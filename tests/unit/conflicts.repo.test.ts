import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  schema,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { IConflictRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-memory-conflicts.db';
let testDb: TestDb;
let conflictRepo: IConflictRepository;

describe('conflictRepo', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    conflictRepo = repos.conflicts;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  it('lists and resolves conflicts', async () => {
    // Seed a conflict row
    testDb.db
      .insert(schema.conflictLog)
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

    const unresolved = await conflictRepo.list(
      { entryType: 'tool', resolved: false },
      { limit: 10 }
    );
    expect(unresolved.length).toBeGreaterThan(0);
    const row = unresolved.find((c) => c.id === 'conf-test-1');
    expect(row).toBeDefined();
    expect(row?.resolved).toBe(false);

    const resolved = await conflictRepo.resolve('conf-test-1', 'Kept version ver-b', 'tester');
    expect(resolved).toBeDefined();
    expect(resolved?.resolved).toBe(true);
    expect(resolved?.resolution).toBe('Kept version ver-b');
    expect(resolved?.resolvedBy).toBe('tester');

    const nowResolved = await conflictRepo.list(
      { entryType: 'tool', resolved: true },
      { limit: 10 }
    );
    const resolvedRow = nowResolved.find((c) => c.id === 'conf-test-1');
    expect(resolvedRow).toBeDefined();
    expect(resolvedRow?.resolved).toBe(true);
  });
});
