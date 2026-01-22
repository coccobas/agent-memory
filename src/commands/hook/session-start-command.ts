import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { ensureSessionIdExists } from './session.js';
import { createComponentLogger } from '../../utils/logger.js';
import { getContext } from '../../core/container.js';
import { getSqlite } from '../../db/connection.js';

const logger = createComponentLogger('session-start');

/**
 * Get entry counts for a project scope using efficient UNION ALL query.
 * Returns counts for guidelines, knowledge, and tools.
 */
function getProjectEntryCounts(projectId: string): {
  guidelines: number;
  knowledge: number;
  tools: number;
} {
  try {
    const sqlite = getSqlite();
    const query = `
      SELECT 'guidelines' as entry_type, COUNT(*) as count
      FROM guidelines WHERE is_active = 1 AND scope_type = 'project' AND scope_id = ?
      UNION ALL
      SELECT 'knowledge', COUNT(*)
      FROM knowledge WHERE is_active = 1 AND scope_type = 'project' AND scope_id = ?
      UNION ALL
      SELECT 'tools', COUNT(*)
      FROM tools WHERE is_active = 1 AND scope_type = 'project' AND scope_id = ?
    `;
    const rows = sqlite.prepare(query).all(projectId, projectId, projectId) as Array<{
      entry_type: string;
      count: number;
    }>;

    const counts = { guidelines: 0, knowledge: 0, tools: 0 };
    for (const row of rows) {
      if (row.entry_type === 'guidelines') counts.guidelines = row.count;
      else if (row.entry_type === 'knowledge') counts.knowledge = row.count;
      else if (row.entry_type === 'tools') counts.tools = row.count;
    }
    return counts;
  } catch (error) {
    logger.debug({ error, projectId }, 'Failed to get entry counts');
    return { guidelines: 0, knowledge: 0, tools: 0 };
  }
}

export async function runSessionStartCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
}): Promise<HookCommandResult> {
  const { projectId, agentId, input } = params;

  // Generate a fallback session ID if not provided
  // This allows the hook to work even when Claude Code sends minimal/empty input
  const sessionId = input.session_id || `hook-session-${Date.now()}`;
  const source = input.source ?? 'startup';

  if (!input.session_id) {
    logger.debug(
      { generatedSessionId: sessionId, source },
      'Session start hook called without session_id, using generated ID'
    );
  }

  logger.debug({ sessionId, projectId, agentId, source }, 'Starting session start processing');

  try {
    // Ensure the session exists (creates if needed)
    await ensureSessionIdExists(sessionId, projectId);

    // Run session start processing via LibrarianService
    // This orchestrates: latent memory warming
    try {
      const ctx = getContext();
      const librarianService = ctx.services.librarian;

      if (librarianService) {
        logger.debug({ sessionId, projectId, source }, 'Running session start via Librarian');

        const sessionStartResult = await librarianService.onSessionStart({
          sessionId,
          projectId,
          agentId,
          source,
        });

        // Log summary of results
        const hasClearCapture = sessionStartResult.clearCapture;
        const hasWarmup = sessionStartResult.warmup && sessionStartResult.warmup.entriesWarmed > 0;

        if (hasClearCapture || hasWarmup) {
          logger.info(
            {
              sessionId,
              projectId,
              source,
              durationMs: sessionStartResult.timing.durationMs,
              clearCapture: hasClearCapture
                ? {
                    experiencesExtracted: sessionStartResult.clearCapture?.experiencesExtracted,
                    knowledgeExtracted: sessionStartResult.clearCapture?.knowledgeExtracted,
                    consolidationDeduped: sessionStartResult.clearCapture?.consolidationDeduped,
                  }
                : undefined,
              warmup: hasWarmup
                ? {
                    entriesWarmed: sessionStartResult.warmup?.entriesWarmed,
                    cacheHitRate: sessionStartResult.warmup?.cacheHitRate,
                  }
                : undefined,
              errors: sessionStartResult.errors?.length ?? 0,
            },
            hasClearCapture
              ? 'Session start completed with clear capture'
              : 'Session start completed with cache warming'
          );
        } else {
          logger.debug(
            {
              sessionId,
              projectId,
              source,
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

    // P4: Get entry counts for the project to return to client
    const counts = projectId
      ? getProjectEntryCounts(projectId)
      : { guidelines: 0, knowledge: 0, tools: 0 };

    return {
      exitCode: 0,
      stdout: [JSON.stringify({ sessionId, counts })],
      stderr: [],
    };
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
