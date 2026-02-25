import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../../../src/core/context.js';
import type { SourceAdapter, SourcePageInput } from '../../../src/v2/sources/types.js';
import { handleSourceIngest } from '../../../src/v2/sources/ingest-handler.js';
import { ensureProjectScope } from '../../../src/v2/mcp/context-detection.js';

function applyV2Migration(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  for (const file of ['0044_add_v2_core_schema.sql', '0045_add_embedding_vector.sql']) {
    const sql = readFileSync(join(process.cwd(), 'src/db/migrations', file), 'utf8');
    sqlite.exec(sql);
  }
}

function contextWithSqlite(sqlite: Database.Database): AppContext {
  return { sqlite } as unknown as AppContext;
}

const testAdapter: SourceAdapter = {
  sourceName: 'test',
  metadataIdField: 'testSourceId',
  normalizeContent: (raw: string) => raw.trim(),
};

function makePage(overrides: Partial<SourcePageInput> = {}): SourcePageInput {
  return {
    sourceId: 'src-001',
    title: 'Test Page',
    content: 'Some knowledge about the project architecture.',
    ...overrides,
  };
}

describe('handleSourceIngest', () => {
  it('single page creates new entry with source=import', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleSourceIngest(context, testAdapter, [makePage()], 'test-proj');

    expect(result.summary.created).toBe(1);
    expect(result.summary.errors).toBe(0);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].action).toBe('created');
    expect(result.results[0].entryId).toBeTruthy();

    // Verify the entry exists in the database
    const entry = sqlite
      .prepare('SELECT * FROM v2_entries WHERE id = ?')
      .get(result.results[0].entryId) as { source: string; entry_type: string; metadata: string };
    expect(entry.source).toBe('import');
    expect(JSON.parse(entry.metadata).testSourceId).toBe('src-001');
  });

  it('re-ingest same sourceId updates existing entry (not duplicate)', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const page = makePage({ sourceId: 'unique-page' });

    // First ingest
    const first = await handleSourceIngest(context, testAdapter, [page], 'test-proj');
    expect(first.summary.created).toBe(1);
    const entryId = first.results[0].entryId;

    // Second ingest — same sourceId, updated content
    const updatedPage = makePage({
      sourceId: 'unique-page',
      content: 'Updated knowledge content.',
    });
    const second = await handleSourceIngest(context, testAdapter, [updatedPage], 'test-proj');

    expect(second.summary.updated).toBe(1);
    expect(second.summary.created).toBe(0);
    expect(second.results[0].entryId).toBe(entryId);

    // Verify only one entry exists
    const count = sqlite
      .prepare(
        `SELECT COUNT(*) AS cnt FROM v2_entries WHERE json_extract(metadata, '$.testSourceId') = ?`
      )
      .get('unique-page') as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  it('batch of 3 pages creates 3 entries with correct summary', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const pages = [
      makePage({ sourceId: 'p1', title: 'Page 1' }),
      makePage({ sourceId: 'p2', title: 'Page 2' }),
      makePage({ sourceId: 'p3', title: 'Page 3' }),
    ];

    const result = await handleSourceIngest(context, testAdapter, pages, 'test-proj');

    expect(result.summary.created).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.action === 'created')).toBe(true);

    // Verify unique entry IDs
    const ids = new Set(result.results.map((r) => r.entryId));
    expect(ids.size).toBe(3);
  });

  it('mix of new + existing pages returns correct actions', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    // Create one existing entry
    await handleSourceIngest(
      context,
      testAdapter,
      [makePage({ sourceId: 'existing-1', title: 'Existing' })],
      'test-proj'
    );

    // Now batch with one existing + two new
    const pages = [
      makePage({ sourceId: 'existing-1', title: 'Existing Updated' }),
      makePage({ sourceId: 'new-1', title: 'New Page 1' }),
      makePage({ sourceId: 'new-2', title: 'New Page 2' }),
    ];

    const result = await handleSourceIngest(context, testAdapter, pages, 'test-proj');

    expect(result.summary.created).toBe(2);
    expect(result.summary.updated).toBe(1);
    expect(result.results.find((r) => r.sourceId === 'existing-1')?.action).toBe('updated');
    expect(result.results.find((r) => r.sourceId === 'new-1')?.action).toBe('created');
    expect(result.results.find((r) => r.sourceId === 'new-2')?.action).toBe('created');
  });

  it('empty pages array returns no-op', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);

    const result = await handleSourceIngest(context, testAdapter, [], 'test-proj');

    expect(result.summary.created).toBe(0);
    expect(result.summary.errors).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it('invalid page (missing title) returns error in result, continues processing others', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const pages: SourcePageInput[] = [
      { sourceId: 'bad-page', title: '', content: 'no title here' },
      makePage({ sourceId: 'good-page', title: 'Good Page' }),
    ];

    const result = await handleSourceIngest(context, testAdapter, pages, 'test-proj');

    expect(result.summary.errors).toBe(1);
    expect(result.summary.created).toBe(1);
    expect(result.results).toHaveLength(2);

    const errorResult = result.results.find((r) => r.sourceId === 'bad-page');
    expect(errorResult?.action).toBe('error');
    expect(errorResult?.error).toBeDefined();

    const successResult = result.results.find((r) => r.sourceId === 'good-page');
    expect(successResult?.action).toBe('created');
  });
});
