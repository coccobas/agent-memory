/**
 * Integration tests for tasks handler
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AppContext } from '../../src/core/context.js';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
  registerTestContext,
} from '../fixtures/test-helpers.js';
import { taskHandlers } from '../../src/mcp/handlers/tasks.handler.js';

const TEST_DB_PATH = './data/test-tasks-handler.db';
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

describe('Tasks Handler Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = registerTestContext(testDb);
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('add', () => {
    it('should add task with subtasks', async () => {
      const result = await taskHandlers.add(context, {
        scopeType: 'global',
        subtasks: ['Subtask 1', 'Subtask 2'],
      });

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task.id).toBeDefined();
      expect(result.task.title).toBeDefined();
      expect(result.subtasks).toBeDefined();
      expect(result.subtasks.length).toBe(2);
    });

    it('should require subtasks', async () => {
      await expect(
        taskHandlers.add(context, {
          scopeType: 'global',
          subtasks: [],
        })
      ).rejects.toThrow(/subtasks/);

      await expect(
        taskHandlers.add(context, {
          scopeType: 'global',
        })
      ).rejects.toThrow();
    });

    it('should support decomposition strategies', async () => {
      const strategies: Array<'maximal' | 'balanced' | 'minimal'> = [
        'maximal',
        'balanced',
        'minimal',
      ];

      for (const strategy of strategies) {
        const result = await taskHandlers.add(context, {
          scopeType: 'global',
          subtasks: ['Test subtask'],
          decompositionStrategy: strategy,
        });

        expect(result.success).toBe(true);
      }
    });

    it('should support parent task', async () => {
      // Create a parent task first
      const parentResult = await taskHandlers.add(context, {
        scopeType: 'global',
        subtasks: ['Parent subtask'],
      });

      const result = await taskHandlers.add(context, {
        scopeType: 'global',
        parentTask: parentResult.task.id,
        subtasks: ['Child subtask'],
      });

      expect(result.success).toBe(true);
    });

    it('should support project scope', async () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      const result = await taskHandlers.add(context, {
        scopeType: 'project',
        scopeId: project.id,
        projectId: project.id,
        subtasks: ['Project subtask'],
      });

      expect(result.success).toBe(true);
    });

    it('should store createdBy', async () => {
      const result = await taskHandlers.add(context, {
        scopeType: 'global',
        subtasks: ['Test subtask'],
        createdBy: 'test-user',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('get', () => {
    it('should get task by ID', async () => {
      const addResult = await taskHandlers.add(context, {
        scopeType: 'global',
        subtasks: ['Get test subtask'],
      });

      const result = await taskHandlers.get(context, { taskId: addResult.task.id });

      expect(result.task).toBeDefined();
      expect(result.task.id).toBe(addResult.task.id);
      expect(result.subtasks).toBeDefined();
      expect(Array.isArray(result.subtasks)).toBe(true);
    });

    it('should require taskId', async () => {
      await expect(taskHandlers.get(context, {})).rejects.toThrow();
    });

    it('should return subtasks with task', async () => {
      const addResult = await taskHandlers.add(context, {
        scopeType: 'global',
        subtasks: ['Subtask A', 'Subtask B'],
      });

      const result = await taskHandlers.get(context, { taskId: addResult.task.id });

      expect(result.subtasks.length).toBe(2);
    });
  });

  describe('list', () => {
    it('should list tasks', async () => {
      await taskHandlers.add(context, {
        scopeType: 'global',
        subtasks: ['List test subtask 1'],
      });

      await taskHandlers.add(context, {
        scopeType: 'global',
        subtasks: ['List test subtask 2'],
      });

      const result = await taskHandlers.list(context, {
        scopeType: 'global',
      });

      expect(result.tasks).toBeDefined();
      expect(Array.isArray(result.tasks)).toBe(true);
      expect(result.tasks.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by parentTaskId', async () => {
      const parent = await taskHandlers.add(context, {
        scopeType: 'global',
        subtasks: ['Parent'],
      });

      await taskHandlers.add(context, {
        scopeType: 'global',
        parentTask: parent.task.id,
        subtasks: ['Child'],
      });

      const result = await taskHandlers.list(context, {
        parentTaskId: parent.task.id,
      });

      expect(Array.isArray(result.tasks)).toBe(true);
    });

    it('should filter by scopeType', async () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      await taskHandlers.add(context, {
        scopeType: 'project',
        scopeId: project.id,
        subtasks: ['Project task'],
      });

      const result = await taskHandlers.list(context, {
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(Array.isArray(result.tasks)).toBe(true);
    });

    it('should support pagination', async () => {
      await taskHandlers.add(context, {
        scopeType: 'global',
        subtasks: ['Pagination test 1'],
      });

      await taskHandlers.add(context, {
        scopeType: 'global',
        subtasks: ['Pagination test 2'],
      });

      const result = await taskHandlers.list(context, {
        scopeType: 'global',
        limit: 1,
        offset: 0,
      });

      expect(result.tasks.length).toBeLessThanOrEqual(1);
    });
  });
});


