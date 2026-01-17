import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { ensureSessionIdExists } from './session.js';
import { createComponentLogger } from '../../utils/logger.js';
import { getContext } from '../../core/container.js';

const logger = createComponentLogger('session-start');

export async function runSessionStartCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
}): Promise<HookCommandResult> {
  const { projectId, agentId, input } = params;

  const sessionId = input.session_id;

  if (!sessionId) {
    logger.warn('Session start hook called without session_id');
    return { exitCode: 2, stdout: [], stderr: ['Missing session_id in hook input'] };
  }

  logger.debug({ sessionId, projectId, agentId }, 'Starting session start processing');

  try {
    // Ensure the session exists (creates if needed)
    await ensureSessionIdExists(sessionId, projectId);

    // Run session start processing via LibrarianService
    // This orchestrates: latent memory warming
    try {
      const ctx = getContext();
      const librarianService = ctx.services.librarian;

      if (librarianService) {
        logger.debug({ sessionId, projectId }, 'Running session start via Librarian');

        const sessionStartResult = await librarianService.onSessionStart({
          sessionId,
          projectId,
          agentId,
        });

        // Log summary of results
        if (sessionStartResult.warmup && sessionStartResult.warmup.entriesWarmed > 0) {
          logger.info(
            {
              sessionId,
              projectId,
              durationMs: sessionStartResult.timing.durationMs,
              warmup: {
                entriesWarmed: sessionStartResult.warmup.entriesWarmed,
                cacheHitRate: sessionStartResult.warmup.cacheHitRate,
              },
              errors: sessionStartResult.errors?.length ?? 0,
            },
            'Session start completed with cache warming'
          );
        } else {
          logger.debug(
            {
              sessionId,
              projectId,
              durationMs: sessionStartResult.timing.durationMs,
            },
            'Session start completed (no entries warmed)'
          );
        }
      } else {
        logger.debug(
          { sessionId },
          'Librarian service not available, skipping session start processing'
        );
      }
    } catch (librarianError) {
      // Don't fail the session start if librarian fails - just log it
      logger.warn(
        {
          sessionId,
          error: librarianError instanceof Error ? librarianError.message : String(librarianError),
        },
        'Session start processing failed (non-fatal)'
      );
    }

    logger.debug({ sessionId }, 'Session start processing completed');

    return { exitCode: 0, stdout: [], stderr: [] };
  } catch (error) {
    logger.error(
      {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Session start processing failed'
    );

    return {
      exitCode: 2,
      stdout: [],
      stderr: [`Session start failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
