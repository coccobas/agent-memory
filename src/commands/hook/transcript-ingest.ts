import { getDb, getSqlite } from '../../db/connection.js';
import { createRepositories } from '../../core/factory/repositories.js';
import { readTranscriptFromOffset } from '../../utils/transcript-cursor.js';
import { extractMessageFromTranscriptEntry } from './shared.js';
import { getAgentMemoryStatePath, loadState, saveState } from './state-file.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('transcript-ingest');

function getRepos() {
  return createRepositories({ db: getDb(), sqlite: getSqlite() });
}

export interface TranscriptIngestResult {
  appended: number;
  linesRead: number;
  wasTruncated: boolean;
  conversationId?: string;
}

export async function ingestTranscript(params: {
  sessionId: string;
  transcriptPath: string;
  projectId?: string;
  agentId?: string;
  cwd?: string;
}): Promise<TranscriptIngestResult> {
  const { sessionId, transcriptPath } = params;

  logger.debug({ sessionId, transcriptPath }, 'Starting transcript ingestion');

  const statePath = getAgentMemoryStatePath();
  const state = loadState(statePath);

  const byteOffsetKey = `claude:byteOffset:${sessionId}:${transcriptPath}`;
  const lastByteOffset = typeof state[byteOffsetKey] === 'number' ? state[byteOffsetKey] : 0;

  logger.debug({ lastByteOffset, byteOffsetKey }, 'Reading transcript from offset');

  const result = readTranscriptFromOffset(transcriptPath, lastByteOffset);

  if (result.wasTruncated) {
    logger.info(
      { sessionId, transcriptPath, lastByteOffset },
      'Transcript file was truncated, resetting offset to 0'
    );
    state[byteOffsetKey] = 0;
    saveState(statePath, state);
    const resetResult = readTranscriptFromOffset(transcriptPath, 0);
    const processResult = await processTranscriptLines(
      resetResult,
      params,
      state,
      statePath,
      byteOffsetKey
    );
    return { ...processResult, wasTruncated: true };
  }

  if (result.lines.length === 0) {
    logger.debug({ sessionId, transcriptPath }, 'No new lines in transcript');
    return { appended: 0, linesRead: 0, wasTruncated: false };
  }

  const processResult = await processTranscriptLines(
    result,
    params,
    state,
    statePath,
    byteOffsetKey
  );
  return { ...processResult, wasTruncated: false };
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
): Promise<{ appended: number; linesRead: number; conversationId?: string }> {
  const { sessionId, projectId, agentId, cwd, transcriptPath } = params;
  const repos = getRepos();
  const conversationRepo = repos.conversations;

  // Validate projectId exists to avoid FK constraint failure
  let validProjectId: string | undefined;
  if (projectId) {
    const project = await repos.projects.getById(projectId);
    if (project) {
      validProjectId = projectId;
    } else {
      logger.warn(
        { projectId, sessionId },
        'Project ID not found in database, proceeding without project association'
      );
    }
  }

  const existingList = await conversationRepo.list(
    { sessionId, status: 'active' },
    { limit: 1, offset: 0 }
  );
  const existing = existingList[0];
  const isNewConversation = !existing;

  const conversation = existing
    ? existing
    : await conversationRepo.create({
        sessionId,
        projectId: validProjectId,
        agentId: agentId ?? undefined,
        title: cwd ? `Claude Code: ${cwd}` : 'Claude Code conversation',
        metadata: { source: 'claude-code', transcriptPath },
      });

  if (isNewConversation) {
    logger.debug(
      { conversationId: conversation.id, sessionId, projectId: validProjectId },
      'Created new conversation for session'
    );
  }

  let appended = 0;
  let parseErrors = 0;

  for (const line of result.lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      parseErrors++;
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

  logger.debug(
    {
      sessionId,
      conversationId: conversation.id,
      linesRead: result.lines.length,
      messagesAppended: appended,
      parseErrors,
      nextByteOffset: result.nextByteOffset,
    },
    'Transcript processing completed'
  );

  return { appended, linesRead: result.lines.length, conversationId: conversation.id };
}
