import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  indexTranscriptMessage,
  indexTranscriptMessages,
  removeTranscriptFtsEntries,
  hasTranscriptFtsTable,
} from '../../../src/v2/adapters/sqlite/transcript-fts.js';

function applyMigrations(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  for (const file of [
    '0044_add_v2_core_schema.sql',
    '0045_add_embedding_vector.sql',
    '0046_add_v2_transcripts.sql',
    '0047_add_transcript_fts_and_provenance.sql',
  ]) {
    sqlite.exec(readFileSync(join(process.cwd(), `src/db/migrations/${file}`), 'utf8'));
  }
}

function insertTranscript(sqlite: Database.Database, id: string): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO v2_transcripts (id, claude_session_id, status, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?)`
    )
    .run(id, `session-${id}`, now, now);
}

describe('transcript-fts', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
  });

  describe('hasTranscriptFtsTable', () => {
    it('returns true when migration 0047 is applied', () => {
      expect(hasTranscriptFtsTable(sqlite)).toBe(true);
    });

    it('returns false when FTS table does not exist', () => {
      const bare = new Database(':memory:');
      expect(hasTranscriptFtsTable(bare)).toBe(false);
    });
  });

  describe('indexTranscriptMessage', () => {
    it('indexes user messages', () => {
      insertTranscript(sqlite, 'tx-1');
      indexTranscriptMessage(
        sqlite,
        'msg-1',
        'tx-1',
        'We always use TypeScript strict mode',
        'user'
      );

      const row = sqlite
        .prepare('SELECT * FROM v2_transcript_fts WHERE message_id = ?')
        .get('msg-1') as { content: string } | undefined;

      expect(row).toBeDefined();
      expect(row!.content).toContain('TypeScript strict mode');
    });

    it('indexes assistant messages', () => {
      insertTranscript(sqlite, 'tx-1');
      indexTranscriptMessage(sqlite, 'msg-1', 'tx-1', 'I recommend using strict mode', 'assistant');

      const row = sqlite
        .prepare('SELECT * FROM v2_transcript_fts WHERE message_id = ?')
        .get('msg-1');
      expect(row).toBeDefined();
    });

    it('skips tool_use messages', () => {
      insertTranscript(sqlite, 'tx-1');
      indexTranscriptMessage(sqlite, 'msg-1', 'tx-1', 'Read file.ts', 'tool_use');

      const row = sqlite
        .prepare('SELECT * FROM v2_transcript_fts WHERE message_id = ?')
        .get('msg-1');
      expect(row).toBeUndefined();
    });

    it('skips system messages', () => {
      insertTranscript(sqlite, 'tx-1');
      indexTranscriptMessage(sqlite, 'msg-1', 'tx-1', 'system prompt', 'system');

      const row = sqlite
        .prepare('SELECT * FROM v2_transcript_fts WHERE message_id = ?')
        .get('msg-1');
      expect(row).toBeUndefined();
    });

    it('skips empty content', () => {
      insertTranscript(sqlite, 'tx-1');
      indexTranscriptMessage(sqlite, 'msg-1', 'tx-1', '   ', 'user');

      const row = sqlite
        .prepare('SELECT * FROM v2_transcript_fts WHERE message_id = ?')
        .get('msg-1');
      expect(row).toBeUndefined();
    });

    it('truncates very long content', () => {
      insertTranscript(sqlite, 'tx-1');
      const longContent = 'a'.repeat(10000);
      indexTranscriptMessage(sqlite, 'msg-1', 'tx-1', longContent, 'user');

      const row = sqlite
        .prepare('SELECT * FROM v2_transcript_fts WHERE message_id = ?')
        .get('msg-1') as { content: string };

      expect(row.content.length).toBeLessThanOrEqual(4000);
    });
  });

  describe('indexTranscriptMessages (batch)', () => {
    it('indexes multiple messages and returns count', () => {
      insertTranscript(sqlite, 'tx-1');

      const count = indexTranscriptMessages(
        sqlite,
        [
          { id: 'msg-1', role: 'user', content: 'Hello world' },
          { id: 'msg-2', role: 'assistant', content: 'Hi there' },
          { id: 'msg-3', role: 'tool_use', content: 'Read foo.ts' },
          { id: 'msg-4', role: 'user', content: 'Thanks' },
        ],
        'tx-1'
      );

      expect(count).toBe(3); // tool_use skipped

      const allRows = sqlite.prepare('SELECT message_id FROM v2_transcript_fts').all() as {
        message_id: string;
      }[];
      expect(allRows).toHaveLength(3);
    });
  });

  describe('removeTranscriptFtsEntries', () => {
    it('removes all FTS entries for a transcript', () => {
      insertTranscript(sqlite, 'tx-1');
      insertTranscript(sqlite, 'tx-2');

      indexTranscriptMessage(sqlite, 'msg-1', 'tx-1', 'first transcript', 'user');
      indexTranscriptMessage(sqlite, 'msg-2', 'tx-2', 'second transcript', 'user');

      removeTranscriptFtsEntries(sqlite, 'tx-1');

      const remaining = sqlite.prepare('SELECT transcript_id FROM v2_transcript_fts').all() as {
        transcript_id: string;
      }[];

      expect(remaining).toHaveLength(1);
      expect(remaining[0].transcript_id).toBe('tx-2');
    });
  });

  describe('FTS MATCH search', () => {
    it('finds messages by content', () => {
      insertTranscript(sqlite, 'tx-1');
      indexTranscriptMessage(sqlite, 'msg-1', 'tx-1', 'We use Docker for all deployments', 'user');
      indexTranscriptMessage(sqlite, 'msg-2', 'tx-1', 'Authentication uses JWT tokens', 'user');

      const results = sqlite
        .prepare(
          `SELECT message_id, rank FROM v2_transcript_fts
           WHERE v2_transcript_fts MATCH 'Docker'
           ORDER BY rank`
        )
        .all() as { message_id: string }[];

      expect(results).toHaveLength(1);
      expect(results[0].message_id).toBe('msg-1');
    });

    it('matches across multiple words', () => {
      insertTranscript(sqlite, 'tx-1');
      indexTranscriptMessage(
        sqlite,
        'msg-1',
        'tx-1',
        'We always validate user input with zod schemas',
        'user'
      );

      const results = sqlite
        .prepare(
          `SELECT message_id FROM v2_transcript_fts
           WHERE v2_transcript_fts MATCH 'validate zod'`
        )
        .all() as { message_id: string }[];

      expect(results).toHaveLength(1);
    });
  });
});
