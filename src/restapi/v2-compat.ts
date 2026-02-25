/**
 * V2 Compatibility Layer
 *
 * Translates v1 dashboard tool calls into v2 handler invocations
 * and transforms v2 responses back to the v1 shapes the dashboard expects.
 */

import type Database from 'better-sqlite3';
import type { AppContext } from '../core/context.js';
import type { EntrySnapshot, EntryType, ScopeType } from '../v2/contracts/entry.js';
import type { QueryResponse } from '../v2/contracts/query.js';
import {
  handleV2MemoryQuery,
  handleV2MemoryWrite,
  handleV2MemoryProjector,
} from '../v2/mcp/handlers.js';
import { handleV2MemorySession } from '../v2/mcp/session-handler.js';
import { handleV2TranscriptSearch } from '../v2/mcp/transcript-search-handler.js';

// ---------------------------------------------------------------------------
// Types for v1 response shapes
// ---------------------------------------------------------------------------

interface CursorMeta {
  returnedCount: number;
  hasMore: boolean;
  nextCursor?: string;
}

// ---------------------------------------------------------------------------
// Cursor helpers (base64-encoded offset)
// ---------------------------------------------------------------------------

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    return parseInt(Buffer.from(cursor, 'base64').toString('utf-8'), 10) || 0;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString('base64');
}

// ---------------------------------------------------------------------------
// EntrySnapshot → v1 WithVersion transforms
// ---------------------------------------------------------------------------

function snapshotToGuideline(e: EntrySnapshot): Record<string, unknown> {
  return {
    id: e.ref.id,
    name: e.title,
    scopeType: e.scope.type,
    scopeId: e.scope.id ?? undefined,
    isActive: true,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    currentVersion: {
      id: `v${e.version}`,
      content: e.content,
      category: e.category ?? undefined,
      priority: e.priority ?? undefined,
    },
  };
}

function snapshotToKnowledge(e: EntrySnapshot): Record<string, unknown> {
  return {
    id: e.ref.id,
    scopeType: e.scope.type,
    scopeId: e.scope.id ?? undefined,
    isActive: true,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    currentVersion: {
      id: `v${e.version}`,
      title: e.title,
      content: e.content,
      category: e.category ?? 'fact',
      confidence: e.confidence ?? undefined,
    },
  };
}

function snapshotToTool(e: EntrySnapshot): Record<string, unknown> {
  const meta = e.metadata ?? {};
  return {
    id: e.ref.id,
    name: e.title,
    category: e.category ?? 'cli',
    scopeType: e.scope.type,
    scopeId: e.scope.id ?? undefined,
    isActive: true,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    currentVersion: {
      id: `v${e.version}`,
      description: e.content,
      category: e.category ?? 'cli',
      parameters: (meta.parameters as Record<string, unknown>) ?? undefined,
      constraints: (meta.constraints as string) ?? undefined,
    },
  };
}

function snapshotToExperience(e: EntrySnapshot): Record<string, unknown> {
  const meta = e.metadata ?? {};
  return {
    id: e.ref.id,
    scopeType: e.scope.type,
    scopeId: e.scope.id ?? undefined,
    isActive: true,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    currentVersion: {
      id: `v${e.version}`,
      title: e.title,
      content: e.content,
      scenario: (meta.scenario as string) ?? undefined,
      outcome: (meta.outcome as string) ?? undefined,
      level: (meta.level as string) ?? 'case',
      confidence: e.confidence ?? undefined,
    },
  };
}

const TRANSFORM_MAP: Record<EntryType, (e: EntrySnapshot) => Record<string, unknown>> = {
  guideline: snapshotToGuideline,
  knowledge: snapshotToKnowledge,
  tool: snapshotToTool,
  experience: snapshotToExperience,
};

const LIST_KEY_MAP: Record<EntryType, string> = {
  guideline: 'guidelines',
  knowledge: 'knowledge',
  tool: 'tools',
  experience: 'experiences',
};

// ---------------------------------------------------------------------------
// Entry CRUD (guideline, knowledge, tool, experience)
// ---------------------------------------------------------------------------

async function handleEntryList(
  context: AppContext,
  entryType: EntryType,
  params: Record<string, unknown>
): Promise<unknown> {
  const scopeType = (params.scopeType as string) || 'global';
  const scopeId = (params.scopeId as string) ?? null;
  const limit = Math.min((params.limit as number) || 100, 200);
  const offset = decodeCursor(params.cursor as string | undefined);

  const result = (await handleV2MemoryQuery(context, {
    action: 'search',
    scope: { type: scopeType, id: scopeId },
    types: [entryType],
    limit: limit + 1, // fetch one extra to detect hasMore
    offset,
  })) as QueryResponse;

  const hasMore = result.results.length > limit;
  const entries = result.results.slice(0, limit);

  const transform = TRANSFORM_MAP[entryType];
  const items = entries.map((r) => transform(r.entry));

  const meta: CursorMeta = {
    returnedCount: items.length,
    hasMore,
    ...(hasMore ? { nextCursor: encodeCursor(offset + limit) } : {}),
  };

  return { [LIST_KEY_MAP[entryType]]: items, meta };
}

