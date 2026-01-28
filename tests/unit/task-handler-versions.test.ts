import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  type TestDb,
} from '../fixtures/test-helpers.js';
import { issueHandlers } from '../../src/mcp/handlers/issues.handler.js';
import type { ITaskRepository } from '../../src/db/repositories/tasks.js';

const TEST_DB_PATH = './data/test-memory-task-versions.db';
let testDb: TestDb;
let taskRepo: ITaskRepository;

describe('Task History Handler', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    taskRepo = repos.tasks!;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('history action', () => {
    it('should return version history for a task', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Test Task',
        description: 'Initial description',
        taskType: 'bug',
      });

      const mockContext = {
        db: testDb.db,
        repos: { tasks: taskRepo },
        services: {},
      } as any;

      const result = (await issueHandlers.history(mockContext, {
        id: task.id,
      })) as any;

      expect(result).toBeDefined();
      expect(result.taskId).toBe(task.id);
      expect(result.taskTitle).toBe('Test Task');
      expect(result.versions).toBeDefined();
      expect(Array.isArray(result.versions)).toBe(true);
      expect(result.meta).toBeDefined();
      expect(result.meta.versionCount).toBeGreaterThan(0);
    });

    it('should return versions sorted by versionNum ascending', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Multi-version Task',
        description: 'Initial',
        taskType: 'feature',
      });

      await taskRepo.update(task.id, {
        title: 'Updated Title',
        description: 'Updated description',
        updatedBy: 'test-agent',
        changeReason: 'First update',
      });

      await taskRepo.update(task.id, {
        status: 'in_progress',
        updatedBy: 'test-agent',
        changeReason: 'Started work',
      });

      const mockContext = {
        db: testDb.db,
        repos: { tasks: taskRepo },
        services: {},
      } as any;

      const result = (await issueHandlers.history(mockContext, {
        id: task.id,
      })) as any;

      expect(result.versions.length).toBeGreaterThanOrEqual(2);

      for (let i = 1; i < result.versions.length; i++) {
        expect(result.versions[i].versionNum).toBeGreaterThanOrEqual(
          result.versions[i - 1].versionNum
        );
      }
    });

    it('should include currentVersionNum in meta', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Version Meta Task',
        description: 'Test',
        taskType: 'improvement',
      });

      const mockContext = {
        db: testDb.db,
        repos: { tasks: taskRepo },
        services: {},
      } as any;

      const result = (await issueHandlers.history(mockContext, {
        id: task.id,
      })) as any;

      expect(result.meta.currentVersionNum).toBeDefined();
      expect(typeof result.meta.currentVersionNum).toBe('number');
      expect(result.meta.currentVersionNum).toBeGreaterThan(0);
    });

    it('should throw error for non-existent task', async () => {
      const nonExistentId = 'task_nonexistent123';

      const mockContext = {
        db: testDb.db,
        repos: { tasks: taskRepo },
        services: {},
      } as any;

      await expect(
        issueHandlers.history(mockContext, {
          id: nonExistentId,
        })
      ).rejects.toThrow();
    });

    it('should return version details including timestamps', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Timestamp Task',
        description: 'Check timestamps',
        taskType: 'bug',
        createdBy: 'test-agent',
      });

      const mockContext = {
        db: testDb.db,
        repos: { tasks: taskRepo },
        services: {},
      } as any;

      const result = (await issueHandlers.history(mockContext, {
        id: task.id,
      })) as any;

      expect(result.versions.length).toBeGreaterThan(0);
      const firstVersion = result.versions[0];

      expect(firstVersion.id).toBeDefined();
      expect(firstVersion.taskId).toBe(task.id);
      expect(firstVersion.versionNum).toBe(1);
      expect(firstVersion.title).toBe('Timestamp Task');
      expect(firstVersion.description).toBe('Check timestamps');
      expect(firstVersion.createdAt).toBeDefined();
    });

    it('should include versionCount in meta', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Count Task',
        description: 'Test version count',
        taskType: 'feature',
      });

      const mockContext = {
        db: testDb.db,
        repos: { tasks: taskRepo },
        services: {},
      } as any;

      const result = (await issueHandlers.history(mockContext, {
        id: task.id,
      })) as any;

      expect(result.meta.versionCount).toBe(result.versions.length);
    });

    it('should handle task with multiple updates', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Multi-update Task',
        description: 'Initial',
        taskType: 'bug',
        createdBy: 'agent1',
      });

      await taskRepo.update(task.id, {
        title: 'Updated 1',
        updatedBy: 'agent2',
        changeReason: 'First change',
      });

      await taskRepo.update(task.id, {
        status: 'in_progress',
        updatedBy: 'agent3',
        changeReason: 'Started',
      });

      await taskRepo.update(task.id, {
        status: 'done',
        resolution: 'Fixed',
        updatedBy: 'agent4',
        changeReason: 'Completed',
      });

      const mockContext = {
        db: testDb.db,
        repos: { tasks: taskRepo },
        services: {},
      } as any;

      const result = (await issueHandlers.history(mockContext, {
        id: task.id,
      })) as any;

      expect(result.versions.length).toBeGreaterThanOrEqual(3);
      expect(result.meta.versionCount).toBeGreaterThanOrEqual(3);

      const lastVersion = result.versions[result.versions.length - 1];
      expect(lastVersion.status).toBe('done');
      expect(lastVersion.resolution).toBe('Fixed');
    });
  });
});
