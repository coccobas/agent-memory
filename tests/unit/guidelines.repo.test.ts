/**
 * Unit tests for guidelines repository
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
} from '../fixtures/test-helpers.js';
import { guidelineRepo } from '../../src/db/repositories/guidelines.js';

const TEST_DB_PATH = './data/test-guidelines-repo.db';
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

describe('guidelineRepo', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create a guideline with initial version', () => {
      const guideline = guidelineRepo.create({
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

    it('should default priority to 50', () => {
      const guideline = guidelineRepo.create({
        scopeType: 'global',
        name: 'default-priority-guideline',
        content: 'Content',
      });

      expect(guideline.priority).toBe(50);
    });

    it('should create guideline at project scope', () => {
      const org = createTestOrg(db, 'Test Org');
      const project = createTestProject(db, 'Test Project', org.id);

      const guideline = guidelineRepo.create({
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
    it('should get guideline by ID', () => {
      const created = guidelineRepo.create({
        scopeType: 'global',
        name: 'get-by-id-guideline',
        content: 'Content',
      });

      const guideline = guidelineRepo.getById(created.id);

      expect(guideline).toBeDefined();
      expect(guideline?.id).toBe(created.id);
      expect(guideline?.name).toBe('get-by-id-guideline');
    });

    it('should return undefined for non-existent ID', () => {
      const guideline = guidelineRepo.getById('non-existent-id');
      expect(guideline).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list guidelines', () => {
      guidelineRepo.create({
        scopeType: 'global',
        name: 'list-guideline-1',
        content: 'Content 1',
      });

      guidelineRepo.create({
        scopeType: 'global',
        name: 'list-guideline-2',
        content: 'Content 2',
      });

      const guidelines = guidelineRepo.list({ scopeType: 'global' }, { limit: 10 });

      expect(guidelines.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by category', () => {
      guidelineRepo.create({
        scopeType: 'global',
        name: 'security-guideline',
        content: 'Content',
        category: 'security',
      });

      const guidelines = guidelineRepo.list(
        { scopeType: 'global', category: 'security' },
        { limit: 10 }
      );

      guidelines.forEach((g) => {
        expect(g.category).toBe('security');
      });
    });

    it('should support pagination', () => {
      guidelineRepo.create({
        scopeType: 'global',
        name: 'pagination-1',
        content: 'Content',
      });

      const page1 = guidelineRepo.list({ scopeType: 'global' }, { limit: 1, offset: 0 });
      const page2 = guidelineRepo.list({ scopeType: 'global' }, { limit: 1, offset: 1 });

      expect(page1.length).toBeLessThanOrEqual(1);
      expect(page2.length).toBeLessThanOrEqual(1);
    });
  });

  describe('update', () => {
    it('should update guideline and create new version', () => {
      const created = guidelineRepo.create({
        scopeType: 'global',
        name: 'update-guideline',
        content: 'Original content',
      });

      const originalVersionId = created.currentVersionId;

      const updated = guidelineRepo.update(created.id, {
        content: 'Updated content',
        changeReason: 'Test update',
      });

      expect(updated.currentVersionId).not.toBe(originalVersionId);
      expect(updated.currentVersion?.content).toBe('Updated content');
      expect(updated.currentVersion?.versionNum).toBe(2);
    });

    it('should update priority', () => {
      const created = guidelineRepo.create({
        scopeType: 'global',
        name: 'update-priority-guideline',
        content: 'Content',
        priority: 50,
      });

      const updated = guidelineRepo.update(created.id, {
        priority: 90,
      });

      expect(updated.priority).toBe(90);
    });
  });

  describe('getHistory', () => {
    it('should get version history', () => {
      const created = guidelineRepo.create({
        scopeType: 'global',
        name: 'history-guideline',
        content: 'Version 1',
      });

      guidelineRepo.update(created.id, {
        content: 'Version 2',
        changeReason: 'Update',
      });

      const history = guidelineRepo.getHistory(created.id);

      expect(history.length).toBe(2);
      expect(history[0]?.versionNum).toBe(1);
      expect(history[1]?.versionNum).toBe(2);
    });
  });

  describe('deactivate', () => {
    it('should deactivate guideline', () => {
      const created = guidelineRepo.create({
        scopeType: 'global',
        name: 'deactivate-guideline',
        content: 'Content',
      });

      guidelineRepo.deactivate(created.id);

      const guideline = guidelineRepo.getById(created.id);
      expect(guideline?.isActive).toBe(false);
    });
  });
});








