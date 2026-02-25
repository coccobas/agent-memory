import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  upsertTranscript,
  appendMessages,
  updateTranscriptStatus,
  findByClaudeSessionId,
  loadMessages,
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

describe('transcript-store', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
  });

  describe('upsertTranscript', () => {
    it('creates a new record', () => {
      const result = upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-abc',
        status: 'active',
        transcriptPath: '/tmp/transcript.jsonl',
        agentId: 'claude-code',
      });

      expect(result.id).toBe('tx-1');
      expect(result.claudeSessionId).toBe('sess-abc');
      expect(result.status).toBe('active');
      expect(result.byteOffset).toBe(0);
      expect(result.messageCount).toBe(0);
    });

    it('is idempotent for the same claude_session_id', () => {
      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-abc',
        status: 'active',
      });

      const second = upsertTranscript(sqlite, {
        id: 'tx-2',
        claudeSessionId: 'sess-abc',
        status: 'active',
        transcriptPath: '/updated/path',
      });

      // Should return the original record, not create a new one
      expect(second.id).toBe('tx-1');

      // Verify only 1 row exists
      const count = sqlite.prepare('SELECT COUNT(*) AS c FROM v2_transcripts').get() as {
        c: number;
      };
      expect(count.c).toBe(1);
    });
  });

  describe('appendMessages', () => {
    it('inserts messages and updates byte_offset atomically', () => {
      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'active',
      });

      const result = appendMessages(sqlite, {
        transcriptId: 'tx-1',
        messages: [
          { id: 'm1', role: 'user', content: 'hello', sequenceNum: 1 },
          { id: 'm2', role: 'assistant', content: 'hi there', sequenceNum: 2 },
        ],
        newByteOffset: 256,
      });

      expect(result.messagesStored).toBe(2);

      // Verify transcript updated
      const tx = findByClaudeSessionId(sqlite, 'sess-1');
      expect(tx?.byteOffset).toBe(256);
      expect(tx?.messageCount).toBe(2);
    });

    it('auto-increments sequence_num from max when not specified', () => {
      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'active',
      });

      appendMessages(sqlite, {
        transcriptId: 'tx-1',
        messages: [{ id: 'm1', role: 'user', content: 'first', sequenceNum: 1 }],
        newByteOffset: 100,
      });

      appendMessages(sqlite, {
        transcriptId: 'tx-1',
        messages: [
          { id: 'm2', role: 'assistant', content: 'second', sequenceNum: 2 },
          { id: 'm3', role: 'user', content: 'third', sequenceNum: 3 },
        ],
        newByteOffset: 300,
      });

      const msgs = loadMessages(sqlite, 'tx-1');
      expect(msgs).toHaveLength(3);
      expect(msgs.map((m) => m.sequenceNum)).toEqual([1, 2, 3]);
    });
  });

  describe('updateTranscriptStatus', () => {
    it('transitions active to ended', () => {
      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'active',
      });

      const result = updateTranscriptStatus(sqlite, 'tx-1', 'ended');
      expect(result?.status).toBe('ended');
    });

    it('transitions ended to extracted', () => {
      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'active',
      });
      updateTranscriptStatus(sqlite, 'tx-1', 'ended');

      const result = updateTranscriptStatus(sqlite, 'tx-1', 'extracted');
      expect(result?.status).toBe('extracted');
    });
  });

  describe('findByClaudeSessionId', () => {
    it('returns null when not found', () => {
      const result = findByClaudeSessionId(sqlite, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns record when found', () => {
      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-abc',
        status: 'active',
        agentId: 'claude-code',
      });

      const result = findByClaudeSessionId(sqlite, 'sess-abc');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('tx-1');
      expect(result!.agentId).toBe('claude-code');
    });
  });

  describe('loadMessages', () => {
    it('returns ordered messages', () => {
      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'active',
      });

      appendMessages(sqlite, {
        transcriptId: 'tx-1',
        messages: [
          { id: 'm1', role: 'user', content: 'hello', sequenceNum: 1 },
          { id: 'm2', role: 'assistant', content: 'hi', sequenceNum: 2 },
          { id: 'm3', role: 'user', content: 'bye', sequenceNum: 3 },
        ],
        newByteOffset: 300,
      });

      const msgs = loadMessages(sqlite, 'tx-1');
      expect(msgs).toHaveLength(3);
      expect(msgs[0]!.role).toBe('user');
      expect(msgs[0]!.content).toBe('hello');
      expect(msgs[2]!.role).toBe('user');
      expect(msgs[2]!.content).toBe('bye');
    });

    it('supports fromSequence and limit', () => {
      upsertTranscript(sqlite, {
        id: 'tx-1',
        claudeSessionId: 'sess-1',
        status: 'active',
      });

      appendMessages(sqlite, {
        transcriptId: 'tx-1',
        messages: [
          { id: 'm1', role: 'user', content: 'a', sequenceNum: 1 },
          { id: 'm2', role: 'assistant', content: 'b', sequenceNum: 2 },
          { id: 'm3', role: 'user', content: 'c', sequenceNum: 3 },
          { id: 'm4', role: 'assistant', content: 'd', sequenceNum: 4 },
        ],
        newByteOffset: 400,
      });

      const msgs = loadMessages(sqlite, 'tx-1', { fromSequence: 2, limit: 2 });
      expect(msgs).toHaveLength(2);
      expect(msgs[0]!.sequenceNum).toBe(2);
      expect(msgs[1]!.sequenceNum).toBe(3);
    });
  });
});
