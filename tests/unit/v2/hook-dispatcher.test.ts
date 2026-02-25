import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import { createSqliteMemoryV2Runtime } from '../../../src/v2/adapters/sqlite/factory.js';
import {
  handleHookSessionStart,
  handleHookPostToolUse,
  handleHookSessionEnd,
} from '../../../src/v2/hooks/dispatcher.js';
import { runHookCommand } from '../../../src/v2/hooks/cli.js';
import {
  findByClaudeSessionId,
  loadMessages,
  appendMessages,
} from '../../../src/v2/adapters/sqlite/transcript-store.js';

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
       VALUES ('project:test-proj', 'project', 'global:__root__', 'test-proj', 'Test', '{"rootPath":"/tmp/test"}', 0, ?, ?)`
    )
    .run(now, now);
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `id-${idSeq}`;
}

describe('hook-dispatcher', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
    ensureScopes(sqlite);
    idSeq = 0;
  });

  describe('handleHookSessionStart', () => {
    it('creates transcript record', async () => {
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

      await handleHookSessionStart(
        { sqlite, runtime, idGenerator: nextId },
        {
          sessionId: 'sess-1',
          projectId: 'test-proj',
          transcriptPath: '/tmp/transcript.jsonl',
        }
      );

      const tx = findByClaudeSessionId(sqlite, 'sess-1');
      expect(tx).not.toBeNull();
      expect(tx!.status).toBe('active');
      expect(tx!.transcriptPath).toBe('/tmp/transcript.jsonl');
    });

    it('is idempotent (same session_id)', async () => {
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

      await handleHookSessionStart(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-1', projectId: 'test-proj' }
      );

      await handleHookSessionStart(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-1', projectId: 'test-proj' }
      );

      const count = sqlite.prepare('SELECT COUNT(*) AS c FROM v2_transcripts').get() as {
        c: number;
      };
      expect(count.c).toBe(1);
    });
  });

  describe('handleHookPostToolUse', () => {
    it('reads transcript incrementally and appends messages', async () => {
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });
      const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
      const transcriptPath = join(tmpDir, 'transcript.jsonl');

      const line1 = JSON.stringify({ role: 'user', content: 'hello world from user' }) + '\n';
      const line2 = JSON.stringify({ role: 'assistant', content: 'hi from assistant' }) + '\n';
      writeFileSync(transcriptPath, line1 + line2);

      await handleHookSessionStart(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-1', projectId: 'test-proj', transcriptPath }
      );

      await handleHookPostToolUse(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-1' }
      );

      const tx = findByClaudeSessionId(sqlite, 'sess-1');
      expect(tx!.messageCount).toBe(2);

      const msgs = loadMessages(sqlite, tx!.id);
      expect(msgs).toHaveLength(2);
    });

    it('handles missing transcript_path gracefully', async () => {
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

      await handleHookSessionStart(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-1', projectId: 'test-proj' }
      );

      // Should not throw
      await handleHookPostToolUse(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-1' }
      );

      const tx = findByClaudeSessionId(sqlite, 'sess-1');
      expect(tx!.messageCount).toBe(0);
    });
  });

  describe('runHookCommand with Claude Code snake_case payloads', () => {
    it('creates transcript from snake_case session-start payload', async () => {
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

      // Simulates exact JSON Claude Code sends on stdin
      const claudePayload = JSON.stringify({
        session_id: 'claude-sess-1',
        transcript_path: '/tmp/test-transcript.jsonl',
        cwd: '/tmp/test',
        hook_event_name: 'SessionStart',
      });

      await runHookCommand('session-start', claudePayload, {
        sqlite,
        runtime,
        idGenerator: nextId,
      });

      const tx = findByClaudeSessionId(sqlite, 'claude-sess-1');
      expect(tx).not.toBeNull();
      expect(tx!.status).toBe('active');
      expect(tx!.transcriptPath).toBe('/tmp/test-transcript.jsonl');
    });

    it('handles posttooluse event name with snake_case payload', async () => {
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });
      const tmpDir = mkdtempSync(join(tmpdir(), 'hook-snake-'));
      const transcriptPath = join(tmpDir, 'transcript.jsonl');
      writeFileSync(transcriptPath, JSON.stringify({ role: 'user', content: 'test' }) + '\n');

      // First create transcript via session-start
      await runHookCommand(
        'session-start',
        JSON.stringify({
          session_id: 'claude-sess-2',
          transcript_path: transcriptPath,
          cwd: '/tmp/test',
        }),
        { sqlite, runtime, idGenerator: nextId }
      );

      // Then fire posttooluse (Claude Code native event name)
      await runHookCommand(
        'posttooluse',
        JSON.stringify({
          session_id: 'claude-sess-2',
          tool_name: 'Write',
        }),
        { sqlite, runtime, idGenerator: nextId }
      );

      const tx = findByClaudeSessionId(sqlite, 'claude-sess-2');
      expect(tx!.messageCount).toBe(1);
    });

    it('ignores payload without session_id', async () => {
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

      await runHookCommand(
        'session-start',
        JSON.stringify({
          cwd: '/tmp/test',
        }),
        { sqlite, runtime, idGenerator: nextId }
      );

      const count = (
        sqlite.prepare('SELECT COUNT(*) AS c FROM v2_transcripts').get() as { c: number }
      ).c;
      expect(count).toBe(0);
    });
  });

  describe('handleHookSessionEnd', () => {
    it('runs extraction and marks transcript as extracted', async () => {
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });

      await handleHookSessionStart(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-1', projectId: 'test-proj' }
      );

      const tx = findByClaudeSessionId(sqlite, 'sess-1')!;

      appendMessages(sqlite, {
        transcriptId: tx.id,
        messages: [
          {
            id: nextId(),
            role: 'user',
            content: 'We always follow security best practices and validate authentication tokens',
            sequenceNum: 1,
          },
        ],
        newByteOffset: 200,
      });

      const result = await handleHookSessionEnd(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-1', projectId: 'test-proj' }
      );

      expect(result.extracted).toBeDefined();

      const updated = findByClaudeSessionId(sqlite, 'sess-1');
      expect(updated!.status).toBe('extracted');
    });

    it('does final transcript read when post-tool-use never fired', async () => {
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });
      const tmpDir = mkdtempSync(join(tmpdir(), 'hook-end-'));
      const transcriptPath = join(tmpDir, 'transcript.jsonl');

      // Write messages to file — simulates Claude Code writing during the session
      const line1 = JSON.stringify({ role: 'user', content: 'hello world' }) + '\n';
      const line2 = JSON.stringify({ role: 'assistant', content: 'hi there' }) + '\n';
      writeFileSync(transcriptPath, line1 + line2);

      await handleHookSessionStart(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-2', projectId: 'test-proj', transcriptPath }
      );

      // Skip handleHookPostToolUse entirely — simulates /clear before any tool use
      await handleHookSessionEnd(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-2', projectId: 'test-proj' }
      );

      const tx = findByClaudeSessionId(sqlite, 'sess-2')!;
      expect(tx.messageCount).toBe(2);

      const msgs = loadMessages(sqlite, tx.id);
      expect(msgs).toHaveLength(2);
      expect(msgs[0].role).toBe('user');
      expect(msgs[1].role).toBe('assistant');
    });

    it('captures trailing messages not yet read by post-tool-use', async () => {
      const runtime = createSqliteMemoryV2Runtime({ sqlite, idGenerator: nextId });
      const tmpDir = mkdtempSync(join(tmpdir(), 'hook-tail-'));
      const transcriptPath = join(tmpDir, 'transcript.jsonl');

      const line1 = JSON.stringify({ role: 'user', content: 'first message' }) + '\n';
      writeFileSync(transcriptPath, line1);

      await handleHookSessionStart(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-3', projectId: 'test-proj', transcriptPath }
      );

      // Post-tool-use reads the first message
      await handleHookPostToolUse(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-3' }
      );

      let tx = findByClaudeSessionId(sqlite, 'sess-3')!;
      expect(tx.messageCount).toBe(1);

      // More messages arrive after the last post-tool-use
      const line2 = JSON.stringify({ role: 'assistant', content: 'response' }) + '\n';
      const line3 = JSON.stringify({ role: 'user', content: 'follow up' }) + '\n';
      writeFileSync(transcriptPath, line1 + line2 + line3);

      // Session end should capture the trailing messages
      await handleHookSessionEnd(
        { sqlite, runtime, idGenerator: nextId },
        { sessionId: 'sess-3', projectId: 'test-proj' }
      );

      tx = findByClaudeSessionId(sqlite, 'sess-3')!;
      expect(tx.messageCount).toBe(3);

      const msgs = loadMessages(sqlite, tx.id);
      expect(msgs).toHaveLength(3);
      expect(msgs[0].content).toBe('first message');
      expect(msgs[1].content).toBe('response');
      expect(msgs[2].content).toBe('follow up');
    });
  });
});
