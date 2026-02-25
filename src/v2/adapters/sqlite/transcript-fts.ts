/**
 * Transcript FTS index management.
 *
 * Manages the v2_transcript_fts virtual table that enables
 * full-text search over transcript messages.
 * Only user and assistant messages are indexed (tool_use/tool_result/system are noise).
 */

import type Database from 'better-sqlite3';

const INDEXED_ROLES = new Set(['user', 'assistant']);

/** Maximum content length indexed into FTS (avoid bloat from huge tool outputs). */
const MAX_FTS_CONTENT_LENGTH = 4000;

/**
 * Index a single transcript message into the FTS table.
 * Silently skips non-indexable roles and empty content.
 */
export function indexTranscriptMessage(
  sqlite: Database.Database,
  messageId: string,
  transcriptId: string,
  content: string,
  role: string
): void {
  if (!INDEXED_ROLES.has(role)) return;
  if (!content.trim()) return;

  const truncated =
    content.length > MAX_FTS_CONTENT_LENGTH ? content.slice(0, MAX_FTS_CONTENT_LENGTH) : content;

  sqlite
    .prepare(
      `INSERT INTO v2_transcript_fts (message_id, transcript_id, content, role)
       VALUES (?, ?, ?, ?)`
    )
    .run(messageId, transcriptId, truncated, role);
}

/**
 * Index a batch of messages at once (more efficient for bulk inserts).
 */
export function indexTranscriptMessages(
  sqlite: Database.Database,
  messages: readonly {
    readonly id: string;
    readonly role: string;
    readonly content: string;
  }[],
  transcriptId: string
): number {
  const stmt = sqlite.prepare(
    `INSERT INTO v2_transcript_fts (message_id, transcript_id, content, role)
     VALUES (?, ?, ?, ?)`
  );

  let indexed = 0;
  for (const msg of messages) {
    if (!INDEXED_ROLES.has(msg.role)) continue;
    if (!msg.content.trim()) continue;

    const truncated =
      msg.content.length > MAX_FTS_CONTENT_LENGTH
        ? msg.content.slice(0, MAX_FTS_CONTENT_LENGTH)
        : msg.content;

    stmt.run(msg.id, transcriptId, truncated, msg.role);
    indexed += 1;
  }

  return indexed;
}

/**
 * Remove all FTS entries for a transcript.
 * Useful when re-indexing or deleting a transcript.
 */
export function removeTranscriptFtsEntries(sqlite: Database.Database, transcriptId: string): void {
  sqlite.prepare(`DELETE FROM v2_transcript_fts WHERE transcript_id = ?`).run(transcriptId);
}

/**
 * Check if the v2_transcript_fts table exists.
 * Used to gracefully degrade on databases that haven't applied migration 0047.
 */
export function hasTranscriptFtsTable(sqlite: Database.Database): boolean {
  const row = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name = 'v2_transcript_fts'`
    )
    .get() as { name: string } | undefined;

  return row !== undefined;
}
