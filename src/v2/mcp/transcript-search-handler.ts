/**
 * V2 MCP handler for transcript search, browsing, and provenance queries.
 *
 * Actions:
 * - list: Browse transcripts chronologically (timeline)
 * - load: Load messages for a specific transcript
 * - search: FTS search over transcript messages, returns conversation snippets
 * - provenance: Given an entry ID, returns the transcript snippets that produced it
 */

import type Database from 'better-sqlite3';
import type { AppContext } from '../../core/context.js';
import type { TranscriptSearchRequest } from '../contracts/transcript-query.js';
import type { TranscriptRole } from '../contracts/transcript.js';
import { searchTranscripts } from '../read/transcript-search.js';
// eslint-disable-next-line no-restricted-imports
import { loadMessages } from '../adapters/sqlite/transcript-store.js';
// eslint-disable-next-line no-restricted-imports
import {
  loadProvenanceByEntry,
  loadProvenanceSnippet,
} from '../adapters/sqlite/provenance-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireSqlite(context: AppContext) {
  if (!context.sqlite) {
    throw new Error('memory_v2_requires_sqlite_backend');
  }
  return context.sqlite;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

const VALID_ROLES = new Set<TranscriptRole>([
  'user',
  'assistant',
  'system',
  'tool_use',
  'tool_result',
]);

function asOptionalRoles(value: unknown): TranscriptRole[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const roles: TranscriptRole[] = [];
  for (const v of value) {
    if (typeof v === 'string' && VALID_ROLES.has(v as TranscriptRole)) {
      roles.push(v as TranscriptRole);
    }
  }
  return roles.length > 0 ? roles : undefined;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleV2TranscriptSearch(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const sqlite = requireSqlite(context);
  const action = asString(params.action, 'action');

  if (action === 'list') {
    const limit = asOptionalNumber(params.limit) ?? 20;
    const offset = asOptionalNumber(params.offset) ?? 0;
    const status = asOptionalString(params.status);
    const projectScopeId = asOptionalString(params.projectScopeId);

    return listTranscripts(sqlite, { limit, offset, status, projectScopeId });
  }

  if (action === 'load') {
    const transcriptId = asString(params.transcriptId, 'transcriptId');
    const fromSequence = asOptionalNumber(params.fromSequence);
    const limit = asOptionalNumber(params.limit) ?? 200;

    const messages = loadMessages(sqlite, transcriptId, { fromSequence, limit });

    // Load transcript metadata too
    const transcript = loadTranscriptById(sqlite, transcriptId);

    return {
      transcript,
      messages,
      totalMessages: transcript?.message_count ?? messages.length,
    };
  }

  if (action === 'search') {
    const query = asString(params.query, 'query');
    const limit = asOptionalNumber(params.limit) ?? 10;
    const offset = asOptionalNumber(params.offset) ?? 0;
    const contextWindow = asOptionalNumber(params.contextWindow);
    const transcriptId = asOptionalString(params.transcriptId);
    const roles = asOptionalRoles(params.roles);

    const request: TranscriptSearchRequest = {
      query,
      limit,
      offset,
      contextWindow,
      transcriptId,
      roles,
    };

    // Scope filtering
    if (params.scope && typeof params.scope === 'object') {
      const scopeObj = params.scope as Record<string, unknown>;
      const scopeType = asOptionalString(scopeObj.type);
      const scopeId = asOptionalString(scopeObj.id);

      if (scopeType === 'project' && scopeId) {
        (request as { scope: { type: 'project'; id: string } }).scope = {
          type: 'project',
          id: scopeId,
        };
      }
    }

    const response = searchTranscripts(sqlite, request);

    return {
      ...response,
      _display:
        response.totalCount > 0
          ? `Found ${response.totalCount} transcript matches for "${query}"`
          : `No transcript matches for "${query}"`,
    };
  }

  if (action === 'provenance') {
    const entryId = asString(params.entryId, 'entryId');

    const provenanceRecords = loadProvenanceByEntry(sqlite, entryId);

    if (provenanceRecords.length === 0) {
      return {
        entryId,
        provenance: [],
        _display: `No provenance found for entry ${entryId}`,
      };
    }

    // Load message snippets for each provenance record
    const enriched = provenanceRecords.map((prov) => {
      const messages = loadProvenanceSnippet(sqlite, prov);
      return {
        ...prov,
        messages,
      };
    });

    return {
      entryId,
      provenance: enriched,
      _display: `Found ${enriched.length} provenance link(s) for entry ${entryId}`,
    };
  }

  throw new Error(`invalid_action:${action}`);
}

// ---------------------------------------------------------------------------
// List / Load helpers
// ---------------------------------------------------------------------------

interface TranscriptListRow {
  id: string;
  claude_session_id: string;
  session_scope_id: string | null;
  project_scope_id: string | null;
  agent_id: string | null;
  message_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

function listTranscripts(
  sqlite: Database.Database,
  opts: { limit: number; offset: number; status?: string; projectScopeId?: string }
): { transcripts: unknown[]; totalCount: number } {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];

  if (opts.status) {
    conditions.push('status = ?');
    queryParams.push(opts.status);
  }

  if (opts.projectScopeId) {
    conditions.push('project_scope_id = ?');
    queryParams.push(opts.projectScopeId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = sqlite
    .prepare(`SELECT COUNT(*) AS cnt FROM v2_transcripts ${whereClause}`)
    .get(...queryParams) as { cnt: number };

  const rows = sqlite
    .prepare(
      `SELECT id, claude_session_id, session_scope_id, project_scope_id,
              agent_id, message_count, status, created_at, updated_at
       FROM v2_transcripts
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...queryParams, opts.limit, opts.offset) as TranscriptListRow[];

  const transcripts = rows.map((row) => ({
    id: row.id,
    claudeSessionId: row.claude_session_id,
    sessionScopeId: row.session_scope_id,
    projectScopeId: row.project_scope_id,
    agentId: row.agent_id,
    messageCount: row.message_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return { transcripts, totalCount: countRow.cnt };
}

function loadTranscriptById(
  sqlite: Database.Database,
  transcriptId: string
): TranscriptListRow | null {
  const row = sqlite
    .prepare(
      `SELECT id, claude_session_id, session_scope_id, project_scope_id,
              agent_id, message_count, status, created_at, updated_at
       FROM v2_transcripts WHERE id = ? LIMIT 1`
    )
    .get(transcriptId) as TranscriptListRow | undefined;

  return row
    ? {
        ...row,
      }
    : null;
}
