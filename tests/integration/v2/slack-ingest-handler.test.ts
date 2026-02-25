import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../../../src/core/context.js';
import { handleV2MemorySlackIngest } from '../../../src/v2/mcp/slack-ingest-handler.js';
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

describe('handleV2MemorySlackIngest', () => {
  it('single thread creates new entry with slackThreadId in metadata', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemorySlackIngest(context, {
      threads: [
        {
          threadId: '1706000000.000001',
          title: 'Architecture Discussion',
          content: 'We decided to use event sourcing for the new system.',
          channelName: 'engineering',
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
    expect(metadata.slackThreadId).toBe('1706000000.000001');
    expect(metadata.channelName).toBe('engineering');
  });

  it('re-ingest same threadId updates existing entry', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const first = await handleV2MemorySlackIngest(context, {
      threads: [{ threadId: 'thread-1', title: 'Original', content: 'First version.' }],
      projectId: 'test-proj',
    });
    expect(first.summary.created).toBe(1);

    const second = await handleV2MemorySlackIngest(context, {
      threads: [{ threadId: 'thread-1', title: 'Updated', content: 'Updated version.' }],
      projectId: 'test-proj',
    });
    expect(second.summary.updated).toBe(1);
    expect(second.summary.created).toBe(0);
    expect(second.results[0].entryId).toBe(first.results[0].entryId);
  });

  it('batch of 3 threads creates 3 entries', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemorySlackIngest(context, {
      threads: [
        { threadId: 't1', title: 'Thread 1', content: 'Content one.' },
        { threadId: 't2', title: 'Thread 2', content: 'Content two.' },
        { threadId: 't3', title: 'Thread 3', content: 'Content three.' },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.created).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  it('missing threads returns validation error', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);

    const result = await handleV2MemorySlackIngest(context, {});
    expect(result.summary.created).toBe(0);
    expect(result._display).toContain('Error');
  });

  it('thread missing threadId returns error in results, others succeed', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemorySlackIngest(context, {
      threads: [
        { title: 'No ID', content: 'Missing threadId.' },
        { threadId: 'good-thread', title: 'Good', content: 'Valid thread content.' },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.errors).toBe(1);
    expect(result.summary.created).toBe(1);

    const errorResult = result.results.find((r) => r.sourceId === 'unknown');
    expect(errorResult?.action).toBe('error');

    const successResult = result.results.find((r) => r.sourceId === 'good-thread');
    expect(successResult?.action).toBe('created');
  });

  it('Slack mrkdwn is normalized in stored content', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    const context = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'test-proj');

    const result = await handleV2MemorySlackIngest(context, {
      threads: [
        {
          threadId: 'fmt-thread',
          title: 'Formatting Test',
          content: '<@U123|alice> said: *important* decision in <#C456|engineering>',
        },
      ],
      projectId: 'test-proj',
    });

    expect(result.summary.created).toBe(1);

    // Read the stored content from the version table
    const version = sqlite
      .prepare(
        `SELECT content FROM v2_entry_versions WHERE entry_id = ? ORDER BY version_num DESC LIMIT 1`
      )
      .get(result.results[0].entryId) as { content: string };

    expect(version.content).toContain('@alice');
    expect(version.content).toContain('**important**');
    expect(version.content).toContain('#engineering');
    expect(version.content).not.toContain('<@U123');
    expect(version.content).not.toContain('<#C456');
  });
});
