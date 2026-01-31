/**
 * Scope management handlers (organizations, projects, sessions)
 *
 * Security: Destructive operations require admin key authentication.
 *
 * Context-aware handlers that receive AppContext for dependency injection.
 */

import type {
  CreateOrganizationInput,
  CreateProjectInput,
  UpdateProjectInput,
  CreateSessionInput,
} from '../../core/interfaces/repositories.js';
import type { AppContext } from '../../core/context.js';
import type { FeedbackService } from '../../services/feedback/index.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isObject,
  isBoolean,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { getCriticalGuidelinesForSession } from '../../services/critical-guidelines.service.js';
import { requireAdminKey } from '../../utils/admin.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';
import { createComponentLogger } from '../../utils/logger.js';
import { findSimilarGroups, consolidate } from '../../services/consolidation.service.js';
import { generateAndStoreSummary } from '../../services/summary.service.js';
import { getCorrelationId } from '../../utils/correlation.js';
import { getInjectionTrackerService } from '../../services/injection-tracking/index.js';

const logger = createComponentLogger('scopes');
import { DEFAULT_LIBRARIAN_CONFIG } from '../../services/librarian/types.js';
import { createSessionEpisodeCleanup } from '../../services/episode/session-cleanup.js';
import type {
  OrgCreateParams,
  OrgListParams,
  ProjectCreateParams,
  ProjectListParams,
  ProjectGetParams,
  ProjectUpdateParams,
  ProjectDeleteParams,
  SessionStartParams,
  SessionEndParams,
  SessionListParams,
} from '../types.js';

/**
 * Type guard to check if a value is a valid session status
 */
function isSessionStatus(value: unknown): value is 'active' | 'paused' | 'completed' | 'discarded' {
  return isString(value) && ['active', 'paused', 'completed', 'discarded'].includes(value);
}

interface SessionProcessingMetadata {
  processingTriggeredAt?: string;
  processingTriggeredBy?: 'mcp' | 'hook';
}

function getProcessingMetadata(
  metadata: Record<string, unknown> | null
): SessionProcessingMetadata | null {
  if (!metadata) return null;
  const processingTriggeredAt = metadata.processingTriggeredAt;
  const processingTriggeredBy = metadata.processingTriggeredBy;
  if (typeof processingTriggeredAt === 'string') {
    return {
      processingTriggeredAt,
      processingTriggeredBy:
        processingTriggeredBy === 'mcp' || processingTriggeredBy === 'hook'
          ? processingTriggeredBy
          : undefined,
    };
  }
  return null;
}

async function markProcessingTriggered(
  context: AppContext,
  sessionId: string,
  triggeredBy: 'mcp' | 'hook'
): Promise<void> {
  const session = await context.repos.sessions.getById(sessionId);
  if (!session) return;

  const existingMetadata = (session.metadata as Record<string, unknown>) ?? {};
  await context.repos.sessions.update(sessionId, {
    metadata: {
      ...existingMetadata,
      processingTriggeredAt: new Date().toISOString(),
      processingTriggeredBy: triggeredBy,
    },
  });
}

