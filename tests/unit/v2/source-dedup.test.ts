import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { findEntryBySourceId } from '../../../src/v2/sources/dedup.js';

function applyV2Migration(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  for (const file of ['0044_add_v2_core_schema.sql', '0045_add_embedding_vector.sql']) {
    const sql = readFileSync(join(process.cwd(), 'src/db/migrations', file), 'utf8');
    sqlite.exec(sql);
  }
}

function seedScope(sqlite: Database.Database, scopeId: string): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO v2_scopes (id, type, parent_scope_id, name, metadata, created_at, updated_at)
       VALUES ('global:__root__', 'global', NULL, 'global', '{}', ?, ?)`
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO v2_scopes (id, type, parent_scope_id, name, metadata, created_at, updated_at)
       VALUES (?, 'project', 'global:__root__', ?, '{}', ?, ?)`
    )
    .run(scopeId, scopeId, now, now);
}

function seedEntry(
  sqlite: Database.Database,
  id: string,
  scopeId: string,
  metadata: Record<string, unknown>,
  isActive = 1
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO v2_entries (id, entry_type, scope_id, title, source, category, priority, confidence, current_version, is_active, metadata, created_at, updated_at)
       VALUES (?, 'knowledge', ?, 'Test', 'import', 'fact', 50, NULL, 1, ?, ?, ?, ?)`
    )
    .run(id, scopeId, isActive, JSON.stringify(metadata), now, now);
  sqlite
    .prepare(
      `INSERT INTO v2_entry_versions (id, entry_id, version_num, content, created_at)
       VALUES (?, ?, 1, 'test content', ?)`
    )
    .run(`ver-${id}`, id, now);
}

describe('findEntryBySourceId', () => {
  it('returns null when no entry with given sourceId exists', () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    seedScope(sqlite, 'project:alpha');

    const result = findEntryBySourceId(sqlite, 'notionPageId', 'page-123', 'project:alpha');
    expect(result).toBeNull();
  });

  it('returns entry ID when matching sourceId + scope found', () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    seedScope(sqlite, 'project:alpha');
    seedEntry(sqlite, 'entry-1', 'project:alpha', { notionPageId: 'page-123' });

    const result = findEntryBySourceId(sqlite, 'notionPageId', 'page-123', 'project:alpha');
    expect(result).toBe('entry-1');
  });

  it('returns null when sourceId exists in different scope', () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    seedScope(sqlite, 'project:alpha');
    seedScope(sqlite, 'project:beta');
    seedEntry(sqlite, 'entry-1', 'project:alpha', { notionPageId: 'page-123' });

    const result = findEntryBySourceId(sqlite, 'notionPageId', 'page-123', 'project:beta');
    expect(result).toBeNull();
  });

  it('returns null when entry is soft-deleted (is_active=0)', () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    seedScope(sqlite, 'project:alpha');
    seedEntry(sqlite, 'entry-1', 'project:alpha', { notionPageId: 'page-123' }, 0);

    const result = findEntryBySourceId(sqlite, 'notionPageId', 'page-123', 'project:alpha');
    expect(result).toBeNull();
  });

  it('handles entries without the metadata field gracefully', () => {
    const sqlite = new Database(':memory:');
    applyV2Migration(sqlite);
    seedScope(sqlite, 'project:alpha');
    seedEntry(sqlite, 'entry-1', 'project:alpha', { somethingElse: 'value' });

    const result = findEntryBySourceId(sqlite, 'notionPageId', 'page-123', 'project:alpha');
    expect(result).toBeNull();
  });
});
