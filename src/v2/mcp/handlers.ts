import type Database from 'better-sqlite3';
import type { AppContext } from '../../core/context.js';
import { V2Error } from '../kernel/errors.js';
import type {
  CreateScopeRequest,
  DeleteEntryRequest,
  DeleteRelationRequest,
  EntryType,
  QueryRequest,
  RelationType,
  ScopeType,
  UpsertEntryRequest,
  UpsertRelationRequest,
} from '../contracts/index.js';
import { createSqliteMemoryV2Runtime, type SqliteMemoryV2Runtime } from '../bootstrap.js';

const DEFAULT_PROJECTOR_NAME = 'v2-core';
const ROOT_SCOPE_TOKEN = '__root__';

const runtimeBySqlite = new WeakMap<Database.Database, SqliteMemoryV2Runtime>();

function requireSqlite(context: AppContext): Database.Database {
  if (!context.sqlite) {
    throw new Error('memory_v2_requires_sqlite_backend');
  }
  return context.sqlite;
}

function getRuntime(context: AppContext): SqliteMemoryV2Runtime {
  const sqlite = requireSqlite(context);
  const cached = runtimeBySqlite.get(sqlite);
  if (cached) {
    return cached;
  }

  const runtime = createSqliteMemoryV2Runtime({
    sqlite,
    projectorName: DEFAULT_PROJECTOR_NAME,
  });
  runtimeBySqlite.set(sqlite, runtime);
  return runtime;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid_${field}`);
  }
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return asRecord(value, 'record');
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return asString(value, 'string');
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('invalid_number');
  }
  return value;
}

function asScope(value: unknown): { type: ScopeType; id: string | null } {
  const record = asRecord(value, 'scope');
  const type = asString(record.type, 'scope.type');

  if (type !== 'global' && type !== 'org' && type !== 'project' && type !== 'session') {
    throw new Error('invalid_scope.type');
  }

  const rawId = record.id;
  return {
    type,
    id: rawId === undefined || rawId === null ? null : asString(rawId, 'scope.id'),
  };
}

function asEntryType(value: unknown, field: string): EntryType {
  const type = asString(value, field);
  if (type !== 'guideline' && type !== 'knowledge' && type !== 'tool' && type !== 'experience') {
    throw new Error(`invalid_${field}`);
  }
  return type;
}

function asRelationType(value: unknown, field: string): RelationType {
  const relationType = asString(value, field);
  if (
    relationType !== 'applies_to' &&
    relationType !== 'depends_on' &&
    relationType !== 'conflicts_with' &&
    relationType !== 'related_to' &&
    relationType !== 'parent_task' &&
    relationType !== 'subtask_of' &&
    relationType !== 'promoted_to'
  ) {
    throw new Error(`invalid_${field}`);
  }
  return relationType;
}

function scopeRefFromStored(
  scopeType: ScopeType,
  scopeId: string
): { type: ScopeType; id: string | null } {
  const prefix = `${scopeType}:`;
  if (scopeId.startsWith(prefix)) {
    const encoded = scopeId.slice(prefix.length);
    return {
      type: scopeType,
      id: encoded === ROOT_SCOPE_TOKEN ? null : encoded,
    };
  }

  return {
    type: scopeType,
    id: scopeId,
  };
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

interface StoredEntryRow {
  id: string;
  entry_type: 'guideline' | 'knowledge' | 'tool' | 'experience';
  scope_type: ScopeType;
  scope_id: string;
  title: string;
  content: string;
  category: string | null;
  priority: number | null;
  source: 'remember' | 'observe_extract' | 'observe_commit' | 'hook_capture' | 'import';
  confidence: number | null;
  current_version: number;
  metadata: string | null;
}

function loadEntryForTagMutation(
  sqlite: Database.Database,
  entryId: string
): {
  row: StoredEntryRow;
  tags: string[];
} {
  const row = sqlite
    .prepare(
      `
      SELECT
        e.id,
        e.entry_type,
        s.type AS scope_type,
        s.id AS scope_id,
        e.title,
        ev.content,
        e.category,
        e.priority,
        e.source,
        e.confidence,
        e.current_version,
        e.metadata
      FROM v2_entries e
      INNER JOIN v2_scopes s ON s.id = e.scope_id
      INNER JOIN v2_entry_versions ev
        ON ev.entry_id = e.id
       AND ev.version_num = e.current_version
      WHERE e.id = ?
      LIMIT 1
    `
    )
    .get(entryId) as StoredEntryRow | undefined;

  if (!row) {
    throw new V2Error('V2_NOT_FOUND', `Entry not found: ${entryId}`, { entryId });
  }

  const tags = sqlite
    .prepare(
      `
      SELECT t.name
      FROM v2_entry_tags et
      INNER JOIN v2_tags t ON t.id = et.tag_id
      WHERE et.entry_id = ?
      ORDER BY t.name COLLATE NOCASE ASC
    `
    )
    .all(entryId) as Array<{ name: string }>;

  return {
    row,
    tags: tags.map((tag) => tag.name),
  };
}

function parseUpsertEntry(params: Record<string, unknown>): UpsertEntryRequest {
  const data = asRecord(params.data, 'data');
  const type = asEntryType(data.type, 'data.type');

  const source = asString(data.source, 'data.source');
  if (
    source !== 'remember' &&
    source !== 'observe_extract' &&
    source !== 'observe_commit' &&
    source !== 'hook_capture' &&
    source !== 'import'
  ) {
    throw new Error('invalid_data.source');
  }

  const rawTags = data.tags;
  const tags = Array.isArray(rawTags)
    ? rawTags.map((tag) => asString(tag, 'data.tags')).map(normalizeTag)
    : undefined;

  const entry: UpsertEntryRequest = {
    entryId: asOptionalString(params.entryId),
    expectedVersion: asOptionalNumber(params.expectedVersion),
    actorId: asOptionalString(params.actorId) ?? null,
    correlationId: asOptionalString(params.correlationId),
    data: {
      type,
      title: asString(data.title, 'data.title'),
      content: asString(data.content, 'data.content'),
      source,
      scope: asScope(data.scope),
      category: asOptionalString(data.category),
      confidence: asOptionalNumber(data.confidence),
      metadata: asOptionalRecord(data.metadata),
      tags,
      ...(type === 'guideline' ? { priority: asOptionalNumber(data.priority) } : {}),
      ...(type === 'knowledge' ? { citation: asOptionalString(data.citation) } : {}),
      ...(type === 'tool' ? { usage: asOptionalString(data.usage) } : {}),
      ...(type === 'experience'
        ? {
            scenario: asOptionalString(data.scenario),
            outcome: asOptionalString(data.outcome),
          }
        : {}),
    },
  };

  return entry;
}

function parseDeleteEntry(params: Record<string, unknown>): DeleteEntryRequest {
  return {
    ref: {
      type: asEntryType(params.entryType, 'entryType'),
      id: asString(params.entryId, 'entryId'),
    },
    reason: asOptionalString(params.reason),
    actorId: asOptionalString(params.actorId) ?? null,
    correlationId: asOptionalString(params.correlationId),
  };
}

function parseUpsertRelation(params: Record<string, unknown>): UpsertRelationRequest {
  const relationType = asRelationType(params.relationType, 'relationType');

  const source = asRecord(params.source, 'source');
  const target = asRecord(params.target, 'target');

  const sourceType = asEntryType(source.entryType, 'source.entryType');
  const targetType = asEntryType(target.entryType, 'target.entryType');

  return {
    relationId: asOptionalString(params.relationId),
    source: {
      type: sourceType,
      id: asString(source.entryId, 'source.entryId'),
    },
    target: {
      type: targetType,
      id: asString(target.entryId, 'target.entryId'),
    },
    relationType,
    metadata: asOptionalRecord(params.metadata),
    actorId: asOptionalString(params.actorId) ?? null,
    correlationId: asOptionalString(params.correlationId),
  };
}

function parseDeleteRelation(params: Record<string, unknown>): DeleteRelationRequest {
  type RelationSource = NonNullable<DeleteRelationRequest['source']>;
  type RelationTarget = NonNullable<DeleteRelationRequest['target']>;

  const source = params.source ? asRecord(params.source, 'source') : undefined;
  const target = params.target ? asRecord(params.target, 'target') : undefined;

  return {
    relationId: asOptionalString(params.relationId),
    source: source
      ? {
          type: asEntryType(source.entryType, 'source.entryType') as RelationSource['type'],
          id: asString(source.entryId, 'source.entryId'),
        }
      : undefined,
    target: target
      ? {
          type: asEntryType(target.entryType, 'target.entryType') as RelationTarget['type'],
          id: asString(target.entryId, 'target.entryId'),
        }
      : undefined,
    relationType: params.relationType
      ? asRelationType(params.relationType, 'relationType')
      : undefined,
    actorId: asOptionalString(params.actorId) ?? null,
    correlationId: asOptionalString(params.correlationId),
  };
}

function parseQueryRequest(params: Record<string, unknown>): QueryRequest {
  const limit = asOptionalNumber(params.limit) ?? 20;
  const scope = asScope(params.scope);

  const request: QueryRequest = {
    query: asOptionalString(params.query),
    scope,
    limit,
    offset: asOptionalNumber(params.offset),
    includeInactive: params.includeInactive === true,
    tokenBudget: asOptionalNumber(params.tokenBudget),
  };

  if (Array.isArray(params.queryEmbedding)) {
    request.queryEmbedding = params.queryEmbedding.map((v) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error('invalid_queryEmbedding');
      }
      return v;
    });
  }

  if (params.strategy) {
    const strategy = asString(params.strategy, 'strategy');
    if (strategy !== 'fts' && strategy !== 'semantic' && strategy !== 'hybrid') {
      throw new Error('invalid_strategy');
    }
    request.strategy = strategy;
  }

  if (Array.isArray(params.types)) {
    request.types = params.types.map((type) => {
      return asEntryType(type, 'types');
    });
  }

  if (params.tags) {
    const tags = asRecord(params.tags, 'tags');
    request.tags = {
      include: Array.isArray(tags.include)
        ? tags.include.map((tag) => asString(tag, 'tags.include')).map(normalizeTag)
        : undefined,
      require: Array.isArray(tags.require)
        ? tags.require.map((tag) => asString(tag, 'tags.require')).map(normalizeTag)
        : undefined,
      exclude: Array.isArray(tags.exclude)
        ? tags.exclude.map((tag) => asString(tag, 'tags.exclude')).map(normalizeTag)
        : undefined,
    };
  }

  if (params.relatedTo) {
    const relatedTo = asRecord(params.relatedTo, 'relatedTo');
    const entryType = asEntryType(relatedTo.entryType, 'relatedTo.entryType');
    const relationType = relatedTo.relationType
      ? asRelationType(relatedTo.relationType, 'relatedTo.relationType')
      : undefined;

    request.relatedTo = {
      entryType,
      entryId: asString(relatedTo.entryId, 'relatedTo.entryId'),
      relationType,
      depth: asOptionalNumber(relatedTo.depth),
    };
  }

  return request;
}

export async function handleV2MemoryWrite(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const runtime = getRuntime(context);
  const action = asString(params.action, 'action');

  if (action === 'upsert_entry') {
    return runtime.memory.write.upsertEntry(parseUpsertEntry(params));
  }

  if (action === 'delete_entry') {
    return runtime.memory.write.deleteEntry(parseDeleteEntry(params));
  }

  if (action === 'upsert_relation') {
    return runtime.memory.write.upsertRelation(parseUpsertRelation(params));
  }

  if (action === 'delete_relation') {
    return runtime.memory.write.deleteRelation(parseDeleteRelation(params));
  }

  if (action === 'create_scope') {
    const scopeType = asString(params.scopeType, 'scopeType');
    if (
      scopeType !== 'global' &&
      scopeType !== 'org' &&
      scopeType !== 'project' &&
      scopeType !== 'session'
    ) {
      throw new Error('invalid_scopeType');
    }
    const request: CreateScopeRequest = {
      type: scopeType,
      id:
        params.scopeId === undefined || params.scopeId === null
          ? null
          : asString(params.scopeId, 'scopeId'),
      parentScopeId: asOptionalString(params.parentScopeId),
      label: asOptionalString(params.label),
    };
    return runtime.memory.write.createScope(request);
  }

  if (action === 'archive_scope') {
    const scopeId = asString(params.scopeId, 'scopeId');
    return runtime.memory.write.archiveScope(scopeId);
  }

  if (action === 'tag_entry' || action === 'untag_entry') {
    const sqlite = requireSqlite(context);
    const entryId = asString(params.entryId, 'entryId');
    const tag = normalizeTag(asString(params.tag, 'tag'));
    const { row, tags } = loadEntryForTagMutation(sqlite, entryId);

    const nextTags = new Set(tags.map(normalizeTag));
    if (action === 'tag_entry') {
      nextTags.add(tag);
    } else {
      nextTags.delete(tag);
    }

    return runtime.memory.write.upsertEntry({
      entryId: row.id,
      expectedVersion: row.current_version,
      actorId: asOptionalString(params.actorId) ?? null,
      correlationId: asOptionalString(params.correlationId),
      data: {
        type: row.entry_type,
        title: row.title,
        content: row.content,
        source: row.source,
        scope: scopeRefFromStored(row.scope_type, row.scope_id),
        category: row.category ?? undefined,
        confidence: row.confidence ?? undefined,
        metadata: parseJsonRecord(row.metadata),
        tags: [...nextTags],
        ...(row.entry_type === 'guideline' ? { priority: row.priority ?? undefined } : {}),
      },
    });
  }

  throw new Error(`invalid_action:${action}`);
}

export async function handleV2MemoryQuery(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const runtime = getRuntime(context);
  const action = asString(params.action, 'action');

  if (action !== 'search') {
    throw new Error(`invalid_action:${action}`);
  }

  const request = parseQueryRequest(params);
  return runtime.memory.read.execute(request);
}

function projectorStatus(sqlite: Database.Database): {
  latestSeq: number;
  checkpointSeq: number;
  lag: number;
  pendingCount: number;
  oldestPendingAgeMs: number;
} {
  const latest = sqlite.prepare('SELECT MAX(seq) AS max_seq FROM v2_outbox_events').get() as {
    max_seq: number | null;
  };
  const checkpoint = sqlite
    .prepare('SELECT last_seq FROM v2_projector_checkpoints WHERE projector_name = ? LIMIT 1')
    .get(DEFAULT_PROJECTOR_NAME) as { last_seq: number } | undefined;

  const pending = sqlite
    .prepare(
      `
      SELECT COUNT(*) AS pending_count,
             MIN(occurred_at) AS oldest_occurred_at
      FROM v2_outbox_events
      WHERE seq > ?
    `
    )
    .get(checkpoint?.last_seq ?? 0) as {
    pending_count: number;
    oldest_occurred_at: string | null;
  };

  const oldestPendingAgeMs = pending.oldest_occurred_at
    ? Math.max(0, Date.now() - Date.parse(pending.oldest_occurred_at))
    : 0;

  const latestSeq = latest.max_seq ?? 0;
  const checkpointSeq = checkpoint?.last_seq ?? 0;

  return {
    latestSeq,
    checkpointSeq,
    lag: Math.max(0, latestSeq - checkpointSeq),
    pendingCount: pending.pending_count,
    oldestPendingAgeMs,
  };
}

export async function handleV2MemoryProjector(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const runtime = getRuntime(context);
  const sqlite = requireSqlite(context);
  const action = asString(params.action, 'action');

  if (action === 'status') {
    return {
      projector: DEFAULT_PROJECTOR_NAME,
      ...projectorStatus(sqlite),
    };
  }

  if (action === 'drain_once') {
    const limit = asOptionalNumber(params.limit) ?? 100;
    const result = await runtime.projectorRunner.runBatch(limit);
    return {
      action,
      ...result,
      ...projectorStatus(sqlite),
    };
  }

  if (action === 'replay_range') {
    const fromSeq = asOptionalNumber(params.fromSeq);
    const toSeq = asOptionalNumber(params.toSeq);
    const limit = asOptionalNumber(params.limit) ?? 100;

    if (fromSeq === undefined || toSeq === undefined || fromSeq <= 0 || toSeq < fromSeq) {
      throw new Error('invalid_replay_range');
    }

    sqlite
      .prepare(
        `
        DELETE FROM v2_projector_receipts
        WHERE projector_name = ?
          AND event_id IN (
            SELECT event_id
            FROM v2_outbox_events
            WHERE seq BETWEEN ? AND ?
          )
      `
      )
      .run(DEFAULT_PROJECTOR_NAME, fromSeq, toSeq);

    sqlite
      .prepare(
        `
        UPDATE v2_projector_checkpoints
           SET last_seq = CASE
             WHEN last_seq >= ? THEN ?
             ELSE last_seq
           END,
               updated_at = CURRENT_TIMESTAMP
         WHERE projector_name = ?
      `
      )
      .run(fromSeq, fromSeq - 1, DEFAULT_PROJECTOR_NAME);

    const result = await runtime.projectorRunner.runBatch(limit);
    return {
      action,
      replayed: {
        fromSeq,
        toSeq,
      },
      ...result,
      ...projectorStatus(sqlite),
    };
  }

  throw new Error(`invalid_action:${action}`);
}
