import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import { createSqliteMemoryV2Runtime } from '../../../src/v2/adapters/sqlite/factory.js';
import { ingest } from '../../../src/v2/hooks/ingest.js';
import { findByClaudeSessionId } from '../../../src/v2/adapters/sqlite/transcript-store.js';

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
       VALUES ('project:test', 'project', 'global:__root__', 'test', 'Test', '{}', 0, ?, ?)`
    )
    .run(now, now);
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `id-${idSeq}`;
}

describe('ingest', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
    ensureScopes(sqlite);
    idSeq = 0;
  });

  it('creates transcript and appends messages', async () => {
    const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

    const result = await ingest(
      { sqlite, runtime },
      {
        claudeSessionId: 'sess-1',
        projectScopeId: 'project:test',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ],
      }
    );

    expect(result.messagesStored).toBe(2);
    expect(result.transcriptId).toBeTruthy();

    const tx = findByClaudeSessionId(sqlite, 'sess-1');
    expect(tx).not.toBeNull();
    expect(tx!.messageCount).toBe(2);
  });

  it('with isFinal=true triggers extraction', async () => {
    const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

    const result = await ingest(
      { sqlite, runtime },
      {
        claudeSessionId: 'sess-1',
        projectScopeId: 'project:test',
        messages: [
          {
            role: 'user',
            content: 'We always follow the coding standards and conventions for security',
          },
        ],
        isFinal: true,
      }
    );

    expect(result.extracted).toBeDefined();
    expect(result.extracted!.candidates).toBeGreaterThanOrEqual(0);

    const tx = findByClaudeSessionId(sqlite, 'sess-1');
    expect(tx!.status).toBe('extracted');
  });

  it('without isFinal only stores (no extraction)', async () => {
    const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

    const result = await ingest(
      { sqlite, runtime },
      {
        claudeSessionId: 'sess-1',
        projectScopeId: 'project:test',
        messages: [
          {
            role: 'user',
            content: 'We always use strict mode in TypeScript projects and follow conventions',
          },
        ],
      }
    );

    expect(result.extracted).toBeUndefined();

    const tx = findByClaudeSessionId(sqlite, 'sess-1');
    expect(tx!.status).toBe('active');
  });

  it('is idempotent (calling twice with same messages does not duplicate)', async () => {
    const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

    const payload = {
      claudeSessionId: 'sess-1',
      projectScopeId: 'project:test',
      messages: [{ role: 'user' as const, content: 'hello' }],
    };

    await ingest({ sqlite, runtime }, payload);
    await ingest({ sqlite, runtime }, payload);

    // Only 1 transcript record
    const txCount = sqlite.prepare('SELECT COUNT(*) AS c FROM v2_transcripts').get() as {
      c: number;
    };
    expect(txCount.c).toBe(1);
  });
});
