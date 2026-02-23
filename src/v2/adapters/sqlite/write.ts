import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  CreateScopeRequest,
  DeleteEntryRequest,
  DeleteRelationRequest,
  EntrySnapshot,
  MemoryOutboxEvent,
  RelationSnapshot,
  ScopeSnapshot,
  ScopeType,
  UpsertEntryRequest,
  UpsertRelationRequest,
} from '../../contracts/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../kernel/errors.js';
import type { WriteTransaction, WriteUnitOfWork } from '../../write/index.js';
import {
  ensureScope,
  getScopeParentKey,
  loadEntrySnapshot,
  loadRelationSnapshot,
  normalizeTags,
  requireEntryRef,
  serializeRecord,
  toScopeKey,
} from './shared.js';

interface WriteEntryStateRow {
  id: string;
  current_version: number;
  created_at: string;
  created_by: string | null;
}

interface RelationIdRow {
  id: string;
}

export interface SqliteWriteUnitOfWorkDeps {
  sqlite: Database.Database;
  idGenerator?: () => string;
  clock?: () => Date;
}

function defaultIdGenerator(): string {
  return randomUUID();
}

function defaultClock(): Date {
  return new Date();
}

class SqliteWriteTransaction implements WriteTransaction {
  private readonly sqlite: Database.Database;
  private readonly nextId: () => string;
  private readonly now: () => Date;

  constructor(deps: SqliteWriteUnitOfWorkDeps) {
    this.sqlite = deps.sqlite;
    this.nextId = deps.idGenerator ?? defaultIdGenerator;
    this.now = deps.clock ?? defaultClock;
  }

