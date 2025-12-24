/**
 * Unit tests for guidelines repository
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
import type { IGuidelineRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-guidelines-repo.db';
let testDb: TestDb;
let guidelineRepo: IGuidelineRepository;

describe('guidelineRepo', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    guidelineRepo = repos.guidelines;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create a guideline with initial version', async () => {
      const guideline = await guidelineRepo.create({
        scopeType: 'global',
        name: 'test-guideline',
        content: 'Test content',
        category: 'security',
        priority: 80,
      });

      expect(guideline.id).toBeDefined();
      expect(guideline.name).toBe('test-guideline');
      expect(guideline.currentVersion).toBeDefined();
      expect(guideline.currentVersion?.content).toBe('Test content');
      expect(guideline.currentVersion?.versionNum).toBe(1);
    });

    it('should default priority to 50', async () => {
      const guideline = await guidelineRepo.create({
        scopeType: 'global',
        name: 'default-priority-guideline',
        content: 'Content',
      });

      expect(guideline.priority).toBe(50);
    });

    it('should create guideline at project scope', async () => {
      const org = createTestOrg(testDb.db, 'Test Org');
      const project = createTestProject(testDb.db, 'Test Project', org.id);

      const guideline = await guidelineRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        name: 'project-guideline',
        content: 'Project content',
      });

      expect(guideline.scopeType).toBe('project');
      expect(guideline.scopeId).toBe(project.id);
    });
  });

  describe('getById', () => {
    it('should get guideline by ID', async () => {
      const created = await guidelineRepo.create({
        scopeType: 'global',
        name: 'get-by-id-guideline',
        content: 'Content',
      });

      const guideline = await guidelineRepo.getById(created.id);

      expect(guideline).toBeDefined();
      expect(guideline?.id).toBe(created.id);
      expect(guideline?.name).toBe('get-by-id-guideline');
    });

    it('should return undefined for non-existent ID', async () => {
      const guideline = await guidelineRepo.getById('non-existent-id');
      expect(guideline).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list guidelines', async () => {
      await guidelineRepo.create({
        scopeType: 'global',
        name: 'list-guideline-1',
        content: 'Content 1',
      });

      await guidelineRepo.create({
        scopeType: 'global',
        name: 'list-guideline-2',
        content: 'Content 2',
      });

      const guidelines = await guidelineRepo.list({ scopeType: 'global' }, { limit: 10 });

      expect(guidelines.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by category', async () => {
      await guidelineRepo.create({
        scopeType: 'global',
        name: 'security-guideline',
        content: 'Content',
        category: 'security',
      });

      const guidelines = await guidelineRepo.list(
        { scopeType: 'global', category: 'security' },
        { limit: 10 }
      );

      guidelines.forEach((g) => {
        expect(g.category).toBe('security');
      });
    });

    it('should support pagination', async () => {
      await guidelineRepo.create({
        scopeType: 'global',
        name: 'pagination-1',
        content: 'Content',
      });

      const page1 = await guidelineRepo.list({ scopeType: 'global' }, { limit: 1, offset: 0 });
      const page2 = await guidelineRepo.list({ scopeType: 'global' }, { limit: 1, offset: 1 });

      expect(page1.length).toBeLessThanOrEqual(1);
      expect(page2.length).toBeLessThanOrEqual(1);
    });
  });

  describe('update', () => {
    it('should update guideline and create new version', async () => {
      const created = await guidelineRepo.create({
        scopeType: 'global',
        name: 'update-guideline',
        content: 'Original content',
      });

      const originalVersionId = created.currentVersionId;

      const updated = await guidelineRepo.update(created.id, {
        content: 'Updated content',
        changeReason: 'Test update',
      });

      expect(updated.currentVersionId).not.toBe(originalVersionId);
      expect(updated.currentVersion?.content).toBe('Updated content');
      expect(updated.currentVersion?.versionNum).toBe(2);
    });

    it('should update priority', async () => {
      const created = await guidelineRepo.create({
        scopeType: 'global',
        name: 'update-priority-guideline',
        content: 'Content',
        priority: 50,
      });

      const updated = await guidelineRepo.update(created.id, {
        priority: 90,
      });

      expect(updated.priority).toBe(90);
    });
  });

  describe('getHistory', () => {
    it('should get version history', async () => {
      const created = await guidelineRepo.create({
        scopeType: 'global',
        name: 'history-guideline',
        content: 'Version 1',
      });

      await guidelineRepo.update(created.id, {
        content: 'Version 2',
        changeReason: 'Update',
      });

      const history = await guidelineRepo.getHistory(created.id);

      expect(history.length).toBe(2);
      expect(history[0]?.versionNum).toBe(1);
      expect(history[1]?.versionNum).toBe(2);
    });
  });

  describe('deactivate', () => {
    it('should deactivate guideline', async () => {
      const created = await guidelineRepo.create({
        scopeType: 'global',
        name: 'deactivate-guideline',
        content: 'Content',
      });

      await guidelineRepo.deactivate(created.id);

      const guideline = await guidelineRepo.getById(created.id);
      expect(guideline?.isActive).toBe(false);
    });
  });
});
