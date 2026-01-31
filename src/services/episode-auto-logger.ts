/**
 * Episode Auto-Logger Service
 *
 * Automatically logs tool executions as episode events to provide
 * a timeline of work activity without requiring explicit user intent.
 *
 * Features:
 * - Filters noise (only logs significant write operations)
 * - Debounces rapid tool calls to prevent event spam
 * - Infers event types from tool/action combinations
 * - Works with active episodes in the current session
 */

import type { IEpisodeRepository } from '../core/interfaces/repositories.js';
import { createComponentLogger } from '../utils/logger.js';
import {
  DEFAULT_SIGNIFICANT_TOOLS,
  DEFAULT_SKIP_TOOLS,
  SIGNIFICANT_ACTIONS,
  SKIP_ACTIONS,
} from '../config/registry/sections/episode.js';
import type {
  BoundaryDetectorService,
  BufferedEvent,
  DetectedBoundary,
} from './episode/boundary-detector.js';

const logger = createComponentLogger('episode-auto-logger');

/**
 * Configuration for the auto-logger service
 */
export interface EpisodeAutoLoggerConfig {
  /** Enable auto-logging */
  enabled: boolean;
  /** Minimum time between logged events (ms) */
  debounceMs: number;
  /** Override default significant tools */
  significantTools?: readonly string[];
  /** Override default skip tools */
  skipTools?: readonly string[];
  /** Auto-create episode on first significant tool if none exists (zero-friction mode) */
  autoCreateEpisode?: boolean;
}

/**
 * Tool execution event to log
 */
export interface ToolExecutionEvent {
  toolName: string;
  action?: string;
  success: boolean;
  sessionId?: string;
  projectId?: string;
  /** Semantic summary of the tool execution (e.g., "Learned that auth tokens expire after 1 hour") */
  semanticSummary?: string;
  /** Optional additional context from the tool execution */
  context?: {
    /** Entry type if created (guideline, knowledge, tool, etc.) */
    entryType?: string;
    /** Entry ID if created */
    entryId?: string;
    /** Entry name/title if available */
    entryName?: string;
    /** Output excerpt for trajectory building */
    outputExcerpt?: string;
    /** Any additional metadata */
    metadata?: Record<string, unknown>;
  };
}

/**
 * Maps tool+action combinations to episode event types
 */
const DECISION_ACTIONS = new Set([
  'add',
  'create',
  'promote',
  'record_case',
  'learn',
  'delete',
  'deactivate',
  'bulk_add',
  'bulk_delete',
  'approve',
  'reject',
  'complete',
  'fail',
  'cancel',
]);

function inferEventType(
  toolName: string,
  action: string | undefined
): 'checkpoint' | 'decision' | 'started' | 'completed' {
  if (action && DECISION_ACTIONS.has(action)) {
    return 'decision';
  }
  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'Bash') {
    return 'decision';
  }
  return 'checkpoint';
}

/**
 * Generates a human-readable event name from tool execution
 */
