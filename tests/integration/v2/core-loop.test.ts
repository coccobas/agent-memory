import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { IndexProjector } from '../../../src/v2/indexing/index.js';
import { OutboxProjectionRunner } from '../../../src/v2/indexing/index.js';
import {
  SqliteOutboxSubscriber,
  createSqliteMemoryV2Runtime,
} from '../../../src/v2/adapters/index.js';

function applyV2Migration(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  const sql = readFileSync(
    join(process.cwd(), 'src/db/migrations/0044_add_v2_core_schema.sql'),
    'utf8'
  );
  sqlite.exec(sql);
}

function idGenerator(prefix: string): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `${prefix}-${index}`;
  };
}

describe('V2 core loop integration', () => {
  it('writes entry and outbox event atomically', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('atomic'),
    });

    await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'Atomic write',
        content: 'entry and outbox in same transaction',
        source: 'import',
        scope: { type: 'project', id: 'alpha' },
        tags: ['txn'],
      },
    });

    const entryCount = sqlite.prepare('SELECT COUNT(*) AS count FROM v2_entries').get() as {
      count: number;
    };
    const outboxCount = sqlite.prepare('SELECT COUNT(*) AS count FROM v2_outbox_events').get() as {
      count: number;
    };

    expect(entryCount.count).toBe(1);
    expect(outboxCount.count).toBe(1);

    sqlite.close();
  });

  it('maintains append-only monotonic versions for updates', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('version'),
    });

    const first = await runtime.memory.write.upsertEntry({
      data: {
        type: 'guideline',
        title: 'Versioned',
        content: 'v1',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
        priority: 1,
      },
    });

    const second = await runtime.memory.write.upsertEntry({
      entryId: first.ref.id,
      expectedVersion: first.version,
      data: {
        type: 'guideline',
        title: 'Versioned',
        content: 'v2',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
        priority: 2,
      },
    });

    const row = sqlite
      .prepare('SELECT current_version FROM v2_entries WHERE id = ?')
      .get(first.ref.id) as { current_version: number };
    const versions = sqlite
      .prepare('SELECT COUNT(*) AS count FROM v2_entry_versions WHERE entry_id = ?')
      .get(first.ref.id) as { count: number };

    expect(second.version).toBe(2);
    expect(row.current_version).toBe(2);
    expect(versions.count).toBe(2);

    sqlite.close();
  });

  it('supports immediate read-after-write through primary fallback before projector catch-up', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('fallback'),
    });

    const created = await runtime.memory.write.upsertEntry({
      data: {
        type: 'tool',
        title: 'Deploy helper',
        content: 'Use this helper to deploy quickly',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    const response = await runtime.memory.read.execute({
      query: 'deploy helper',
      scope: { type: 'project', id: 'alpha' },
      limit: 10,
    });

    const ids = response.results.map((result) => result.entry.ref.id);
    expect(ids).toContain(created.ref.id);

    sqlite.close();
  });

  it('keeps projections idempotent when draining outbox repeatedly', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('idempotent'),
    });

    const created = await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'FTS projection',
        content: 'Index this content once',
        source: 'import',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    const firstDrain = await runtime.projectorRunner.runBatch(50);
    const secondDrain = await runtime.projectorRunner.runBatch(50);

    const ftsCount = sqlite
      .prepare('SELECT COUNT(*) AS count FROM v2_entry_fts WHERE entry_id = ?')
      .get(created.ref.id) as { count: number };

    expect(firstDrain.processed).toBeGreaterThan(0);
    expect(secondDrain.processed).toBe(0);
    expect(ftsCount.count).toBe(1);

    sqlite.close();
  });

  it('resumes projector checkpoint without skipping already acknowledged later events', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('checkpoint'),
    });

    await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'First',
        content: 'first event',
        source: 'import',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'Second',
        content: 'second event',
        source: 'import',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    let failedOnce = false;
    const flakyProjector: IndexProjector = {
      name: 'flaky',
      async project(event) {
        if (!failedOnce) {
          failedOnce = true;
          throw new Error(`boom:${event.eventId}`);
        }
      },
    };

    const subscriber = new SqliteOutboxSubscriber({ sqlite }, { projectorName: 'resume-test' });
    const runner = new OutboxProjectionRunner(subscriber, flakyProjector);

    const firstRun = await runner.runBatch(10);
    const firstCheckpoint = sqlite
      .prepare('SELECT last_seq FROM v2_projector_checkpoints WHERE projector_name = ? LIMIT 1')
      .get('resume-test') as { last_seq: number };

    const secondRun = await runner.runBatch(10);
    const secondCheckpoint = sqlite
      .prepare('SELECT last_seq FROM v2_projector_checkpoints WHERE projector_name = ? LIMIT 1')
      .get('resume-test') as { last_seq: number };

    expect(firstRun.failed).toBeGreaterThan(0);
    expect(firstCheckpoint.last_seq).toBe(0);
    expect(secondRun.processed).toBeGreaterThan(0);
    expect(secondCheckpoint.last_seq).toBe(2);

    sqlite.close();
  });

  it('returns deterministic retrieval ordering with channel reasons', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);

    const runtime = createSqliteMemoryV2Runtime({
      sqlite,
      idGenerator: idGenerator('rank'),
    });

    const seed = await runtime.memory.write.upsertEntry({
      data: {
        type: 'knowledge',
        title: 'Seed',
        content: 'seed for relation traversal',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    const primary = await runtime.memory.write.upsertEntry({
      data: {
        type: 'tool',
        title: 'Deploy command',
        content: 'deploy service quickly with docker',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    const related = await runtime.memory.write.upsertEntry({
      data: {
        type: 'experience',
        title: 'Deployment incident',
        content: 'incident linked to deploy strategy',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
      },
    });

    await runtime.memory.write.upsertRelation({
      source: seed.ref,
      target: related.ref,
      relationType: 'related_to',
    });

    await runtime.projectorRunner.runBatch(100);

    const request = {
      query: 'deploy docker',
      scope: { type: 'project', id: 'alpha' } as const,
      relatedTo: {
        entryType: seed.ref.type,
        entryId: seed.ref.id,
        depth: 1,
      },
      limit: 10,
    };

    const first = await runtime.memory.read.execute(request);
    const second = await runtime.memory.read.execute(request);

    const firstIds = first.results.map((result) => result.entry.ref.id);
    const secondIds = second.results.map((result) => result.entry.ref.id);

    expect(firstIds).toEqual(secondIds);
    expect(firstIds[0]).toBe(primary.ref.id);

    const relatedResult = first.results.find((result) => result.entry.ref.id === related.ref.id);
    expect(relatedResult).toBeDefined();
    expect(relatedResult?.reasons.some((reason) => reason.startsWith('relation:'))).toBe(true);
    expect(relatedResult?.reasons.some((reason) => reason.startsWith('scope:'))).toBe(true);

    sqlite.close();
  });
});
