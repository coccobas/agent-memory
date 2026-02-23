import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../../../src/core/context.js';
import {
  handleV2MemoryProjector,
  handleV2MemoryQuery,
  handleV2MemoryWrite,
} from '../../../src/v2/mcp/index.js';

function applyV2Migration(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  const sql = readFileSync(
    join(process.cwd(), 'src/db/migrations/0044_add_v2_core_schema.sql'),
    'utf8'
  );
  sqlite.exec(sql);
}

function contextWithSqlite(sqlite: Database.Database): AppContext {
  return {
    sqlite,
  } as unknown as AppContext;
}

describe('V2 MCP contract handlers', () => {
  it('validates structured write/query/projector flow end to end', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);

    const created = await handleV2MemoryWrite(context, {
      action: 'upsert_entry',
      data: {
        type: 'knowledge',
        title: 'MCP write',
        content: 'stored through v2 transport',
        source: 'remember',
        scope: { type: 'project', id: 'alpha' },
        tags: ['mcp'],
      },
    });

    const createdEntry = created as { ref: { id: string }; version: number };

    const queryResult = (await handleV2MemoryQuery(context, {
      action: 'search',
      query: 'v2 transport',
      scope: { type: 'project', id: 'alpha' },
      limit: 10,
    })) as {
      results: Array<{ entry: { ref: { id: string } }; reasons: string[] }>;
      trace: Array<{ name: string }>;
    };

    expect(queryResult.results.some((result) => result.entry.ref.id === createdEntry.ref.id)).toBe(
      true
    );
    expect(queryResult.trace.length).toBeGreaterThan(0);

    const statusBefore = (await handleV2MemoryProjector(context, {
      action: 'status',
    })) as { pendingCount: number; lag: number };

    expect(statusBefore.pendingCount).toBeGreaterThan(0);
    expect(statusBefore.lag).toBeGreaterThan(0);

    const drained = (await handleV2MemoryProjector(context, {
      action: 'drain_once',
      limit: 50,
    })) as { processed: number; lag: number };

    expect(drained.processed).toBeGreaterThan(0);

    const statusAfter = (await handleV2MemoryProjector(context, {
      action: 'status',
    })) as { lag: number };

    expect(statusAfter.lag).toBe(0);

    await handleV2MemoryWrite(context, {
      action: 'tag_entry',
      entryId: createdEntry.ref.id,
      tag: 'retrieval',
    });

    const tagged = sqlite
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM v2_entry_tags et
        INNER JOIN v2_tags t ON t.id = et.tag_id
        WHERE et.entry_id = ?
          AND t.name = ?
      `
      )
      .get(createdEntry.ref.id, 'retrieval') as { count: number };

    expect(tagged.count).toBe(1);

    const replayed = (await handleV2MemoryProjector(context, {
      action: 'replay_range',
      fromSeq: 1,
      toSeq: 2,
      limit: 50,
    })) as { replayed: { fromSeq: number; toSeq: number } };

    expect(replayed.replayed.fromSeq).toBe(1);
    expect(replayed.replayed.toSeq).toBe(2);

    sqlite.close();
  });

  it('rejects invalid action payloads', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);

    await expect(
      handleV2MemoryWrite(context, {
        action: 'upsert_entry',
        data: {
          type: 'invalid',
        },
      })
    ).rejects.toThrow(/invalid_data.type/);

    await expect(
      handleV2MemoryProjector(context, {
        action: 'replay_range',
        fromSeq: 5,
        toSeq: 1,
      })
    ).rejects.toThrow(/invalid_replay_range/);

    sqlite.close();
  });
});