function generateEventName(
  toolName: string,
  action: string | undefined,
  context?: ToolExecutionEvent['context'],
  semanticSummary?: string
): string {
  if (semanticSummary) {
    return truncate(semanticSummary, 60);
  }

  // Remove 'memory_' prefix for cleaner names
  const cleanToolName = toolName.replace(/^memory_/, '');

  // If we have an entry name, use it
  if (context?.entryName) {
    const actionVerb = action === 'add' ? 'Added' : action === 'update' ? 'Updated' : 'Stored';
    return `${actionVerb} ${context.entryType ?? cleanToolName}: ${truncate(context.entryName, 40)}`;
  }

  // If we have an entry type, mention it
  if (context?.entryType) {
    const actionVerb = action === 'add' ? 'Added' : action === 'update' ? 'Updated' : 'Modified';
    return `${actionVerb} ${context.entryType}`;
  }

  // Generate from tool and action
  if (action) {
    const actionVerb = action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ');
    return `${actionVerb} (${cleanToolName})`;
  }

  return `Tool: ${cleanToolName}`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

function generateEpisodeNameFromTool(event: ToolExecutionEvent): string {
  const cleanToolName = event.toolName.replace(/^memory_/, '');
  if (event.context?.entryName) {
    return `Working on ${truncate(event.context.entryName, 40)}`;
  }
  if (event.action) {
    const actionVerb =
      event.action.charAt(0).toUpperCase() + event.action.slice(1).replace(/_/g, ' ');
    return `${actionVerb} session`;
  }
  return `${cleanToolName} session`;
}

/**
 * Create the Episode Auto-Logger Service
 */
export function createEpisodeAutoLoggerService(
  episodeRepo: IEpisodeRepository,
  config: EpisodeAutoLoggerConfig,
  boundaryDetector?: BoundaryDetectorService
) {
  const significantTools = new Set<string>(config.significantTools ?? DEFAULT_SIGNIFICANT_TOOLS);
  const skipTools = new Set<string>(config.skipTools ?? DEFAULT_SKIP_TOOLS);
  const significantActions = new Set<string>(SIGNIFICANT_ACTIONS);
  const skipActions = new Set<string>(SKIP_ACTIONS);

  // Track last log time per session for debouncing
  const lastLogTime = new Map<string, number>();

  /**
   * Convert tool execution event to buffered event for boundary detection
   */
  function toBufferedEvent(event: ToolExecutionEvent): BufferedEvent | null {
    if (!event.sessionId) return null;

    const cleanToolName = event.toolName.replace(/^memory_/, '');
    const summary = event.context?.entryName
      ? `${event.action ?? 'used'} ${cleanToolName}: ${event.context.entryName}`
      : event.action
        ? `${event.action} (${cleanToolName})`
        : cleanToolName;

    return {
      timestamp: new Date(),
      toolName: event.toolName,
      action: event.action,
      targetFile: event.context?.metadata?.file as string | undefined,
      summary,
      sessionId: event.sessionId,
    };
  }

  /**
   * Check if a tool execution should be logged
   */
  function shouldLog(event: ToolExecutionEvent): boolean {
    // Must be enabled
    if (!config.enabled) {
      return false;
    }

    // Must have a session ID
    if (!event.sessionId) {
      return false;
    }

    // Must be successful
    if (!event.success) {
      return false;
    }

    // Skip if tool is in skip list
    if (skipTools.has(event.toolName)) {
      return false;
    }

    // Skip if action is in skip list
    if (event.action && skipActions.has(event.action)) {
      return false;
    }

    // Log if tool is in significant tools list
    if (significantTools.has(event.toolName)) {
      return true;
    }

    // Log if action is in significant actions list
    if (event.action && significantActions.has(event.action)) {
      return true;
    }

    // Default: don't log
    return false;
  }

  /**
   * Check if enough time has passed since last log (debounce)
   */
  function shouldDebounce(sessionId: string): boolean {
    const now = Date.now();
    const lastTime = lastLogTime.get(sessionId);

    if (lastTime && now - lastTime < config.debounceMs) {
      return true;
    }

    return false;
  }

  /**
   * Record that we logged for a session (for debouncing)
   */
  function recordLog(sessionId: string): void {
    lastLogTime.set(sessionId, Date.now());
  }

  return {
    /**
     * Log a tool execution as an episode event (if appropriate)
     *
     * This method is designed to be called from tool-runner after each
     * successful tool execution. It handles filtering, debouncing, and
     * event creation automatically.
     *
     * @param event - Tool execution event to potentially log
     * @returns true if an event was logged, false otherwise
     */
    async logToolExecution(event: ToolExecutionEvent): Promise<boolean> {
      try {
        // Check if we should log this event
        if (!shouldLog(event)) {
          logger.trace(
            { tool: event.toolName, action: event.action },
            'Skipping event (not significant)'
          );
          return false;
        }

        const sessionId = event.sessionId;
        if (!sessionId) {
          return false;
        }

        // Check debounce
        if (shouldDebounce(sessionId)) {
          logger.trace({ tool: event.toolName, sessionId }, 'Skipping event (debounced)');
          return false;
        }

        // ALWAYS feed event to boundary detector first (even without active episode)
        // This allows boundary detection to work and create episodes from scratch
        if (boundaryDetector) {
          const bufferedEvent = toBufferedEvent(event);
          if (bufferedEvent) {
            // Fire and forget - don't block on boundary detection
            boundaryDetector.ingest(bufferedEvent).catch((err) => {
              logger.warn(
                { error: err instanceof Error ? err.message : String(err) },
                'Boundary detection failed'
              );
            });
          }
        }

        // Find active episode for this session, or auto-create one
        let activeEpisode = await episodeRepo.getActiveEpisode(sessionId);
        if (!activeEpisode) {
          if (config.autoCreateEpisode) {
            try {
              const episodeName = generateEpisodeNameFromTool(event);
              const created = await episodeRepo.create({
                sessionId,
                projectId: event.projectId,
                scopeType: event.projectId ? 'project' : 'session',
                scopeId: event.projectId ?? sessionId,
                name: episodeName,
                triggerType: 'auto_detection',
                triggerRef: 'first_tool_usage',
                metadata: {
                  autoCreated: true,
                  zeroFriction: true,
                  triggerTool: event.toolName,
                  triggerAction: event.action,
                  nameSource: 'auto',
                },
              });
              activeEpisode = await episodeRepo.start(created.id);
              logger.info(
                {
                  sessionId,
                  episodeId: activeEpisode.id,
                  episodeName,
                  triggerTool: event.toolName,
                },
                'Auto-created episode on first tool usage'
              );
            } catch (err) {
              logger.warn(
                { sessionId, error: err instanceof Error ? err.message : String(err) },
                'Failed to auto-create episode'
              );
              return false;
            }
          } else {
            logger.trace(
              { sessionId },
              'No active episode for session (event fed to boundary detector)'
            );
            return false;
          }
        }

        // Create the event
        const eventType = inferEventType(event.toolName, event.action);
        const eventName = generateEventName(
          event.toolName,
          event.action,
          event.context,
          event.semanticSummary
        );

        const description =
          event.semanticSummary ??
          (event.context?.entryName
            ? `${event.action}: ${event.context.entryName}`
            : event.action
              ? `Tool ${event.toolName} with action ${event.action}`
              : `Tool ${event.toolName}`);

        await episodeRepo.addEvent({
          episodeId: activeEpisode.id,
          eventType,
          name: eventName,
          description,
          entryType: event.context?.entryType,
          entryId: event.context?.entryId,
          data: {
            tool: event.toolName,
            action: event.action,
            autoLogged: true,
            semanticSummary: event.semanticSummary,
            outputExcerpt: event.context?.outputExcerpt,
            ...event.context?.metadata,
          },
        });

        // Record log time for debouncing
        recordLog(sessionId);

        logger.debug(
          {
            episodeId: activeEpisode.id,
            tool: event.toolName,
            action: event.action,
            eventType,
            eventName,
          },
          'Auto-logged tool execution as episode event'
        );

        return true;
      } catch (error) {
        logger.warn(
          {
            tool: event.toolName,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to auto-log episode event'
        );
        return false;
      }
    },

    async logToolFailure(event: ToolExecutionEvent & { errorMessage: string }): Promise<boolean> {
      try {
        if (!config.enabled || !event.sessionId) {
          return false;
        }

        const activeEpisode = await episodeRepo.getActiveEpisode(event.sessionId);
        if (!activeEpisode) {
          return false;
        }

        const cleanToolName = event.toolName.replace(/^memory_/, '');
        await episodeRepo.addEvent({
          episodeId: activeEpisode.id,
          eventType: 'error',
          name: `Error: ${cleanToolName}${event.action ? ` (${event.action})` : ''}`,
          description: event.errorMessage,
          data: {
            tool: event.toolName,
            action: event.action,
            error: event.errorMessage,
            autoLogged: true,
          },
        });

        logger.debug(
          { episodeId: activeEpisode.id, tool: event.toolName, error: event.errorMessage },
          'Auto-logged tool failure as episode error event'
        );

        return true;
      } catch (error) {
        logger.warn(
          { tool: event.toolName, error: error instanceof Error ? error.message : String(error) },
          'Failed to auto-log tool failure'
        );
        return false;
      }
    },

    getConfig(): EpisodeAutoLoggerConfig {
      return { ...config };
    },

    /**
     * Check if auto-logging is enabled
     */
    isEnabled(): boolean {
      return config.enabled;
    },

    /**
     * Clear debounce tracking (useful for testing)
     */
    clearDebounceState(): void {
      lastLogTime.clear();
    },

    /**
     * Get the boundary detector (if available)
     */
    getBoundaryDetector(): BoundaryDetectorService | undefined {
      return boundaryDetector;
    },

    /**
     * Get detected boundaries for a session (shadow mode)
     */
    getDetectedBoundaries(sessionId?: string): DetectedBoundary[] {
      if (!boundaryDetector) return [];
      if (sessionId) {
        return boundaryDetector.getBoundariesForSession(sessionId);
      }
      return boundaryDetector.getDetectedBoundaries();
    },

    /**
     * Flush boundary detector buffer for a session
     */
    flushBoundaryBuffer(sessionId: string): BufferedEvent[] {
      if (!boundaryDetector) return [];
      return boundaryDetector.flush(sessionId);
    },
  };
}

/**
 * Episode Auto-Logger Service type
 */
export type EpisodeAutoLoggerService = ReturnType<typeof createEpisodeAutoLoggerService>;

/**
 * Interface for services that need episode auto-logging
 */
export interface IEpisodeAutoLoggerService {
  logToolExecution(event: ToolExecutionEvent): Promise<boolean>;
  logToolFailure(event: ToolExecutionEvent & { errorMessage: string }): Promise<boolean>;
  getConfig(): EpisodeAutoLoggerConfig;
  isEnabled(): boolean;
  clearDebounceState(): void;
  getBoundaryDetector(): BoundaryDetectorService | undefined;
  getDetectedBoundaries(sessionId?: string): DetectedBoundary[];
  flushBoundaryBuffer(sessionId: string): BufferedEvent[];
}
