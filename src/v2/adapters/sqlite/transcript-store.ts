/**
 * V2 Transcript Store — SQLite adapter.
 *
 * Manages transcript records and messages for hook autocapture.
 * Separate from the entry write plane (MemoryWriteService) since
 * transcripts are operational bookkeeping, not domain entries.
 */

import type Database from 'better-sqlite3';
import type {
  TranscriptRecord,
  TranscriptMessage,
  TranscriptStatus,
  TranscriptRole,
} from '../../contracts/transcript.js';
import { hasTranscriptFtsTable, indexTranscriptMessages } from './transcript-fts.js';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface UpsertTranscriptInput {
  readonly id: string;
  readonly claudeSessionId: string;
  readonly status: TranscriptStatus;
  readonly sessionScopeId?: string;
  readonly projectScopeId?: string;
  readonly topicScopeId?: string;
  readonly transcriptPath?: string;
  readonly agentId?: string;
}

export interface AppendMessagesInput {
  readonly transcriptId: string;
  readonly messages: readonly {
    readonly id: string;
    readonly role: TranscriptRole;
    readonly content: string;
    readonly sequenceNum: number;
    readonly toolName?: string;
    readonly timestamp?: string;
    readonly metadata?: Record<string, unknown>;
  }[];
  readonly newByteOffset: number;
}

export interface AppendMessagesResult {
  readonly messagesStored: number;
}

