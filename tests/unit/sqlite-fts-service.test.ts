import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SQLiteFTSService,
  createSQLiteFTSService,
} from '../../src/services/fts/sqlite-fts.service.js';
import {
  setupTestDb,
  cleanupTestDb,
  createTestTool,
  createTestGuideline,
  createTestKnowledge,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-sqlite-fts.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

describe('SQLiteFTSService', () => {
  beforeEach(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
    }
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('constructor', () => {
    it('should create a service with sqlite connection', () => {
      const service = new SQLiteFTSService(sqlite);
      expect(service).toBeDefined();
    });
  });

  describe('escapeQuery', () => {
    it('should escape double quotes', () => {
      const service = new SQLiteFTSService(sqlite);
      const escaped = service.escapeQuery('test "quoted" text');
      expect(escaped).toContain('""');
    });

    it('should wrap queries with operators in quotes', () => {
      const service = new SQLiteFTSService(sqlite);
      const escaped = service.escapeQuery('test query');
      // Contains space, should be wrapped
      expect(escaped.startsWith('"')).toBe(true);
      expect(escaped.endsWith('"')).toBe(true);
    });

    it('should handle simple terms', () => {
      const service = new SQLiteFTSService(sqlite);
      const escaped = service.escapeQuery('simple');
      expect(escaped).toBe('simple');
    });

    it('should handle queries with plus operator', () => {
      const service = new SQLiteFTSService(sqlite);
      const escaped = service.escapeQuery('term1+term2');
      expect(escaped.startsWith('"')).toBe(true);
    });

    it('should handle queries with minus operator', () => {
      const service = new SQLiteFTSService(sqlite);
      const escaped = service.escapeQuery('term1-term2');
      expect(escaped.startsWith('"')).toBe(true);
    });

    it('should handle queries with pipe operator', () => {
      const service = new SQLiteFTSService(sqlite);
      const escaped = service.escapeQuery('term1|term2');
      expect(escaped.startsWith('"')).toBe(true);
    });

    it('should handle queries with asterisk', () => {
      const service = new SQLiteFTSService(sqlite);
      const escaped = service.escapeQuery('term*');
      expect(escaped.startsWith('"')).toBe(true);
    });

    it('should handle queries with parentheses', () => {
      const service = new SQLiteFTSService(sqlite);
      const escaped = service.escapeQuery('(term1 term2)');
      expect(escaped.startsWith('"')).toBe(true);
    });
  });

  describe('isAvailable', () => {
    it('should check if FTS tables exist', async () => {
      const service = new SQLiteFTSService(sqlite);
      const available = await service.isAvailable();
      // May or may not have FTS tables depending on test setup
      expect(typeof available).toBe('boolean');
    });
  });

  describe('search', () => {
    it('should return empty results for empty entry types', async () => {
      const service = new SQLiteFTSService(sqlite);
      const results = await service.search('test', []);
      expect(results).toEqual([]);
    });

    it('should handle search for tools', async () => {
      createTestTool(db, 'fts-tool', 'global', undefined, 'function', 'Searchable description');
      const service = new SQLiteFTSService(sqlite);
      // FTS may or may not be available
      const results = await service.search('searchable', ['tool']);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle search for guidelines', async () => {
      createTestGuideline(db, 'fts-guideline', 'global', undefined, 'testing', 50, 'Searchable content');
      const service = new SQLiteFTSService(sqlite);
      const results = await service.search('searchable', ['guideline']);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle search for knowledge', async () => {
      createTestKnowledge(db, 'FTS Knowledge', 'global', undefined, 'Searchable content');
      const service = new SQLiteFTSService(sqlite);
      const results = await service.search('searchable', ['knowledge']);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should search multiple entry types', async () => {
      createTestTool(db, 'multi-fts-tool', 'global');
      createTestGuideline(db, 'multi-fts-guideline', 'global');
      createTestKnowledge(db, 'Multi FTS Knowledge', 'global');

      const service = new SQLiteFTSService(sqlite);
      const results = await service.search('multi', ['tool', 'guideline', 'knowledge']);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should respect limit option', async () => {
      const service = new SQLiteFTSService(sqlite);
      const results = await service.search('test', ['tool'], { limit: 5 });
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should support prefix option', async () => {
      const service = new SQLiteFTSService(sqlite);
      const results = await service.search('test', ['tool'], { prefix: true });
      expect(results).toBeDefined();
    });

    it('should support highlight option', async () => {
      const service = new SQLiteFTSService(sqlite);
      const results = await service.search('test', ['tool'], { highlight: true });
      expect(results).toBeDefined();
    });

    it('should handle unknown entry type gracefully', async () => {
      const service = new SQLiteFTSService(sqlite);
      const results = await service.search('test', ['unknown' as any]);
      expect(results).toEqual([]);
    });

    it('should sort results by rank', async () => {
      const service = new SQLiteFTSService(sqlite);
      const results = await service.search('test', ['tool', 'guideline']);

      // Results should be sorted by rank (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.rank).toBeGreaterThanOrEqual(results[i]!.rank);
      }
    });
  });

  describe('rebuild', () => {
    it('should rebuild FTS index for specific type', async () => {
      createTestTool(db, 'rebuild-tool', 'global');
      const service = new SQLiteFTSService(sqlite);
      // Should not throw
      await expect(service.rebuild('tool')).resolves.not.toThrow();
    });

    it('should rebuild FTS index for all types', async () => {
      createTestTool(db, 'rebuild-all-tool', 'global');
      createTestGuideline(db, 'rebuild-all-guide', 'global');
      createTestKnowledge(db, 'Rebuild All Knowledge', 'global');

      const service = new SQLiteFTSService(sqlite);
      // Should not throw
      await expect(service.rebuild()).resolves.not.toThrow();
    });

    it('should handle rebuild for guideline type', async () => {
      createTestGuideline(db, 'rebuild-guideline', 'global');
      const service = new SQLiteFTSService(sqlite);
      await expect(service.rebuild('guideline')).resolves.not.toThrow();
    });

    it('should handle rebuild for knowledge type', async () => {
      createTestKnowledge(db, 'Rebuild Knowledge', 'global');
      const service = new SQLiteFTSService(sqlite);
      await expect(service.rebuild('knowledge')).resolves.not.toThrow();
    });
  });

  describe('syncEntry', () => {
    it('should be a no-op (FTS5 triggers handle syncing)', async () => {
      const service = new SQLiteFTSService(sqlite);
      // Should not throw
      await expect(service.syncEntry('tool', 'test-id')).resolves.not.toThrow();
    });
  });
});

describe('createSQLiteFTSService', () => {
  beforeEach(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
    }
    cleanupTestDb(TEST_DB_PATH);
  });

  it('should create a SQLiteFTSService', () => {
    const service = createSQLiteFTSService(sqlite);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(SQLiteFTSService);
  });

  it('should create a working service', async () => {
    const service = createSQLiteFTSService(sqlite);
    const available = await service.isAvailable();
    expect(typeof available).toBe('boolean');
  });
});