  upsertEntry(request: UpsertEntryRequest): EntrySnapshot {
    const nowIso = this.now().toISOString();
    const entryId = request.entryId ?? this.nextId();
    const existing = this.sqlite
      .prepare(
        `
        SELECT id, current_version, created_at, created_by
        FROM v2_entries
        WHERE id = ?
      `
      )
      .get(entryId) as WriteEntryStateRow | undefined;

    const scopeId = ensureScope(this.sqlite, request.data.scope, nowIso);
    const metadataJson = serializeRecord(request.data.metadata);
    const tags = normalizeTags(request.data.tags);

    let nextVersion = 1;

    if (existing) {
      if (
        request.expectedVersion !== undefined &&
        request.expectedVersion !== existing.current_version
      ) {
        throw new ConflictError(
          `Version conflict on entry ${entryId}: expected ${request.expectedVersion}, actual ${existing.current_version}`,
          { entryId, expected: request.expectedVersion, actual: existing.current_version }
        );
      }

      nextVersion = existing.current_version + 1;

      this.sqlite
        .prepare(
          `
          UPDATE v2_entries
             SET entry_type = ?,
                 scope_id = ?,
                 title = ?,
                 category = ?,
                 priority = ?,
                 source = ?,
                 confidence = ?,
                 current_version = ?,
                 is_active = 1,
                 metadata = ?,
                 updated_at = ?,
                 updated_by = ?
           WHERE id = ?
        `
        )
        .run(
          request.data.type,
          scopeId,
          request.data.title,
          request.data.category ?? null,
          request.data.type === 'guideline' ? (request.data.priority ?? null) : null,
          request.data.source,
          request.data.confidence ?? null,
          nextVersion,
          metadataJson,
          nowIso,
          request.actorId ?? null,
          entryId
        );
    } else {
      if (request.expectedVersion !== undefined && request.expectedVersion !== 0) {
        throw new ConflictError(
          `Version conflict on new entry ${entryId}: expected ${request.expectedVersion}, actual 0`,
          { entryId, expected: request.expectedVersion, actual: 0 }
        );
      }

      this.sqlite
        .prepare(
          `
          INSERT INTO v2_entries (
            id,
            entry_type,
            scope_id,
            title,
            category,
            priority,
            source,
            confidence,
            current_version,
            is_active,
            metadata,
            created_at,
            updated_at,
            created_by,
            updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)
        `
        )
        .run(
          entryId,
          request.data.type,
          scopeId,
          request.data.title,
          request.data.category ?? null,
          request.data.type === 'guideline' ? (request.data.priority ?? null) : null,
          request.data.source,
          request.data.confidence ?? null,
          metadataJson,
          nowIso,
          nowIso,
          request.actorId ?? null,
          request.actorId ?? null
        );
    }

    this.sqlite
      .prepare(
        `
        INSERT INTO v2_entry_versions (
          id,
          entry_id,
          version_num,
          content,
          facets_json,
          created_at,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        this.nextId(),
        entryId,
        nextVersion,
        request.data.content,
        JSON.stringify({
          category: request.data.category ?? null,
          tags,
          metadata: request.data.metadata ?? {},
        }),
        nowIso,
        request.actorId ?? null
      );

    this.sqlite.prepare('DELETE FROM v2_entry_tags WHERE entry_id = ?').run(entryId);

    for (const tag of tags) {
      this.sqlite
        .prepare(
          'INSERT INTO v2_tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING'
        )
        .run(this.nextId(), tag, nowIso);

      const tagRow = this.sqlite
        .prepare('SELECT id FROM v2_tags WHERE name = ? COLLATE NOCASE LIMIT 1')
        .get(tag) as { id: string } | undefined;

      if (!tagRow) {
        throw new NotFoundError(`Tag resolution failed: ${tag}`, { tag });
      }

      this.sqlite
        .prepare(
          'INSERT OR IGNORE INTO v2_entry_tags (entry_id, tag_id, created_at) VALUES (?, ?, ?)'
        )
        .run(entryId, tagRow.id, nowIso);
    }

    const snapshot = loadEntrySnapshot(this.sqlite, entryId);
    if (!snapshot) {
      throw new NotFoundError(`Entry not found after upsert: ${entryId}`, { entryId });
    }

    return snapshot;
  }

  deleteEntry(request: DeleteEntryRequest): EntrySnapshot | null {
    const snapshot = loadEntrySnapshot(this.sqlite, request.ref.id);
    if (!snapshot) {
      return null;
    }

    const nowIso = this.now().toISOString();

    this.sqlite
      .prepare(
        `
        UPDATE v2_entries
           SET is_active = 0,
               updated_at = ?,
               updated_by = ?
         WHERE id = ?
      `
      )
      .run(nowIso, request.actorId ?? null, request.ref.id);

    return loadEntrySnapshot(this.sqlite, request.ref.id);
  }

  upsertRelation(request: UpsertRelationRequest): RelationSnapshot {
    const nowIso = this.now().toISOString();

    const source = requireEntryRef(this.sqlite, request.source.id);
    const target = requireEntryRef(this.sqlite, request.target.id);

    if (source.type !== request.source.type) {
      throw new ValidationError(
        `Relation source type mismatch: expected ${request.source.type}, found ${source.type}`,
        { entryId: request.source.id, expected: request.source.type, actual: source.type }
      );
    }
    if (target.type !== request.target.type) {
      throw new ValidationError(
        `Relation target type mismatch: expected ${request.target.type}, found ${target.type}`,
        { entryId: request.target.id, expected: request.target.type, actual: target.type }
      );
    }

    let relationId = request.relationId ?? null;

    if (!relationId) {
      const existingByComposite = this.sqlite
        .prepare(
          `
          SELECT id
          FROM v2_relations
          WHERE source_entry_id = ?
            AND target_entry_id = ?
            AND relation_type = ?
          LIMIT 1
        `
        )
        .get(request.source.id, request.target.id, request.relationType) as
        | RelationIdRow
        | undefined;

      relationId = existingByComposite?.id ?? this.nextId();
    }

    const existing = this.sqlite
      .prepare('SELECT id FROM v2_relations WHERE id = ? LIMIT 1')
      .get(relationId) as RelationIdRow | undefined;

    if (existing) {
      this.sqlite
        .prepare(
          `
          UPDATE v2_relations
             SET source_entry_id = ?,
                 target_entry_id = ?,
                 relation_type = ?,
                 metadata = ?,
                 updated_at = ?,
                 updated_by = ?
           WHERE id = ?
        `
        )
        .run(
          request.source.id,
          request.target.id,
          request.relationType,
          serializeRecord(request.metadata),
          nowIso,
          request.actorId ?? null,
          relationId
        );
    } else {
      this.sqlite
        .prepare(
          `
          INSERT INTO v2_relations (
            id,
            source_entry_id,
            target_entry_id,
            relation_type,
            metadata,
            created_at,
            updated_at,
            created_by,
            updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          relationId,
          request.source.id,
          request.target.id,
          request.relationType,
          serializeRecord(request.metadata),
          nowIso,
          nowIso,
          request.actorId ?? null,
          request.actorId ?? null
        );
    }

    const snapshot = loadRelationSnapshot(this.sqlite, relationId);
    if (!snapshot) {
      throw new NotFoundError(`Relation not found after upsert: ${relationId}`, { relationId });
    }

    return snapshot;
  }

