/**
 * V2 Hook Dispatcher — Claude Code hook orchestration.
 *
 * Three handlers for Claude Code's hook lifecycle:
 * - session-start: Create transcript record
 * - post-tool-use: Read transcript incrementally, append messages
 * - session-end: Final ingest + extraction
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SqliteMemoryV2Runtime } from '../adapters/sqlite/factory.js';
import type { ExtractionSummary } from '../contracts/transcript.js';
import type { EmbeddingService } from '../indexing/embedding-pipeline.js';
import {
  upsertTranscript,
  appendMessages,
  findByClaudeSessionId,
  updateTranscriptStatus,
} from '../adapters/sqlite/transcript-store.js';
import { readTranscriptIncremental } from './transcript-parser.js';
import { runSessionEndExtraction } from './extractor.js';
import { ensureProjectScope } from '../mcp/context-detection.js';
import { assignTranscriptToTopic } from '../topics/assigner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DispatcherDeps {
  readonly sqlite: Database.Database;
  readonly runtime: SqliteMemoryV2Runtime;
  readonly idGenerator?: () => string;
  readonly embeddingService?: EmbeddingService;
}

export interface SessionStartInput {
  readonly sessionId: string;
  readonly projectId?: string;
  readonly transcriptPath?: string;
  readonly agentId?: string;
  readonly cwd?: string;
}

export interface PostToolUseInput {
  readonly sessionId: string;
}

export interface SessionEndInput {
  readonly sessionId: string;
  readonly projectId?: string;
}

export interface SessionEndResult {
  readonly extracted?: ExtractionSummary;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Handle session-start hook event.
 * Creates the transcript record and ensures the project scope exists.
 */
export async function handleHookSessionStart(
  deps: DispatcherDeps,
  input: SessionStartInput
): Promise<void> {
  const genId = deps.idGenerator ?? (() => randomUUID());

  if (input.projectId) {
    ensureProjectScope(deps.sqlite, input.projectId, undefined, input.cwd);
  }

  upsertTranscript(deps.sqlite, {
    id: genId(),
    claudeSessionId: input.sessionId,
    status: 'active',
    projectScopeId: input.projectId ? `project:${input.projectId}` : undefined,
    transcriptPath: input.transcriptPath,
    agentId: input.agentId ?? 'claude-code',
  });
}

/**
 * Handle post-tool-use hook event.
 * Reads new lines from the transcript file and appends them to the store.
 */
export async function handleHookPostToolUse(
  deps: DispatcherDeps,
  input: PostToolUseInput
): Promise<void> {
  const genId = deps.idGenerator ?? (() => randomUUID());
  const transcript = findByClaudeSessionId(deps.sqlite, input.sessionId);

  if (!transcript) return;
  if (!transcript.transcriptPath) return;

  const result = readTranscriptIncremental(transcript.transcriptPath, transcript.byteOffset);

  if (result.messages.length === 0) return;

  // Get current max sequence
  const maxSeqRow = deps.sqlite
    .prepare(
      `SELECT COALESCE(MAX(sequence_num), 0) AS max_seq
       FROM v2_transcript_messages WHERE transcript_id = ?`
    )
    .get(transcript.id) as { max_seq: number };

  let nextSeq = maxSeqRow.max_seq + 1;

  const messages = result.messages.map((msg) => ({
    id: genId(),
    role: msg.role,
    content: msg.content,
    sequenceNum: nextSeq++,
    toolName: msg.toolName ?? undefined,
    timestamp: msg.timestamp ?? undefined,
  }));

  appendMessages(deps.sqlite, {
    transcriptId: transcript.id,
    messages,
    newByteOffset: result.newByteOffset,
  });
}

/**
 * Handle session-end hook event.
 * Does a final transcript read, marks as ended, then runs extraction.
 */
export async function handleHookSessionEnd(
  deps: DispatcherDeps,
  input: SessionEndInput
): Promise<SessionEndResult> {
  const genId = deps.idGenerator ?? (() => randomUUID());
  const transcript = findByClaudeSessionId(deps.sqlite, input.sessionId);

  if (!transcript) {
    return {};
  }

  // Final incremental read — capture any messages written since the last
  // post-tool-use hook (or all messages if post-tool-use never fired).
  if (transcript.transcriptPath) {
    const result = readTranscriptIncremental(transcript.transcriptPath, transcript.byteOffset);

    if (result.messages.length > 0) {
      const maxSeqRow = deps.sqlite
        .prepare(
          `SELECT COALESCE(MAX(sequence_num), 0) AS max_seq
           FROM v2_transcript_messages WHERE transcript_id = ?`
        )
        .get(transcript.id) as { max_seq: number };

      let nextSeq = maxSeqRow.max_seq + 1;

      const messages = result.messages.map((msg) => ({
        id: genId(),
        role: msg.role,
        content: msg.content,
        sequenceNum: nextSeq++,
        toolName: msg.toolName ?? undefined,
        timestamp: msg.timestamp ?? undefined,
      }));

      appendMessages(deps.sqlite, {
        transcriptId: transcript.id,
        messages,
        newByteOffset: result.newByteOffset,
      });
    }
  }

  // Mark as ended
  updateTranscriptStatus(deps.sqlite, transcript.id, 'ended');

  // Resolve project ID
  const projectExternalId = input.projectId ?? extractProjectId(transcript.projectScopeId);

  if (!projectExternalId) {
    updateTranscriptStatus(deps.sqlite, transcript.id, 'extracted');
    return { extracted: { candidates: 0, stored: 0, duplicatesSkipped: 0 } };
  }

  const extracted = await runSessionEndExtraction(deps.sqlite, deps.runtime, transcript.id, {
    projectExternalId,
  });

  // Fire-and-forget: auto-assign transcript to a topic
  if (transcript.projectScopeId) {
    const embeddingService = deps.embeddingService;
    if (embeddingService) {
      assignTranscriptToTopic(
        { sqlite: deps.sqlite, embeddingService },
        { transcriptId: transcript.id, projectScopeId: transcript.projectScopeId }
      ).catch(() => {
        /* non-fatal */
      });
    }
  }

  return { extracted };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractProjectId(scopeId: string | null): string | null {
  if (!scopeId) return null;
  const colonIdx = scopeId.indexOf(':');
  if (colonIdx < 0) return scopeId;
  return scopeId.slice(colonIdx + 1) || null;
}
