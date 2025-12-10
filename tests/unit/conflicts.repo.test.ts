import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema.js';

const TEST_DB_PATH = './data/test-memory-conflicts.db';

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle>;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { conflictRepo } from '../../src/db/repositories/conflicts.js';

describe('conflictRepo', () => {
  beforeAll(() => {
    if (!existsSync('./data')) {
      mkdirSync('./data', { recursive: true });
    }

    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${TEST_DB_PATH}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }

    sqlite = new Database(TEST_DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    db = drizzle(sqlite, { schema });

    const migrationPath = join(process.cwd(), 'src/db/migrations/0000_lying_the_hand.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    const statements = migrationSql.split('--> statement-breakpoint');
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) {
        sqlite.exec(trimmed);
      }
    }
  });

  afterAll(() => {
    sqlite.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${TEST_DB_PATH}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  });

  it('lists and resolves conflicts', () => {
    // Seed a conflict row
    db.insert(schema.conflictLog)
      .values({
        id: 'conf-test-1',
        entryType: 'tool',
        entryId: 'tool-test',
        versionAId: 'ver-a',
        versionBId: 'ver-b',
        detectedAt: '2024-12-10T00:00:00.000Z',
        resolved: false,
      })
      .run();

    const unresolved = conflictRepo.list({ entryType: 'tool', resolved: false }, { limit: 10 });
    expect(unresolved.length).toBeGreaterThan(0);
    const row = unresolved.find((c) => c.id === 'conf-test-1');
    expect(row).toBeDefined();
    expect(row?.resolved).toBe(false);

    const resolved = conflictRepo.resolve('conf-test-1', 'Kept version ver-b', 'tester');
    expect(resolved).toBeDefined();
    expect(resolved?.resolved).toBe(true);
    expect(resolved?.resolution).toBe('Kept version ver-b');
    expect(resolved?.resolvedBy).toBe('tester');

    const nowResolved = conflictRepo.list({ entryType: 'tool', resolved: true }, { limit: 10 });
    const resolvedRow = nowResolved.find((c) => c.id === 'conf-test-1');
    expect(resolvedRow).toBeDefined();
    expect(resolvedRow?.resolved).toBe(true);
  });
});