  deleteRelation(request: DeleteRelationRequest): RelationSnapshot | null {
    let relationId = request.relationId ?? null;

    if (!relationId) {
      const clauses: string[] = [];
      const params: unknown[] = [];

      if (request.source) {
        clauses.push('source_entry_id = ?');
        params.push(request.source.id);
      }

      if (request.target) {
        clauses.push('target_entry_id = ?');
        params.push(request.target.id);
      }

      if (request.relationType) {
        clauses.push('relation_type = ?');
        params.push(request.relationType);
      }

      if (clauses.length === 0) {
        return null;
      }

      const query = `
        SELECT id
        FROM v2_relations
        WHERE ${clauses.join(' AND ')}
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      const row = this.sqlite.prepare(query).get(...params) as RelationIdRow | undefined;
      relationId = row?.id ?? null;
    }

    if (!relationId) {
      return null;
    }

    const snapshot = loadRelationSnapshot(this.sqlite, relationId);
    if (!snapshot) {
      return null;
    }

    this.sqlite.prepare('DELETE FROM v2_relations WHERE id = ?').run(relationId);
    return snapshot;
  }

  createScope(request: CreateScopeRequest): ScopeSnapshot {
    const nowIso = this.now().toISOString();
    const scopeKey = toScopeKey({ type: request.type, id: request.id });

    const parentScopeId =
      request.parentScopeId ?? getScopeParentKey({ type: request.type, id: request.id });

    if (parentScopeId) {
      this.sqlite
        .prepare(
          `
          INSERT INTO v2_scopes (id, type, parent_scope_id, name, metadata, created_at, updated_at)
          VALUES (?, 'global', NULL, 'global', '{}', ?, ?)
          ON CONFLICT(id) DO NOTHING
        `
        )
        .run(parentScopeId, nowIso, nowIso);
    }

    this.sqlite
      .prepare(
        `
        INSERT INTO v2_scopes (id, type, parent_scope_id, name, label, metadata, is_archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '{}', 0, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = COALESCE(excluded.label, v2_scopes.label),
          parent_scope_id = COALESCE(excluded.parent_scope_id, v2_scopes.parent_scope_id),
          updated_at = excluded.updated_at
      `
      )
      .run(
        scopeKey,
        request.type,
        parentScopeId,
        request.id ?? request.type,
        request.label ?? null,
        nowIso,
        nowIso
      );

    return this.loadScopeSnapshot(scopeKey)!;
  }

  archiveScope(scopeId: string): ScopeSnapshot | null {
    const existing = this.loadScopeSnapshot(scopeId);
    if (!existing) {
      return null;
    }

    const nowIso = this.now().toISOString();
    this.sqlite
      .prepare(
        `
        UPDATE v2_scopes
           SET is_archived = 1,
               updated_at = ?
         WHERE id = ?
      `
      )
      .run(nowIso, scopeId);

    return this.loadScopeSnapshot(scopeId);
  }

  private loadScopeSnapshot(scopeKey: string): ScopeSnapshot | null {
    const row = this.sqlite
      .prepare(
        `
        SELECT id, type, parent_scope_id, label, is_archived
        FROM v2_scopes
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(scopeKey) as
      | {
          id: string;
          type: ScopeType;
          parent_scope_id: string | null;
          label: string | null;
          is_archived: number;
        }
      | undefined;

    if (!row) {
      return null;
    }

    const parts = row.id.split(':');
    const externalId = parts.length > 1 ? parts.slice(1).join(':') : null;

    return {
      id: row.id,
      type: row.type,
      externalId: externalId === '__root__' ? null : externalId,
      parentScopeId: row.parent_scope_id,
      label: row.label,
      isArchived: row.is_archived === 1,
    };
  }

  appendOutbox(events: readonly MemoryOutboxEvent[]): void {
    const stmt = this.sqlite.prepare(
      `
      INSERT INTO v2_outbox_events (
        event_id,
        event_type,
        aggregate_id,
        correlation_id,
        payload_json,
        occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
    );

    for (const event of events) {
      stmt.run(
        event.eventId,
        event.eventType,
        event.aggregateId,
        event.correlationId ?? null,
        JSON.stringify(event),
        event.occurredAt
      );
    }
  }
}

export class SqliteWriteUnitOfWork implements WriteUnitOfWork {
  private readonly sqlite: Database.Database;
  private readonly idGenerator: () => string;
  private readonly clock: () => Date;

  constructor(deps: SqliteWriteUnitOfWorkDeps) {
    this.sqlite = deps.sqlite;
    this.idGenerator = deps.idGenerator ?? defaultIdGenerator;
    this.clock = deps.clock ?? defaultClock;
  }

  async runInTransaction<T>(work: (tx: WriteTransaction) => T): Promise<T> {
    const runner = this.sqlite.transaction((callback: (tx: WriteTransaction) => T) => {
      const tx = new SqliteWriteTransaction({
        sqlite: this.sqlite,
        idGenerator: this.idGenerator,
        clock: this.clock,
      });
      return callback(tx);
    });

    return runner(work);
  }
}
