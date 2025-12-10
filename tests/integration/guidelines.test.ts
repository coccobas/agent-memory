import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestProject, createTestGuideline } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-guidelines.db';

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

import { guidelineHandlers } from '../../src/mcp/handlers/guidelines.handler.js';

describe('Guidelines Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('memory_guideline_add', () => {
    it('should add a guideline with all fields', () => {
      const result = guidelineHandlers.add({
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

    it('should add guideline at project scope', () => {
      const project = createTestProject(db);
      const result = guidelineHandlers.add({
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

    it('should require scopeType', () => {
      expect(() => {
        guidelineHandlers.add({ name: 'test', content: 'content' });
      }).toThrow('scopeType is required');
    });

    it('should require name', () => {
      expect(() => {
        guidelineHandlers.add({ scopeType: 'global', content: 'content' });
      }).toThrow('name is required');
    });

    it('should require content', () => {
      expect(() => {
        guidelineHandlers.add({ scopeType: 'global', name: 'test' });
      }).toThrow('content is required');
    });
  });

  describe('memory_guideline_update', () => {
    it('should update guideline and create new version', () => {
      const { guideline } = createTestGuideline(db, 'update_test', 'global', undefined, 'security', 90);
      const originalVersionId = guideline.currentVersionId;

      const result = guidelineHandlers.update({
        id: guideline.id,
        content: 'Updated content',
        priority: 95,
        changeReason: 'Testing updates',
      });

      expect(result.success).toBe(true);
      expect(result.guideline.currentVersionId).not.toBe(originalVersionId);
      expect(result.guideline.priority).toBe(95);
    });

    it('should require id', () => {
      expect(() => {
        guidelineHandlers.update({});
      }).toThrow('id is required');
    });
  });

  describe('memory_guideline_get', () => {
    it('should get guideline by ID', () => {
      const { guideline } = createTestGuideline(db, 'get_test');
      const result = guidelineHandlers.get({ id: guideline.id });

      expect(result.guideline).toBeDefined();
      expect(result.guideline.id).toBe(guideline.id);
    });

    it('should get guideline by name and scope', () => {
      const project = createTestProject(db);
      const { guideline } = createTestGuideline(db, 'get_by_name', 'project', project.id);

      const result = guidelineHandlers.get({
        name: 'get_by_name',
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(result.guideline.id).toBe(guideline.id);
    });
  });

  describe('memory_guideline_list', () => {
    it('should list guidelines with scope filter', () => {
      const project = createTestProject(db);
      createTestGuideline(db, 'guideline1', 'global');
      createTestGuideline(db, 'guideline2', 'project', project.id);
      createTestGuideline(db, 'guideline3', 'project', project.id);

      const result = guidelineHandlers.list({
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

    it('should filter by category', () => {
      createTestGuideline(db, 'security1', 'global', undefined, 'security');
      createTestGuideline(db, 'security2', 'global', undefined, 'security');
      createTestGuideline(db, 'behavior1', 'global', undefined, 'behavior');

      const result = guidelineHandlers.list({
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
    it('should return version history', () => {
      const { guideline } = createTestGuideline(db, 'history_test');
      guidelineHandlers.update({ id: guideline.id, content: 'Version 2', changeReason: 'Update' });
      guidelineHandlers.update({ id: guideline.id, content: 'Version 3', changeReason: 'Another update' });

      const result = guidelineHandlers.history({ id: guideline.id });
      expect(result.versions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('memory_guideline_deactivate', () => {
    it('should deactivate a guideline', () => {
      const { guideline } = createTestGuideline(db, 'deactivate_test');
      const result = guidelineHandlers.deactivate({ id: guideline.id });

      expect(result.success).toBe(true);

      const fetched = guidelineHandlers.get({ id: guideline.id });
      expect(fetched.guideline.isActive).toBe(false);
    });
  });
});

