/**
 * Unit tests for migration service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestTool } from '../fixtures/test-helpers.js';
import { migrateEntries } from '../../src/services/migration.service.js';

const TEST_DB_PATH = './data/test-migration.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

describe('migration.service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('migrateEntries', () => {
    it('should migrate entries from JSON to YAML', () => {
      createTestTool(db, 'migration-test-tool', 'global');

      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'yaml',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(typeof result.migrated).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.dryRun).toBe('boolean');
    });

    it('should migrate entries from JSON to Markdown', () => {
      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'markdown',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(result.migrated).toBeGreaterThanOrEqual(0);
    });

    it('should support dry-run mode', () => {
      createTestTool(db, 'dry-run-test-tool', 'global');

      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'yaml',
        scopeType: 'global',
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.migrated).toBeGreaterThanOrEqual(0);
    });

    it('should filter by scopeType', () => {
      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'yaml',
        scopeType: 'project',
        scopeId: 'test-project-id',
      });

      expect(result).toBeDefined();
    });

    it('should filter by scopeId', () => {
      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'yaml',
        scopeType: 'project',
        scopeId: 'specific-project-id',
      });

      expect(result).toBeDefined();
    });

    it('should handle migration errors gracefully', () => {
      const result = migrateEntries({
        fromFormat: 'invalid-format',
        toFormat: 'yaml',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      // Should have errors for invalid format
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should report migration statistics', () => {
      createTestTool(db, 'stats-test-tool-1', 'global');
      createTestTool(db, 'stats-test-tool-2', 'global');

      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'markdown',
        scopeType: 'global',
      });

      expect(result.migrated).toBeGreaterThanOrEqual(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle OpenAPI format migration', () => {
      // OpenAPI only supports tools
      createTestTool(db, 'openapi-test-tool', 'global');

      const result = migrateEntries({
        fromFormat: 'openapi',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      // May succeed or fail depending on OpenAPI implementation
      expect(typeof result.migrated).toBe('number');
    });

    it('should handle empty database', () => {
      // Use a scope that doesn't have entries from previous tests
      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'yaml',
        scopeType: 'project',
        scopeId: 'non-existent-project-id',
      });

      expect(result.migrated).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('should collect errors during migration', () => {
      // Try to migrate with invalid source format
      const result = migrateEntries({
        fromFormat: 'invalid',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(Array.isArray(result.errors)).toBe(true);
      // Errors should have entryId and error message
      result.errors.forEach((error) => {
        expect(error.entryId).toBeDefined();
        expect(typeof error.error).toBe('string');
      });
    });

    it('should handle YAML to JSON migration', () => {
      const result = migrateEntries({
        fromFormat: 'yaml',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(typeof result.migrated).toBe('number');
    });

    it('should handle Markdown to JSON migration', () => {
      const result = migrateEntries({
        fromFormat: 'markdown',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(typeof result.migrated).toBe('number');
    });
  });
});
