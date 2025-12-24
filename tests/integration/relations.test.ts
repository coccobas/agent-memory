import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestTool,
  createTestGuideline,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-relations.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { relationHandlers } from '../../src/mcp/handlers/relations.handler.js';

describe('Relations Integration', () => {
  const AGENT_ID = 'agent-1';
  let previousPermMode: string | undefined;
  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = registerTestContext(testDb);
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('memory_relation_create', () => {
    it('should create a relation between tool and guideline', async () => {
      const { tool } = createTestTool(db, 'sql_tool');
      const { guideline } = createTestGuideline(db, 'sql_guideline');

      const result = await relationHandlers.create(context, {
        agentId: AGENT_ID,
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

    it('should create relation in reverse direction', async () => {
      const { guideline } = createTestGuideline(db, 'reverse_guideline');
      const { tool } = createTestTool(db, 'reverse_tool');

      const result = await relationHandlers.create(context, {
        agentId: AGENT_ID,
        sourceType: 'guideline',
        sourceId: guideline.id,
        targetType: 'tool',
        targetId: tool.id,
        relationType: 'applies_to',
      });

      expect(result.success).toBe(true);
    });

    it('should require all required fields', async () => {
      await expect(relationHandlers.create(context, { agentId: AGENT_ID })).rejects.toThrow(
        'sourceType is required'
      );
    });
  });

  describe('memory_relation_list', () => {
    it('should list relations by source', async () => {
      const { tool } = createTestTool(db, 'source_tool');
      const { guideline: g1 } = createTestGuideline(db, 'target1');
      const { guideline: g2 } = createTestGuideline(db, 'target2');

      await relationHandlers.create(context, {
        agentId: AGENT_ID,
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: g1.id,
        relationType: 'applies_to',
      });

      await relationHandlers.create(context, {
        agentId: AGENT_ID,
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: g2.id,
        relationType: 'applies_to',
      });

      const result = await relationHandlers.list(context, {
        agentId: AGENT_ID,
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

    it('should list relations by target', async () => {
      const { guideline } = createTestGuideline(db, 'target_guideline');
      const { tool: t1 } = createTestTool(db, 'source1');
      const { tool: t2 } = createTestTool(db, 'source2');

      await relationHandlers.create(context, {
        agentId: AGENT_ID,
        sourceType: 'tool',
        sourceId: t1.id,
        targetType: 'guideline',
        targetId: guideline.id,
        relationType: 'applies_to',
      });

      await relationHandlers.create(context, {
        agentId: AGENT_ID,
        sourceType: 'tool',
        sourceId: t2.id,
        targetType: 'guideline',
        targetId: guideline.id,
        relationType: 'applies_to',
      });

      const result = await relationHandlers.list(context, {
        agentId: AGENT_ID,
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

    it('should filter by relation type', async () => {
      const { tool } = createTestTool(db, 'filter_tool');
      const { guideline: g1 } = createTestGuideline(db, 'applies1');
      const { guideline: g2 } = createTestGuideline(db, 'depends1');

      await relationHandlers.create(context, {
        agentId: AGENT_ID,
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: g1.id,
        relationType: 'applies_to',
      });

      await relationHandlers.create(context, {
        agentId: AGENT_ID,
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: g2.id,
        relationType: 'depends_on',
      });

      const result = await relationHandlers.list(context, {
        agentId: AGENT_ID,
        sourceType: 'tool',
        sourceId: tool.id,
        relationType: 'applies_to',
        limit: 10,
      });

      expect(result.relations.length).toBe(1);
      expect(result.relations[0].relationType).toBe('applies_to');
    });

    it('should require an anchored entry filter', async () => {
      await expect(
        relationHandlers.list(context, { agentId: AGENT_ID, limit: 10 })
      ).rejects.toThrow();
    });
  });

  describe('memory_relation_delete', () => {
    it('should delete a relation', async () => {
      const { tool } = createTestTool(db, 'delete_tool');
      const { guideline } = createTestGuideline(db, 'delete_guideline');

      const createResult = await relationHandlers.create(context, {
        agentId: AGENT_ID,
        sourceType: 'tool',
        sourceId: tool.id,
        targetType: 'guideline',
        targetId: guideline.id,
        relationType: 'applies_to',
      });

      const deleteResult = await relationHandlers.delete(context, {
        agentId: AGENT_ID,
        id: createResult.relation.id,
      });

      expect(deleteResult.success).toBe(true);

      // Verify relation is deleted
      const listResult = await relationHandlers.list(context, {
        agentId: AGENT_ID,
        sourceType: 'tool',
        sourceId: tool.id,
        limit: 10,
      });
      expect(listResult.relations.find((r) => r.id === createResult.relation.id)).toBeUndefined();
    });

    it('should require id or full key', async () => {
      await expect(relationHandlers.delete(context, { agentId: AGENT_ID })).rejects.toThrow(
        /id or \(sourceType, sourceId, targetType, targetId, relationType\)/
      );
    });
  });
});
