import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { ensureSessionIdExists, getObserveState } from './session.js';
import { hasWarnedReview, isReviewSuspended, setWarnedReview } from './state-file.js';
import { ingestTranscript } from './transcript-ingest.js';
import { writeSessionSummaryFile } from './session-summary.js';

export function runStopCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
}): HookCommandResult {
  const { projectId, agentId, input } = params;

  const sessionId = input.session_id;
  const transcriptPath = input.transcript_path;
  const cwd = input.cwd || process.cwd();

  if (!sessionId) {
    return { exitCode: 2, stdout: [], stderr: ['Missing session_id in hook input'] };
  }
  if (!transcriptPath) {
    return { exitCode: 2, stdout: [], stderr: ['Missing transcript_path in hook input'] };
  }

  ensureSessionIdExists(sessionId, projectId);

  ingestTranscript({
    sessionId,
    transcriptPath,
    projectId,
    agentId,
    cwd,
  });

  if (isReviewSuspended(sessionId)) {
    return { exitCode: 0, stdout: [], stderr: [] };
  }

  const observe = getObserveState(sessionId);
  const { itemCount } = writeSessionSummaryFile(sessionId, cwd);

  if (!observe.committedAt && !hasWarnedReview(sessionId)) {
    setWarnedReview(sessionId);
    if (itemCount > 0) {
      return {
        exitCode: 0,
        stdout: [],
        stderr: [`✓ Session tracked (${itemCount} items) - see .claude/session-summary.md`],
      };
    }
    return { exitCode: 0, stdout: [], stderr: ['✓ Session tracked - no new items'] };
  }

  if ((observe.needsReviewCount ?? 0) > 0 && !observe.reviewedAt) {
    return {
      exitCode: 0,
      stdout: [],
      stderr: [
        `✓ Session (${itemCount} items, ${observe.needsReviewCount} need review) - run: npx agent-memory review`,
      ],
    };
  }

  return { exitCode: 0, stdout: [], stderr: [] };
}
