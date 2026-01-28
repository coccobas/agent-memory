/**
 * Unit tests for task repository versioning support
 *
 * Tests the versioning pattern for tasks following the same pattern as tools.ts:
 * - create() inserts initial version (versionNum=1) and sets currentVersionId
 * - update() appends new version instead of direct mutation
 * - getHistory(taskId) returns all versions sorted by versionNum ascending
 * - getVersion(taskId, versionNum) returns specific version
 * - Conflict detection using checkAndLogConflictWithDb pattern
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
  createTestRepositories,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { ITaskRepository } from '../../src/db/repositories/tasks.js';

const TEST_DB_PATH = './data/test-task-versions-repo.db';
let testDb: TestDb;
let taskRepo: ITaskRepository;

describe('taskRepo versioning', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    taskRepo = repos.tasks!;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create with versioning', () => {
    it('should create a task with initial version (versionNum=1)', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Test Task',
        description: 'Test description',
        taskType: 'feature',
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.currentVersionId).toBeDefined();
      expect(task.currentVersion).toBeDefined();
      expect(task.currentVersion?.versionNum).toBe(1);
      expect(task.currentVersion?.title).toBe('Test Task');
      expect(task.currentVersion?.description).toBe('Test description');
    });

    it('should create task at project scope with version', async () => {
      const org = createTestOrg(testDb.db, 'Task Version Org');
      const project = createTestProject(testDb.db, 'Task Version Project', org.id);

      const task = await taskRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        title: 'Project Task',
        description: 'Project task description',
        taskType: 'bug',
      });

      expect(task.scopeType).toBe('project');
      expect(task.scopeId).toBe(project.id);
      expect(task.currentVersion).toBeDefined();
      expect(task.currentVersion?.versionNum).toBe(1);
    });

    it('should store status and resolution in version', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Status Task',
        description: 'Task with status',
        taskType: 'improvement',
        status: 'in_progress',
        resolution: 'Initial resolution',
      });

      expect(task.currentVersion?.status).toBe('in_progress');
      expect(task.currentVersion?.resolution).toBe('Initial resolution');
    });

    it('should store metadata in version', async () => {
      const task = await taskRepo.create({
        scopeType: 'global',
        title: 'Metadata Task',
        description: 'Task with metadata',
        taskType: 'research',
        metadata: { priority: 'high', tags: ['urgent'] },
      });

      expect(task.currentVersion?.metadata).toEqual({ priority: 'high', tags: ['urgent'] });
    });
  });

  describe('update with versioning', () => {
    it('should update task and create new version (versionNum increments)', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'Update Test Task',
        description: 'Original description',
        taskType: 'feature',
      });

      const originalVersionId = created.currentVersionId;

      const updated = await taskRepo.update(created.id, {
        description: 'Updated description',
        changeReason: 'Test update',
      });

      expect(updated).toBeDefined();
      expect(updated!.currentVersionId).not.toBe(originalVersionId);
      expect(updated!.currentVersion?.description).toBe('Updated description');
      expect(updated!.currentVersion?.versionNum).toBe(2);
      expect(updated!.currentVersion?.changeReason).toBe('Test update');
    });

    it('should inherit unchanged fields from previous version', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'Inherit Test Task',
        description: 'Original description',
        taskType: 'bug',
        status: 'open',
        resolution: 'Original resolution',
      });

      // Update only description, other fields should be inherited
      const updated = await taskRepo.update(created.id, {
        description: 'New description',
      });

      expect(updated!.currentVersion?.title).toBe('Inherit Test Task');
      expect(updated!.currentVersion?.description).toBe('New description');
      expect(updated!.currentVersion?.status).toBe('open');
      expect(updated!.currentVersion?.resolution).toBe('Original resolution');
    });

    it('should update title in version', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'Original Title',
        description: 'Description',
        taskType: 'feature',
      });

      const updated = await taskRepo.update(created.id, {
        title: 'New Title',
      });

      expect(updated!.currentVersion?.title).toBe('New Title');
      expect(updated!.currentVersion?.versionNum).toBe(2);
    });

    it('should update status in version', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'Status Update Task',
        description: 'Description',
        taskType: 'feature',
        status: 'open',
      });

      const updated = await taskRepo.update(created.id, {
        status: 'in_progress',
      });

      expect(updated!.currentVersion?.status).toBe('in_progress');
    });

    it('should return undefined when updating non-existent task', async () => {
      const result = await taskRepo.update('non-existent-id', {
        description: 'New description',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('getHistory', () => {
    it('should get version history sorted by versionNum ascending', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'History Task',
        description: 'Version 1',
        taskType: 'feature',
      });

      await taskRepo.update(created.id, {
        description: 'Version 2',
        changeReason: 'First update',
      });

      await taskRepo.update(created.id, {
        description: 'Version 3',
        changeReason: 'Second update',
      });

      const history = await taskRepo.getHistory(created.id);

      expect(history.length).toBe(3);
      // History is ordered ascending (oldest first)
      expect(history[0]?.versionNum).toBe(1);
      expect(history[0]?.description).toBe('Version 1');
      expect(history[1]?.versionNum).toBe(2);
      expect(history[1]?.description).toBe('Version 2');
      expect(history[2]?.versionNum).toBe(3);
      expect(history[2]?.description).toBe('Version 3');
    });

    it('should return empty array for non-existent task', async () => {
      const history = await taskRepo.getHistory('non-existent-id');
      expect(history).toEqual([]);
    });
  });

  describe('getVersion', () => {
    it('should get specific version by taskId and versionNum', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'Version Lookup Task',
        description: 'Version 1 content',
        taskType: 'feature',
      });

      await taskRepo.update(created.id, {
        description: 'Version 2 content',
      });

      await taskRepo.update(created.id, {
        description: 'Version 3 content',
      });

      const version1 = await taskRepo.getVersion(created.id, 1);
      const version2 = await taskRepo.getVersion(created.id, 2);
      const version3 = await taskRepo.getVersion(created.id, 3);

      expect(version1?.description).toBe('Version 1 content');
      expect(version1?.versionNum).toBe(1);
      expect(version2?.description).toBe('Version 2 content');
      expect(version2?.versionNum).toBe(2);
      expect(version3?.description).toBe('Version 3 content');
      expect(version3?.versionNum).toBe(3);
    });

    it('should return undefined for non-existent version', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'Single Version Task',
        description: 'Only version',
        taskType: 'feature',
      });

      const version = await taskRepo.getVersion(created.id, 999);
      expect(version).toBeUndefined();
    });

    it('should return undefined for non-existent task', async () => {
      const version = await taskRepo.getVersion('non-existent-id', 1);
      expect(version).toBeUndefined();
    });
  });

  describe('conflict detection', () => {
    it('should set conflictFlag when updates happen within conflict window', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'Conflict Test Task',
        description: 'Original',
        taskType: 'feature',
      });

      // Rapid updates within conflict window (5 seconds)
      await taskRepo.update(created.id, {
        description: 'Update 1',
      });

      const updated2 = await taskRepo.update(created.id, {
        description: 'Update 2',
      });

      // The second update should have conflictFlag set
      expect(updated2!.currentVersion?.conflictFlag).toBe(true);
    });
  });

  describe('current version content matches latest', () => {
    it('should have currentVersion matching the latest version content', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'Latest Version Task',
        description: 'Initial',
        taskType: 'feature',
      });

      await taskRepo.update(created.id, {
        description: 'Updated once',
      });

      await taskRepo.update(created.id, {
        description: 'Final update',
        title: 'Final Title',
      });

      const task = await taskRepo.getById(created.id);
      const history = await taskRepo.getHistory(created.id);
      const latestVersion = history[history.length - 1];

      expect(task!.currentVersion?.id).toBe(latestVersion?.id);
      expect(task!.currentVersion?.description).toBe('Final update');
      expect(task!.currentVersion?.title).toBe('Final Title');
      expect(task!.currentVersion?.versionNum).toBe(3);
    });
  });

  describe('getById with version', () => {
    it('should return task with currentVersion populated', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'GetById Task',
        description: 'Test description',
        taskType: 'feature',
      });

      const task = await taskRepo.getById(created.id);

      expect(task).toBeDefined();
      expect(task!.id).toBe(created.id);
      expect(task!.currentVersion).toBeDefined();
      expect(task!.currentVersion?.title).toBe('GetById Task');
      expect(task!.currentVersion?.description).toBe('Test description');
    });

    it('should return undefined for non-existent ID', async () => {
      const task = await taskRepo.getById('non-existent-id');
      expect(task).toBeUndefined();
    });
  });

  describe('delete with versions', () => {
    it('should delete task and all its versions', async () => {
      const created = await taskRepo.create({
        scopeType: 'global',
        title: 'Delete Task',
        description: 'To be deleted',
        taskType: 'feature',
      });

      await taskRepo.update(created.id, {
        description: 'Updated before delete',
      });

      const result = await taskRepo.delete(created.id);
      expect(result).toBe(true);

      const task = await taskRepo.getById(created.id);
      expect(task).toBeUndefined();

      const history = await taskRepo.getHistory(created.id);
      expect(history).toEqual([]);
    });
  });
});
