import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import { handleV2MemoryObserve } from '../../../src/v2/mcp/observe-handler.js';
import type { AppContext } from '../../../src/core/context.js';

function applyMigrations(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  for (const file of [
    '0044_add_v2_core_schema.sql',
    '0045_add_embedding_vector.sql',
    '0046_add_v2_transcripts.sql',
  ]) {
    sqlite.exec(readFileSync(join(process.cwd(), `src/db/migrations/${file}`), 'utf8'));
  }
}

function ensureScopes(sqlite: Database.Database): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO v2_scopes (id, type, parent_scope_id, name, metadata, created_at, updated_at)
       VALUES ('global:__root__', 'global', NULL, 'global', '{}', ?, ?)`
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO v2_scopes (id, type, parent_scope_id, name, label, metadata, is_archived, created_at, updated_at)
       VALUES ('project:test', 'project', 'global:__root__', 'test', 'Test', '{"rootPath":"/tmp/test"}', 0, ?, ?)`
    )
    .run(now, now);
}

function makeContext(sqlite: Database.Database): AppContext {
  return { sqlite } as unknown as AppContext;
}

describe('memory_observe MCP handler', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
    ensureScopes(sqlite);
  });

  it('stores messages with valid payload', async () => {
    const result = await handleV2MemoryObserve(makeContext(sqlite), {
      sessionId: 'sess-1',
      messages: [
        { role: 'user', content: 'hello world' },
        { role: 'assistant', content: 'hi there' },
      ],
      projectId: 'test',
    });

    expect(result.success).toBe(true);
    expect(result.messagesStored).toBe(2);
    expect(result.transcriptId).toBeTruthy();
  });

  it('with isFinal=true extracts entries', async () => {
    const result = await handleV2MemoryObserve(makeContext(sqlite), {
      sessionId: 'sess-2',
      messages: [
        {
          role: 'user',
          content: 'We always follow the security guidelines and conventions for authentication',
        },
      ],
      isFinal: true,
      projectId: 'test',
    });

    expect(result.success).toBe(true);
    expect(result.extracted).toBeDefined();
  });

  it('with missing sessionId returns validation error', async () => {
    const result = await handleV2MemoryObserve(makeContext(sqlite), {
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('session_id_required');
  });

  it('with empty messages array is a no-op', async () => {
    const result = await handleV2MemoryObserve(makeContext(sqlite), {
      sessionId: 'sess-3',
      messages: [],
    });

    expect(result.success).toBe(true);
    expect(result.messagesStored).toBe(0);
  });
});
