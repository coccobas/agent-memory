import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { ensureSessionIdExists } from './session.js';
import { ingestTranscript } from './transcript-ingest.js';

export function runSessionEndCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
}): HookCommandResult {
  const { projectId, agentId, input } = params;

  const sessionId = input.session_id;
  const transcriptPath = input.transcript_path;

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
    cwd: input.cwd,
  });

  return { exitCode: 0, stdout: [], stderr: [] };
}