export const scopeHandlers = {
  // ===========================================================================
  // ORGANIZATIONS
  // ===========================================================================

  async orgCreate(context: AppContext, params: OrgCreateParams & { adminKey?: string }) {
    // Security: Org creation requires admin authentication
    requireAdminKey(params);

    const name = getRequiredParam(params, 'name', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    const input: CreateOrganizationInput = {
      name,
      metadata,
    };

    const org = await context.repos.organizations.create(input);
    return formatTimestamps({ success: true, organization: org });
  },

  async orgList(context: AppContext, params: OrgListParams) {
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const organizations = await context.repos.organizations.list({ limit, offset });
    return formatTimestamps({
      organizations,
      meta: {
        returnedCount: organizations.length,
      },
    });
  },

  // ===========================================================================
  // PROJECTS
  // ===========================================================================

  async projectCreate(context: AppContext, params: ProjectCreateParams & { adminKey?: string }) {
    // Security: Project creation requires admin authentication
    requireAdminKey(params);

    const name = getRequiredParam(params, 'name', isString);
    const orgId = getOptionalParam(params, 'orgId', isString);
    const description = getOptionalParam(params, 'description', isString);
    const rootPath = getOptionalParam(params, 'rootPath', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    const input: CreateProjectInput = {
      name,
      orgId,
      description,
      rootPath,
      metadata,
    };

    const project = await context.repos.projects.create(input);
    return formatTimestamps({ success: true, project });
  },

  async projectList(context: AppContext, params: ProjectListParams) {
    const orgId = getOptionalParam(params, 'orgId', isString);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const projects = await context.repos.projects.list({ orgId }, { limit, offset });
    return formatTimestamps({
      projects,
      meta: {
        returnedCount: projects.length,
      },
    });
  },

  async projectGet(context: AppContext, params: ProjectGetParams) {
    const id = getOptionalParam(params, 'id', isString);
    const name = getOptionalParam(params, 'name', isString);
    const orgId = getOptionalParam(params, 'orgId', isString);

    if (!id && !name) {
      throw createValidationError(
        'id or name',
        'is required',
        'Provide either project id or name to look up'
      );
    }

    let project;
    if (id) {
      project = await context.repos.projects.getById(id);
    } else if (name) {
      project = await context.repos.projects.getByName(name, orgId);
    }

    if (!project) {
      throw createNotFoundError('Project', id ?? name);
    }

    return formatTimestamps({ project });
  },

  async projectUpdate(context: AppContext, params: ProjectUpdateParams & { adminKey?: string }) {
    // Security: Project update requires admin authentication
    requireAdminKey(params);

    const id = getRequiredParam(params, 'id', isString);
    const name = getOptionalParam(params, 'name', isString);
    const description = getOptionalParam(params, 'description', isString);
    const rootPath = getOptionalParam(params, 'rootPath', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    const input: UpdateProjectInput = {};
    if (name !== undefined) input.name = name;
    if (description !== undefined) input.description = description;
    if (rootPath !== undefined) input.rootPath = rootPath;
    if (metadata !== undefined) input.metadata = metadata;

    const project = await context.repos.projects.update(id, input);
    if (!project) {
      throw createNotFoundError('Project', id);
    }

    return formatTimestamps({ success: true, project });
  },

  async projectDelete(context: AppContext, params: ProjectDeleteParams & { adminKey?: string }) {
    // Security: Project deletion requires admin authentication
    requireAdminKey(params);

    const id = getRequiredParam(params, 'id', isString);
    const confirm = getOptionalParam(params, 'confirm', isBoolean);

    if (!confirm) {
      throw createValidationError(
        'confirm',
        'is required for delete operation',
        'Set confirm: true to proceed. WARNING: This will permanently delete the project and cannot be undone.'
      );
    }

    const deleted = await context.repos.projects.delete(id);
    if (!deleted) {
      throw createNotFoundError('Project', id);
    }

    return { success: true, message: `Project ${id} deleted` };
  },

  // ===========================================================================
  // SESSIONS
  // ===========================================================================

  async sessionStart(context: AppContext, params: SessionStartParams) {
    const projectId = getOptionalParam(params, 'projectId', isString);
    const name = getOptionalParam(params, 'name', isString);
    const purpose = getOptionalParam(params, 'purpose', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    // End any active sessions for this project and trigger maintenance
    if (projectId) {
      const activeSessions = await context.repos.sessions.list(
        { projectId, status: 'active' },
        { limit: 10 }
      );

      for (const activeSession of activeSessions) {
        await context.repos.sessions.end(activeSession.id, 'completed');
        logger.debug(
          { sessionId: activeSession.id, projectId },
          'Auto-ended stale session on new session start'
        );
      }

      // Trigger maintenance for the project (non-blocking)
      if (activeSessions.length > 0) {
        triggerSessionEndMaintenance(projectId, context);
      }
    }

    const input: CreateSessionInput = {
      projectId,
      name,
      purpose,
      agentId,
      metadata,
    };

    const session = await context.repos.sessions.create(input);

    // Fetch critical guidelines for the session's scope
    const criticalGuidelines = getCriticalGuidelinesForSession(
      projectId ?? null,
      session.id,
      context.db
    );

    return formatTimestamps({
      success: true,
      session,
      criticalGuidelines,
    });
  },

  async sessionEnd(context: AppContext, params: SessionEndParams) {
    let id = getOptionalParam(params, 'id', isString);
    const status = getOptionalParam(params, 'status', isSessionStatus);

    if (!id) {
      id = (params as unknown as Record<string, unknown>).sessionId as string | undefined;
    }

    // Auto-detect session if still not provided
    if (!id) {
      const contextDetection = context.services.contextDetection;
      if (contextDetection) {
        const detected = await contextDetection.detect();
        if (detected.session) {
          id = detected.session.id;
          logger.debug(
            { sessionId: id, source: detected.session.source },
            'Auto-detected session for end'
          );
        } else {
          // Check for any active session in detected project
          const projectId = detected.project?.id;
          if (projectId) {
            const activeSessions = await context.repos.sessions.list(
              { projectId, status: 'active' },
              { limit: 1 }
            );
            const activeSession = activeSessions[0];
            if (activeSession) {
              id = activeSession.id;
              logger.debug({ sessionId: id }, 'Found active session for end');
            }
          }
        }
      }

      if (!id) {
        throw createValidationError(
          'id',
          'is required',
          'No session id provided and no active session found. Either provide a session id or start a session first.'
        );
      }
    }

    let episodeCleanupResult = null;
    if (context.repos.episodes && status !== 'discarded') {
      const sessionEpisodeCleanup = createSessionEpisodeCleanup({
        episodeRepo: context.repos.episodes,
        episodeService: context.services.episode,
        captureService: context.services.capture,
        unifiedMessageSource: context.services.unifiedMessageSource,
      });
      episodeCleanupResult = await sessionEpisodeCleanup.completeSessionEpisode(id, 'session_end');
      if (episodeCleanupResult.episodeId) {
        logger.debug(
          {
            sessionId: id,
            episodeId: episodeCleanupResult.episodeId,
            action: episodeCleanupResult.action,
          },
          'Completed episode on session end'
        );
      }
    }

    const session = await context.repos.sessions.end(
      id,
      (status ?? 'completed') as 'completed' | 'discarded'
    );
    if (!session) {
      throw createNotFoundError('Session', id);
    }

    // Trigger librarian session end (full learning pipeline) - non-blocking
    const librarianService = context.services.librarian;
    if (librarianService && status !== 'discarded') {
      librarianService
        .onSessionEnd({
          sessionId: id,
          projectId: session.projectId ?? undefined,
          agentId: undefined, // Will be resolved from context
          // Messages will be loaded from conversation history if available
        })
        .then((result) => {
          const hasCapture =
            result.capture &&
            (result.capture.experiencesExtracted > 0 || result.capture.knowledgeExtracted > 0);
          const hasAnalysis = result.analysis && result.analysis.patternsDetected > 0;

          if (hasCapture || hasAnalysis) {
            logger.info(
              {
                sessionId: id,
                capture: result.capture
                  ? {
                      experiences: result.capture.experiencesExtracted,
                      knowledge: result.capture.knowledgeExtracted,
                      guidelines: result.capture.guidelinesExtracted,
                      tools: result.capture.toolsExtracted,
                    }
                  : undefined,
                analysis: result.analysis
                  ? {
                      patterns: result.analysis.patternsDetected,
                      queued: result.analysis.queuedForReview,
                    }
                  : undefined,
                durationMs: result.timing.durationMs,
              },
              'Session end learning pipeline completed'
            );
          }
        })
        .catch((error) => {
          logger.error(
            { sessionId: id, error: error instanceof Error ? error.message : String(error) },
            'Session end learning pipeline failed'
          );
        });
    } else if (status !== 'discarded') {
      // Fallback to capture service if librarian not available
      const captureService = context.services.capture;
      if (captureService) {
        captureService
          .onSessionEnd(id)
          .then((result) => {
            if (
              result.experiences.experiences.length > 0 ||
              result.knowledge.knowledge.length > 0
            ) {
              logger.info(
                {
                  sessionId: id,
                  experiencesExtracted: result.experiences.experiences.length,
                  knowledgeExtracted: result.knowledge.knowledge.length,
                  guidelinesExtracted: result.knowledge.guidelines.length,
                  toolsExtracted: result.knowledge.tools.length,
                },
                'Session capture completed (fallback)'
              );
            }
          })
          .catch((error) => {
            logger.error(
              { sessionId: id, error: error instanceof Error ? error.message : String(error) },
              'Session capture failed'
            );
          });
      }
    }

    // Record task outcome for RL feedback (non-blocking)
    recordSessionOutcome(id, status ?? 'completed', context.services.feedback);

    // Trigger auto-consolidation and summary generation (non-blocking)
    if (status !== 'discarded' && session.projectId) {
      triggerSessionEndMaintenance(session.projectId, context);
    }

    // Append new messages and seal the transcript
    let transcriptSealed = false;
    if (context.services.transcript && status !== 'discarded') {
      try {
        const transcripts = await context.repos.ideTranscripts?.list(
          { agentMemorySessionId: id, isSealed: false },
          { limit: 1 }
        );
        const transcript = transcripts?.[0];

        if (transcript) {
          await context.services.transcript.seal(transcript.id);
          transcriptSealed = true;
          logger.debug(
            { transcriptId: transcript.id, sessionId: id },
            'Sealed transcript on session end'
          );

          if (DEFAULT_LIBRARIAN_CONFIG.triggerOnSessionEnd) {
            const existingProcessing = getProcessingMetadata(session.metadata);
            if (!existingProcessing) {
              await markProcessingTriggered(context, id, 'mcp');
              triggerTranscriptProcessing(context, id, session.projectId, transcript.id);
            } else {
              logger.debug(
                {
                  sessionId: id,
                  triggeredAt: existingProcessing.processingTriggeredAt,
                  triggeredBy: existingProcessing.processingTriggeredBy,
                },
                'Skipping processing - already triggered'
              );
            }
          }
        }
      } catch (error) {
        logger.warn(
          { sessionId: id, error: error instanceof Error ? error.message : String(error) },
          'Failed to seal transcript'
        );
      }
    }

    // Clear context detection cache to prevent stale session data
    context.services.contextDetection?.clearCache();

    getInjectionTrackerService().clearSession(id);

    return formatTimestamps({ success: true, session, transcriptSealed });
  },

  async sessionList(context: AppContext, params: SessionListParams) {
    const projectId = getOptionalParam(params, 'projectId', isString);
    const status = getOptionalParam(params, 'status', isSessionStatus);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const sessions = await context.repos.sessions.list({ projectId, status }, { limit, offset });
    return formatTimestamps({
      sessions,
      meta: {
        returnedCount: sessions.length,
      },
    });
  },
};

function triggerTranscriptProcessing(
  context: AppContext,
  sessionId: string,
  projectId: string | null,
  transcriptId: string
): void {
  setImmediate(() => {
    void (async () => {
      try {
        const librarianService = context.services.librarian;
        if (!librarianService) {
          logger.debug({ sessionId }, 'Librarian service unavailable, skipping processing');
          return;
        }

        const unifiedMessageSource = context.services.unifiedMessageSource;
        let messages: Array<{
          role: 'user' | 'assistant' | 'system';
          content: string;
          createdAt?: string;
          toolsUsed?: string[];
        }> = [];

        if (unifiedMessageSource) {
          const result = await unifiedMessageSource.getMessagesForSession(sessionId, {
            limit: 100,
          });
          messages = result.messages.map((msg) => ({
            role:
              msg.role === 'agent' ? 'assistant' : (msg.role as 'user' | 'assistant' | 'system'),
            content: msg.content,
            createdAt: msg.timestamp,
            toolsUsed: msg.toolsUsed ?? undefined,
          }));
          logger.debug(
            { sessionId, transcriptId, messageCount: messages.length, source: result.source },
            'Retrieved messages for processing via unified source'
          );
        }

        if (messages.length === 0) {
          logger.debug({ sessionId, transcriptId }, 'No messages to process');
          return;
        }

        const sessionEndResult = await librarianService.onSessionEnd({
          sessionId,
          projectId: projectId ?? undefined,
          agentId: 'mcp',
          messages,
        });

        const hasResults =
          (sessionEndResult.capture?.experiencesExtracted ?? 0) > 0 ||
          (sessionEndResult.missedExtraction?.queuedForReview ?? 0) > 0 ||
          (sessionEndResult.analysis?.patternsDetected ?? 0) > 0;

        if (hasResults) {
          logger.info(
            {
              sessionId,
              transcriptId,
              durationMs: sessionEndResult.timing.durationMs,
              experiences: sessionEndResult.capture?.experiencesExtracted ?? 0,
              patterns: sessionEndResult.analysis?.patternsDetected ?? 0,
            },
            'Transcript processing completed via MCP'
          );
        }
      } catch (error) {
        logger.warn(
          {
            sessionId,
            transcriptId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Transcript processing failed (non-fatal)'
        );
      }
    })();
  });
}

/**
 * Record session outcome for RL feedback collection
 *
 * Infers outcome type from session status and links all retrievals
 * from the session to this outcome.
 */
function recordSessionOutcome(
  sessionId: string,
  status: 'active' | 'paused' | 'completed' | 'discarded',
  feedbackService: FeedbackService
): void {
  // Fire-and-forget async recording
  setImmediate(() => {
    void (async () => {
      try {
        // Infer outcome type from session status
        const outcomeType = inferOutcomeFromStatus(status);

        // Record the outcome
        const outcomeId = await feedbackService.recordOutcome({
          sessionId,
          outcomeType,
          outcomeSignal: 'session_status',
          confidence: getConfidenceForStatus(status),
        });

        // Link all unlinked retrievals from this session to the outcome
        const retrievals = await feedbackService.getUnlinkedRetrievals(sessionId);
        if (retrievals.length > 0) {
          await feedbackService.linkRetrievalsToOutcome(
            outcomeId,
            retrievals.map((r) => r.id)
          );
          logger.debug(
            { sessionId, outcomeId, linkedRetrievals: retrievals.length },
            'Linked retrievals to session outcome'
          );
        }
      } catch (error) {
        logger.error(
          { sessionId, error: error instanceof Error ? error.message : String(error) },
          'Failed to record session outcome for RL feedback'
        );
      }
    })();
  });
}

/**
 * Infer outcome type from session status
 */
function inferOutcomeFromStatus(
  status: 'active' | 'paused' | 'completed' | 'discarded'
): 'success' | 'failure' | 'partial' | 'unknown' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'discarded':
      return 'failure';
    case 'paused':
      return 'partial';
    default:
      return 'unknown';
  }
}

/**
 * Get confidence level for status-based outcome inference
 */
function getConfidenceForStatus(status: 'active' | 'paused' | 'completed' | 'discarded'): number {
  // Session status is a moderate signal - not explicit user feedback
  switch (status) {
    case 'completed':
      return 0.7; // Completed sessions likely successful
    case 'discarded':
      return 0.8; // Discarded is a stronger signal of failure
    case 'paused':
      return 0.5; // Paused is ambiguous
    default:
      return 0.3;
  }
}

/**
 * Trigger maintenance tasks on session end
 *
 * Runs consolidation and summary generation in the background.
 * These are non-blocking and fire-and-forget.
 */
function triggerSessionEndMaintenance(projectId: string, context: AppContext): void {
  // Bug #192 fix: Capture correlation ID for async error tracing
  const correlationId = getCorrelationId();

  // Fire-and-forget async maintenance
  setImmediate(() => {
    void (async () => {
      try {
        // Check if we have the required services for consolidation
        const embeddingService = context.services?.embedding;
        const vectorService = context.services?.vector;

        if (embeddingService && vectorService) {
          // Find similar entries (discovery only, no deduplication)
          const groups = await findSimilarGroups({
            scopeType: 'project',
            scopeId: projectId,
            entryTypes: ['guideline', 'knowledge', 'tool'],
            threshold: 0.85,
            limit: 10,
            db: context.db,
            services: {
              embedding: embeddingService,
              vector: vectorService,
            },
          });

          if (groups.length > 0) {
            logger.info(
              { projectId, similarGroups: groups.length },
              'Found similar entries during session end maintenance'
            );

            // Auto-dedupe if groups have high similarity (> 0.95)
            const highSimilarityGroups = groups.filter((g) => g.averageSimilarity > 0.95);
            if (highSimilarityGroups.length > 0) {
              const result = await consolidate({
                scopeType: 'project',
                scopeId: projectId,
                entryTypes: ['guideline', 'knowledge', 'tool'],
                strategy: 'dedupe',
                threshold: 0.95,
                limit: 5,
                dryRun: false,
                consolidatedBy: 'session-end-maintenance',
                db: context.db,
                services: {
                  embedding: embeddingService,
                  vector: vectorService,
                },
              });

              if (result.entriesDeactivated > 0) {
                logger.info(
                  { projectId, deactivated: result.entriesDeactivated },
                  'Auto-deduplicated entries during session end'
                );
              }
            }
          }
        }

        // Generate/update project summary
        const project = await context.repos.projects.getById(projectId);
        if (project) {
          const summaryResult = await generateAndStoreSummary(context.db, {
            projectId,
            projectName: project.name,
          });

          if (summaryResult.stored) {
            logger.debug(
              { projectId, knowledgeId: summaryResult.knowledgeId },
              'Updated project summary during session end'
            );
          }
        }
      } catch (error) {
        // Bug #192 fix: Include correlation ID for distributed tracing
        logger.error(
          {
            projectId,
            correlationId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Session end maintenance failed'
        );
      }
    })();
  });
}
