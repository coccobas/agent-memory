import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { ensureSessionIdExists } from './session.js';
import { ingestTranscript } from './transcript-ingest.js';
import { handleObserve } from './handlers/observe.handler.js';
import { createComponentLogger } from '../../utils/logger.js';
import {
  sessionEndCounter,
  transcriptIngestDuration,
  transcriptLinesCounter,
  transcriptMessagesCounter,
} from '../../utils/metrics.js';
import { getContext } from '../../core/container.js';
import { DEFAULT_LIBRARIAN_CONFIG } from '../../services/librarian/types.js';
import { getBehaviorObserverService } from '../../services/capture/behavior-observer.js';
import { getInjectionTrackerService } from '../../services/injection-tracking/index.js';
import { getHookLearningService } from '../../services/learning/index.js';

const logger = createComponentLogger('session-end');

export async function runSessionEndCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
}): Promise<HookCommandResult> {
  const { projectId, agentId, input } = params;

  const sessionId = input.session_id;
  const transcriptPath = input.transcript_path;

  // Handle missing session_id gracefully - exit successfully but skip processing
  // This can happen when Claude Code sends minimal/empty input
  if (!sessionId) {
    logger.debug('Session end hook called without session_id, skipping (no-op)');
    sessionEndCounter.inc({ status: 'skipped' });
    return { exitCode: 0, stdout: [], stderr: [] };
  }

  // Handle missing transcript_path gracefully - exit successfully but skip processing
  if (!transcriptPath) {
    logger.debug(
      { sessionId },
      'Session end hook called without transcript_path, skipping (no-op)'
    );
    sessionEndCounter.inc({ status: 'skipped' });
    return { exitCode: 0, stdout: [], stderr: [] };
  }

  logger.debug(
    { sessionId, transcriptPath, projectId, agentId },
    'Starting session end processing'
  );

  // Start timing the ingestion
  const timer = transcriptIngestDuration.startTimer();

  try {
    await ensureSessionIdExists(sessionId, projectId);

    const result = await ingestTranscript({
      sessionId,
      transcriptPath,
      projectId,
      agentId,
      cwd: input.cwd,
    });

    // Record metrics
    transcriptLinesCounter.inc({}, result.linesRead);
    transcriptMessagesCounter.inc({}, result.appended);

    // Determine result type for histogram label
    let resultType: 'completed' | 'empty' | 'truncated' = 'completed';
    if (result.linesRead === 0) {
      resultType = 'empty';
    } else if (result.wasTruncated) {
      resultType = 'truncated';
    }

    timer.end({ result: resultType });
    sessionEndCounter.inc({ status: 'success' });

    logger.debug(
      {
        sessionId,
        linesRead: result.linesRead,
        messagesAppended: result.appended,
      },
      'Session end processing completed'
    );

    // Backfill episode-message links for completed episodes in this session
    // This handles cases where transcript was ingested after episode.complete() ran
    if (result.appended > 0) {
      try {
        const ctx = getContext();
        const episodeRepo = ctx.repos.episodes;
        const unifiedMessageSource = ctx.services.unifiedMessageSource;
        const conversationRepo = ctx.repos.conversations;

        if (!episodeRepo || (!unifiedMessageSource && !conversationRepo)) {
          logger.debug(
            { sessionId },
            'Episode repo or message source unavailable, skipping backfill'
          );
        } else {
          const completedEpisodes = await episodeRepo.list({
            sessionId,
            status: 'completed',
            includeInactive: false,
          });

          let totalLinked = 0;
          let messageSource: 'transcript' | 'conversation' = 'conversation';
          for (const episode of completedEpisodes) {
            if (episode.startedAt && episode.endedAt) {
              if (unifiedMessageSource) {
                const linkResult = await unifiedMessageSource.linkMessagesToEpisode({
                  episodeId: episode.id,
                  sessionId,
                  startTime: episode.startedAt,
                  endTime: episode.endedAt,
                });
                totalLinked += linkResult.linked;
                messageSource = linkResult.source;
              } else if (conversationRepo) {
                const linked = await conversationRepo.linkMessagesToEpisode({
                  episodeId: episode.id,
                  sessionId,
                  startTime: episode.startedAt,
                  endTime: episode.endedAt,
                });
                totalLinked += linked;
              }
            }
          }

          if (totalLinked > 0) {
            logger.info(
              {
                sessionId,
                episodesProcessed: completedEpisodes.length,
                messagesLinked: totalLinked,
                messageSource,
              },
              'Backfilled episode-message links on session end'
            );
          }
        }
      } catch (backfillError) {
        logger.warn(
          {
            sessionId,
            error: backfillError instanceof Error ? backfillError.message : String(backfillError),
          },
          'Episode-message backfill failed on session end (non-fatal)'
        );
      }
    }

    // Auto-extract learnings from the conversation if messages were ingested
    if (result.appended > 0) {
      try {
        logger.debug({ sessionId, projectId }, 'Running auto-observe on session end');
        const observeResult = await handleObserve({
          sessionId,
          projectId,
          command: 'observe',
          subcommand: '',
          args: [],
        });

        if (observeResult.exitCode === 0 && observeResult.stderr.length > 0) {
          logger.info(
            { sessionId, output: observeResult.stderr.join(' ') },
            'Auto-observe completed on session end'
          );
        }
      } catch (observeError) {
        // Don't fail the session end if observe fails - just log it
        logger.warn(
          {
            sessionId,
            error: observeError instanceof Error ? observeError.message : String(observeError),
          },
          'Auto-observe failed on session end (non-fatal)'
        );
      }

      // Run behavior analysis (Trigger 5: Hook-Based Behavior Observation)
      // Analyzes tool use sequences to detect patterns and record experiences
      try {
        const behaviorObserver = getBehaviorObserverService();
        const analysisResult = behaviorObserver.analyzeSession(sessionId);

        if (analysisResult.patterns.length > 0) {
          logger.info(
            {
              sessionId,
              patternsDetected: analysisResult.patterns.length,
              patternTypes: analysisResult.patterns.map((p) => p.type),
              eventsAnalyzed: analysisResult.eventsAnalyzed,
            },
            'Behavior patterns detected from tool sequences'
          );

          // Record detected patterns as experiences via CaptureService
          const ctx = getContext();
          const captureService = ctx.services.capture;

          if (captureService) {
            for (const pattern of analysisResult.patterns) {
              try {
                await captureService.recordBehaviorObservation({
                  sessionId,
                  projectId,
                  agentId,
                  pattern,
                  events: behaviorObserver.getSessionEvents(sessionId),
                });
                logger.debug(
                  { sessionId, patternType: pattern.type, patternTitle: pattern.title },
                  'Behavior pattern recorded as experience'
                );
              } catch (recordError) {
                logger.warn(
                  {
                    sessionId,
                    patternType: pattern.type,
                    error: recordError instanceof Error ? recordError.message : String(recordError),
                  },
                  'Failed to record behavior pattern (non-fatal)'
                );
              }
            }
          }

          // Create episodes from detected behavior patterns (frictionless episode creation)
          const episodeService = ctx.services.episode;
          if (episodeService) {
            for (const pattern of analysisResult.patterns) {
              try {
                // Create episode for the detected pattern
                const episode = await episodeService.create({
                  scopeType: 'session',
                  scopeId: sessionId,
                  sessionId,
                  name: pattern.title,
                  description: `${pattern.scenario}\n\nOutcome: ${pattern.outcome}`,
                  triggerType: 'behavior_pattern',
                  triggerRef: pattern.type,
                  tags: ['auto-detected', `pattern:${pattern.type}`],
                  metadata: {
                    confidence: pattern.confidence,
                    eventIndices: pattern.eventIndices,
                    applicability: pattern.applicability,
                    contraindications: pattern.contraindications,
                    nameSource: 'auto',
                  },
                  createdBy: agentId,
                });

                // Start and immediately complete the episode (it already happened)
                await episodeService.start(episode.id);
                await episodeService.complete(
                  episode.id,
                  pattern.outcome,
                  pattern.confidence >= 0.8 ? 'success' : 'partial'
                );

                logger.debug(
                  {
                    sessionId,
                    episodeId: episode.id,
                    patternType: pattern.type,
                    patternTitle: pattern.title,
                  },
                  'Episode created from behavior pattern'
                );
              } catch (episodeError) {
                logger.warn(
                  {
                    sessionId,
                    patternType: pattern.type,
                    error:
                      episodeError instanceof Error ? episodeError.message : String(episodeError),
                  },
                  'Failed to create episode from behavior pattern (non-fatal)'
                );
              }
            }
          }
        }

        behaviorObserver.clearSession(sessionId);
      } catch (behaviorError) {
        // Don't fail the session end if behavior analysis fails - just log it
        logger.warn(
          {
            sessionId,
            error: behaviorError instanceof Error ? behaviorError.message : String(behaviorError),
          },
          'Behavior analysis failed on session end (non-fatal)'
        );
      }

      // Run unified learning pipeline via LibrarianService
      // This orchestrates: experience capture → pattern analysis → maintenance
      if (DEFAULT_LIBRARIAN_CONFIG.triggerOnSessionEnd) {
        try {
          const ctx = getContext();
          const librarianService = ctx.services.librarian;

          // Check if MCP already triggered processing (prevents double processing)
          const session = await ctx.repos.sessions.getById(sessionId);
          const sessionMetadata = session?.metadata as Record<string, unknown> | null;
          const processingTriggeredAt = sessionMetadata?.processingTriggeredAt;
          const processingTriggeredBy = sessionMetadata?.processingTriggeredBy;

          if (processingTriggeredAt && processingTriggeredBy === 'mcp') {
            logger.debug(
              { sessionId, processingTriggeredAt, processingTriggeredBy },
              'Skipping librarian processing - already triggered by MCP'
            );
          } else if (librarianService) {
            // Mark processing as triggered by hook
            if (session) {
              await ctx.repos.sessions.update(sessionId, {
                metadata: {
                  ...sessionMetadata,
                  processingTriggeredAt: new Date().toISOString(),
                  processingTriggeredBy: 'hook',
                },
              });
            }
            const unifiedMessageSource = ctx.services.unifiedMessageSource;
            let messages: Array<{
              role: 'user' | 'assistant' | 'system';
              content: string;
              createdAt?: string;
              toolsUsed?: string[];
            }> = [];
            let messageSource: 'transcript' | 'conversation' = 'conversation';

            if (unifiedMessageSource) {
              const result = await unifiedMessageSource.getMessagesForSession(sessionId, {
                limit: 100,
              });
              messages = result.messages.map((msg) => ({
                role:
                  msg.role === 'agent'
                    ? 'assistant'
                    : (msg.role as 'user' | 'assistant' | 'system'),
                content: msg.content,
                createdAt: msg.timestamp,
                toolsUsed: msg.toolsUsed ?? undefined,
              }));
              messageSource = result.source;
              logger.debug(
                { sessionId, messageSource, messageCount: messages.length },
                'Retrieved messages via unified source for librarian'
              );
            } else {
              const repos = ctx.repos;
              const conversations = await repos.conversations.list(
                { sessionId, status: 'active' },
                { limit: 1, offset: 0 }
              );

              const conversation = conversations[0];
              const rawMessages = conversation
                ? await repos.conversations.getMessages(conversation.id, 100, 0)
                : [];
              messages = rawMessages.map((msg) => ({
                role: msg.role as 'user' | 'assistant' | 'system',
                content: msg.content,
                createdAt: msg.createdAt ?? undefined,
                toolsUsed: msg.toolsUsed ?? undefined,
              }));
            }

            // Run unified session end processing
            logger.debug(
              { sessionId, projectId, messageSource },
              'Running unified session end via Librarian'
            );
            const sessionEndResult = await librarianService.onSessionEnd({
              sessionId,
              projectId,
              agentId,
              messages,
            });

            // Log summary of results
            const hasCapture =
              sessionEndResult.capture && sessionEndResult.capture.experiencesExtracted > 0;
            const hasMissedExtraction =
              sessionEndResult.missedExtraction &&
              sessionEndResult.missedExtraction.queuedForReview > 0;
            const hasAnalysis =
              sessionEndResult.analysis && sessionEndResult.analysis.patternsDetected > 0;
            const hasMaintenance =
              sessionEndResult.maintenance &&
              (sessionEndResult.maintenance.consolidationDeduped > 0 ||
                sessionEndResult.maintenance.forgettingArchived > 0 ||
                sessionEndResult.maintenance.graphNodesCreated > 0);

            if (hasCapture || hasMissedExtraction || hasAnalysis || hasMaintenance) {
              logger.info(
                {
                  sessionId,
                  projectId,
                  durationMs: sessionEndResult.timing.durationMs,
                  capture: sessionEndResult.capture
                    ? {
                        experiences: sessionEndResult.capture.experiencesExtracted,
                        knowledge: sessionEndResult.capture.knowledgeExtracted,
                      }
                    : undefined,
                  missedExtraction: sessionEndResult.missedExtraction
                    ? {
                        extracted: sessionEndResult.missedExtraction.totalExtracted,
                        queued: sessionEndResult.missedExtraction.queuedForReview,
                        filtered: sessionEndResult.missedExtraction.duplicatesFiltered,
                      }
                    : undefined,
                  analysis: sessionEndResult.analysis
                    ? {
                        patterns: sessionEndResult.analysis.patternsDetected,
                        queued: sessionEndResult.analysis.queuedForReview,
                      }
                    : undefined,
                  maintenance: sessionEndResult.maintenance
                    ? {
                        deduped: sessionEndResult.maintenance.consolidationDeduped,
                        archived: sessionEndResult.maintenance.forgettingArchived,
                        graphNodes: sessionEndResult.maintenance.graphNodesCreated,
                      }
                    : undefined,
                  errors: sessionEndResult.errors?.length ?? 0,
                },
                'Unified session end completed'
              );
            }
          }
        } catch (librarianError) {
          // Don't fail the session end if librarian fails - just log it
          logger.warn(
            {
              sessionId,
              error:
                librarianError instanceof Error ? librarianError.message : String(librarianError),
            },
            'Unified session end failed (non-fatal)'
          );
        }
      }
    }

    getHookLearningService()
      .onSessionEnd(sessionId)
      .catch((err) => {
        logger.warn(
          { sessionId, error: err instanceof Error ? err.message : String(err) },
          'Session-end outcome analysis failed (non-fatal)'
        );
      });

    getInjectionTrackerService().clearSession(sessionId);
    logger.debug({ sessionId }, 'Cleared injection tracker for ended session');

    return { exitCode: 0, stdout: [], stderr: [] };
  } catch (error) {
    timer.end({ result: 'failed' });
    sessionEndCounter.inc({ status: 'failed' });

    logger.error(
      {
        sessionId,
        transcriptPath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Session end processing failed'
    );

    return {
      exitCode: 2,
      stdout: [],
      stderr: [`Session end failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
