import { conversationRepo } from '../../db/repositories/conversations.js';
import { readTranscriptFromOffset } from '../../utils/transcript-cursor.js';
import { extractMessageFromTranscriptEntry } from './shared.js';
import { getAgentMemoryStatePath, loadState, saveState } from './state-file.js';

export function ingestTranscript(params: {
  sessionId: string;
  transcriptPath: string;
  projectId?: string;
  agentId?: string;
  cwd?: string;
}): { appended: number; linesRead: number } {
  const { sessionId, transcriptPath } = params;

  const statePath = getAgentMemoryStatePath();
  const state = loadState(statePath);

  const byteOffsetKey = `claude:byteOffset:${sessionId}:${transcriptPath}`;
  const lastByteOffset = typeof state[byteOffsetKey] === 'number' ? state[byteOffsetKey] : 0;

  const result = readTranscriptFromOffset(transcriptPath, lastByteOffset);

  if (result.wasTruncated) {
    state[byteOffsetKey] = 0;
    saveState(statePath, state);
    const resetResult = readTranscriptFromOffset(transcriptPath, 0);
    return processTranscriptLines(resetResult, params, state, statePath, byteOffsetKey);
  }

  if (result.lines.length === 0) {
    return { appended: 0, linesRead: 0 };
  }

  return processTranscriptLines(result, params, state, statePath, byteOffsetKey);
}

function processTranscriptLines(
  result: { lines: string[]; nextByteOffset: number },
  params: { sessionId: string; transcriptPath: string; projectId?: string; agentId?: string; cwd?: string },
  state: Record<string, unknown>,
  statePath: string,
  byteOffsetKey: string
): { appended: number; linesRead: number } {
  const { sessionId, projectId, agentId, cwd, transcriptPath } = params;

  const existing = conversationRepo.list(
    { sessionId, status: 'active' },
    { limit: 1, offset: 0 }
  )[0];
  const conversation = existing
    ? existing
    : conversationRepo.create({
        sessionId,
        projectId,
        agentId: agentId ?? undefined,
        title: cwd ? `Claude Code: ${cwd}` : 'Claude Code conversation',
        metadata: { source: 'claude-code', transcriptPath },
      });

  let appended = 0;
  for (const line of result.lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const msg = extractMessageFromTranscriptEntry(parsed);
    if (!msg) continue;

    conversationRepo.addMessage({
      conversationId: conversation.id,
      role: msg.role,
      content: msg.content,
      metadata: { source: 'claude-code', sessionId },
    });
    appended += 1;
  }

  state[byteOffsetKey] = result.nextByteOffset;
  saveState(statePath, state);

  return { appended, linesRead: result.lines.length };
}

