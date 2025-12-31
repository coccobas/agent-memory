import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  createTestProject,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { ITaskRepository } from '../../src/db/repositories/tasks.js';

const TEST_DB_PATH = './data/test-memory-tasks.db';
let testDb: TestDb;
let taskRepo: ITaskRepository;

describe('taskRepo', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    taskRepo = repos.tasks!;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create a task with minimal fields', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Fix login bug',
        description: 'Users cannot login with special characters in password',
        taskType: 'bug',
      });

      expect(task).toBeDefined();
      expect(task.id).toMatch(/^task_/);
      expect(task.title).toBe('Fix login bug');
      expect(task.description).toBe('Users cannot login with special characters in password');
      expect(task.taskType).toBe('bug');
      expect(task.taskDomain).toBe('agent'); // default
      expect(task.severity).toBe('medium'); // default
      expect(task.urgency).toBe('normal'); // default
      expect(task.status).toBe('open'); // default
      expect(task.isActive).toBe(true);
    });

    it('should create a task with all fields', async () => {
      const project = createTestProject(testDb.db, 'Test Project');

      const task = await taskRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        title: 'Implement feature X',
        description: 'Add new user authentication flow',
        taskType: 'feature',
        taskDomain: 'physical',
        severity: 'high',
        urgency: 'soon',
        status: 'backlog',
        category: 'authentication',
        file: 'src/auth/login.ts',
        startLine: 100,
        endLine: 150,
        assignee: 'dev@example.com',
        reporter: 'pm@example.com',
        dueDate: '2024-12-31',
        estimatedMinutes: 480,
        tags: ['auth', 'urgent'],
        metadata: { priority_score: 85 },
        createdBy: 'test-agent',
      });

      expect(task.scopeType).toBe('project');
      expect(task.scopeId).toBe(project.id);
      expect(task.taskDomain).toBe('physical');
      expect(task.severity).toBe('high');
      expect(task.urgency).toBe('soon');
      expect(task.status).toBe('backlog');
      expect(task.category).toBe('authentication');
      expect(task.file).toBe('src/auth/login.ts');
      expect(task.assignee).toBe('dev@example.com');
      expect(task.estimatedMinutes).toBe(480);
      expect(task.createdBy).toBe('test-agent');
    });

    it('should create a task with parent task (hierarchy)', async () => {
      const parentTask = await taskRepo.create({
        scopeType: 'global',
        title: 'Epic: Redesign UI',
        description: 'Complete UI overhaul',
        taskType: 'feature',
      });

      const childTask = await taskRepo.create({
        scopeType: 'global',
        title: 'Update button styles',
        description: 'Modernize button components',
        taskType: 'improvement',
        parentTaskId: parentTask.id,
      });

      expect(childTask.parentTaskId).toBe(parentTask.id);

      const subtasks = await taskRepo.getSubtasks(parentTask.id);
      expect(subtasks).toHaveLength(1);
      expect(subtasks[0].id).toBe(childTask.id);
    });
  });

  describe('getById', () => {
    it('should retrieve a task by ID', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'Test task for getById',
        description: 'Testing getById',
        taskType: 'research',
      });

      const found = await taskRepo.getById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('Test task for getById');
    });

    it('should return undefined for non-existent ID', async () => {
      const found = await taskRepo.getById('task_nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list tasks with filtering by status', async () => {
      // Create tasks with different statuses
      await taskRepo.create({
        scopeType: 'global',
        title: 'Open task',
        description: 'This is open',
        taskType: 'bug',
        status: 'open',
      });

      await taskRepo.create({
        scopeType: 'global',
        title: 'In progress task',
        description: 'This is in progress',
        taskType: 'bug',
        status: 'in_progress',
      });

      const openTasks = await taskRepo.listByStatus('open');
      expect(openTasks.length).toBeGreaterThan(0);
      expect(openTasks.every((t) => t.status === 'open')).toBe(true);
    });

    it('should list tasks with filtering by severity', async () => {
      await taskRepo.create({
        scopeType: 'global',
        title: 'Critical task',
        description: 'Very urgent',
        taskType: 'bug',
        severity: 'critical',
      });

      const tasks = await taskRepo.list({ severity: 'critical' });
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.every((t) => t.severity === 'critical')).toBe(true);
    });
  });

  describe('update', () => {
    it('should update task fields', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Original title',
        description: 'Original description',
        taskType: 'bug',
      });

      const updated = await taskRepo.update(task.id, {
        title: 'Updated title',
        severity: 'high',
        assignee: 'new-assignee',
        updatedBy: 'test-agent',
      });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe('Updated title');
      expect(updated!.severity).toBe('high');
      expect(updated!.assignee).toBe('new-assignee');
      expect(updated!.updatedBy).toBe('test-agent');
    });

    it('should return undefined for non-existent task', async () => {
      const result = await taskRepo.update('task_nonexistent', { title: 'New' });
      expect(result).toBeUndefined();
    });
  });

  describe('updateStatus', () => {
    it('should update task status', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Status update test',
        description: 'Testing status transitions',
        taskType: 'bug',
        status: 'open',
      });

      const updated = await taskRepo.updateStatus(task.id, 'in_progress', 'test-agent');
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('in_progress');
      expect(updated!.startedAt).toBeDefined(); // Should set startedAt

      const resolved = await taskRepo.updateStatus(task.id, 'done', 'test-agent');
      expect(resolved!.status).toBe('done');
      expect(resolved!.resolvedAt).toBeDefined(); // Should set resolvedAt
    });
  });

  describe('blocking relationships', () => {
    it('should add and remove blockers', async () => {
      const blockerTask = await taskRepo.create({
        scopeType: 'global',
        title: 'Blocker task',
        description: 'This blocks another task',
        taskType: 'bug',
      });

      const blockedTask = await taskRepo.create({
        scopeType: 'global',
        title: 'Blocked task',
        description: 'This is blocked',
        taskType: 'feature',
      });

      // Add blocker
      const withBlocker = await taskRepo.addBlocker(blockedTask.id, blockerTask.id, 'test-agent');
      expect(withBlocker).toBeDefined();

      // Verify blockedBy is set (stored as JSON)
      const refreshed = await taskRepo.getById(blockedTask.id);
      expect(refreshed!.blockedBy).toBeDefined();
      const blockedByArray = JSON.parse(refreshed!.blockedBy!);
      expect(blockedByArray).toContain(blockerTask.id);

      // List blocked tasks
      const blockedTasks = await taskRepo.listBlocked();
      expect(blockedTasks.some((t) => t.id === blockedTask.id)).toBe(true);

      // Remove blocker
      const withoutBlocker = await taskRepo.removeBlocker(
        blockedTask.id,
        blockerTask.id,
        'test-agent'
      );
      expect(withoutBlocker).toBeDefined();

      const final = await taskRepo.getById(blockedTask.id);
      const finalBlockedBy = final!.blockedBy ? JSON.parse(final!.blockedBy) : [];
      expect(finalBlockedBy).not.toContain(blockerTask.id);
    });
  });

  describe('deactivate and reactivate', () => {
    it('should deactivate a task', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'To be deactivated',
        description: 'Will be deactivated',
        taskType: 'debt',
      });

      const result = await taskRepo.deactivate(task.id);
      expect(result).toBe(true);

      const deactivated = await taskRepo.getById(task.id);
      expect(deactivated!.isActive).toBe(false);
    });

    it('should reactivate a deactivated task', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'To be reactivated',
        description: 'Will be reactivated',
        taskType: 'debt',
      });

      await taskRepo.deactivate(task.id);
      const reactivated = await taskRepo.reactivate(task.id);
      expect(reactivated).toBe(true);

      const found = await taskRepo.getById(task.id);
      expect(found!.isActive).toBe(true);
    });
  });

  describe('delete', () => {
    it('should permanently delete a task', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'To be deleted',
        description: 'Will be permanently deleted',
        taskType: 'other',
      });

      const result = await taskRepo.delete(task.id);
      expect(result).toBe(true);

      const found = await taskRepo.getById(task.id);
      expect(found).toBeUndefined();
    });
  });
});
