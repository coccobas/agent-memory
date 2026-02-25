/**
 * V2 Provenance Store — SQLite adapter.
 *
 * Links extracted entries back to the transcript message range
 * that produced them. Enables "where did this entry come from?"
 * queries and transcript-level context recovery.
 */

import type Database from 'better-sqlite3';
import type { ProvenanceRecord } from '../../contracts/provenance.js';
import type { TranscriptMessage } from '../../contracts/transcript.js';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface InsertProvenanceInput {
  readonly id: string;
  readonly entryId: string;
  readonly transcriptId: string;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly extractorName: string;
  readonly confidence?: number;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface ProvenanceRow {
  id: string;
  entry_id: string;
  transcript_id: string;
  seq_start: number;
  seq_end: number;
  extractor_name: string;
  confidence: number | null;
  created_at: string;
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

function rowToProvenance(row: ProvenanceRow): ProvenanceRecord {
  return {
    id: row.id,
    entryId: row.entry_id,
    transcriptId: row.transcript_id,
    seqStart: row.seq_start,
    seqEnd: row.seq_end,
    extractorName: row.extractor_name,
    confidence: row.confidence,
    createdAt: row.created_at,
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
    role: row.role as TranscriptMessage['role'],
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
 * Insert a provenance record linking an entry to a transcript message range.
 * Uses INSERT OR IGNORE to handle the unique constraint gracefully.
 */
export function insertProvenance(
  sqlite: Database.Database,
  input: InsertProvenanceInput
): ProvenanceRecord | null {
  const now = new Date().toISOString();

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO v2_entry_provenance
         (id, entry_id, transcript_id, seq_start, seq_end, extractor_name, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.entryId,
      input.transcriptId,
      input.seqStart,
      input.seqEnd,
      input.extractorName,
      input.confidence ?? null,
      now
    );

  const row = sqlite.prepare(`SELECT * FROM v2_entry_provenance WHERE id = ?`).get(input.id) as
    | ProvenanceRow
    | undefined;

  return row ? rowToProvenance(row) : null;
}

/**
 * Load all provenance records for an entry, ordered by seq_start.
 */
export function loadProvenanceByEntry(
  sqlite: Database.Database,
  entryId: string
): ProvenanceRecord[] {
  const rows = sqlite
    .prepare(
      `SELECT * FROM v2_entry_provenance
       WHERE entry_id = ?
       ORDER BY seq_start ASC`
    )
    .all(entryId) as ProvenanceRow[];

  return rows.map(rowToProvenance);
}

/**
 * Load all provenance records for a transcript, ordered by seq_start.
 */
export function loadProvenanceByTranscript(
  sqlite: Database.Database,
  transcriptId: string
): ProvenanceRecord[] {
  const rows = sqlite
    .prepare(
      `SELECT * FROM v2_entry_provenance
       WHERE transcript_id = ?
       ORDER BY seq_start ASC`
    )
    .all(transcriptId) as ProvenanceRow[];

  return rows.map(rowToProvenance);
}

/**
 * Load the transcript messages that a provenance record references.
 * Returns messages in the seq_start..seq_end range (inclusive).
 */
export function loadProvenanceSnippet(
  sqlite: Database.Database,
  provenance: ProvenanceRecord
): TranscriptMessage[] {
  const rows = sqlite
    .prepare(
      `SELECT * FROM v2_transcript_messages
       WHERE transcript_id = ?
         AND sequence_num >= ?
         AND sequence_num <= ?
       ORDER BY sequence_num ASC`
    )
    .all(provenance.transcriptId, provenance.seqStart, provenance.seqEnd) as MessageRow[];

  return rows.map(rowToMessage);
}

/**
 * Check if the v2_entry_provenance table exists.
 */
export function hasProvenanceTable(sqlite: Database.Database): boolean {
  const row = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name = 'v2_entry_provenance'`
    )
    .get() as { name: string } | undefined;

  return row !== undefined;
}
