import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  insertProvenance,
  loadProvenanceByEntry,
  loadProvenanceByTranscript,
  loadProvenanceSnippet,
  hasProvenanceTable,
} from '../../../src/v2/adapters/sqlite/provenance-store.js';

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

function insertTranscript(sqlite: Database.Database, id: string): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO v2_transcripts (id, claude_session_id, status, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?)`
    )
    .run(id, `session-${id}`, now, now);
}

function insertEntry(sqlite: Database.Database, id: string): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO v2_entries (id, entry_type, scope_id, title, source, metadata, created_at, updated_at)
       VALUES (?, 'knowledge', 'project:test', 'Test Entry', 'hook_capture', '{}', ?, ?)`
    )
    .run(id, now, now);
}

function insertMessage(
  sqlite: Database.Database,
  id: string,
  transcriptId: string,
  seqNum: number,
  content: string,
  role = 'user'
): void {
  sqlite
    .prepare(
      `INSERT INTO v2_transcript_messages (id, transcript_id, sequence_num, role, content, metadata)
       VALUES (?, ?, ?, ?, ?, '{}')`
    )
    .run(id, transcriptId, seqNum, role, content);
}

describe('provenance-store', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
    ensureScopes(sqlite);
  });

  describe('hasProvenanceTable', () => {
    it('returns true when migration 0047 is applied', () => {
      expect(hasProvenanceTable(sqlite)).toBe(true);
    });

    it('returns false on bare database', () => {
      const bare = new Database(':memory:');
      expect(hasProvenanceTable(bare)).toBe(false);
    });
  });

  describe('insertProvenance', () => {
    it('inserts and returns a provenance record', () => {
      insertTranscript(sqlite, 'tx-1');
      insertEntry(sqlite, 'entry-1');

      const record = insertProvenance(sqlite, {
        id: 'prov-1',
        entryId: 'entry-1',
        transcriptId: 'tx-1',
        seqStart: 3,
        seqEnd: 5,
        extractorName: 'regex',
        confidence: 0.8,
      });

      expect(record).not.toBeNull();
      expect(record!.entryId).toBe('entry-1');
      expect(record!.transcriptId).toBe('tx-1');
      expect(record!.seqStart).toBe(3);
      expect(record!.seqEnd).toBe(5);
      expect(record!.extractorName).toBe('regex');
      expect(record!.confidence).toBe(0.8);
    });

    it('handles duplicate gracefully (INSERT OR IGNORE)', () => {
      insertTranscript(sqlite, 'tx-1');
      insertEntry(sqlite, 'entry-1');

      insertProvenance(sqlite, {
        id: 'prov-1',
        entryId: 'entry-1',
        transcriptId: 'tx-1',
        seqStart: 3,
        seqEnd: 5,
        extractorName: 'regex',
      });

      // Same entry+transcript+range should not throw
      insertProvenance(sqlite, {
        id: 'prov-2',
        entryId: 'entry-1',
        transcriptId: 'tx-1',
        seqStart: 3,
        seqEnd: 5,
        extractorName: 'regex',
      });

      const all = loadProvenanceByEntry(sqlite, 'entry-1');
      expect(all).toHaveLength(1);
    });
  });

  describe('loadProvenanceByEntry', () => {
    it('returns all provenance records for an entry', () => {
      insertTranscript(sqlite, 'tx-1');
      insertTranscript(sqlite, 'tx-2');
      insertEntry(sqlite, 'entry-1');

      insertProvenance(sqlite, {
        id: 'prov-1',
        entryId: 'entry-1',
        transcriptId: 'tx-1',
        seqStart: 1,
        seqEnd: 3,
        extractorName: 'regex',
      });

      insertProvenance(sqlite, {
        id: 'prov-2',
        entryId: 'entry-1',
        transcriptId: 'tx-2',
        seqStart: 5,
        seqEnd: 7,
        extractorName: 'llm',
      });

      const records = loadProvenanceByEntry(sqlite, 'entry-1');
      expect(records).toHaveLength(2);
      expect(records[0].seqStart).toBe(1);
      expect(records[1].seqStart).toBe(5);
    });

    it('returns empty array when no provenance exists', () => {
      const records = loadProvenanceByEntry(sqlite, 'nonexistent');
      expect(records).toEqual([]);
    });
  });

  describe('loadProvenanceByTranscript', () => {
    it('returns all provenance records for a transcript', () => {
      insertTranscript(sqlite, 'tx-1');
      insertEntry(sqlite, 'entry-1');
      insertEntry(sqlite, 'entry-2');

      insertProvenance(sqlite, {
        id: 'prov-1',
        entryId: 'entry-1',
        transcriptId: 'tx-1',
        seqStart: 1,
        seqEnd: 3,
        extractorName: 'regex',
      });

      insertProvenance(sqlite, {
        id: 'prov-2',
        entryId: 'entry-2',
        transcriptId: 'tx-1',
        seqStart: 5,
        seqEnd: 7,
        extractorName: 'regex',
      });

      const records = loadProvenanceByTranscript(sqlite, 'tx-1');
      expect(records).toHaveLength(2);
    });
  });

  describe('loadProvenanceSnippet', () => {
    it('loads messages in the provenance range', () => {
      insertTranscript(sqlite, 'tx-1');
      insertEntry(sqlite, 'entry-1');

      for (let i = 1; i <= 5; i++) {
        insertMessage(sqlite, `msg-${i}`, 'tx-1', i, `Message ${i}`);
      }

      const prov = insertProvenance(sqlite, {
        id: 'prov-1',
        entryId: 'entry-1',
        transcriptId: 'tx-1',
        seqStart: 2,
        seqEnd: 4,
        extractorName: 'regex',
      })!;

      const messages = loadProvenanceSnippet(sqlite, prov);
      expect(messages).toHaveLength(3);
      expect(messages[0].sequenceNum).toBe(2);
      expect(messages[1].sequenceNum).toBe(3);
      expect(messages[2].sequenceNum).toBe(4);
    });
  });
});
