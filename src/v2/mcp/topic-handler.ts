/**
 * V2 Topic Lifecycle Handler
 *
 * Manages topics as v2 scopes with type='topic'.
 * Topics are persistent "smart folders" that group related transcripts.
 * They live under a project scope and can be assigned manually or
 * automatically via embedding similarity.
 */

import type Database from 'better-sqlite3';
import type { AppContext } from '../../core/context.js';
import { getRuntime } from './handlers.js';
import { ensureProjectScope } from './context-detection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TopicCreateParams {
  projectId: string;
  name: string;
  description?: string;
  agentId?: string;
}

export interface TopicListParams {
  projectId?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface TopicAssignParams {
  transcriptId: string;
  topicScopeId: string;
}

export interface TopicMoveParams {
  transcriptId: string;
  targetTopicScopeId: string;
}

export interface TopicMergeParams {
  sourceTopicScopeId: string;
  targetTopicScopeId: string;
}

export interface TopicInfo {
  scopeId: string;
  externalId: string | null;
  name: string | null;
  projectScopeId: string | null;
  isArchived: boolean;
  metadata: Record<string, unknown>;
  transcriptCount: number;
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

function externalIdFromKey(scopeKey: string): string | null {
  const colonIdx = scopeKey.indexOf(':');
  if (colonIdx < 0) return null;
  const suffix = scopeKey.slice(colonIdx + 1);
  return suffix === '__root__' ? null : suffix;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Create a new topic.
 * Creates a v2 scope of type 'topic' parented to the project scope.
 */
export async function handleTopicCreate(
  context: AppContext,
  params: TopicCreateParams
): Promise<{ topic: TopicInfo; created: true }> {
  const runtime = getRuntime(context);
  const sqlite = requireSqlite(context);
  const now = new Date().toISOString();

  const parentScopeId = ensureProjectScope(sqlite, params.projectId);

  const topicId = crypto.randomUUID();
  const topicMeta: Record<string, unknown> = {
    description: params.description ?? null,
    createdBy: params.agentId ?? 'claude-code',
    createdAt: now,
  };

  const scope = await runtime.memory.write.createScope({
    type: 'topic',
    id: topicId,
    parentScopeId,
    label: params.name,
  });

  sqlite
    .prepare('UPDATE v2_scopes SET metadata = ? WHERE id = ?')
    .run(JSON.stringify(topicMeta), scope.id);

  return {
    topic: {
      scopeId: scope.id,
      externalId: scope.externalId,
      name: scope.label,
      projectScopeId: parentScopeId,
      isArchived: scope.isArchived,
      metadata: topicMeta,
      transcriptCount: 0,
      createdAt: now,
      updatedAt: now,
    },
    created: true,
  };
}

/**
 * List topics, optionally filtered by project.
 */
export function handleTopicList(
  context: AppContext,
  params: TopicListParams
): { topics: TopicInfo[]; total: number } {
  const sqlite = requireSqlite(context);
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  let whereClause = "WHERE s.type = 'topic'";
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
             s.metadata, s.created_at, s.updated_at,
             COALESCE(tc.cnt, 0) AS transcript_count
      FROM v2_scopes s
      LEFT JOIN (
        SELECT topic_scope_id, COUNT(*) AS cnt
        FROM v2_transcripts
        WHERE topic_scope_id IS NOT NULL
        GROUP BY topic_scope_id
      ) tc ON tc.topic_scope_id = s.id
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
    transcript_count: number;
  }>;

  const topics = rows.map((row) => ({
    scopeId: row.id,
    externalId: externalIdFromKey(row.id),
    name: row.label ?? row.name,
    projectScopeId: row.parent_scope_id,
    isArchived: row.is_archived === 1,
    metadata: parseJson(row.metadata),
    transcriptCount: row.transcript_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return { topics, total: countRow.cnt };
}

/**
 * Assign a transcript to a topic (manual assignment).
 */
export function handleTopicAssign(
  context: AppContext,
  params: TopicAssignParams
): { success: true; transcriptId: string; topicScopeId: string } {
  const sqlite = requireSqlite(context);
  const now = new Date().toISOString();

  const result = sqlite
    .prepare(
      `UPDATE v2_transcripts
       SET topic_scope_id = ?, topic_assignment = 'manual', updated_at = ?
       WHERE id = ?`
    )
    .run(params.topicScopeId, now, params.transcriptId);

  if (result.changes === 0) {
    throw new Error(`Transcript not found: ${params.transcriptId}`);
  }

  return {
    success: true,
    transcriptId: params.transcriptId,
    topicScopeId: params.topicScopeId,
  };
}

/**
 * Move a transcript to a different topic.
 */
export function handleTopicMove(
  context: AppContext,
  params: TopicMoveParams
): { success: true; transcriptId: string; targetTopicScopeId: string } {
  const sqlite = requireSqlite(context);
  const now = new Date().toISOString();

  const result = sqlite
    .prepare(
      `UPDATE v2_transcripts
       SET topic_scope_id = ?, topic_assignment = 'manual', updated_at = ?
       WHERE id = ?`
    )
    .run(params.targetTopicScopeId, now, params.transcriptId);

  if (result.changes === 0) {
    throw new Error(`Transcript not found: ${params.transcriptId}`);
  }

  return {
    success: true,
    transcriptId: params.transcriptId,
    targetTopicScopeId: params.targetTopicScopeId,
  };
}

/**
 * Merge source topic into target topic.
 * Moves all transcripts from source to target, then archives source.
 */
export async function handleTopicMerge(
  context: AppContext,
  params: TopicMergeParams
): Promise<{ success: true; transcriptsMoved: number; sourceArchived: true }> {
  const runtime = getRuntime(context);
  const sqlite = requireSqlite(context);
  const now = new Date().toISOString();

  // Move all transcripts from source to target
  const moveResult = sqlite
    .prepare(
      `UPDATE v2_transcripts
       SET topic_scope_id = ?, topic_assignment = 'manual', updated_at = ?
       WHERE topic_scope_id = ?`
    )
    .run(params.targetTopicScopeId, now, params.sourceTopicScopeId);

  // Archive the source topic
  await runtime.memory.write.archiveScope(params.sourceTopicScopeId);

  return {
    success: true,
    transcriptsMoved: moveResult.changes,
    sourceArchived: true,
  };
}

// ---------------------------------------------------------------------------
// MCP handler (routes action param)
// ---------------------------------------------------------------------------

export async function handleV2MemoryTopic(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const action = params.action as string;

  if (action === 'create') {
    return handleTopicCreate(context, {
      projectId: params.projectId as string,
      name: params.name as string,
      description: params.description as string | undefined,
      agentId: params.agentId as string | undefined,
    });
  }

  if (action === 'list') {
    return handleTopicList(context, {
      projectId: params.projectId as string | undefined,
      includeArchived: params.includeArchived === true,
      limit: params.limit as number | undefined,
      offset: params.offset as number | undefined,
    });
  }

  if (action === 'assign') {
    return handleTopicAssign(context, {
      transcriptId: params.transcriptId as string,
      topicScopeId: params.topicScopeId as string,
    });
  }

  if (action === 'move') {
    return handleTopicMove(context, {
      transcriptId: params.transcriptId as string,
      targetTopicScopeId: params.targetTopicScopeId as string,
    });
  }

  if (action === 'merge') {
    return handleTopicMerge(context, {
      sourceTopicScopeId: params.sourceTopicScopeId as string,
      targetTopicScopeId: params.targetTopicScopeId as string,
    });
  }

  throw new Error(`invalid_action:${action}`);
}
