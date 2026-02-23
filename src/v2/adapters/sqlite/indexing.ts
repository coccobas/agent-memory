import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  OUTBOX_EVENT_TYPES,
  type EntryDeletedEvent,
  type EntryUpsertedEvent,
  type MemoryOutboxEvent,
  type RelationDeletedEvent,
  type RelationUpsertedEvent,
} from '../../contracts/index.js';
import type { EmbeddingWriter, IndexProjector, OutboxSubscriber } from '../../indexing/index.js';

export interface SqliteIndexingDeps {
  sqlite: Database.Database;
  clock?: () => Date;
}

function defaultClock(): Date {
  return new Date();
}

function isEntryUpserted(event: MemoryOutboxEvent): event is EntryUpsertedEvent {
  return event.eventType === OUTBOX_EVENT_TYPES.ENTRY_UPSERTED;
}

function isEntryDeleted(event: MemoryOutboxEvent): event is EntryDeletedEvent {
  return event.eventType === OUTBOX_EVENT_TYPES.ENTRY_DELETED;
}

function isRelationUpserted(event: MemoryOutboxEvent): event is RelationUpsertedEvent {
  return event.eventType === OUTBOX_EVENT_TYPES.RELATION_UPSERTED;
}

function isRelationDeleted(event: MemoryOutboxEvent): event is RelationDeletedEvent {
  return event.eventType === OUTBOX_EVENT_TYPES.RELATION_DELETED;
}

interface OutboxRow {
  seq: number;
  payload_json: string;
}

export class SqliteOutboxSubscriber implements OutboxSubscriber {
  private readonly sqlite: Database.Database;
  private readonly projectorName: string;
  private readonly now: () => Date;

  constructor(
    deps: SqliteIndexingDeps,
    options: {
      projectorName: string;
    }
  ) {
    this.sqlite = deps.sqlite;
    this.projectorName = options.projectorName;
    this.now = deps.clock ?? defaultClock;

    this.sqlite
      .prepare(
        `
        INSERT INTO v2_projector_checkpoints (projector_name, last_seq, updated_at)
        VALUES (?, 0, ?)
        ON CONFLICT(projector_name) DO NOTHING
      `
      )
      .run(this.projectorName, this.now().toISOString());
  }

  async pullBatch(limit: number): Promise<readonly MemoryOutboxEvent[]> {
    const checkpoint = this.readCheckpoint();

    const rows = this.sqlite
      .prepare(
        `
        SELECT e.seq, e.payload_json
        FROM v2_outbox_events e
        LEFT JOIN v2_projector_receipts r
          ON r.projector_name = ?
         AND r.event_id = e.event_id
        WHERE e.seq > ?
          AND r.event_id IS NULL
        ORDER BY e.seq ASC
        LIMIT ?
      `
      )
      .all(this.projectorName, checkpoint, Math.max(1, limit)) as OutboxRow[];

    const events: MemoryOutboxEvent[] = [];

    for (const row of rows) {
      const parsed = JSON.parse(row.payload_json) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }
      events.push(parsed as MemoryOutboxEvent);
    }

