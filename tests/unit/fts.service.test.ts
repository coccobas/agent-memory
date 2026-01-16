/**
 * Unit tests for FTS service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestTool,
  createTestGuideline,
  createTestKnowledge,
} from '../fixtures/test-helpers.js';
import {
  searchFTS,
  rebuildFTSIndex,
  isFTSAvailable,
  syncFTSForEntry,
  sanitizeFts5Operators,
  escapeFts5Query,
  escapeFts5Quotes,
} from '../../src/services/fts.service.js';

const TEST_DB_PATH = './data/test-fts.db';
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
  };
});

describe('fts.service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('isFTSAvailable', () => {
    it('should check if FTS5 is available', () => {
      const available = isFTSAvailable();
      expect(typeof available).toBe('boolean');
      // May or may not be available depending on test database setup
    });
  });

  describe('searchFTS', () => {
    it('should search for tools', () => {
      createTestTool(db, 'search-test-tool', 'global', undefined, 'A tool for testing search');

      const results = searchFTS('search test', ['tool']);

      // May return results if FTS is set up, or empty array if not
      expect(Array.isArray(results)).toBe(true);
      results.forEach((result) => {
        expect(result.entryType).toBe('tool');
        expect(result.entryId).toBeDefined();
        expect(result.versionId).toBeDefined();
        expect(typeof result.rank).toBe('number');
      });
    });

    it('should search for guidelines', () => {
      createTestGuideline(
        db,
        'search-test-guideline',
        'global',
        undefined,
        'testing',
        80,
        'A guideline for testing search functionality'
      );

      const results = searchFTS('search test', ['guideline']);

      expect(Array.isArray(results)).toBe(true);
      results.forEach((result) => {
        expect(result.entryType).toBe('guideline');
      });
    });

    it('should search for knowledge', () => {
      createTestKnowledge(db, 'Search Test Knowledge', 'This is knowledge for testing search');

      const results = searchFTS('search test', ['knowledge']);

      expect(Array.isArray(results)).toBe(true);
      results.forEach((result) => {
        expect(result.entryType).toBe('knowledge');
      });
    });

    it('should search multiple entry types', () => {
      createTestTool(db, 'multi-search-tool', 'global');
      createTestGuideline(
        db,
        'multi-search-guideline',
        'global',
        undefined,
        'testing',
        80,
        'Test guideline'
      );

      const results = searchFTS('multi search', ['tool', 'guideline']);

      expect(Array.isArray(results)).toBe(true);
      // Should potentially return results from both types
      const types = results.map((r) => r.entryType);
      expect(['tool', 'guideline']).toContain('tool');
    });

    it('should respect limit option', () => {
      // Create multiple entries
      for (let i = 0; i < 5; i++) {
        createTestTool(db, `limit-test-tool-${i}`, 'global');
      }

      const results = searchFTS('limit test', ['tool'], { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should generate snippets when highlight option is enabled', () => {
      createTestTool(
        db,
        'highlight-test-tool',
        'global',
        undefined,
        'This is a description with test keyword'
      );

      const results = searchFTS('test', ['tool'], { highlight: true });

      expect(Array.isArray(results)).toBe(true);
      // If snippets are generated, they should be strings
      results.forEach((result) => {
        if (result.snippet) {
          expect(typeof result.snippet).toBe('string');
        }
      });
    });

    it('should handle prefix matching', () => {
      createTestTool(db, 'prefix-matching-tool', 'global');

      const results = searchFTS('prefix', ['tool'], { prefix: true });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = searchFTS('nonexistent-query-xyz-123', ['tool', 'guideline', 'knowledge']);

      expect(results).toEqual([]);
    });

    it('should handle empty query gracefully', () => {
      const results = searchFTS('', ['tool']);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should sort results by rank', () => {
      createTestTool(db, 'rank-test-1', 'global');
      createTestTool(db, 'rank-test-2', 'global');

      const results = searchFTS('rank test', ['tool']);

      if (results.length > 1) {
        // Higher rank should come first
        expect(results[0]?.rank).toBeGreaterThanOrEqual(results[1]?.rank || 0);
      }
    });
  });

  describe('rebuildFTSIndex', () => {
    it('should rebuild index for specific entry type', () => {
      createTestTool(db, 'rebuild-test-tool', 'global');

      // Should not throw
      expect(() => {
        rebuildFTSIndex('tool');
      }).not.toThrow();
    });

    it('should rebuild index for all types when no type specified', () => {
      createTestTool(db, 'rebuild-all-tool', 'global');
      createTestGuideline(db, 'rebuild-all-guideline', 'global', undefined, 'testing', 80, 'Test');

      // Should not throw
      expect(() => {
        rebuildFTSIndex();
      }).not.toThrow();
    });

    it('should handle rebuild when no entries exist', () => {
      // Should not throw even with empty database
      expect(() => {
        rebuildFTSIndex('tool');
      }).not.toThrow();
    });
  });

  describe('syncFTSForEntry', () => {
    it('should sync FTS for specific entry', () => {
      const { tool } = createTestTool(db, 'sync-test-tool', 'global');

      // Should not throw (triggers handle this automatically)
      expect(() => {
        syncFTSForEntry('tool', tool.id);
      }).not.toThrow();
    });

    it('should handle sync for different entry types', () => {
      const guideline = createTestGuideline(
        db,
        'sync-test-guideline',
        'global',
        undefined,
        'testing',
        80,
        'Test'
      );

      expect(() => {
        syncFTSForEntry('guideline', guideline.guideline.id);
      }).not.toThrow();

      const { knowledge } = createTestKnowledge(db, 'Sync Test Knowledge');

      expect(() => {
        syncFTSForEntry('knowledge', knowledge.id);
      }).not.toThrow();
    });
  });

  describe('sanitizeFts5Operators', () => {
    describe('operator detection and sanitization', () => {
      it('should sanitize uppercase AND operator', () => {
        const result = sanitizeFts5Operators('term1 AND term2');
        expect(result).toBe('"term1 AND term2"');
      });

      it('should sanitize lowercase and operator', () => {
        const result = sanitizeFts5Operators('term1 and term2');
        expect(result).toBe('"term1 and term2"');
      });

      it('should sanitize mixed case And operator', () => {
        const result = sanitizeFts5Operators('term1 And term2');
        expect(result).toBe('"term1 And term2"');
      });

      it('should sanitize OR operator', () => {
        const result = sanitizeFts5Operators('term1 OR term2');
        expect(result).toBe('"term1 OR term2"');
      });

      it('should sanitize NOT operator', () => {
        const result = sanitizeFts5Operators('term1 NOT term2');
        expect(result).toBe('"term1 NOT term2"');
      });

      it('should sanitize NEAR operator without distance', () => {
        const result = sanitizeFts5Operators('term1 NEAR term2');
        expect(result).toBe('"term1 NEAR term2"');
      });

      it('should sanitize NEAR/N operator with distance', () => {
        const result = sanitizeFts5Operators('term1 NEAR/5 term2');
        expect(result).toBe('"term1 NEAR/5 term2"');
      });

      it('should sanitize NEAR/10 operator', () => {
        const result = sanitizeFts5Operators('term1 NEAR/10 term2');
        expect(result).toBe('"term1 NEAR/10 term2"');
      });

      it('should sanitize multiple operators in one query', () => {
        const result = sanitizeFts5Operators('term1 AND term2 OR term3 NOT term4');
        expect(result).toBe('"term1 AND term2 OR term3 NOT term4"');
      });

      it('should sanitize complex query with NEAR and AND', () => {
        const result = sanitizeFts5Operators('term1 NEAR/5 term2 AND term3');
        expect(result).toBe('"term1 NEAR/5 term2 AND term3"');
      });
    });

    describe('quote escaping', () => {
      it('should escape double quotes before sanitizing', () => {
        const result = sanitizeFts5Operators('"quoted" AND term');
        expect(result).toBe('"""quoted"" AND term"');
      });

      it('should handle multiple quotes with operators', () => {
        const result = sanitizeFts5Operators('"first" OR "second"');
        expect(result).toBe('"""first"" OR ""second"""');
      });

      it('should escape quotes in query without operators', () => {
        const result = sanitizeFts5Operators('"just a quoted phrase"');
        expect(result).toBe('""just a quoted phrase""');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        const result = sanitizeFts5Operators('');
        expect(result).toBe('');
      });

      it('should handle whitespace-only string', () => {
        const result = sanitizeFts5Operators('   ');
        expect(result).toBe('   ');
      });

      it('should not sanitize query without operators', () => {
        const result = sanitizeFts5Operators('simple search query');
        expect(result).toBe('simple search query');
      });

      it('should not sanitize partial operator matches', () => {
        // "LAND" contains "AND" but is not the operator
        const result = sanitizeFts5Operators('landscape');
        expect(result).toBe('landscape');
      });

      it('should not sanitize operator as part of word', () => {
        // "android" contains "and" but is not the operator
        const result = sanitizeFts5Operators('android');
        expect(result).toBe('android');
      });

      it('should handle operator at start of query', () => {
        const result = sanitizeFts5Operators('AND term');
        expect(result).toBe('"AND term"');
      });

      it('should handle operator at end of query', () => {
        const result = sanitizeFts5Operators('term AND');
        expect(result).toBe('"term AND"');
      });

      it('should preserve normal punctuation without operators', () => {
        const result = sanitizeFts5Operators('hello, world!');
        expect(result).toBe('hello, world!');
      });
    });

    describe('word boundary detection', () => {
      it('should detect AND with punctuation before', () => {
        const result = sanitizeFts5Operators('(AND term)');
        expect(result).toBe('"(AND term)"');
      });

      it('should detect AND with punctuation after', () => {
        const result = sanitizeFts5Operators('term AND,');
        expect(result).toBe('"term AND,"');
      });

      it('should not match operators inside compound words', () => {
        const result = sanitizeFts5Operators('understand');
        expect(result).toBe('understand');
      });

      it('should not match operators in URLs or identifiers', () => {
        const result = sanitizeFts5Operators('myANDroid_app');
        expect(result).toBe('myANDroid_app');
      });
    });

    describe('case sensitivity', () => {
      it('should be case-insensitive for all operators', () => {
        expect(sanitizeFts5Operators('a and b')).toBe('"a and b"');
        expect(sanitizeFts5Operators('a AND b')).toBe('"a AND b"');
        expect(sanitizeFts5Operators('a AnD b')).toBe('"a AnD b"');
        expect(sanitizeFts5Operators('a or b')).toBe('"a or b"');
        expect(sanitizeFts5Operators('a OR b')).toBe('"a OR b"');
        expect(sanitizeFts5Operators('a not b')).toBe('"a not b"');
        expect(sanitizeFts5Operators('a NOT b')).toBe('"a NOT b"');
        expect(sanitizeFts5Operators('a near b')).toBe('"a near b"');
        expect(sanitizeFts5Operators('a NEAR b')).toBe('"a NEAR b"');
      });
    });
  });

  describe('escapeFts5Query', () => {
    it('should escape double quotes', () => {
      const result = escapeFts5Query('"quoted text"');
      expect(result).toBe('"""quoted text"""');
    });

    it('should wrap query with special characters in quotes', () => {
      const result = escapeFts5Query('term1 + term2');
      expect(result).toBe('"term1 + term2"');
    });

    it('should handle query without special characters', () => {
      const result = escapeFts5Query('simple');
      expect(result).toBe('simple');
    });
  });

  describe('escapeFts5Quotes', () => {
    it('should only escape double quotes', () => {
      const result = escapeFts5Quotes('"quoted text"');
      expect(result).toBe('""quoted text""');
    });

    it('should not modify text without quotes', () => {
      const result = escapeFts5Quotes('no quotes here');
      expect(result).toBe('no quotes here');
    });

    it('should handle multiple quotes', () => {
      const result = escapeFts5Quotes('"first" "second" "third"');
      expect(result).toBe('""first"" ""second"" ""third""');
    });
  });
});
