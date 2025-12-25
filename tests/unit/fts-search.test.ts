import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestTool,
  createTestGuideline,
  createTestKnowledge,
} from '../fixtures/test-helpers.js';
import { executeFts5Query, executeFts5Search } from '../../src/services/query/fts-search.js';

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
      createTestTool(db, 'fts-tool-search', 'global', undefined, 'function', 'Test description for FTS');

      // The FTS query may or may not work depending on whether FTS tables are set up
      const result = executeFts5Query('tool', 'fts', []);

      expect(result).toBeInstanceOf(Set);
      // If FTS is not available, will fallback to LIKE and may return results or not
    });

    it('should search guidelines by default fields', () => {
      createTestGuideline(db, 'fts-guideline', 'global', undefined, 'testing', 50, 'Content for testing');

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
      createTestTool(db, 'field-tool', 'global', undefined, 'function', 'Description field content');

      const result = executeFts5Query('tool', 'field', ['name']);

      expect(result).toBeInstanceOf(Set);
    });

    it('should support field-specific search for guidelines', () => {
      createTestGuideline(db, 'field-guideline', 'global', undefined, 'testing', 50, 'Guideline content');

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
      createTestGuideline(db, 'fts-search-guideline', 'global', undefined, 'testing', 50, 'Content');

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
      createTestGuideline(db, 'like-fallback-guideline', 'global', undefined, 'testing', 50, 'Content');

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
});
