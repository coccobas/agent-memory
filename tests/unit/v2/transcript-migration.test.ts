import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';

function applyMigrations(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  const m44 = readFileSync(
    join(process.cwd(), 'src/db/migrations/0044_add_v2_core_schema.sql'),
    'utf8'
  );
  sqlite.exec(m44);

  const m45 = readFileSync(
    join(process.cwd(), 'src/db/migrations/0045_add_embedding_vector.sql'),
    'utf8'
  );
  sqlite.exec(m45);

  const m46 = readFileSync(
    join(process.cwd(), 'src/db/migrations/0046_add_v2_transcripts.sql'),
    'utf8'
  );
  sqlite.exec(m46);
}

describe('0046_add_v2_transcripts migration', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    applyMigrations(sqlite);
  });

  it('creates v2_transcripts table', () => {
    const tables = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='v2_transcripts'`)
      .all() as { name: string }[];

    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe('v2_transcripts');
  });

  it('creates v2_transcript_messages table', () => {
    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='v2_transcript_messages'`
      )
      .all() as { name: string }[];

    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe('v2_transcript_messages');
  });

  it('v2_transcripts has correct columns', () => {
    const cols = sqlite.prepare(`PRAGMA table_info(v2_transcripts)`).all() as {
      name: string;
      type: string;
    }[];
    const names = cols.map((c) => c.name);

    expect(names).toContain('id');
    expect(names).toContain('session_scope_id');
    expect(names).toContain('project_scope_id');
    expect(names).toContain('claude_session_id');
    expect(names).toContain('transcript_path');
    expect(names).toContain('agent_id');
    expect(names).toContain('byte_offset');
    expect(names).toContain('message_count');
    expect(names).toContain('status');
    expect(names).toContain('created_at');
    expect(names).toContain('updated_at');
  });

  it('v2_transcript_messages has correct columns', () => {
    const cols = sqlite.prepare(`PRAGMA table_info(v2_transcript_messages)`).all() as {
      name: string;
      type: string;
    }[];
    const names = cols.map((c) => c.name);

    expect(names).toContain('id');
    expect(names).toContain('transcript_id');
    expect(names).toContain('sequence_num');
    expect(names).toContain('role');
    expect(names).toContain('content');
    expect(names).toContain('tool_name');
    expect(names).toContain('timestamp');
    expect(names).toContain('metadata');
  });

  it('claude_session_id has unique constraint', () => {
    const now = new Date().toISOString();

    sqlite
      .prepare(
        `INSERT INTO v2_transcripts (id, claude_session_id, status, byte_offset, message_count, created_at, updated_at)
         VALUES ('t1', 'session-abc', 'active', 0, 0, ?, ?)`
      )
      .run(now, now);

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO v2_transcripts (id, claude_session_id, status, byte_offset, message_count, created_at, updated_at)
           VALUES ('t2', 'session-abc', 'active', 0, 0, ?, ?)`
        )
        .run(now, now)
    ).toThrow();
  });

  it('sequence_num is unique per transcript_id', () => {
    const now = new Date().toISOString();

    sqlite
      .prepare(
        `INSERT INTO v2_transcripts (id, claude_session_id, status, byte_offset, message_count, created_at, updated_at)
         VALUES ('t1', 'sess-1', 'active', 0, 0, ?, ?)`
      )
      .run(now, now);

    sqlite
      .prepare(
        `INSERT INTO v2_transcript_messages (id, transcript_id, sequence_num, role, content, timestamp)
         VALUES ('m1', 't1', 1, 'user', 'hello', ?)`
      )
      .run(now);

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO v2_transcript_messages (id, transcript_id, sequence_num, role, content, timestamp)
           VALUES ('m2', 't1', 1, 'user', 'world', ?)`
        )
        .run(now)
    ).toThrow();
  });

  it('transcript_messages FK references v2_transcripts', () => {
    const now = new Date().toISOString();

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO v2_transcript_messages (id, transcript_id, sequence_num, role, content, timestamp)
           VALUES ('m1', 'nonexistent', 1, 'user', 'hello', ?)`
        )
        .run(now)
    ).toThrow();
  });

  it('status CHECK constraint allows valid values', () => {
    const now = new Date().toISOString();

    for (const status of ['active', 'ended', 'extracted']) {
      sqlite
        .prepare(
          `INSERT INTO v2_transcripts (id, claude_session_id, status, byte_offset, message_count, created_at, updated_at)
           VALUES (?, ?, ?, 0, 0, ?, ?)`
        )
        .run(`t-${status}`, `sess-${status}`, status, now, now);
    }

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO v2_transcripts (id, claude_session_id, status, byte_offset, message_count, created_at, updated_at)
           VALUES ('t-bad', 'sess-bad', 'invalid', 0, 0, ?, ?)`
        )
        .run(now, now)
    ).toThrow();
  });
});
