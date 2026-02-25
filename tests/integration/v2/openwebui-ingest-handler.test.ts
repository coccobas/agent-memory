import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../../../src/core/context.js';
import { handleV2MemoryOpenWebUIIngest } from '../../../src/v2/mcp/openwebui-ingest-handler.js';
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

describe('handleV2MemoryOpenWebUIIngest', () => {
  it('single document creates new entry with openwebuiDocId in metadata', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemoryOpenWebUIIngest(context, {
      documents: [
        {
          docId: 'owui-chat-001',
          title: 'Architecture Discussion',
          content: 'We decided to use event sourcing for the backend.',
          pipelineName: 'memory-extraction',
          modelId: 'claude-3.5-sonnet',
        },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.created).toBe(1);
    expect(result.results[0].action).toBe('created');

    const entry = sqlite
      .prepare('SELECT metadata FROM v2_entries WHERE id = ?')
      .get(result.results[0].entryId) as { metadata: string };
    const metadata = JSON.parse(entry.metadata);
    expect(metadata.openwebuiDocId).toBe('owui-chat-001');
    expect(metadata.pipelineName).toBe('memory-extraction');
    expect(metadata.modelId).toBe('claude-3.5-sonnet');
  });

  it('re-ingest same docId updates existing entry', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const first = await handleV2MemoryOpenWebUIIngest(context, {
      documents: [{ docId: 'doc-1', title: 'Original', content: 'First version.' }],
      projectId: 'test-proj',
    });
    expect(first.summary.created).toBe(1);

    const second = await handleV2MemoryOpenWebUIIngest(context, {
      documents: [{ docId: 'doc-1', title: 'Updated', content: 'Updated version.' }],
      projectId: 'test-proj',
    });
    expect(second.summary.updated).toBe(1);
    expect(second.summary.created).toBe(0);
    expect(second.results[0].entryId).toBe(first.results[0].entryId);
  });

  it('batch of 3 documents creates 3 entries', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemoryOpenWebUIIngest(context, {
      documents: [
        { docId: 'd1', title: 'Doc 1', content: 'Content one.' },
        { docId: 'd2', title: 'Doc 2', content: 'Content two.' },
        { docId: 'd3', title: 'Doc 3', content: 'Content three.' },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.created).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  it('missing documents returns validation error', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);

    const result = await handleV2MemoryOpenWebUIIngest(context, {});
    expect(result.summary.created).toBe(0);
    expect(result._display).toContain('Error');
  });

  it('document missing docId returns error in results, others succeed', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemoryOpenWebUIIngest(context, {
      documents: [
        { title: 'No ID', content: 'Missing docId.' },
        { docId: 'good-doc', title: 'Good', content: 'Valid document content.' },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.errors).toBe(1);
    expect(result.summary.created).toBe(1);

    const errorResult = result.results.find((r) => r.sourceId === 'unknown');
    expect(errorResult?.action).toBe('error');

    const successResult = result.results.find((r) => r.sourceId === 'good-doc');
    expect(successResult?.action).toBe('created');
  });

  it('Open WebUI content is normalized in stored content', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemoryOpenWebUIIngest(context, {
      documents: [
        {
          docId: 'norm-doc',
          title: 'Normalization Test',
          content:
            '__pipeline__: extraction\n\n[user] What do we use?\n[assistant] We use TypeScript.',
        },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.created).toBe(1);

    const version = sqlite
      .prepare(
        `SELECT content FROM v2_entry_versions WHERE entry_id = ? ORDER BY version_num DESC LIMIT 1`
      )
      .get(result.results[0].entryId) as { content: string };

    expect(version.content).toContain('### User');
    expect(version.content).toContain('### Assistant');
    expect(version.content).toContain('TypeScript');
    expect(version.content).not.toContain('__pipeline__');
    expect(version.content).not.toContain('[user]');
  });
});