    return events;
  }

  async ack(eventIds: readonly string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const nowIso = this.now().toISOString();
    const insert = this.sqlite.prepare(
      `
      INSERT INTO v2_projector_receipts (projector_name, event_id, processed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(projector_name, event_id) DO NOTHING
    `
    );

    for (const eventId of eventIds) {
      insert.run(this.projectorName, eventId, nowIso);
    }

    this.advanceCheckpoint(nowIso);
  }

  async nack(_eventIds: readonly string[], _reason: string): Promise<void> {
    // No-op: failures remain replayable because checkpoint only advances through contiguous receipts.
  }

  private readCheckpoint(): number {
    const row = this.sqlite
      .prepare(
        `
        SELECT last_seq
        FROM v2_projector_checkpoints
        WHERE projector_name = ?
      `
      )
      .get(this.projectorName) as { last_seq: number } | undefined;

    return row?.last_seq ?? 0;
  }

  private advanceCheckpoint(nowIso: string): void {
    let checkpoint = this.readCheckpoint();
    let canAdvance = true;

    while (canAdvance) {
      const nextSeq = checkpoint + 1;
      const nextRow = this.sqlite
        .prepare('SELECT event_id FROM v2_outbox_events WHERE seq = ? LIMIT 1')
        .get(nextSeq) as { event_id: string } | undefined;

      if (!nextRow) {
        canAdvance = false;
        continue;
      }

      const receipt = this.sqlite
        .prepare(
          `
          SELECT 1
          FROM v2_projector_receipts
          WHERE projector_name = ?
            AND event_id = ?
          LIMIT 1
        `
        )
        .get(this.projectorName, nextRow.event_id) as { 1: number } | undefined;

      if (!receipt) {
        canAdvance = false;
        continue;
      }

      checkpoint = nextSeq;
    }

    this.sqlite
      .prepare(
        `
        UPDATE v2_projector_checkpoints
           SET last_seq = ?,
               updated_at = ?
         WHERE projector_name = ?
      `
      )
      .run(checkpoint, nowIso, this.projectorName);
  }
}

export class SqliteFtsProjector implements IndexProjector {
  readonly name = 'fts_projector';

  private readonly sqlite: Database.Database;

  constructor(deps: SqliteIndexingDeps) {
    this.sqlite = deps.sqlite;
  }

  async project(event: MemoryOutboxEvent): Promise<void> {
    if (isEntryDeleted(event)) {
      this.sqlite.prepare('DELETE FROM v2_entry_fts WHERE entry_id = ?').run(event.payload.ref.id);
      return;
    }

    if (!isEntryUpserted(event)) {
      return;
    }

    const snapshot = event.payload.snapshot;
    const facets = JSON.stringify({
      type: snapshot.ref.type,
      category: snapshot.category,
      tags: snapshot.tags,
      scope: snapshot.scope,
    });

    this.sqlite.prepare('DELETE FROM v2_entry_fts WHERE entry_id = ?').run(snapshot.ref.id);
    this.sqlite
      .prepare('INSERT INTO v2_entry_fts (entry_id, title, content, facets) VALUES (?, ?, ?, ?)')
      .run(snapshot.ref.id, snapshot.title, snapshot.content, facets);
  }
}

export class SqliteSemanticProjector implements IndexProjector {
  readonly name = 'semantic_projector';

  private readonly sqlite: Database.Database;
  private readonly now: () => Date;

  constructor(deps: SqliteIndexingDeps) {
    this.sqlite = deps.sqlite;
    this.now = deps.clock ?? defaultClock;
  }

  async project(event: MemoryOutboxEvent): Promise<void> {
    if (isEntryDeleted(event)) {
      this.sqlite
        .prepare('DELETE FROM v2_entry_embeddings WHERE entry_id = ?')
        .run(event.payload.ref.id);
      return;
    }

    if (!isEntryUpserted(event)) {
      return;
    }

    const snapshot = event.payload.snapshot;
    const contentHash = createHash('sha256')
      .update(`${snapshot.title}\n${snapshot.content}`)
      .digest('hex');

    this.sqlite
      .prepare(
        `
        INSERT INTO v2_entry_embeddings (
          entry_id,
          embedding_model,
          embedding_dim,
          content_hash,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(entry_id) DO UPDATE SET
          embedding_model = excluded.embedding_model,
          embedding_dim = excluded.embedding_dim,
          content_hash = excluded.content_hash,
          updated_at = excluded.updated_at
      `
      )
      .run(snapshot.ref.id, 'pending', null, contentHash, this.now().toISOString());
  }
}

export class SqliteRelationBookkeepingProjector implements IndexProjector {
  readonly name = 'relation_bookkeeping_projector';

  private readonly sqlite: Database.Database;
  private readonly now: () => Date;

  constructor(deps: SqliteIndexingDeps) {
    this.sqlite = deps.sqlite;
    this.now = deps.clock ?? defaultClock;
  }

