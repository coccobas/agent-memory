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

const logger = createComponentLogger('session-end');

export async function runSessionEndCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
}): Promise<HookCommandResult> {
  const { projectId, agentId, input } = params;

  const sessionId = input.session_id;
  const transcriptPath = input.transcript_path;

  if (!sessionId) {
    logger.warn('Session end hook called without session_id');
    sessionEndCounter.inc({ status: 'skipped' });
    return { exitCode: 2, stdout: [], stderr: ['Missing session_id in hook input'] };
  }

  if (!transcriptPath) {
    logger.warn({ sessionId }, 'Session end hook called without transcript_path');
    sessionEndCounter.inc({ status: 'skipped' });
    return { exitCode: 2, stdout: [], stderr: ['Missing transcript_path in hook input'] };
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

      // Run unified learning pipeline via LibrarianService
      // This orchestrates: experience capture → pattern analysis → maintenance
      if (DEFAULT_LIBRARIAN_CONFIG.triggerOnSessionEnd) {
        try {
          const ctx = getContext();
          const librarianService = ctx.services.librarian;

          if (librarianService) {
            // Get conversation messages for experience capture
            const repos = ctx.repos;
            const conversations = await repos.conversations.list(
              { sessionId, status: 'active' },
              { limit: 1, offset: 0 }
            );

            const conversation = conversations[0];
            const messages = conversation
              ? await repos.conversations.getMessages(conversation.id, 100, 0)
              : [];

            // Run unified session end processing
            logger.debug({ sessionId, projectId }, 'Running unified session end via Librarian');
            const sessionEndResult = await librarianService.onSessionEnd({
              sessionId,
              projectId,
              agentId,
              messages: messages.map((msg) => ({
                role: msg.role as 'user' | 'assistant' | 'system',
                content: msg.content,
                createdAt: msg.createdAt ?? undefined,
                toolsUsed: msg.toolsUsed ?? undefined,
              })),
            });

            // Log summary of results
            const hasCapture =
              sessionEndResult.capture && sessionEndResult.capture.experiencesExtracted > 0;
            const hasAnalysis =
              sessionEndResult.analysis && sessionEndResult.analysis.patternsDetected > 0;
            const hasMaintenance =
              sessionEndResult.maintenance &&
              (sessionEndResult.maintenance.consolidationDeduped > 0 ||
                sessionEndResult.maintenance.forgettingArchived > 0 ||
                sessionEndResult.maintenance.graphNodesCreated > 0);

            if (hasCapture || hasAnalysis || hasMaintenance) {
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
