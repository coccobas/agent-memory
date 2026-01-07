/**
 * Context Detection Service
 *
 * Automatically detects project, session, and agentId from:
 * - Working directory (matched against project.rootPath)
 * - Active sessions (for the detected project)
 * - Environment variables and defaults
 *
 * This enables MCP tools to work with minimal explicit parameters.
 */

import type { Config } from '../config/index.js';
import type { IProjectRepository, ISessionRepository } from '../core/interfaces/repositories.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('context-detection');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Source of a detected value
 */
export type DetectionSource = 'cwd' | 'active' | 'env' | 'default' | 'explicit';

/**
 * Detected project context
 */
export interface DetectedProject {
  id: string;
  name: string;
  rootPath?: string;
  source: DetectionSource;
}

/**
 * Detected session context
 */
export interface DetectedSession {
  id: string;
  name?: string;
  status: string;
  source: DetectionSource;
}

/**
 * Detected agent ID
 */
export interface DetectedAgentId {
  value: string;
  source: DetectionSource;
}

/**
 * Complete detected context
 */
export interface DetectedContext {
  project?: DetectedProject;
  session?: DetectedSession;
  agentId: DetectedAgentId;
  workingDirectory: string;
}

/**
 * Parameters that can be enriched by auto-detection
 */
export interface EnrichableParams {
  scopeType?: string;
  scopeId?: string;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
}

/**
 * Result of parameter enrichment
 */
export interface EnrichmentResult {
  enriched: Record<string, unknown>;
  detected: DetectedContext;
}

/**
 * Context Detection Service Interface
 */
export interface IContextDetectionService {
  /**
   * Detect context from working directory and explicit parameters
   */
  detect(explicitParams?: EnrichableParams): Promise<DetectedContext>;

  /**
   * Enrich parameters with auto-detected values
   * Explicit parameters always take precedence over auto-detected ones
   */
  enrichParams(args: Record<string, unknown>): Promise<EnrichmentResult>;

  /**
   * Clear the detection cache (forces re-detection)
   */
  clearCache(): void;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

interface CacheEntry {
  context: DetectedContext;
  timestamp: number;
}

/**
 * Context Detection Service implementation
 */
export class ContextDetectionService implements IContextDetectionService {
  private cache: CacheEntry | null = null;
  private readonly cacheTTLMs: number;
  private readonly defaultAgentId: string;
  private readonly enabled: boolean;

  constructor(
    config: Config,
    private readonly projectRepo: IProjectRepository,
    private readonly sessionRepo: ISessionRepository
  ) {
    this.cacheTTLMs = config.autoContext.cacheTTLMs;
    this.defaultAgentId = config.autoContext.defaultAgentId;
    this.enabled = config.autoContext.enabled;
  }

  async detect(explicitParams?: EnrichableParams): Promise<DetectedContext> {
    const workingDirectory = process.cwd();

    // If disabled, return minimal context with just defaults
    if (!this.enabled) {
      return {
        workingDirectory,
        agentId: {
          value: explicitParams?.agentId ?? this.defaultAgentId,
          source: explicitParams?.agentId ? 'explicit' : 'default',
        },
      };
    }

    // Check cache (only if no explicit params that might affect detection)
    if (!explicitParams?.projectId && !explicitParams?.sessionId && this.cache) {
      const age = Date.now() - this.cache.timestamp;
      if (age < this.cacheTTLMs) {
        // Return cached context with potentially updated agentId from explicit params
        const cached = this.cache.context;
        return {
          ...cached,
          agentId: explicitParams?.agentId
            ? { value: explicitParams.agentId, source: 'explicit' }
            : cached.agentId,
        };
      }
    }

    // Detect project from working directory
    let detectedProject: DetectedProject | undefined;
    try {
      const project = await this.projectRepo.findByPath(workingDirectory);
      if (project) {
        detectedProject = {
          id: project.id,
          name: project.name,
          rootPath: project.rootPath ?? undefined,
          source: 'cwd',
        };
        logger.debug({ projectId: project.id, projectName: project.name }, 'Auto-detected project from cwd');
      }
    } catch (error) {
      logger.warn({ error, cwd: workingDirectory }, 'Failed to detect project from cwd');
    }

    // Detect active session for the project
    let detectedSession: DetectedSession | undefined;
    if (detectedProject) {
      try {
        const sessions = await this.sessionRepo.list(
          { projectId: detectedProject.id, status: 'active' },
          { limit: 1 }
        );
        const session = sessions[0];
        if (session) {
          detectedSession = {
            id: session.id,
            name: session.name ?? undefined,
            status: session.status,
            source: 'active',
          };
          logger.debug({ sessionId: session.id }, 'Auto-detected active session');
        }
      } catch (error) {
        logger.warn({ error, projectId: detectedProject.id }, 'Failed to detect active session');
      }
    }

    // Determine agentId: explicit > env > default
    const envAgentId = process.env.AGENT_MEMORY_DEFAULT_AGENT_ID;
    let agentId: DetectedAgentId;
    if (explicitParams?.agentId) {
      agentId = { value: explicitParams.agentId, source: 'explicit' };
    } else if (envAgentId) {
      agentId = { value: envAgentId, source: 'env' };
    } else {
      agentId = { value: this.defaultAgentId, source: 'default' };
    }

    const context: DetectedContext = {
      project: detectedProject,
      session: detectedSession,
      agentId,
      workingDirectory,
    };

    // Cache the result (without explicit agentId as that can change per call)
    this.cache = {
      context: {
        ...context,
        agentId: envAgentId
          ? { value: envAgentId, source: 'env' }
          : { value: this.defaultAgentId, source: 'default' },
      },
      timestamp: Date.now(),
    };

    return context;
  }

  async enrichParams(args: Record<string, unknown>): Promise<EnrichmentResult> {
    // Extract explicit params for detection
    const explicitParams: EnrichableParams = {
      scopeType: args.scopeType as string | undefined,
      scopeId: args.scopeId as string | undefined,
      projectId: args.projectId as string | undefined,
      sessionId: args.sessionId as string | undefined,
      agentId: args.agentId as string | undefined,
    };

    const detected = await this.detect(explicitParams);

    // Build enriched params - explicit values always take precedence
    const enriched = { ...args };

    // Enrich scopeType and scopeId
    if (!enriched.scopeType && detected.project) {
      enriched.scopeType = 'project';
    }
    if (!enriched.scopeId && detected.project && enriched.scopeType === 'project') {
      enriched.scopeId = detected.project.id;
    }

    // Enrich projectId (for tools that use projectId directly)
    if (!enriched.projectId && detected.project) {
      enriched.projectId = detected.project.id;
    }

    // Enrich sessionId (for tools that use sessionId directly)
    if (!enriched.sessionId && detected.session) {
      enriched.sessionId = detected.session.id;
    }

    // Enrich agentId (always set if not provided)
    if (!enriched.agentId) {
      enriched.agentId = detected.agentId.value;
    }

    return { enriched, detected };
  }

  clearCache(): void {
    this.cache = null;
    logger.debug('Context detection cache cleared');
  }
}

/**
 * Create a context detection service instance
 */
export function createContextDetectionService(
  config: Config,
  projectRepo: IProjectRepository,
  sessionRepo: ISessionRepository
): IContextDetectionService {
  return new ContextDetectionService(config, projectRepo, sessionRepo);
}
