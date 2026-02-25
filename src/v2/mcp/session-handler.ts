/**
 * V2 Session Lifecycle Handler
 *
 * Manages sessions as v2 scopes with type='session'.
 * Sessions have a parent project scope and store metadata
 * like agentId, purpose, startedAt, endedAt.
 */

import type Database from 'better-sqlite3';
import type { AppContext } from '../../core/context.js';
import type { ScopeSnapshot } from '../contracts/entry.js';
import { getRuntime } from './handlers.js';
import { ensureProjectScope } from './context-detection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionStartParams {
  projectId: string;
  name: string;
  purpose?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionEndParams {
  sessionScopeId: string;
}

export interface SessionListParams {
  projectId?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface SessionInfo {
  scopeId: string;
  externalId: string | null;
  name: string | null;
  projectScopeId: string | null;
  isArchived: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireSqlite(context: AppContext): Database.Database {
  if (!context.sqlite) {
    throw new Error('memory_v2_requires_sqlite_backend');
  }
  return context.sqlite;
}

function parseJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
}

function loadScopeMetadata(sqlite: Database.Database, scopeId: string): Record<string, unknown> {
  const row = sqlite.prepare('SELECT metadata FROM v2_scopes WHERE id = ? LIMIT 1').get(scopeId) as
    | { metadata: string | null }
    | undefined;

  return parseJson(row?.metadata ?? null);
}

/**
 * Extract the external ID from a scope key.
 * "session:abc-123" → "abc-123"
 */
function externalIdFromKey(scopeKey: string): string | null {
  const colonIdx = scopeKey.indexOf(':');
  if (colonIdx < 0) return null;
  const suffix = scopeKey.slice(colonIdx + 1);
  return suffix === '__root__' ? null : suffix;
}

function scopeToSessionInfo(
  scope: ScopeSnapshot,
  metadata: Record<string, unknown>,
  parentScopeId: string | null
): SessionInfo {
  return {
    scopeId: scope.id,
    externalId: scope.externalId,
    name: scope.label,
    projectScopeId: parentScopeId ?? scope.parentScopeId,
    isArchived: scope.isArchived,
    metadata,
    createdAt: '',
    updatedAt: '',
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Start a new session.
 * Creates a v2 scope of type 'session' parented to the project scope.
 */
export async function handleSessionStart(
  context: AppContext,
  params: SessionStartParams
): Promise<{ session: SessionInfo; created: true }> {
  const runtime = getRuntime(context);
  const sqlite = requireSqlite(context);
  const now = new Date().toISOString();

  // Ensure the project scope exists
  const parentScopeId = ensureProjectScope(sqlite, params.projectId);

  const sessionId = crypto.randomUUID();
  const sessionMeta = {
    agentId: params.agentId ?? 'claude-code',
    purpose: params.purpose ?? null,
    startedAt: now,
    ...(params.metadata ?? {}),
  };

  const scope = await runtime.memory.write.createScope({
    type: 'session',
    id: sessionId,
    parentScopeId,
    label: params.name,
  });

  // Store metadata on the scope row directly
  sqlite
    .prepare('UPDATE v2_scopes SET metadata = ? WHERE id = ?')
    .run(JSON.stringify(sessionMeta), scope.id);

  return {
    session: scopeToSessionInfo(scope, sessionMeta, parentScopeId),
    created: true,
  };
}

/**
 * End (archive) an existing session.
 */
export async function handleSessionEnd(
  context: AppContext,
  params: SessionEndParams
): Promise<{ session: SessionInfo; archived: true } | { error: string }> {
  const runtime = getRuntime(context);
  const sqlite = requireSqlite(context);

  const archived = await runtime.memory.write.archiveScope(params.sessionScopeId);
  if (!archived) {
    return { error: `Session scope not found: ${params.sessionScopeId}` };
  }

  // Update metadata with endedAt
  const existingMeta = loadScopeMetadata(sqlite, params.sessionScopeId);
  const updatedMeta = { ...existingMeta, endedAt: new Date().toISOString() };
  sqlite
    .prepare('UPDATE v2_scopes SET metadata = ? WHERE id = ?')
    .run(JSON.stringify(updatedMeta), params.sessionScopeId);

  return {
    session: scopeToSessionInfo(archived, updatedMeta, archived.parentScopeId),
    archived: true,
  };
}

/**
 * List sessions, optionally filtered by project.
 */
export function handleSessionList(
  context: AppContext,
  params: SessionListParams
): { sessions: SessionInfo[]; total: number } {
  const sqlite = requireSqlite(context);
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  let whereClause = "WHERE s.type = 'session'";
  const queryParams: unknown[] = [];

  if (params.projectId) {
    whereClause += ' AND s.parent_scope_id = ?';
    queryParams.push(`project:${params.projectId}`);
  }

  if (!params.includeArchived) {
    whereClause += ' AND s.is_archived = 0';
  }

  const countRow = sqlite
    .prepare(`SELECT COUNT(*) AS cnt FROM v2_scopes s ${whereClause}`)
    .get(...queryParams) as { cnt: number };

  const rows = sqlite
    .prepare(
      `
      SELECT s.id, s.name, s.label, s.parent_scope_id, s.is_archived,
             s.metadata, s.created_at, s.updated_at
      FROM v2_scopes s
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(...queryParams, limit, offset) as Array<{
    id: string;
    name: string | null;
    label: string | null;
    parent_scope_id: string | null;
    is_archived: number;
    metadata: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const sessions = rows.map((row) => ({
    scopeId: row.id,
    externalId: externalIdFromKey(row.id),
    name: row.label ?? row.name,
    projectScopeId: row.parent_scope_id,
    isArchived: row.is_archived === 1,
    metadata: parseJson(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return { sessions, total: countRow.cnt };
}

// ---------------------------------------------------------------------------
// MCP handler (routes action param)
// ---------------------------------------------------------------------------

export async function handleV2MemorySession(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const action = params.action as string;

  if (action === 'start') {
    return handleSessionStart(context, {
      projectId: params.projectId as string,
      name: params.name as string,
      purpose: params.purpose as string | undefined,
      agentId: params.agentId as string | undefined,
      metadata: params.metadata as Record<string, unknown> | undefined,
    });
  }

  if (action === 'end') {
    return handleSessionEnd(context, {
      sessionScopeId: params.sessionScopeId as string,
    });
  }

  if (action === 'list') {
    return handleSessionList(context, {
      projectId: params.projectId as string | undefined,
      includeArchived: params.includeArchived === true,
      limit: params.limit as number | undefined,
      offset: params.offset as number | undefined,
    });
  }

  throw new Error(`invalid_action:${action}`);
}
