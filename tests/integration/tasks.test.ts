/**
 * Integration tests for tasks handler
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
} from '../fixtures/test-helpers.js';
import { taskHandlers } from '../../src/mcp/handlers/tasks.handler.js';

const TEST_DB_PATH = './data/test-tasks-handler.db';
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

describe('Tasks Handler Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('add', () => {
    it('should add task with subtasks', () => {
      const result = taskHandlers.add({
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

    it('should require subtasks', () => {
      expect(() => {
        taskHandlers.add({
          scopeType: 'global',
          subtasks: [],
        });
      }).toThrow('At least one subtask is required');

      expect(() => {
        taskHandlers.add({
          scopeType: 'global',
        });
      }).toThrow();
    });

    it('should support decomposition strategies', () => {
      const strategies: Array<'maximal' | 'balanced' | 'minimal'> = [
        'maximal',
        'balanced',
        'minimal',
      ];

      strategies.forEach((strategy) => {
        const result = taskHandlers.add({
          scopeType: 'global',
          subtasks: ['Test subtask'],
          decompositionStrategy: strategy,
        });

        expect(result.success).toBe(true);
      });
    });

    it('should support parent task', () => {
      // Create a parent task first
      const parentResult = taskHandlers.add({
        scopeType: 'global',
        subtasks: ['Parent subtask'],
      });

      const result = taskHandlers.add({
        scopeType: 'global',
        parentTask: parentResult.task.id,
        subtasks: ['Child subtask'],
      });

      expect(result.success).toBe(true);
    });

    it('should support project scope', () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      const result = taskHandlers.add({
        scopeType: 'project',
        scopeId: project.id,
        projectId: project.id,
        subtasks: ['Project subtask'],
      });

      expect(result.success).toBe(true);
    });

    it('should store createdBy', () => {
      const result = taskHandlers.add({
        scopeType: 'global',
        subtasks: ['Test subtask'],
        createdBy: 'test-user',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('get', () => {
    it('should get task by ID', () => {
      const addResult = taskHandlers.add({
        scopeType: 'global',
        subtasks: ['Get test subtask'],
      });

      const result = taskHandlers.get({ taskId: addResult.task.id });

      expect(result.task).toBeDefined();
      expect(result.task.id).toBe(addResult.task.id);
      expect(result.subtasks).toBeDefined();
      expect(Array.isArray(result.subtasks)).toBe(true);
    });

    it('should require taskId', () => {
      expect(() => {
        taskHandlers.get({});
      }).toThrow();
    });

    it('should return subtasks with task', () => {
      const addResult = taskHandlers.add({
        scopeType: 'global',
        subtasks: ['Subtask A', 'Subtask B'],
      });

      const result = taskHandlers.get({ taskId: addResult.task.id });

      expect(result.subtasks.length).toBe(2);
    });
  });

  describe('list', () => {
    it('should list tasks', () => {
      taskHandlers.add({
        scopeType: 'global',
        subtasks: ['List test subtask 1'],
      });

      taskHandlers.add({
        scopeType: 'global',
        subtasks: ['List test subtask 2'],
      });

      const result = taskHandlers.list({
        scopeType: 'global',
      });

      expect(result.tasks).toBeDefined();
      expect(Array.isArray(result.tasks)).toBe(true);
      expect(result.tasks.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by parentTaskId', () => {
      const parent = taskHandlers.add({
        scopeType: 'global',
        subtasks: ['Parent'],
      });

      taskHandlers.add({
        scopeType: 'global',
        parentTask: parent.task.id,
        subtasks: ['Child'],
      });

      const result = taskHandlers.list({
        parentTaskId: parent.task.id,
      });

      expect(Array.isArray(result.tasks)).toBe(true);
    });

    it('should filter by scopeType', () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      taskHandlers.add({
        scopeType: 'project',
        scopeId: project.id,
        subtasks: ['Project task'],
      });

      const result = taskHandlers.list({
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(Array.isArray(result.tasks)).toBe(true);
    });

    it('should support pagination', () => {
      taskHandlers.add({
        scopeType: 'global',
        subtasks: ['Pagination test 1'],
      });

      taskHandlers.add({
        scopeType: 'global',
        subtasks: ['Pagination test 2'],
      });

      const result = taskHandlers.list({
        scopeType: 'global',
        limit: 1,
        offset: 0,
      });

      expect(result.tasks.length).toBeLessThanOrEqual(1);
    });
  });
});









