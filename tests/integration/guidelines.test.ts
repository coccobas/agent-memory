import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestProject,
  createTestGuideline,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-guidelines.db';

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

import { guidelineHandlers } from '../../src/mcp/handlers/guidelines.handler.js';

describe('Guidelines Integration', () => {
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

  describe('memory_guideline_add', () => {
    it('should add a guideline with all fields', async () => {
      const result = await guidelineHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        name: 'test_guideline',
        category: 'security',
        priority: 100,
        content: 'Test content',
        rationale: 'Test rationale',
        examples: { bad: ['bad example'], good: ['good example'] },
      });

      expect(result.success).toBe(true);
      expect(result.guideline).toBeDefined();
      expect(result.guideline.name).toBe('test_guideline');
      expect(result.guideline.category).toBe('security');
      expect(result.guideline.priority).toBe(100);
    });

    it('should add guideline at project scope', async () => {
      const project = createTestProject(db);
      const result = await guidelineHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: project.id,
        name: 'project_guideline',
        content: 'Project content',
        priority: 80,
      });

      expect(result.success).toBe(true);
      expect(result.guideline.scopeType).toBe('project');
      expect(result.guideline.scopeId).toBe(project.id);
    });

    it('should require scopeType', async () => {
      await expect(
        guidelineHandlers.add(context, { agentId: AGENT_ID, name: 'test', content: 'content' })
      ).rejects.toThrow(/scopeType.*required/i);
    });

    it('should require name', async () => {
      await expect(
        guidelineHandlers.add(context, {
          agentId: AGENT_ID,
          scopeType: 'global',
          content: 'content',
        })
      ).rejects.toThrow(/name.*required/i);
    });

    it('should require content', async () => {
      await expect(
        guidelineHandlers.add(context, { agentId: AGENT_ID, scopeType: 'global', name: 'test' })
      ).rejects.toThrow(/content.*required/i);
    });
  });

  describe('memory_guideline_update', () => {
    it('should update guideline and create new version', async () => {
      const { guideline } = createTestGuideline(
        db,
        'update_test',
        'global',
        undefined,
        'security',
        90
      );
      const originalVersionId = guideline.currentVersionId;

      const result = await guidelineHandlers.update(context, {
        agentId: AGENT_ID,
        id: guideline.id,
        content: 'Updated content',
        priority: 95,
        changeReason: 'Testing updates',
      });

      expect(result.success).toBe(true);
      expect(result.guideline.currentVersionId).not.toBe(originalVersionId);
      expect(result.guideline.priority).toBe(95);
    });

    it('should require id', async () => {
      await expect(guidelineHandlers.update(context, {})).rejects.toThrow('id is required');
    });
  });

  describe('memory_guideline_get', () => {
    it('should get guideline by ID', async () => {
      const { guideline } = createTestGuideline(db, 'get_test');
      const result = await guidelineHandlers.get(context, { agentId: AGENT_ID, id: guideline.id });

      expect(result.guideline).toBeDefined();
      expect(result.guideline.id).toBe(guideline.id);
    });

    it('should get guideline by name and scope', async () => {
      const project = createTestProject(db);
      const { guideline } = createTestGuideline(db, 'get_by_name', 'project', project.id);

      const result = await guidelineHandlers.get(context, {
        agentId: AGENT_ID,
        name: 'get_by_name',
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(result.guideline.id).toBe(guideline.id);
    });
  });

  describe('memory_guideline_list', () => {
    it('should list guidelines with scope filter', async () => {
      const project = createTestProject(db);
      createTestGuideline(db, 'guideline1', 'global');
      createTestGuideline(db, 'guideline2', 'project', project.id);
      createTestGuideline(db, 'guideline3', 'project', project.id);

      const result = await guidelineHandlers.list(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: project.id,
        limit: 10,
      });

      expect(result.guidelines.length).toBe(2);
      result.guidelines.forEach((g) => {
        expect(g.scopeType).toBe('project');
        expect(g.scopeId).toBe(project.id);
      });
    });

    it('should filter by category', async () => {
      createTestGuideline(db, 'security1', 'global', undefined, 'security');
      createTestGuideline(db, 'security2', 'global', undefined, 'security');
      createTestGuideline(db, 'behavior1', 'global', undefined, 'behavior');

      const result = await guidelineHandlers.list(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        category: 'security',
        limit: 10,
      });

      expect(result.guidelines.length).toBeGreaterThan(0);
      result.guidelines.forEach((g) => {
        expect(g.category).toBe('security');
      });
    });
  });

  describe('memory_guideline_history', () => {
    it('should return version history', async () => {
      const { guideline } = createTestGuideline(db, 'history_test');
      await guidelineHandlers.update(context, {
        agentId: AGENT_ID,
        id: guideline.id,
        content: 'Version 2',
        changeReason: 'Update',
      });
      await guidelineHandlers.update(context, {
        agentId: AGENT_ID,
        id: guideline.id,
        content: 'Version 3',
        changeReason: 'Another update',
      });

      const result = await guidelineHandlers.history(context, {
        agentId: AGENT_ID,
        id: guideline.id,
      });
      expect(result.versions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('memory_guideline_deactivate', () => {
    it('should deactivate a guideline', async () => {
      const { guideline } = createTestGuideline(db, 'deactivate_test');
      const result = await guidelineHandlers.deactivate(context, {
        agentId: AGENT_ID,
        id: guideline.id,
      });

      expect(result.success).toBe(true);

      const fetched = await guidelineHandlers.get(context, { agentId: AGENT_ID, id: guideline.id });
      expect(fetched.guideline.isActive).toBe(false);
    });
  });
});
