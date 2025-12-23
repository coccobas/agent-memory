import { getDb, getSqlite } from '../../db/connection.js';
import { createRepositories } from '../../core/factory/repositories.js';
import { readTranscriptFromOffset } from '../../utils/transcript-cursor.js';
import { extractMessageFromTranscriptEntry } from './shared.js';
import { getAgentMemoryStatePath, loadState, saveState } from './state-file.js';

function getConversationRepo() {
  return createRepositories({ db: getDb(), sqlite: getSqlite() }).conversations;
}

export async function ingestTranscript(params: {
  sessionId: string;
  transcriptPath: string;
  projectId?: string;
  agentId?: string;
  cwd?: string;
}): Promise<{ appended: number; linesRead: number }> {
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

async function processTranscriptLines(
  result: { lines: string[]; nextByteOffset: number },
  params: {
    sessionId: string;
    transcriptPath: string;
    projectId?: string;
    agentId?: string;
    cwd?: string;
  },
  state: Record<string, unknown>,
  statePath: string,
  byteOffsetKey: string
): Promise<{ appended: number; linesRead: number }> {
  const { sessionId, projectId, agentId, cwd, transcriptPath } = params;
  const conversationRepo = getConversationRepo();

  const existingList = await conversationRepo.list(
    { sessionId, status: 'active' },
    { limit: 1, offset: 0 }
  );
  const existing = existingList[0];
  const conversation = existing
    ? existing
    : await conversationRepo.create({
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

    await conversationRepo.addMessage({
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