  async project(event: MemoryOutboxEvent): Promise<void> {
    if (isRelationDeleted(event)) {
      this.sqlite
        .prepare('DELETE FROM v2_entity_index WHERE id = ?')
        .run(`relation:${event.payload.relationId}`);
      return;
    }

    if (!isRelationUpserted(event)) {
      return;
    }

    const relation = event.payload.snapshot;
    const entityId = `relation:${relation.id}`;
    const nowIso = this.now().toISOString();

    this.sqlite
      .prepare(
        `
        INSERT INTO v2_entity_index (
          id,
          entry_id,
          entity_type,
          entity_value,
          weight,
          metadata,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          entry_id = excluded.entry_id,
          entity_type = excluded.entity_type,
          entity_value = excluded.entity_value,
          weight = excluded.weight,
          metadata = excluded.metadata,
          updated_at = excluded.updated_at
      `
      )
      .run(
        entityId,
        relation.source.id,
        'relation',
        `${relation.relationType}:${relation.target.id}`,
        1,
        JSON.stringify({
          relationId: relation.id,
          source: relation.source,
          target: relation.target,
          relationType: relation.relationType,
        }),
        nowIso,
        nowIso
      );
  }
}

export class SqliteCacheInvalidationProjector implements IndexProjector {
  readonly name = 'cache_invalidation_projector';

  private readonly invalidate: (key: string) => void | Promise<void>;

  constructor(invalidate: (key: string) => void | Promise<void>) {
    this.invalidate = invalidate;
  }

  async project(event: MemoryOutboxEvent): Promise<void> {
    if (isEntryUpserted(event)) {
      await this.invalidate(`entry:${event.payload.snapshot.ref.id}`);
      return;
    }

    if (isEntryDeleted(event)) {
      await this.invalidate(`entry:${event.payload.ref.id}`);
    }
  }
}

export interface ProjectorStatusSnapshot {
  projectorName: string;
  checkpointSeq: number;
  latestSeq: number;
  lag: number;
}

export class SqliteEmbeddingWriter implements EmbeddingWriter {
  private readonly sqlite: Database.Database;

  constructor(deps: SqliteIndexingDeps) {
    this.sqlite = deps.sqlite;
  }

  async writeEmbedding(
    entryId: string,
    model: string,
    dim: number,
    embedding: Float32Array
  ): Promise<void> {
    const blob = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);

    this.sqlite
      .prepare(
        `
        UPDATE v2_entry_embeddings
           SET embedding = ?,
               embedding_model = ?,
               embedding_dim = ?,
               status = 'ready',
               updated_at = CURRENT_TIMESTAMP
         WHERE entry_id = ?
      `
      )
      .run(blob, model, dim, entryId);
  }

  async listPending(limit: number): Promise<readonly { entryId: string; contentHash: string }[]> {
    const rows = this.sqlite
      .prepare(
        `
        SELECT entry_id, content_hash
        FROM v2_entry_embeddings
        WHERE status = 'pending'
        ORDER BY updated_at ASC
        LIMIT ?
      `
      )
      .all(Math.max(1, limit)) as Array<{ entry_id: string; content_hash: string }>;

    return rows.map((row) => ({
      entryId: row.entry_id,
      contentHash: row.content_hash,
    }));
  }
}

export function getProjectorStatus(
  sqlite: Database.Database,
  projectorName: string
): ProjectorStatusSnapshot {
  const checkpointRow = sqlite
    .prepare(
      `
      SELECT last_seq
      FROM v2_projector_checkpoints
      WHERE projector_name = ?
      LIMIT 1
    `
    )
    .get(projectorName) as { last_seq: number } | undefined;

  const latestRow = sqlite.prepare('SELECT MAX(seq) AS max_seq FROM v2_outbox_events').get() as {
    max_seq: number | null;
  };

  const checkpointSeq = checkpointRow?.last_seq ?? 0;
  const latestSeq = latestRow.max_seq ?? 0;

  return {
    projectorName,
    checkpointSeq,
    latestSeq,
    lag: Math.max(0, latestSeq - checkpointSeq),
  };
}