async function handleEntryAdd(
  context: AppContext,
  entryType: EntryType,
  params: Record<string, unknown>
): Promise<unknown> {
  const scopeType = (params.scopeType as ScopeType) || 'global';
  const scopeId = (params.scopeId as string) ?? null;

  const data: Record<string, unknown> = {
    type: entryType,
    title: (params.name as string) || (params.title as string) || '',
    content: (params.content as string) || (params.description as string) || '',
    source: 'remember' as const,
    scope: { type: scopeType, id: scopeId },
    category: params.category as string | undefined,
    confidence: params.confidence as number | undefined,
    tags: params.tags as string[] | undefined,
    metadata: params.metadata as Record<string, unknown> | undefined,
  };

  // Type-specific fields
  if (entryType === 'guideline') {
    data.priority = params.priority as number | undefined;
  }
  if (entryType === 'tool') {
    data.usage = params.usage as string | undefined;
  }
  if (entryType === 'experience') {
    data.scenario = params.scenario as string | undefined;
    data.outcome = params.outcome as string | undefined;
  }

  const result = (await handleV2MemoryWrite(context, {
    action: 'upsert_entry',
    data,
  })) as EntrySnapshot;

  const transform = TRANSFORM_MAP[entryType];
  return { [entryType]: transform(result), id: result.ref.id };
}

async function handleEntryUpdate(
  context: AppContext,
  entryType: EntryType,
  params: Record<string, unknown>
): Promise<unknown> {
  const entryId = (params.id as string) || (params.entryId as string);
  if (!entryId) throw new Error('Missing id for update');

  // Load current entry to get scope and existing fields
  const sqlite = requireSqlite(context);
  const existing = loadEntry(sqlite, entryId);
  if (!existing) throw new Error(`Entry not found: ${entryId}`);

  const data: Record<string, unknown> = {
    type: entryType,
    title: (params.name as string) || (params.title as string) || existing.title,
    content: (params.content as string) || (params.description as string) || existing.content,
    source: existing.source,
    scope: { type: existing.scope_type, id: scopeIdFromStoredKey(existing.scope_id) },
    category: (params.category as string) ?? existing.category ?? undefined,
    confidence: (params.confidence as number) ?? existing.confidence ?? undefined,
  };

  if (entryType === 'guideline') {
    data.priority = (params.priority as number) ?? existing.priority ?? undefined;
  }

  const result = (await handleV2MemoryWrite(context, {
    action: 'upsert_entry',
    entryId,
    expectedVersion: existing.current_version,
    data,
  })) as EntrySnapshot;

  const transform = TRANSFORM_MAP[entryType];
  return { [entryType]: transform(result), id: result.ref.id };
}

