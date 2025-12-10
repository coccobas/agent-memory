import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestTool, createTestGuideline } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-relations.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js',
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { relationHandlers } from '../../src/mcp/handlers/relations.handler.js';

describe('Relations Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('memory_relation_create', () => {
    it('should create a relation between tool and guideline', () => {
      const { tool } = createTestTool(db, 'sql_tool');
      const { guideline } = createTestGuideline(db, 'sql_guideline');

      const result = relationHandlers.create({
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: guideline.id,
        relationType: 'applies_to',
      });

      expect(result.success).toBe(true);
      expect(result.relation).toBeDefined();
      expect(result.relation.sourceType).toBe('tool');
      expect(result.relation.sourceId).toBe(tool.id);
      expect(result.relation.targetType).toBe('guideline');
      expect(result.relation.targetId).toBe(guideline.id);
      expect(result.relation.relationType).toBe('applies_to');
    });

    it('should create relation in reverse direction', () => {
      const { guideline } = createTestGuideline(db, 'reverse_guideline');
      const { tool } = createTestTool(db, 'reverse_tool');

      const result = relationHandlers.create({
        sourceType: 'guideline',
        sourceId: guideline.id,
        targetType: 'tool',
        targetId: tool.id,
        relationType: 'applies_to',
      });

      expect(result.success).toBe(true);
    });

    it('should require all required fields', () => {
      expect(() => {
        relationHandlers.create({});
      }).toThrow('sourceType is required');
    });
  });

  describe('memory_relation_list', () => {
    it('should list relations by source', () => {
      const { tool } = createTestTool(db, 'source_tool');
      const { guideline: g1 } = createTestGuideline(db, 'target1');
      const { guideline: g2 } = createTestGuideline(db, 'target2');

      relationHandlers.create({
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: g1.id,
        relationType: 'applies_to',
      });

      relationHandlers.create({
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: g2.id,
        relationType: 'applies_to',
      });

      const result = relationHandlers.list({
        sourceType: 'tool',
        sourceId: tool.id,
        limit: 10,
      });

      expect(result.relations.length).toBe(2);
      result.relations.forEach((r) => {
        expect(r.sourceType).toBe('tool');
        expect(r.sourceId).toBe(tool.id);
      });
    });

    it('should list relations by target', () => {
      const { guideline } = createTestGuideline(db, 'target_guideline');
      const { tool: t1 } = createTestTool(db, 'source1');
      const { tool: t2 } = createTestTool(db, 'source2');

      relationHandlers.create({
        sourceType: 'tool',
        sourceId: t1.id,
        targetType: 'guideline',
        targetId: guideline.id,
        relationType: 'applies_to',
      });

      relationHandlers.create({
        sourceType: 'tool',
        sourceId: t2.id,
        targetType: 'guideline',
        targetId: guideline.id,
        relationType: 'applies_to',
      });

      const result = relationHandlers.list({
        targetType: 'guideline',
        targetId: guideline.id,
        limit: 10,
      });

      expect(result.relations.length).toBe(2);
      result.relations.forEach((r) => {
        expect(r.targetType).toBe('guideline');
        expect(r.targetId).toBe(guideline.id);
      });
    });

    it('should filter by relation type', () => {
      const { tool } = createTestTool(db, 'filter_tool');
      const { guideline: g1 } = createTestGuideline(db, 'applies1');
      const { guideline: g2 } = createTestGuideline(db, 'depends1');

      relationHandlers.create({
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: g1.id,
        relationType: 'applies_to',
      });

      relationHandlers.create({
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: g2.id,
        relationType: 'depends_on',
      });

      const result = relationHandlers.list({
        sourceType: 'tool',
        sourceId: tool.id,
        relationType: 'applies_to',
        limit: 10,
      });

      expect(result.relations.length).toBe(1);
      expect(result.relations[0].relationType).toBe('applies_to');
    });

    it('should list all relations', () => {
      const result = relationHandlers.list({ limit: 10 });
      expect(result.relations.length).toBeGreaterThan(0);
    });
  });

  describe('memory_relation_delete', () => {
    it('should delete a relation', () => {
      const { tool } = createTestTool(db, 'delete_tool');
      const { guideline } = createTestGuideline(db, 'delete_guideline');

      const createResult = relationHandlers.create({
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: guideline.id,
        relationType: 'applies_to',
      });

      const deleteResult = relationHandlers.delete({
        id: createResult.relation.id,
      });

      expect(deleteResult.success).toBe(true);

      // Verify relation is deleted
      const listResult = relationHandlers.list({
        sourceType: 'tool',
        sourceId: tool.id,
        limit: 10,
      });
      expect(listResult.relations.find((r) => r.id === createResult.relation.id)).toBeUndefined();
    });

    it('should require id or full key', () => {
      expect(() => {
        relationHandlers.delete({});
      }).toThrow(
        'Either id or all of (sourceType, sourceId, targetType, targetId, relationType) are required',
      );
    });
  });
});

