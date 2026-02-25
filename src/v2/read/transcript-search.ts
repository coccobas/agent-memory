/**
 * Transcript search — FTS-based search over transcript messages.
 *
 * Returns conversation snippets with surrounding context messages.
 * Intentionally separate from the entry ReadPipeline since the
 * return type (TranscriptSnippet) is fundamentally different from
 * RetrievalResult.
 */

import type Database from 'better-sqlite3';
import type {
  TranscriptSearchRequest,
  TranscriptSearchResponse,
  TranscriptSnippet,
} from '../contracts/transcript-query.js';
import type { TranscriptMessage, TranscriptRole } from '../contracts/transcript.js';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface FtsMatchRow {
  message_id: string;
  transcript_id: string;
  role: string;
  rank: number;
}

interface TranscriptMetaRow {
  claude_session_id: string;
  project_scope_id: string | null;
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
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONTEXT_WINDOW = 2;
const MAX_CONTEXT_WINDOW = 5;
const MAX_SNIPPET_MESSAGES = 20;

// ---------------------------------------------------------------------------
// FTS query sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize a user query for FTS5 MATCH.
 * Strips FTS operators and special characters that could cause syntax errors.
 */
function sanitizeFtsQuery(raw: string): string {
  // Remove FTS5 operators and special chars
  const cleaned = raw
    .replace(/[*"(){}[\]^~<>:]/g, ' ')
    .replace(/\b(AND|OR|NOT|NEAR)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  // Use implicit AND between words for FTS5
  const words = cleaned.split(' ').filter((w) => w.length > 0);
  return words.join(' ');
}

// ---------------------------------------------------------------------------
// Row → Domain mapping
// ---------------------------------------------------------------------------

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
// Search
// ---------------------------------------------------------------------------

/**
 * Search transcript messages via FTS5 and return snippets with context.
 *
 * The context window loads N messages before and after the matched message,
 * giving the caller a conversation fragment rather than an isolated hit.
 */
export function searchTranscripts(
  sqlite: Database.Database,
  request: TranscriptSearchRequest
): TranscriptSearchResponse {
  const ftsQuery = sanitizeFtsQuery(request.query);
  if (!ftsQuery) {
    return { results: [], totalCount: 0 };
  }

  const contextWindow = Math.min(
    request.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    MAX_CONTEXT_WINDOW
  );

  const limit = request.limit;
  const offset = request.offset ?? 0;

  // Build the FTS query with optional filters
  const conditions: string[] = ['f.v2_transcript_fts MATCH ?'];
  const params: unknown[] = [ftsQuery];

  if (request.transcriptId) {
    conditions.push('f.transcript_id = ?');
    params.push(request.transcriptId);
  }

  if (request.scope?.id) {
    conditions.push('t.project_scope_id = ?');
    params.push(`project:${request.scope.id}`);
  }

  if (request.roles && request.roles.length > 0) {
    const placeholders = request.roles.map(() => '?').join(', ');
    conditions.push(`f.role IN (${placeholders})`);
    params.push(...request.roles);
  }

  const whereClause = conditions.join(' AND ');

  // Count total matches
  let totalCount: number;
  try {
    const countRow = sqlite
      .prepare(
        `SELECT COUNT(*) AS c
         FROM v2_transcript_fts f
         JOIN v2_transcripts t ON t.id = f.transcript_id
         WHERE ${whereClause}`
      )
      .get(...params) as { c: number };
    totalCount = countRow.c;
  } catch {
    // FTS query error → return empty
    return { results: [], totalCount: 0 };
  }

  if (totalCount === 0) {
    return { results: [], totalCount: 0 };
  }

  // Fetch matched messages with rank
  let matchRows: FtsMatchRow[];
  try {
    matchRows = sqlite
      .prepare(
        `SELECT f.message_id, f.transcript_id, f.role, rank
         FROM v2_transcript_fts f
         JOIN v2_transcripts t ON t.id = f.transcript_id
         WHERE ${whereClause}
         ORDER BY rank
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as FtsMatchRow[];
  } catch {
    return { results: [], totalCount: 0 };
  }

  // Build snippets with context
  const snippets: TranscriptSnippet[] = [];

  for (const match of matchRows) {
    // Get matched message's sequence_num
    const msgRow = sqlite
      .prepare(`SELECT sequence_num FROM v2_transcript_messages WHERE id = ?`)
      .get(match.message_id) as { sequence_num: number } | undefined;

    if (!msgRow) continue;

    const seqNum = msgRow.sequence_num;

    // Load context window
    const startSeq = Math.max(1, seqNum - contextWindow);
    const endSeq = seqNum + contextWindow;

    const contextRows = sqlite
      .prepare(
        `SELECT * FROM v2_transcript_messages
         WHERE transcript_id = ?
           AND sequence_num >= ?
           AND sequence_num <= ?
         ORDER BY sequence_num ASC
         LIMIT ?`
      )
      .all(match.transcript_id, startSeq, endSeq, MAX_SNIPPET_MESSAGES) as MessageRow[];

    // Get transcript metadata
    const txMeta = sqlite
      .prepare(
        `SELECT claude_session_id, project_scope_id, created_at
         FROM v2_transcripts WHERE id = ?`
      )
      .get(match.transcript_id) as TranscriptMetaRow | undefined;

    if (!txMeta) continue;

    snippets.push({
      transcriptId: match.transcript_id,
      transcript: {
        claudeSessionId: txMeta.claude_session_id,
        projectScopeId: txMeta.project_scope_id,
        createdAt: txMeta.created_at,
      },
      messages: contextRows.map(rowToMessage),
      matchedMessageId: match.message_id,
      score: -match.rank, // FTS5 rank is negative (lower = better), invert for display
    });
  }

  return { results: snippets, totalCount };
}
