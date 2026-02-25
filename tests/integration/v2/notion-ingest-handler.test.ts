import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../../../src/core/context.js';
import { handleV2MemoryNotionIngest } from '../../../src/v2/mcp/notion-ingest-handler.js';
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

describe('handleV2MemoryNotionIngest', () => {
  it('MCP call with valid single page stores entry', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemoryNotionIngest(context, {
      pages: [
        {
          pageId: 'notion-uuid-001',
          title: 'Architecture Decision',
          content: '# Architecture\n\nWe decided to use hexagonal architecture for the backend.',
        },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.created).toBe(1);
    expect(result.summary.errors).toBe(0);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].action).toBe('created');

    // Verify metadata includes notionPageId
    const entry = sqlite
      .prepare('SELECT metadata FROM v2_entries WHERE id = ?')
      .get(result.results[0].entryId) as { metadata: string };
    const metadata = JSON.parse(entry.metadata);
    expect(metadata.notionPageId).toBe('notion-uuid-001');
  });

  it('MCP call with explicit entryType stores correct type', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemoryNotionIngest(context, {
      pages: [
        {
          pageId: 'notion-uuid-002',
          title: 'Code Style Guide',
          content: 'Some content about formatting.',
          entryType: 'guideline',
        },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.created).toBe(1);
    expect(result.results[0].entryType).toBe('guideline');
  });

  it('MCP call with 3 pages stores 3 entries', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemoryNotionIngest(context, {
      pages: [
        { pageId: 'p1', title: 'Page One', content: 'Content for the first document.' },
        { pageId: 'p2', title: 'Page Two', content: 'Content for the second document.' },
        { pageId: 'p3', title: 'Page Three', content: 'Content for the third document.' },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.created).toBe(3);
    expect(result.results).toHaveLength(3);

    const ids = new Set(result.results.map((r) => r.entryId));
    expect(ids.size).toBe(3);
  });

  it('MCP call re-ingesting same pageId updates existing entry', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    // First call
    const first = await handleV2MemoryNotionIngest(context, {
      pages: [{ pageId: 'dedup-page', title: 'Original', content: 'Original content.' }],
      projectId: 'test-proj',
    });
    expect(first.summary.created).toBe(1);

    // Second call — same pageId
    const second = await handleV2MemoryNotionIngest(context, {
      pages: [{ pageId: 'dedup-page', title: 'Updated Title', content: 'Updated content.' }],
      projectId: 'test-proj',
    });

    expect(second.summary.updated).toBe(1);
    expect(second.summary.created).toBe(0);
    expect(second.results[0].entryId).toBe(first.results[0].entryId);
  });

  it('MCP call with missing pages returns validation error', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);

    const result = await handleV2MemoryNotionIngest(context, {});

    expect(result.summary.created).toBe(0);
    expect(result._display).toContain('Error');
  });

  it('MCP call with page missing pageId returns error in results', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemoryNotionIngest(context, {
      pages: [
        { title: 'No ID', content: 'Missing pageId field.' },
        { pageId: 'good-page', title: 'Good', content: 'Valid page content.' },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.errors).toBe(1);
    expect(result.summary.created).toBe(1);

    const errorResult = result.results.find((r) => r.sourceId === 'unknown');
    expect(errorResult?.action).toBe('error');

    const successResult = result.results.find((r) => r.sourceId === 'good-page');
    expect(successResult?.action).toBe('created');
  });
});
