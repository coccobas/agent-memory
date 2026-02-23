import type Database from 'better-sqlite3';
import type {
  EntryRef,
  EntrySnapshot,
  EntryType,
  RelationType,
  RelationSnapshot,
  ScopeRef,
  ScopeType,
  UpsertEntryRequest,
} from '../../contracts/index.js';
import { NotFoundError } from '../../kernel/errors.js';

export const ROOT_SCOPE_TOKEN = '__root__';

export interface SqliteClock {
  now(): Date;
}

export function toScopeKey(scope: ScopeRef): string {
  const suffix = scope.id ?? ROOT_SCOPE_TOKEN;
  return `${scope.type}:${suffix}`;
}

export function scopeRefFromRow(scopeType: ScopeType, scopeId: string): ScopeRef {
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

export function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
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

export function serializeRecord(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {});
}

export function normalizeTags(tags: readonly string[] | undefined): string[] {
  if (!tags || tags.length === 0) {
    return [];
  }

  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

export function getScopeParentKey(scope: ScopeRef): string | null {
  if (scope.type === 'global') {
    return null;
  }

  // V2 keeps full hierarchy support through parent_scope_id.
  // For default writes we anchor non-global scopes to global unless caller pre-seeded richer parents.
  return toScopeKey({ type: 'global', id: null });
}

export function ensureScope(sqlite: Database.Database, scope: ScopeRef, nowIso: string): string {
  const scopeId = toScopeKey(scope);
  const parentScopeId = getScopeParentKey(scope);

  if (parentScopeId) {
    sqlite
      .prepare(
        `
        INSERT INTO v2_scopes (id, type, parent_scope_id, name, metadata, created_at, updated_at)
        VALUES (?, 'global', NULL, 'global', '{}', ?, ?)
        ON CONFLICT(id) DO NOTHING
      `
      )
      .run(parentScopeId, nowIso, nowIso);
  }

  sqlite
    .prepare(
      `
      INSERT INTO v2_scopes (id, type, parent_scope_id, name, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        parent_scope_id = COALESCE(v2_scopes.parent_scope_id, excluded.parent_scope_id),
        updated_at = excluded.updated_at
    `
    )
    .run(scopeId, scope.type, parentScopeId, scope.id ?? scope.type, '{}', nowIso, nowIso);

  return scopeId;
}

interface EntryRow {
  id: string;
  entry_type: EntryType;
  title: string;
  category: string | null;
  priority: number | null;
  source: UpsertEntryRequest['data']['source'];
  confidence: number | null;
  current_version: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  scope_type: ScopeType;
  scope_id: string;
  content: string;
}

export function loadEntrySnapshot(
  sqlite: Database.Database,
  entryId: string
): EntrySnapshot | null {
  const row = sqlite
    .prepare(
      `
      SELECT
        e.id,
        e.entry_type,
        e.title,
        e.category,
        e.priority,
        e.source,
        e.confidence,
        e.current_version,
        e.metadata,
        e.created_at,
        e.updated_at,
        e.created_by,
        e.updated_by,
        s.type AS scope_type,
        s.id AS scope_id,
        ev.content
      FROM v2_entries e
      INNER JOIN v2_scopes s ON s.id = e.scope_id
      INNER JOIN v2_entry_versions ev
        ON ev.entry_id = e.id
       AND ev.version_num = e.current_version
      WHERE e.id = ?
    `
    )
    .get(entryId) as EntryRow | undefined;

  if (!row) {
    return null;
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
    ref: {
      type: row.entry_type,
      id: row.id,
    },
    scope: scopeRefFromRow(row.scope_type, row.scope_id),
    title: row.title,
    content: row.content,
    category: row.category,
    confidence: row.confidence,
    tags: tags.map((tag) => tag.name),
    source: row.source,
    version: row.current_version,
    priority: row.priority,
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export function requireEntryRef(sqlite: Database.Database, entryId: string): EntryRef {
  const row = sqlite
    .prepare('SELECT id, entry_type FROM v2_entries WHERE id = ? LIMIT 1')
    .get(entryId) as { id: string; entry_type: EntryType } | undefined;

  if (!row) {
    throw new NotFoundError(`Entry not found: ${entryId}`, { entryId });
  }

  return {
    id: row.id,
    type: row.entry_type,
  };
}

interface RelationRow {
  id: string;
  relation_type: RelationType;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  source_id: string;
  source_type: EntryType;
  target_id: string;
  target_type: EntryType;
}

export function loadRelationSnapshot(
  sqlite: Database.Database,
  relationId: string
): RelationSnapshot | null {
  const row = sqlite
    .prepare(
      `
      SELECT
        r.id,
        r.relation_type,
        r.metadata,
        r.created_at,
        r.updated_at,
        r.created_by,
        r.updated_by,
        source.id AS source_id,
        source.entry_type AS source_type,
        target.id AS target_id,
        target.entry_type AS target_type
      FROM v2_relations r
      INNER JOIN v2_entries source ON source.id = r.source_entry_id
      INNER JOIN v2_entries target ON target.id = r.target_entry_id
      WHERE r.id = ?
      LIMIT 1
    `
    )
    .get(relationId) as RelationRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    source: {
      id: row.source_id,
      type: row.source_type,
    },
    target: {
      id: row.target_id,
      type: row.target_type,
    },
    relationType: row.relation_type,
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export function getScopeVisibilityKeys(
  sqlite: Database.Database,
  scope: ScopeRef
): ReadonlySet<string> {
  const scopeKey = toScopeKey(scope);
  const globalScopeKey = toScopeKey({ type: 'global', id: null });
  const keys = new Set<string>([globalScopeKey, scopeKey]);

  let cursor: string | null = scopeKey;
  while (cursor) {
    const row = sqlite.prepare('SELECT parent_scope_id FROM v2_scopes WHERE id = ?').get(cursor) as
      | { parent_scope_id: string | null }
      | undefined;

    if (!row?.parent_scope_id || keys.has(row.parent_scope_id)) {
      break;
    }

    keys.add(row.parent_scope_id);
    cursor = row.parent_scope_id;
  }

  return keys;
}

export function sqliteBool(flag: boolean): number {
  return flag ? 1 : 0;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

export function stringScoreOverlap(left: string, right: string): number {
  const leftTokens = new Set(
    left
      .toLowerCase()
      .split(/\W+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
  );

  const rightTokens = new Set(
    right
      .toLowerCase()
      .split(/\W+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
  );

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}