export interface LoadMessagesOptions {
  readonly fromSequence?: number;
  readonly limit?: number;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface TranscriptRow {
  id: string;
  session_scope_id: string | null;
  project_scope_id: string | null;
  topic_scope_id: string | null;
  topic_assignment: string | null;
  claude_session_id: string;
  transcript_path: string | null;
  agent_id: string | null;
  byte_offset: number;
  message_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  transcript_id: string;
  sequence_num: number;
  role: string;
  content: string;
  tool_name: string | null;
  timestamp: string | null;
  metadata: string;
}

// ---------------------------------------------------------------------------
// Row → Domain mapping
// ---------------------------------------------------------------------------

function rowToTranscript(row: TranscriptRow): TranscriptRecord {
  return {
    id: row.id,
    sessionScopeId: row.session_scope_id,
    projectScopeId: row.project_scope_id,
    topicScopeId: row.topic_scope_id,
    topicAssignment: (row.topic_assignment as TranscriptRecord['topicAssignment']) ?? null,
    claudeSessionId: row.claude_session_id,
    transcriptPath: row.transcript_path,
    agentId: row.agent_id,
    byteOffset: row.byte_offset,
    messageCount: row.message_count,
    status: row.status as TranscriptStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): TranscriptMessage {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata) as Record<string, unknown>;
  } catch {
    // keep empty
  }
  return {
    id: row.id,
    transcriptId: row.transcript_id,
    sequenceNum: row.sequence_num,
    role: row.role as TranscriptRole,
    content: row.content,
    toolName: row.tool_name,
    timestamp: row.timestamp,
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Store functions
// ---------------------------------------------------------------------------

/**
 * Insert or find a transcript by claude_session_id.
 * If the session already exists, return the existing record (idempotent).
 */
export function upsertTranscript(
  sqlite: Database.Database,
  input: UpsertTranscriptInput
): TranscriptRecord {
  const now = new Date().toISOString();

  sqlite
    .prepare(
      `INSERT INTO v2_transcripts
         (id, claude_session_id, session_scope_id, project_scope_id,
          topic_scope_id, transcript_path, agent_id, status, byte_offset,
          message_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
       ON CONFLICT(claude_session_id) DO UPDATE SET
         transcript_path = COALESCE(excluded.transcript_path, v2_transcripts.transcript_path),
         session_scope_id = COALESCE(excluded.session_scope_id, v2_transcripts.session_scope_id),
         project_scope_id = COALESCE(excluded.project_scope_id, v2_transcripts.project_scope_id),
         topic_scope_id = COALESCE(excluded.topic_scope_id, v2_transcripts.topic_scope_id),
         agent_id = COALESCE(excluded.agent_id, v2_transcripts.agent_id),
         updated_at = excluded.updated_at`
    )
    .run(
      input.id,
      input.claudeSessionId,
      input.sessionScopeId ?? null,
      input.projectScopeId ?? null,
      input.topicScopeId ?? null,
      input.transcriptPath ?? null,
      input.agentId ?? null,
      input.status,
      now,
      now
    );

  // Always return the record (could be existing or new)
  const row = sqlite
    .prepare(`SELECT * FROM v2_transcripts WHERE claude_session_id = ?`)
    .get(input.claudeSessionId) as TranscriptRow;

  return rowToTranscript(row);
}

/**
 * Append messages to a transcript and update the byte offset atomically.
 */
export function appendMessages(
  sqlite: Database.Database,
  input: AppendMessagesInput
): AppendMessagesResult {
  const insertMsg = sqlite.prepare(
    `INSERT INTO v2_transcript_messages
       (id, transcript_id, sequence_num, role, content, tool_name, timestamp, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const updateTx = sqlite.prepare(
    `UPDATE v2_transcripts
     SET byte_offset = ?,
         message_count = message_count + ?,
         updated_at = ?
     WHERE id = ?`
  );

  const now = new Date().toISOString();

  const ftsAvailable = hasTranscriptFtsTable(sqlite);

  const runBatch = sqlite.transaction(() => {
    for (const msg of input.messages) {
      insertMsg.run(
        msg.id,
        input.transcriptId,
        msg.sequenceNum,
        msg.role,
        msg.content,
        msg.toolName ?? null,
        msg.timestamp ?? now,
        JSON.stringify(msg.metadata ?? {})
      );
    }

    updateTx.run(input.newByteOffset, input.messages.length, now, input.transcriptId);

    // Populate FTS index (same transaction for consistency)
    if (ftsAvailable) {
      indexTranscriptMessages(sqlite, input.messages, input.transcriptId);
    }
  });

  runBatch();

  return { messagesStored: input.messages.length };
}

/**
 * Update the status of a transcript record.
 */
export function updateTranscriptStatus(
  sqlite: Database.Database,
  transcriptId: string,
  newStatus: TranscriptStatus
): TranscriptRecord | null {
  const now = new Date().toISOString();

  sqlite
    .prepare(`UPDATE v2_transcripts SET status = ?, updated_at = ? WHERE id = ?`)
    .run(newStatus, now, transcriptId);

  const row = sqlite.prepare(`SELECT * FROM v2_transcripts WHERE id = ?`).get(transcriptId) as
    | TranscriptRow
    | undefined;

  return row ? rowToTranscript(row) : null;
}

/**
 * Find a transcript by Claude session ID.
 */
export function findByClaudeSessionId(
  sqlite: Database.Database,
  claudeSessionId: string
): TranscriptRecord | null {
  const row = sqlite
    .prepare(`SELECT * FROM v2_transcripts WHERE claude_session_id = ?`)
    .get(claudeSessionId) as TranscriptRow | undefined;

  return row ? rowToTranscript(row) : null;
}

/**
 * Load messages for a transcript, ordered by sequence_num.
 */
export function loadMessages(
  sqlite: Database.Database,
  transcriptId: string,
  options?: LoadMessagesOptions
): TranscriptMessage[] {
  const fromSeq = options?.fromSequence ?? 0;
  const limit = options?.limit ?? 100_000;

  const rows = sqlite
    .prepare(
      `SELECT * FROM v2_transcript_messages
       WHERE transcript_id = ? AND sequence_num >= ?
       ORDER BY sequence_num ASC
       LIMIT ?`
    )
    .all(transcriptId, fromSeq, limit) as MessageRow[];

  return rows.map(rowToMessage);
}
