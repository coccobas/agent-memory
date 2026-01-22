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
import type { ScopeType } from '../db/schema/types.js';
import { createComponentLogger } from '../utils/logger.js';
import type { TurnData } from './capture/types.js';
import { detectProjectMentions } from '../utils/transcript-analysis.js';

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
  scopeMismatchWarning?: ScopeMismatchWarning;
}

/**
 * Warning when transcript mentions different projects than current scope
 */
export interface ScopeMismatchWarning {
  mentionedProjects: string[];
  currentProject: string;
  warning: string;
  confidence: number;
}

/**
 * Result of project scope resolution
 *
 * Used when scopeType='project' to resolve the actual projectId
 * from explicit params, active session, or cwd detection.
 */
export interface ResolvedProjectScope {
  projectId: string;
  source: 'explicit' | 'session' | 'cwd';
  sessionId?: string;
  warning?: string;
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
   * Get the last cached context synchronously (no DB calls).
   * Returns undefined if no context has been cached yet.
   * Use this when you need context without blocking on async operations.
   */
  getCached(): DetectedContext | undefined;

  /**
   * Enrich parameters with auto-detected values
   * Explicit parameters always take precedence over auto-detected ones
   */
  enrichParams(args: Record<string, unknown>, transcript?: TurnData[]): Promise<EnrichmentResult>;

  /**
   * Detect scope mismatch from transcript analysis
   * Returns warning if transcript mentions different projects than current scope
   */
  detectScopeMismatch(transcript: TurnData[]): Promise<ScopeMismatchWarning | null>;

  /**
   * Resolve project scope for operations.
   *
   * When scopeType='project' and no scopeId is provided:
   * 1. If explicit scopeId → use it (warn if differs from session's project)
   * 2. If active session exists → use session's projectId
   * 3. Fall back to cwd-detected project
   * 4. Error if no project can be resolved
   *
   * For other scopeTypes (global, session, org), passes through unchanged.
   */
  resolveProjectScope(scopeType: ScopeType, scopeId?: string): Promise<ResolvedProjectScope>;

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
        logger.debug(
          { projectId: project.id, projectName: project.name },
          'Auto-detected project from cwd'
        );
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

  async enrichParams(
    args: Record<string, unknown>,
    transcript?: TurnData[]
  ): Promise<EnrichmentResult> {
    const explicitParams: EnrichableParams = {
      scopeType: args.scopeType as string | undefined,
      scopeId: args.scopeId as string | undefined,
      projectId: args.projectId as string | undefined,
      sessionId: args.sessionId as string | undefined,
      agentId: args.agentId as string | undefined,
    };

    const detected = await this.detect(explicitParams);
    const enriched = { ...args };

    if (!enriched.scopeType && detected.project) {
      enriched.scopeType = 'project';
    }
    if (!enriched.scopeId && detected.project && enriched.scopeType === 'project') {
      enriched.scopeId = detected.project.id;
    }

    if (!enriched.projectId && detected.project) {
      enriched.projectId = detected.project.id;
    }

    if (!enriched.sessionId && detected.session) {
      enriched.sessionId = detected.session.id;
    }

    if (!enriched.agentId) {
      enriched.agentId = detected.agentId.value;
    }

    const result: EnrichmentResult = { enriched, detected };

    if (transcript && transcript.length > 0) {
      const mismatchWarning = await this.detectScopeMismatch(transcript);
      if (mismatchWarning) {
        result.scopeMismatchWarning = mismatchWarning;
      }
    }

    return result;
  }

  async detectScopeMismatch(transcript: TurnData[]): Promise<ScopeMismatchWarning | null> {
    if (transcript.length === 0) {
      return null;
    }

    const detected = await this.detect();
    if (!detected.project) {
      return null;
    }

    const currentProjectName = detected.project.name.toLowerCase();
    const mentionedProjects = detectProjectMentions(transcript);

    if (mentionedProjects.length === 0) {
      return null;
    }

    const mismatchedProjects = mentionedProjects.filter(
      (mentioned) => mentioned.toLowerCase() !== currentProjectName
    );

    if (mismatchedProjects.length === 0) {
      return null;
    }

    const mentionCount = mismatchedProjects.reduce((count, project) => {
      const projectLower = project.toLowerCase();
      return (
        count +
        transcript.filter((turn) => turn.content.toLowerCase().includes(projectLower)).length
      );
    }, 0);

    const confidence = Math.min(1.0, 0.3 + mentionCount * 0.2);

    return {
      mentionedProjects: mismatchedProjects,
      currentProject: detected.project.name,
      warning: `Transcript mentions project(s) "${mismatchedProjects.join(', ')}" but current scope is "${detected.project.name}"`,
      confidence,
    };
  }

  clearCache(): void {
    this.cache = null;
    logger.debug('Context detection cache cleared');
  }

  getCached(): DetectedContext | undefined {
    if (!this.cache) return undefined;
    const age = Date.now() - this.cache.timestamp;
    if (age >= this.cacheTTLMs) return undefined;
    return this.cache.context;
  }

  async resolveProjectScope(scopeType: ScopeType, scopeId?: string): Promise<ResolvedProjectScope> {
    // For non-project scopes, pass through unchanged
    if (scopeType !== 'project') {
      return {
        projectId: scopeId ?? '',
        source: 'explicit',
      };
    }

    // Detect current context (includes active session)
    const detected = await this.detect();

    // Get session's projectId if available
    // We need to fetch the session with its projectId
    let sessionProjectId: string | undefined;
    let sessionId: string | undefined;

    if (detected.session) {
      sessionId = detected.session.id;
      // Fetch full session details to get projectId
      try {
        const sessions = await this.sessionRepo.list(
          { projectId: detected.project?.id, status: 'active' },
          { limit: 1 }
        );
        const session = sessions[0];
        if (session && 'projectId' in session && session.projectId) {
          sessionProjectId = session.projectId;
        }
      } catch {
        // Ignore errors, fall through to cwd detection
      }
    }

    // Case 1: Explicit scopeId provided
    if (scopeId) {
      const result: ResolvedProjectScope = {
        projectId: scopeId,
        source: 'explicit',
      };

      // Add warning if differs from session's project
      if (sessionProjectId && scopeId !== sessionProjectId) {
        result.warning = `Explicit scopeId '${scopeId}' differs from active session's project '${sessionProjectId}'`;
        result.sessionId = sessionId;
      }

      return result;
    }

    // Case 2: Resolve from active session
    if (sessionProjectId) {
      logger.debug(
        { sessionId, projectId: sessionProjectId },
        'Resolved project from active session'
      );
      return {
        projectId: sessionProjectId,
        source: 'session',
        sessionId,
      };
    }

    // Case 3: Fall back to cwd-detected project
    if (detected.project?.id) {
      logger.debug({ projectId: detected.project.id }, 'Resolved project from cwd');
      return {
        projectId: detected.project.id,
        source: 'cwd',
      };
    }

    // Case 4: No project can be resolved
    throw new Error(
      'No active session found. Start a session with memory_quickstart or provide scopeId explicitly.'
    );
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
