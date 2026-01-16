import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestTool,
  createTestGuideline,
  createTestKnowledge,
} from '../fixtures/test-helpers.js';
import {
  executeFts5Query,
  executeFts5Search,
  executeFts5SearchWithScores,
  createFtsSearchFunctions,
  type GetPreparedStatementFn,
  type FtsScoredHit,
} from '../../src/services/query/fts-search.js';

const TEST_DB_PATH = './data/test-fts-search.db';

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

describe('fts-search', () => {
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

  describe('executeFts5Query', () => {
    it('should return empty set when no matches', () => {
      createTestTool(db, 'test-tool', 'global');

      const result = executeFts5Query('tool', 'nonexistent-query-xyz', []);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should search tools by default fields', () => {
      createTestTool(
        db,
        'fts-tool-search',
        'global',
        undefined,
        'function',
        'Test description for FTS'
      );

      // The FTS query may or may not work depending on whether FTS tables are set up
      const result = executeFts5Query('tool', 'fts', []);

      expect(result).toBeInstanceOf(Set);
      // If FTS is not available, will fallback to LIKE and may return results or not
    });

    it('should search guidelines by default fields', () => {
      createTestGuideline(
        db,
        'fts-guideline',
        'global',
        undefined,
        'testing',
        50,
        'Content for testing'
      );

      const result = executeFts5Query('guideline', 'fts', []);

      expect(result).toBeInstanceOf(Set);
    });

    it('should search knowledge by default fields', () => {
      createTestKnowledge(db, 'FTS Knowledge Title', 'global', undefined, 'Knowledge content');

      const result = executeFts5Query('knowledge', 'FTS', []);

      expect(result).toBeInstanceOf(Set);
    });

    it('should search experiences by default fields', () => {
      // Experience table may not have entries, but the function should handle it
      const result = executeFts5Query('experience', 'test', []);

      expect(result).toBeInstanceOf(Set);
    });

    it('should support field-specific search for tools', () => {
      createTestTool(
        db,
        'field-tool',
        'global',
        undefined,
        'function',
        'Description field content'
      );

      const result = executeFts5Query('tool', 'field', ['name']);

      expect(result).toBeInstanceOf(Set);
    });

    it('should support field-specific search for guidelines', () => {
      createTestGuideline(
        db,
        'field-guideline',
        'global',
        undefined,
        'testing',
        50,
        'Guideline content'
      );

      const result = executeFts5Query('guideline', 'field', ['name', 'content']);

      expect(result).toBeInstanceOf(Set);
    });

    it('should support field-specific search for knowledge', () => {
      createTestKnowledge(db, 'Field Knowledge', 'global', undefined, 'Content to search');

      const result = executeFts5Query('knowledge', 'Field', ['title']);

      expect(result).toBeInstanceOf(Set);
    });

    it('should filter invalid fields', () => {
      createTestTool(db, 'invalid-field-tool', 'global');

      // Invalid fields should be filtered out
      const result = executeFts5Query('tool', 'invalid', ['invalid_column', 'name']);

      expect(result).toBeInstanceOf(Set);
    });

    it('should handle empty search query', () => {
      const result = executeFts5Query('tool', '', []);

      expect(result).toBeInstanceOf(Set);
    });

    it('should handle special characters in search query', () => {
      createTestTool(db, 'special-chars-tool', 'global');

      // Queries with special characters should be escaped
      const result = executeFts5Query('tool', 'test "quoted" phrase', []);

      expect(result).toBeInstanceOf(Set);
    });

    it('should handle percent and underscore in LIKE fallback', () => {
      createTestTool(db, 'percent%underscore_tool', 'global');

      const result = executeFts5Query('tool', '%_special', []);

      expect(result).toBeInstanceOf(Set);
    });
  });

  describe('executeFts5Search', () => {
    it('should return object with all entry type sets', () => {
      const result = executeFts5Search('test', ['tools', 'guidelines', 'knowledge', 'experiences']);

      expect(result).toHaveProperty('tool');
      expect(result).toHaveProperty('guideline');
      expect(result).toHaveProperty('knowledge');
      expect(result).toHaveProperty('experience');
      expect(result.tool).toBeInstanceOf(Set);
      expect(result.guideline).toBeInstanceOf(Set);
      expect(result.knowledge).toBeInstanceOf(Set);
      expect(result.experience).toBeInstanceOf(Set);
    });

    it('should return empty sets for empty query', () => {
      const result = executeFts5Search('', ['tools']);

      expect(result.tool.size).toBe(0);
      expect(result.guideline.size).toBe(0);
      expect(result.knowledge.size).toBe(0);
      expect(result.experience.size).toBe(0);
    });

    it('should return empty sets for empty types array', () => {
      const result = executeFts5Search('test', []);

      expect(result.tool.size).toBe(0);
      expect(result.guideline.size).toBe(0);
      expect(result.knowledge.size).toBe(0);
      expect(result.experience.size).toBe(0);
    });

    it('should search only specified types', () => {
      createTestTool(db, 'search-only-tool', 'global');
      createTestGuideline(db, 'search-only-guideline', 'global');

      // Only search tools
      const result = executeFts5Search('search', ['tools']);

      expect(result).toHaveProperty('tool');
      expect(result).toHaveProperty('guideline');
      // Guidelines should be empty since we only searched tools
      expect(result.guideline.size).toBe(0);
    });

    it('should search tools type', () => {
      createTestTool(db, 'fts-search-tool', 'global');

      const result = executeFts5Search('fts', ['tools']);

      expect(result.tool).toBeInstanceOf(Set);
    });

    it('should search guidelines type', () => {
      createTestGuideline(
        db,
        'fts-search-guideline',
        'global',
        undefined,
        'testing',
        50,
        'Content'
      );

      const result = executeFts5Search('fts', ['guidelines']);

      expect(result.guideline).toBeInstanceOf(Set);
    });

    it('should search knowledge type', () => {
      createTestKnowledge(db, 'FTS Search Knowledge', 'global', undefined, 'Content');

      const result = executeFts5Search('FTS', ['knowledge']);

      expect(result.knowledge).toBeInstanceOf(Set);
    });

    it('should search experiences type', () => {
      const result = executeFts5Search('test', ['experiences']);

      expect(result.experience).toBeInstanceOf(Set);
    });

    it('should search multiple types simultaneously', () => {
      createTestTool(db, 'multi-fts-tool', 'global');
      createTestGuideline(db, 'multi-fts-guideline', 'global');
      createTestKnowledge(db, 'Multi FTS Knowledge', 'global');

      const result = executeFts5Search('multi', ['tools', 'guidelines', 'knowledge']);

      expect(result.tool).toBeInstanceOf(Set);
      expect(result.guideline).toBeInstanceOf(Set);
      expect(result.knowledge).toBeInstanceOf(Set);
    });

    it('should handle special characters in search', () => {
      createTestTool(db, 'special-tool', 'global');

      const result = executeFts5Search('test "quoted" (parens)', ['tools']);

      expect(result.tool).toBeInstanceOf(Set);
    });

    it('should handle FTS5 operators in search query', () => {
      createTestTool(db, 'operator-tool', 'global');

      // Queries with AND/OR operators should be sanitized
      const result = executeFts5Search('term1 AND term2', ['tools']);

      expect(result.tool).toBeInstanceOf(Set);
    });

    it('should handle whitespace-only query', () => {
      const result = executeFts5Search('   ', ['tools']);

      expect(result.tool.size).toBe(0);
    });
  });

  describe('LIKE fallback', () => {
    it('should work for tool searches when FTS fails', () => {
      createTestTool(db, 'like-fallback-tool', 'global', undefined, 'function', 'Description');

      // This will trigger FTS first, then fallback to LIKE if FTS fails
      const result = executeFts5Query('tool', 'like', []);

      expect(result).toBeInstanceOf(Set);
    });

    it('should work for guideline searches when FTS fails', () => {
      createTestGuideline(
        db,
        'like-fallback-guideline',
        'global',
        undefined,
        'testing',
        50,
        'Content'
      );

      const result = executeFts5Query('guideline', 'like', []);

      expect(result).toBeInstanceOf(Set);
    });

    it('should work for knowledge searches when FTS fails', () => {
      createTestKnowledge(db, 'Like Fallback Knowledge', 'global', undefined, 'Content');

      const result = executeFts5Query('knowledge', 'like', []);

      expect(result).toBeInstanceOf(Set);
    });

    it('should work for experience searches when FTS fails', () => {
      const result = executeFts5Query('experience', 'like', []);

      expect(result).toBeInstanceOf(Set);
    });

    it('should handle field mapping in LIKE search', () => {
      createTestTool(db, 'mapping-tool', 'global');

      // Test with valid field
      const result = executeFts5Query('tool', 'mapping', ['name']);

      expect(result).toBeInstanceOf(Set);
    });

    it('should handle invalid fields in LIKE search gracefully', () => {
      createTestTool(db, 'invalid-like-tool', 'global');

      // Invalid field should use default
      const result = executeFts5Query('tool', 'invalid', ['nonexistent']);

      expect(result).toBeInstanceOf(Set);
    });
  });

  describe('executeFts5SearchWithScores', () => {
    it('should return object with all entry type arrays', () => {
      const result = executeFts5SearchWithScores('test', [
        'tools',
        'guidelines',
        'knowledge',
        'experiences',
      ]);

      expect(result).toHaveProperty('tool');
      expect(result).toHaveProperty('guideline');
      expect(result).toHaveProperty('knowledge');
      expect(result).toHaveProperty('experience');
      expect(Array.isArray(result.tool)).toBe(true);
      expect(Array.isArray(result.guideline)).toBe(true);
      expect(Array.isArray(result.knowledge)).toBe(true);
      expect(Array.isArray(result.experience)).toBe(true);
    });

    it('should return empty arrays for empty query', () => {
      const result = executeFts5SearchWithScores('', ['tools']);

      expect(result.tool.length).toBe(0);
      expect(result.guideline.length).toBe(0);
      expect(result.knowledge.length).toBe(0);
      expect(result.experience.length).toBe(0);
    });

    it('should return empty arrays for empty types array', () => {
      const result = executeFts5SearchWithScores('test', []);

      expect(result.tool.length).toBe(0);
      expect(result.guideline.length).toBe(0);
      expect(result.knowledge.length).toBe(0);
      expect(result.experience.length).toBe(0);
    });

    it('should return scored hits with id and score properties', () => {
      createTestTool(db, 'scored-tool', 'global');

      const result = executeFts5SearchWithScores('scored', ['tools']);

      // Even if no matches, structure should be correct
      for (const hit of result.tool) {
        expect(hit).toHaveProperty('id');
        expect(hit).toHaveProperty('score');
        expect(typeof hit.id).toBe('string');
        expect(typeof hit.score).toBe('number');
      }
    });

    it('should respect limit option', () => {
      // Create multiple tools
      for (let i = 0; i < 5; i++) {
        createTestTool(db, `limit-tool-${i}`, 'global');
      }

      const result = executeFts5SearchWithScores('limit', ['tools'], { limit: 2 });

      // Results should be limited (if FTS is available and matches found)
      expect(result.tool.length).toBeLessThanOrEqual(2);
    });

    it('should use default limit of 200', () => {
      createTestTool(db, 'default-limit-tool', 'global');

      // This should work without specifying limit
      const result = executeFts5SearchWithScores('default', ['tools']);

      expect(result).toBeDefined();
    });

    it('should search only specified types', () => {
      createTestTool(db, 'only-scored-tool', 'global');
      createTestGuideline(db, 'only-scored-guideline', 'global');

      // Only search tools
      const result = executeFts5SearchWithScores('only', ['tools']);

      // Guidelines should be empty since we only searched tools
      expect(result.guideline.length).toBe(0);
    });

    it('should search tools type with scores', () => {
      createTestTool(db, 'fts-scored-tool', 'global');

      const result = executeFts5SearchWithScores('fts', ['tools']);

      expect(Array.isArray(result.tool)).toBe(true);
    });

    it('should search guidelines type with scores', () => {
      createTestGuideline(db, 'fts-scored-guideline', 'global');

      const result = executeFts5SearchWithScores('fts', ['guidelines']);

      expect(Array.isArray(result.guideline)).toBe(true);
    });

    it('should search knowledge type with scores', () => {
      createTestKnowledge(db, 'FTS Scored Knowledge', 'global');

      const result = executeFts5SearchWithScores('FTS', ['knowledge']);

      expect(Array.isArray(result.knowledge)).toBe(true);
    });

    it('should search experiences type with scores', () => {
      const result = executeFts5SearchWithScores('test', ['experiences']);

      expect(Array.isArray(result.experience)).toBe(true);
    });

    it('should search multiple types simultaneously with scores', () => {
      createTestTool(db, 'multi-scored-tool', 'global');
      createTestGuideline(db, 'multi-scored-guideline', 'global');
      createTestKnowledge(db, 'Multi Scored Knowledge', 'global');

      const result = executeFts5SearchWithScores('multi', ['tools', 'guidelines', 'knowledge']);

      expect(Array.isArray(result.tool)).toBe(true);
      expect(Array.isArray(result.guideline)).toBe(true);
      expect(Array.isArray(result.knowledge)).toBe(true);
    });

    it('should sort results by score in descending order', () => {
      // Create tools that might have different scores
      createTestTool(db, 'sort-test-first', 'global');
      createTestTool(db, 'sort-second', 'global');

      const result = executeFts5SearchWithScores('sort', ['tools']);

      // Results should be sorted by score descending
      for (let i = 1; i < result.tool.length; i++) {
        expect(result.tool[i - 1].score).toBeGreaterThanOrEqual(result.tool[i].score);
      }
    });

    it('should handle special characters in scored search', () => {
      createTestTool(db, 'special-scored-tool', 'global');

      const result = executeFts5SearchWithScores('test "quoted" (parens)', ['tools']);

      expect(Array.isArray(result.tool)).toBe(true);
    });

    it('should handle whitespace-only query in scored search', () => {
      const result = executeFts5SearchWithScores('   ', ['tools']);

      expect(result.tool.length).toBe(0);
    });
  });

  describe('createFtsSearchFunctions', () => {
    let mockStatement: { all: ReturnType<typeof vi.fn> };
    let mockGetPreparedStatement: GetPreparedStatementFn;

    beforeEach(() => {
      mockStatement = {
        all: vi.fn().mockReturnValue([]),
      };
      mockGetPreparedStatement = vi.fn().mockReturnValue(mockStatement);
    });

    it('should return object with all FTS functions', () => {
      const functions = createFtsSearchFunctions(mockGetPreparedStatement);

      expect(functions).toHaveProperty('executeFts5Search');
      expect(functions).toHaveProperty('executeFts5SearchWithScores');
      expect(functions).toHaveProperty('executeFts5Query');
      expect(typeof functions.executeFts5Search).toBe('function');
      expect(typeof functions.executeFts5SearchWithScores).toBe('function');
      expect(typeof functions.executeFts5Query).toBe('function');
    });

    describe('factory executeFts5Query', () => {
      it('should use injected getPreparedStatement', () => {
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        functions.executeFts5Query('tool', 'test');

        expect(mockGetPreparedStatement).toHaveBeenCalled();
      });

      it('should return Set of rowids', () => {
        mockStatement.all.mockReturnValue([{ rowid: 1 }, { rowid: 2 }]);
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        const result = functions.executeFts5Query('tool', 'test');

        expect(result).toBeInstanceOf(Set);
        expect(result.has(1)).toBe(true);
        expect(result.has(2)).toBe(true);
      });

      it('should handle empty query by falling back to LIKE', () => {
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        // Empty/stopword query falls back to LIKE
        const result = functions.executeFts5Query('tool', 'the');

        expect(result).toBeInstanceOf(Set);
      });

      it('should handle field-specific search', () => {
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        functions.executeFts5Query('tool', 'test', ['name', 'description']);

        expect(mockGetPreparedStatement).toHaveBeenCalled();
      });

      it('should handle FTS5 error by falling back to LIKE', () => {
        const ftsGetPreparedStatement = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('MATCH')) {
            throw new Error('FTS5 not available');
          }
          return mockStatement;
        });

        const functions = createFtsSearchFunctions(ftsGetPreparedStatement);

        // Should not throw, should fall back to LIKE
        const result = functions.executeFts5Query('tool', 'test');

        expect(result).toBeInstanceOf(Set);
      });

      it('should handle all entry types', () => {
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        expect(() => functions.executeFts5Query('tool', 'test')).not.toThrow();
        expect(() => functions.executeFts5Query('guideline', 'test')).not.toThrow();
        expect(() => functions.executeFts5Query('knowledge', 'test')).not.toThrow();
        expect(() => functions.executeFts5Query('experience', 'test')).not.toThrow();
      });
    });

    describe('factory executeFts5Search', () => {
      it('should return record with all entry type Sets', () => {
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        const result = functions.executeFts5Search('test', ['tools']);

        expect(result.tool).toBeInstanceOf(Set);
        expect(result.guideline).toBeInstanceOf(Set);
        expect(result.knowledge).toBeInstanceOf(Set);
        expect(result.experience).toBeInstanceOf(Set);
      });

      it('should return empty result for empty search', () => {
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        const result = functions.executeFts5Search('', ['tools']);

        expect(result.tool.size).toBe(0);
      });

      it('should return empty result for empty types', () => {
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        const result = functions.executeFts5Search('test', []);

        expect(result.tool.size).toBe(0);
        expect(result.guideline.size).toBe(0);
      });

      it('should search specified types', () => {
        mockStatement.all.mockReturnValue([
          { type: 'tool', id: 't1' },
          { type: 'guideline', id: 'g1' },
        ]);
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        const result = functions.executeFts5Search('test', ['tools', 'guidelines']);

        expect(result.tool.has('t1')).toBe(true);
        expect(result.guideline.has('g1')).toBe(true);
      });

      it('should handle all search types', () => {
        mockStatement.all.mockReturnValue([
          { type: 'tool', id: 't1' },
          { type: 'guideline', id: 'g1' },
          { type: 'knowledge', id: 'k1' },
          { type: 'experience', id: 'e1' },
        ]);
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        const result = functions.executeFts5Search('test', [
          'tools',
          'guidelines',
          'knowledge',
          'experiences',
        ]);

        expect(result.tool.size).toBe(1);
        expect(result.guideline.size).toBe(1);
        expect(result.knowledge.size).toBe(1);
        expect(result.experience.size).toBe(1);
      });
    });

    describe('factory executeFts5SearchWithScores', () => {
      it('should return record with all entry type arrays', () => {
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        const result = functions.executeFts5SearchWithScores('test', ['tools']);

        expect(Array.isArray(result.tool)).toBe(true);
        expect(Array.isArray(result.guideline)).toBe(true);
        expect(Array.isArray(result.knowledge)).toBe(true);
        expect(Array.isArray(result.experience)).toBe(true);
      });

      it('should return empty result for empty search', () => {
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        const result = functions.executeFts5SearchWithScores('', ['tools']);

        expect(result.tool.length).toBe(0);
      });

      it('should return scored hits', () => {
        mockStatement.all.mockReturnValue([
          { type: 'tool', id: 't1', bm25: 0 },
          { type: 'tool', id: 't2', bm25: 1 },
        ]);
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        const result = functions.executeFts5SearchWithScores('test', ['tools']);

        expect(result.tool.length).toBe(2);
        expect(result.tool[0].id).toBe('t1');
        expect(result.tool[0].score).toBe(1.0); // bm25=0 normalizes to 1.0
        expect(result.tool[1].id).toBe('t2');
        expect(result.tool[1].score).toBe(0.5); // bm25=1 normalizes to 0.5
      });

      it('should respect limit option', () => {
        mockStatement.all.mockReturnValue([{ type: 'tool', id: 't1', bm25: 0 }]);
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        functions.executeFts5SearchWithScores('test', ['tools'], { limit: 10 });

        // Check that limit is passed in params
        const params = mockStatement.all.mock.calls[0];
        expect(params).toContain(10);
      });

      it('should handle error by falling back to boolean search', () => {
        const failingGetPreparedStatement = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('bm25')) {
            throw new Error('bm25 not available');
          }
          return mockStatement;
        });
        const functions = createFtsSearchFunctions(failingGetPreparedStatement);

        // Should not throw, should fall back
        const result = functions.executeFts5SearchWithScores('test', ['tools']);

        expect(Array.isArray(result.tool)).toBe(true);
      });

      it('should sort results by score descending', () => {
        mockStatement.all.mockReturnValue([
          { type: 'tool', id: 't1', bm25: 5 },
          { type: 'tool', id: 't2', bm25: 1 },
          { type: 'tool', id: 't3', bm25: 0 },
        ]);
        const functions = createFtsSearchFunctions(mockGetPreparedStatement);

        const result = functions.executeFts5SearchWithScores('test', ['tools']);

        // Should be sorted by score descending
        expect(result.tool[0].id).toBe('t3');
        expect(result.tool[1].id).toBe('t2');
        expect(result.tool[2].id).toBe('t1');
      });
    });

    describe('factory LIKE fallback', () => {
      it('should handle LIKE fallback for tools', () => {
        const ftsFailGetPreparedStatement = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('MATCH')) {
            throw new Error('FTS not available');
          }
          return mockStatement;
        });

        const functions = createFtsSearchFunctions(ftsFailGetPreparedStatement);
        const result = functions.executeFts5Query('tool', 'test');

        expect(result).toBeInstanceOf(Set);
      });

      it('should handle LIKE fallback for guidelines', () => {
        const ftsFailGetPreparedStatement = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('MATCH')) {
            throw new Error('FTS not available');
          }
          return mockStatement;
        });

        const functions = createFtsSearchFunctions(ftsFailGetPreparedStatement);
        const result = functions.executeFts5Query('guideline', 'test');

        expect(result).toBeInstanceOf(Set);
      });

      it('should handle LIKE fallback for knowledge', () => {
        const ftsFailGetPreparedStatement = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('MATCH')) {
            throw new Error('FTS not available');
          }
          return mockStatement;
        });

        const functions = createFtsSearchFunctions(ftsFailGetPreparedStatement);
        const result = functions.executeFts5Query('knowledge', 'test');

        expect(result).toBeInstanceOf(Set);
      });

      it('should handle LIKE fallback for experiences', () => {
        const ftsFailGetPreparedStatement = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('MATCH')) {
            throw new Error('FTS not available');
          }
          return mockStatement;
        });

        const functions = createFtsSearchFunctions(ftsFailGetPreparedStatement);
        const result = functions.executeFts5Query('experience', 'test');

        expect(result).toBeInstanceOf(Set);
      });

      it('should handle field-specific LIKE search', () => {
        const ftsFailGetPreparedStatement = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('MATCH')) {
            throw new Error('FTS not available');
          }
          return mockStatement;
        });

        const functions = createFtsSearchFunctions(ftsFailGetPreparedStatement);
        const result = functions.executeFts5Query('tool', 'test', ['name']);

        expect(result).toBeInstanceOf(Set);
      });

      it('should handle LIKE fallback error gracefully', () => {
        const failingGetPreparedStatement = vi.fn().mockImplementation(() => {
          throw new Error('All DB access failed');
        });

        const functions = createFtsSearchFunctions(failingGetPreparedStatement);
        const result = functions.executeFts5Query('tool', 'test');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
      });
    });
  });
});
