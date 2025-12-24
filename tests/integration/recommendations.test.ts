import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestProject,
  createTestExperience,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import {
  createRecommendationStore,
  type IRecommendationStore,
} from '../../src/services/librarian/recommendations/recommendation-store.js';

const TEST_DB_PATH = './data/test-recommendations.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;
let store: IRecommendationStore;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

describe('Recommendation Store Integration', () => {
  let previousPermMode: string | undefined;

  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = registerTestContext(testDb);
    store = createRecommendationStore({ db: testDb.db as any, sqlite: testDb.sqlite });
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

  describe('create', () => {
    it('should create a recommendation with sources', async () => {
      const project = createTestProject(db);
      const exp1 = createTestExperience(db, 'Test Experience 1', 'project', project.id);
      const exp2 = createTestExperience(db, 'Test Experience 2', 'project', project.id);

      const recommendation = await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'strategy',
        title: 'Common Pattern',
        pattern: 'Read → Edit → Test',
        confidence: 0.85,
        sourceExperienceIds: [exp1.experience.id, exp2.experience.id],
        exemplarExperienceId: exp1.experience.id,
        createdBy: 'test-agent',
      });

      expect(recommendation.id).toBeDefined();
      expect(recommendation.status).toBe('pending');
      expect(recommendation.title).toBe('Common Pattern');
      expect(recommendation.confidence).toBe(0.85);
      expect(recommendation.patternCount).toBe(2);
      expect(recommendation.sources).toHaveLength(2);
    });

    it('should set exemplar flag on correct source', async () => {
      const project = createTestProject(db);
      const exp1 = createTestExperience(db, 'Exp A', 'project', project.id);
      const exp2 = createTestExperience(db, 'Exp B', 'project', project.id);

      const recommendation = await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'strategy',
        title: 'Exemplar Test',
        confidence: 0.9,
        sourceExperienceIds: [exp1.experience.id, exp2.experience.id],
        exemplarExperienceId: exp1.experience.id,
      });

      const exemplarSource = recommendation.sources?.find(s => s.isExemplar);
      expect(exemplarSource).toBeDefined();
      expect(exemplarSource?.experienceId).toBe(exp1.experience.id);
    });
  });

  describe('getById', () => {
    it('should retrieve a recommendation by id', async () => {
      const project = createTestProject(db);
      const exp = createTestExperience(db, 'Get Test', 'project', project.id);

      const created = await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'strategy',
        title: 'Get By Id Test',
        confidence: 0.75,
        sourceExperienceIds: [exp.experience.id],
      });

      const retrieved = await store.getById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe('Get By Id Test');
    });

    it('should return undefined for non-existent id', async () => {
      const result = await store.getById('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('should include sources when requested', async () => {
      const project = createTestProject(db);
      const exp = createTestExperience(db, 'Source Test', 'project', project.id);

      const created = await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'strategy',
        title: 'Include Sources Test',
        confidence: 0.8,
        sourceExperienceIds: [exp.experience.id],
      });

      const retrieved = await store.getById(created.id, true);

      expect(retrieved?.sources).toBeDefined();
      expect(retrieved?.sources?.length).toBeGreaterThan(0);
    });
  });

  describe('list', () => {
    it('should list recommendations with filtering', async () => {
      const project = createTestProject(db);
      const exp = createTestExperience(db, 'List Test', 'project', project.id);

      await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'strategy',
        title: 'List Test 1',
        confidence: 0.9,
        sourceExperienceIds: [exp.experience.id],
      });

      const results = await store.list({
        scopeType: 'project',
        scopeId: project.id,
        status: 'pending',
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter by minimum confidence', async () => {
      const project = createTestProject(db);
      const exp = createTestExperience(db, 'Confidence Test', 'project', project.id);

      await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'skill',
        title: 'Low Confidence',
        confidence: 0.5,
        sourceExperienceIds: [exp.experience.id],
      });

      await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'skill',
        title: 'High Confidence',
        confidence: 0.95,
        sourceExperienceIds: [exp.experience.id],
      });

      const results = await store.list({
        scopeType: 'project',
        scopeId: project.id,
        minConfidence: 0.9,
      });

      expect(results.every(r => r.confidence >= 0.9)).toBe(true);
    });

    it('should support pagination', async () => {
      const project = createTestProject(db);
      const exp = createTestExperience(db, 'Pagination Test', 'project', project.id);

      // Create several recommendations
      for (let i = 0; i < 5; i++) {
        await store.create({
          scopeType: 'project',
          scopeId: project.id,
          type: 'strategy',
          title: `Pagination ${i}`,
          confidence: 0.8,
          sourceExperienceIds: [exp.experience.id],
        });
      }

      const page1 = await store.list({ scopeType: 'project', scopeId: project.id }, { limit: 2 });
      const page2 = await store.list({ scopeType: 'project', scopeId: project.id }, { limit: 2, offset: 2 });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);
    });
  });

  describe('approve', () => {
    it('should approve a recommendation', async () => {
      const project = createTestProject(db);
      const exp = createTestExperience(db, 'Approve Test', 'project', project.id);

      const created = await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'strategy',
        title: 'To Approve',
        confidence: 0.85,
        sourceExperienceIds: [exp.experience.id],
      });

      const approved = await store.approve(created.id, 'test-reviewer', undefined, undefined, 'Approved for promotion');

      expect(approved?.status).toBe('approved');
      expect(approved?.reviewedBy).toBe('test-reviewer');
      expect(approved?.reviewNotes).toBe('Approved for promotion');
      expect(approved?.reviewedAt).toBeDefined();
    });
  });

  describe('reject', () => {
    it('should reject a recommendation', async () => {
      const project = createTestProject(db);
      const exp = createTestExperience(db, 'Reject Test', 'project', project.id);

      const created = await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'skill',
        title: 'To Reject',
        confidence: 0.6,
        sourceExperienceIds: [exp.experience.id],
      });

      const rejected = await store.reject(created.id, 'test-reviewer', 'Not useful');

      expect(rejected?.status).toBe('rejected');
      expect(rejected?.reviewedBy).toBe('test-reviewer');
      expect(rejected?.reviewNotes).toBe('Not useful');
    });
  });

  describe('skip', () => {
    it('should skip a recommendation', async () => {
      const project = createTestProject(db);
      const exp = createTestExperience(db, 'Skip Test', 'project', project.id);

      const created = await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'strategy',
        title: 'To Skip',
        confidence: 0.7,
        sourceExperienceIds: [exp.experience.id],
      });

      const skipped = await store.skip(created.id, 'test-reviewer', 'Review later');

      expect(skipped?.status).toBe('skipped');
    });
  });

  describe('count', () => {
    it('should count recommendations by status', async () => {
      const project = createTestProject(db);
      const exp = createTestExperience(db, 'Count Test', 'project', project.id);

      await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'strategy',
        title: 'Count Pending',
        confidence: 0.8,
        sourceExperienceIds: [exp.experience.id],
      });

      const pendingCount = await store.count({ status: 'pending' });

      expect(pendingCount).toBeGreaterThan(0);
    });
  });

  describe('delete', () => {
    it('should delete a recommendation', async () => {
      const project = createTestProject(db);
      const exp = createTestExperience(db, 'Delete Test', 'project', project.id);

      const created = await store.create({
        scopeType: 'project',
        scopeId: project.id,
        type: 'skill',
        title: 'To Delete',
        confidence: 0.75,
        sourceExperienceIds: [exp.experience.id],
      });

      const deleted = await store.delete(created.id);
      const afterDelete = await store.getById(created.id);

      expect(deleted).toBe(true);
      expect(afterDelete).toBeUndefined();
    });

    it('should return false for non-existent id', async () => {
      const deleted = await store.delete('non-existent-id');
      expect(deleted).toBe(false);
    });
  });
});
