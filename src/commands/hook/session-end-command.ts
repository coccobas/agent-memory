import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { ensureSessionIdExists } from './session.js';
import { ingestTranscript } from './transcript-ingest.js';
import { createComponentLogger } from '../../utils/logger.js';
import {
  sessionEndCounter,
  transcriptIngestDuration,
  transcriptLinesCounter,
  transcriptMessagesCounter,
} from '../../utils/metrics.js';

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