async function handleEntryDeactivate(
  context: AppContext,
  entryType: EntryType,
  params: Record<string, unknown>
): Promise<unknown> {
  const entryId = (params.id as string) || (params.entryId as string);
  if (!entryId) throw new Error('Missing id for deactivate');

  await handleV2MemoryWrite(context, {
    action: 'delete_entry',
    entryType,
    entryId,
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

async function handleSessions(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const action = (params.action as string) || 'list';

  if (action === 'list') {
    const result = (await handleV2MemorySession(context, {
      action: 'list',
      includeArchived: params.includeArchived === true,
      limit: (params.limit as number) || 100,
      offset: decodeCursor(params.cursor as string | undefined),
    })) as { sessions: unknown[]; total: number };

    const sessions = result.sessions.map(sessionToV1);
    const meta: CursorMeta = {
      returnedCount: sessions.length,
      hasMore: false,
    };
    return { sessions, meta };
  }

  // Pass through other actions (start, end)
  return handleV2MemorySession(context, params);
}

function sessionToV1(raw: unknown): Record<string, unknown> {
  const s = raw as Record<string, unknown>;
  const meta = (s.metadata ?? {}) as Record<string, unknown>;
  return {
    id: s.scopeId ?? s.id,
    projectId: s.projectScopeId ?? undefined,
    name: s.name ?? undefined,
    purpose: (meta.purpose as string) ?? undefined,
    agentId: (meta.agentId as string) ?? 'claude-code',
    status: s.isArchived ? 'completed' : 'active',
    startedAt: (meta.startedAt as string) ?? s.createdAt ?? '',
    endedAt: (meta.endedAt as string) ?? undefined,
    metadata: meta,
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

async function handleSearch(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const query = (params.search as string) || (params.query as string) || '';
  const limit = (params.limit as number) || 20;

  const result = (await handleV2MemoryQuery(context, {
    action: 'search',
    scope: { type: 'global', id: null },
    query,
    limit,
  })) as QueryResponse;

  const results = result.results.map((r) => ({
    type: r.entry.ref.type,
    id: r.entry.ref.id,
    title: r.entry.title,
    name: r.entry.title,
    snippet: r.entry.content.slice(0, 200),
    score: r.score,
  }));

  return { results, total: result.totalCount };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function handleProjects(context: AppContext): unknown {
  const sqlite = requireSqlite(context);
  const rows = sqlite
    .prepare(
      `SELECT id, name, label, metadata, created_at
       FROM v2_scopes
       WHERE type = 'project' AND is_archived = 0
       ORDER BY created_at DESC`
    )
    .all() as Array<{
    id: string;
    name: string | null;
    label: string | null;
    metadata: string | null;
    created_at: string;
  }>;

  const projects = rows.map((r) => {
    const meta = parseJson(r.metadata);
    return {
      id: r.id,
      name: r.label ?? r.name ?? r.id,
      rootPath: (meta.rootPath as string) ?? undefined,
      createdAt: r.created_at,
    };
  });

  return { projects, meta: { returnedCount: projects.length } };
}

// ---------------------------------------------------------------------------
// Dashboard / Analytics
// ---------------------------------------------------------------------------

function handleDashboard(context: AppContext): unknown {
  const sqlite = requireSqlite(context);

  const typeCounts = sqlite
    .prepare(
      `SELECT entry_type, COUNT(*) AS cnt
       FROM v2_entries
       WHERE is_active = 1
       GROUP BY entry_type`
    )
    .all() as Array<{ entry_type: string; cnt: number }>;

  let totalEntries = 0;
  for (const row of typeCounts) {
    totalEntries += row.cnt;
  }

  const sessionCount = (
    sqlite
      .prepare(
        `SELECT COUNT(*) AS cnt FROM v2_scopes
         WHERE type = 'session' AND is_archived = 0`
      )
      .get() as { cnt: number }
  ).cnt;

  return {
    health: { score: 100, grade: 'A' },
    summary: {
      totalEntries,
      activeSessions: sessionCount,
      recentActivity: totalEntries,
    },
  };
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

function requireSqlite(context: AppContext): Database.Database {
  if (!context.sqlite) throw new Error('sqlite_required');
  return context.sqlite;
}

interface StoredRow {
  id: string;
  entry_type: string;
  scope_type: string;
  scope_id: string;
  title: string;
  content: string;
  category: string | null;
  priority: number | null;
  confidence: number | null;
  source: string;
  current_version: number;
  metadata: string | null;
}

function loadEntry(sqlite: Database.Database, entryId: string): StoredRow | undefined {
  return sqlite
    .prepare(
      `SELECT
        e.id, e.entry_type, s.type AS scope_type, s.id AS scope_id,
        e.title, ev.content, e.category, e.priority, e.confidence,
        e.source, e.current_version, e.metadata
       FROM v2_entries e
       INNER JOIN v2_scopes s ON s.id = e.scope_id
       INNER JOIN v2_entry_versions ev
         ON ev.entry_id = e.id AND ev.version_num = e.current_version
       WHERE e.id = ? AND e.is_active = 1
       LIMIT 1`
    )
    .get(entryId) as StoredRow | undefined;
}

function scopeIdFromStoredKey(storedId: string): string | null {
  // "project:abc" → "abc", "global:__root__" → null
  const colonIdx = storedId.indexOf(':');
  if (colonIdx < 0) return storedId;
  const suffix = storedId.slice(colonIdx + 1);
  return suffix === '__root__' ? null : suffix;
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

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

const ENTRY_TYPES: Record<string, EntryType> = {
  memory_guideline: 'guideline',
  memory_knowledge: 'knowledge',
  memory_tool: 'tool',
  memory_experience: 'experience',
};

export async function dispatchV1Tool(
  context: AppContext,
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  // Entry CRUD tools (guideline, knowledge, tool, experience)
  const entryType = ENTRY_TYPES[toolName];
  if (entryType) {
    const action = (params.action as string) || 'list';
    if (action === 'list') return handleEntryList(context, entryType, params);
    if (action === 'add') return handleEntryAdd(context, entryType, params);
    if (action === 'update') return handleEntryUpdate(context, entryType, params);
    if (action === 'deactivate') return handleEntryDeactivate(context, entryType, params);
    throw new Error(`Unknown action '${action}' for ${toolName}`);
  }

  if (toolName === 'memory_session') return handleSessions(context, params);
  if (toolName === 'memory_query') return handleSearch(context, params);
  if (toolName === 'memory_project') return handleProjects(context);
  if (toolName === 'memory_analytics') return handleDashboard(context);
  if (toolName === 'memory_transcript_search') return handleV2TranscriptSearch(context, params);
  if (toolName === 'memory_projector') return handleV2MemoryProjector(context, params);

  throw new Error(`Unknown tool: ${toolName}`);
}
