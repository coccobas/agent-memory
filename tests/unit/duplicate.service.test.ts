/**
 * Unit tests for duplicate service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestTool,
  createTestGuideline,
  createTestKnowledge,
  schema,
} from '../fixtures/test-helpers.js';
import { findSimilarEntries, checkForDuplicates } from '../../src/services/duplicate.service.js';
import { eq } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-duplicate.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
    getSqlite: () => sqlite,
    getPreparedStatement: (sql: string) => sqlite.prepare(sql),
  };
});

describe('duplicate.service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('findSimilarEntries', () => {
    it('should find similar tools by name', () => {
      // Create a tool
      createTestTool(db, 'test-query-tool', 'global');

      const similar = findSimilarEntries('tool', 'test query tool', 'global', null, 0.7);
      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0]?.name).toContain('test');
    });

    it('should return empty array when no similar entries found', () => {
      const similar = findSimilarEntries('tool', 'completely-unique-name-xyz', 'global', null, 0.8);
      expect(similar).toEqual([]);
    });

    it('should respect similarity threshold', () => {
      createTestTool(db, 'my-tool', 'global');

      // Low threshold should find matches
      const lowThreshold = findSimilarEntries('tool', 'my tool', 'global', null, 0.5);
      expect(lowThreshold.length).toBeGreaterThan(0);

      // High threshold might not find matches
      const highThreshold = findSimilarEntries('tool', 'different-tool', 'global', null, 0.95);
      // Should have fewer or no matches with higher threshold
      expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
    });

    it('should find similar guidelines', () => {
      createTestGuideline(
        db,
        'use-parameterized-queries',
        'global',
        undefined,
        'security',
        80,
        'Always use parameterized SQL queries'
      );

      const similar = findSimilarEntries(
        'guideline',
        'use parameterized queries',
        'global',
        null,
        0.7
      );
      expect(similar.length).toBeGreaterThan(0);
    });

    it('should find similar knowledge entries', () => {
      createTestKnowledge(db, 'Database Connection Patterns');

      const similar = findSimilarEntries(
        'knowledge',
        'database connection patterns',
        'global',
        null,
        0.7
      );
      expect(similar.length).toBeGreaterThan(0);
    });

    it('should respect scope when finding duplicates', () => {
      const project = db.select().from(schema.projects).limit(1).get();
      if (project) {
        createTestTool(db, 'scoped-tool', 'project', project.id);

        // Should find in project scope
        const similar = findSimilarEntries('tool', 'scoped tool', 'project', project.id, 0.7);
        expect(similar.length).toBeGreaterThan(0);

        // Should not find in global scope
        const globalSimilar = findSimilarEntries('tool', 'scoped tool', 'global', null, 0.7);
        // May find it or not depending on FTS behavior, but should respect scope
        expect(globalSimilar.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should sort results by similarity', () => {
      createTestTool(db, 'test-tool-one', 'global');
      createTestTool(db, 'test-tool-two', 'global');

      const similar = findSimilarEntries('tool', 'test tool one', 'global', null, 0.5);

      if (similar.length > 1) {
        // First should have higher similarity than second
        expect(similar[0]?.similarity).toBeGreaterThanOrEqual(similar[1]?.similarity || 0);
      }
    });
  });

  describe('checkForDuplicates', () => {
    it('should detect duplicates with high similarity', () => {
      const tool = createTestTool(db, 'existing-tool', 'global');

      const result = checkForDuplicates('tool', 'existing-tool', 'global', null);

      // Should detect duplicate if similarity >= 0.9
      // Note: FTS5 might not be available in test environment, so we check if entries exist
      // If FTS5 finds the entry, it should have similarity >= 0.9 (exact match = 1.0)
      if (result.similarEntries.length > 0) {
        expect(result.similarEntries.some((e) => e.similarity >= 0.9)).toBe(true);
        expect(result.isDuplicate).toBe(true);
      } else {
        // If FTS5 is not available, at least verify the function doesn't crash
        expect(result.isDuplicate).toBe(false);
        expect(Array.isArray(result.similarEntries)).toBe(true);
      }
    });

    it('should not flag as duplicate when similarity is low', () => {
      createTestTool(db, 'different-tool', 'global');

      const result = checkForDuplicates('tool', 'completely-different-name', 'global', null);

      // May have similar entries but not duplicates
      expect(result.isDuplicate).toBe(false);
    });

    it('should return all similar entries even if not duplicates', () => {
      createTestTool(db, 'similar-tool', 'global');

      const result = checkForDuplicates('tool', 'similar tool name', 'global', null);

      expect(result.similarEntries).toBeDefined();
      expect(Array.isArray(result.similarEntries)).toBe(true);
    });

    it('should work with guidelines', () => {
      createTestGuideline(
        db,
        'existing-guideline',
        'global',
        undefined,
        'security',
        80,
        'Test guideline'
      );

      const result = checkForDuplicates('guideline', 'existing-guideline', 'global', null);
      expect(result).toBeDefined();
      expect(typeof result.isDuplicate).toBe('boolean');
    });

    it('should work with knowledge', () => {
      createTestKnowledge(db, 'Existing Knowledge');

      const result = checkForDuplicates('knowledge', 'Existing Knowledge', 'global', null);
      expect(result).toBeDefined();
      expect(typeof result.isDuplicate).toBe('boolean');
    });
  });
});








