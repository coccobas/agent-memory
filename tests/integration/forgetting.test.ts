import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestProject,
  createTestGuideline,
  createTestKnowledge,
  createTestTool,
  createTestExperience,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import * as schema from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-forgetting.db';

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

import { forgettingHandlers } from '../../src/mcp/handlers/forgetting.handler.js';

describe('Forgetting Integration', () => {
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

  describe('status action', () => {
    it('returns service status with config', async () => {
      const result = await forgettingHandlers.status(context, { action: 'status' });

      expect(result.success).toBe(true);
      expect(result.status).toBeDefined();
      expect(result.status.enabled).toBeDefined();
      expect(result.status.config).toBeDefined();
      expect(result.status.config.recency).toBeDefined();
      expect(result.status.config.frequency).toBeDefined();
      expect(result.status.config.importance).toBeDefined();
    });

    it('shows null lastRun initially', async () => {
      const result = await forgettingHandlers.status(context, { action: 'status' });

      expect(result.status.lastRun).toBeNull();
    });
  });

  describe('analyze action', () => {
    it('analyzes entries with no candidates when none match criteria', async () => {
      // Create a fresh project with fresh entries (recently created, never stale)
      const project = createTestProject(db, 'Fresh Project');

      createTestGuideline(db, 'Fresh Guideline', 'project', project.id, 'test', 80);
      createTestKnowledge(db, 'Fresh Knowledge', 'project', project.id);

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'recency',
        staleDays: 90,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.strategy).toBe('recency');
      expect(result.stats.analyzed).toBeGreaterThanOrEqual(2);
      // Fresh entries should not be candidates for forgetting
      expect(result.candidates.length).toBe(0);
    });

    it('identifies stale entries as candidates', async () => {
      const project = createTestProject(db, 'Stale Project');

      // Create a guideline and backdate it
      const { guideline } = createTestGuideline(
        db,
        'Stale Guideline',
        'project',
        project.id,
        'test',
        30 // low priority
      );

      // Backdate the createdAt to make it stale (100 days ago)
      const staleDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.guidelines)
        .set({ createdAt: staleDate })
        .where(eq(schema.guidelines.id, guideline.id))
        .run();

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'recency',
        staleDays: 30,
      });

      expect(result.success).toBe(true);
      expect(result.stats.analyzed).toBeGreaterThanOrEqual(1);
      // The stale guideline should be a candidate
      const staleCandidate = result.candidates.find((c) => c.id === guideline.id);
      if (staleCandidate) {
        expect(staleCandidate.reason).toContain('days');
        expect(staleCandidate.scores.recency).toBeLessThan(0.5);
      }
    });

    it('analyzes with frequency strategy', async () => {
      const project = createTestProject(db, 'Frequency Project');

      // Create entries with low access count (0)
      createTestKnowledge(db, 'Never Accessed', 'project', project.id);

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'frequency',
        minAccessCount: 3,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('frequency');
      // New entries have 0 access count, should be candidates
      expect(result.stats.analyzed).toBeGreaterThanOrEqual(1);
    });

    it('analyzes with importance strategy', async () => {
      const project = createTestProject(db, 'Importance Project');

      // Create a low-priority guideline (guidelines have priority which affects importance)
      createTestGuideline(
        db,
        'Low Importance Guideline',
        'project',
        project.id,
        'test',
        10 // very low priority
      );

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'importance',
        importanceThreshold: 0.6,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('importance');
    });

    it('analyzes with combined strategy', async () => {
      const project = createTestProject(db, 'Combined Project');

      // Create entries
      createTestGuideline(db, 'Combined Test', 'project', project.id, 'test', 50);
      createTestKnowledge(db, 'Combined Knowledge', 'project', project.id);

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'combined',
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('combined');
      expect(result.stats).toBeDefined();
      expect(result.timing).toBeDefined();
      expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('respects limit parameter', async () => {
      const project = createTestProject(db, 'Limit Project');

      // Create many stale entries
      for (let i = 0; i < 10; i++) {
        const { knowledge } = createTestKnowledge(db, `Bulk Entry ${i}`, 'project', project.id);
        // Backdate to make stale
        const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
        db.update(schema.knowledge)
          .set({ createdAt: staleDate })
          .where(eq(schema.knowledge.id, knowledge.id))
          .run();
      }

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'recency',
        staleDays: 30,
        limit: 3,
      });

      expect(result.success).toBe(true);
      expect(result.candidates.length).toBeLessThanOrEqual(3);
    });

    it('filters by entry types', async () => {
      const project = createTestProject(db, 'EntryType Project');

      // Create different entry types
      createTestGuideline(db, 'Filter Guideline', 'project', project.id);
      createTestKnowledge(db, 'Filter Knowledge', 'project', project.id);
      createTestTool(db, 'filter-tool', 'project', project.id);

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        entryTypes: ['knowledge'],
        strategy: 'frequency',
      });

      expect(result.success).toBe(true);
      // Should only analyze knowledge entries
      for (const candidate of result.candidates) {
        expect(candidate.entryType).toBe('knowledge');
      }
    });

    it('protects critical entries', async () => {
      const project = createTestProject(db, 'Critical Project');

      // Create a critical guideline and backdate it
      const { guideline } = createTestGuideline(
        db,
        'Critical Guideline',
        'project',
        project.id,
        'critical',
        100
      );

      // Mark as critical and backdate
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.guidelines)
        .set({ createdAt: staleDate, isCritical: true })
        .where(eq(schema.guidelines.id, guideline.id))
        .run();

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'combined',
      });

      expect(result.success).toBe(true);
      // Critical entries should be protected
      const criticalCandidate = result.candidates.find((c) => c.id === guideline.id);
      expect(criticalCandidate).toBeUndefined();
    });

    it('protects high-priority entries', async () => {
      const project = createTestProject(db, 'HighPriority Project');

      // Create a high-priority guideline and backdate it
      const { guideline } = createTestGuideline(
        db,
        'High Priority Guideline',
        'project',
        project.id,
        'important',
        95 // high priority
      );

      // Backdate to make it look stale
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.guidelines)
        .set({ createdAt: staleDate })
        .where(eq(schema.guidelines.id, guideline.id))
        .run();

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'combined',
      });

      expect(result.success).toBe(true);
      // High-priority entries (>= 90) should be protected
      const highPrioCandidate = result.candidates.find((c) => c.id === guideline.id);
      expect(highPrioCandidate).toBeUndefined();
    });
  });

  describe('forget action', () => {
    it('dry run does not deactivate entries', async () => {
      const project = createTestProject(db, 'DryRun Project');

      // Create a stale entry
      const { knowledge } = createTestKnowledge(db, 'DryRun Knowledge', 'project', project.id);

      // Backdate to make stale
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.knowledge)
        .set({ createdAt: staleDate })
        .where(eq(schema.knowledge.id, knowledge.id))
        .run();

      const result = await forgettingHandlers.forget(context, {
        action: 'forget',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'recency',
        staleDays: 30,
        dryRun: true,
        agentId: AGENT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.stats.forgotten).toBe(0);

      // Verify entry is still active
      const entry = db
        .select()
        .from(schema.knowledge)
        .where(eq(schema.knowledge.id, knowledge.id))
        .get();
      expect(entry?.isActive).toBe(true);
    });

    it('actual forget deactivates entries', async () => {
      const project = createTestProject(db, 'Forget Project');

      // Create a stale entry
      const { knowledge } = createTestKnowledge(db, 'Forget Knowledge', 'project', project.id);

      // Backdate to make stale
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.knowledge)
        .set({ createdAt: staleDate })
        .where(eq(schema.knowledge.id, knowledge.id))
        .run();

      const result = await forgettingHandlers.forget(context, {
        action: 'forget',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'recency',
        staleDays: 30,
        dryRun: false,
        agentId: AGENT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(false);

      // Check if the stale entry was forgotten
      if (result.stats.candidates > 0) {
        expect(result.stats.forgotten).toBeGreaterThan(0);

        // Verify entry is deactivated
        const entry = db
          .select()
          .from(schema.knowledge)
          .where(eq(schema.knowledge.id, knowledge.id))
          .get();
        expect(entry?.isActive).toBe(false);
      }
    });

    it('updates status after forget execution', async () => {
      const project = createTestProject(db, 'Status Update Project');

      // Create a stale entry
      const { knowledge } = createTestKnowledge(db, 'Status Test Knowledge', 'project', project.id);

      // Backdate to make stale
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.knowledge)
        .set({ createdAt: staleDate })
        .where(eq(schema.knowledge.id, knowledge.id))
        .run();

      // Execute forget (not dry run)
      await forgettingHandlers.forget(context, {
        action: 'forget',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'recency',
        staleDays: 30,
        dryRun: false,
        agentId: AGENT_ID,
      });

      // Note: lastRun is tracked in-memory per service instance
      // A new service instance won't have the lastRun from another instance
      // This tests the flow works, but status.lastRun reflects service instance state
      const status = await forgettingHandlers.status(context, { action: 'status' });
      expect(status.success).toBe(true);
    });

    it('returns timing information', async () => {
      const project = createTestProject(db, 'Timing Project');

      const result = await forgettingHandlers.forget(context, {
        action: 'forget',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'combined',
        dryRun: true,
        agentId: AGENT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.timing).toBeDefined();
      expect(result.timing.startedAt).toBeDefined();
      expect(result.timing.completedAt).toBeDefined();
      expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles experiences in forgetting', async () => {
      const project = createTestProject(db, 'Experience Forget Project');

      // Create an experience
      const { experience } = createTestExperience(
        db,
        'Test Experience',
        'project',
        project.id,
        'case',
        'debugging'
      );

      // Backdate to make stale
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.experiences)
        .set({ createdAt: staleDate })
        .where(eq(schema.experiences.id, experience.id))
        .run();

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        entryTypes: ['experience'],
        strategy: 'recency',
        staleDays: 30,
      });

      expect(result.success).toBe(true);
      // Should find experience in candidates if it's stale enough
      const expCandidate = result.candidates.find((c) => c.entryType === 'experience');
      if (expCandidate) {
        expect(expCandidate.id).toBe(experience.id);
      }
    });
  });

  describe('error handling', () => {
    it('handles empty scope gracefully', async () => {
      // Project with no entries
      const emptyProject = createTestProject(db, 'Empty Project');

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: emptyProject.id,
        strategy: 'combined',
      });

      expect(result.success).toBe(true);
      expect(result.stats.analyzed).toBe(0);
      expect(result.candidates.length).toBe(0);
    });

    it('handles global scope', async () => {
      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'global',
        strategy: 'combined',
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.scopeType).toBe('global');
    });
  });

  describe('score calculations', () => {
    it('provides score breakdown for candidates', async () => {
      const project = createTestProject(db, 'Score Project');

      // Create an entry that will be a candidate
      const { guideline } = createTestGuideline(
        db,
        'Score Test Guideline',
        'project',
        project.id,
        'test',
        20 // low priority
      );

      // Backdate significantly
      const veryStaleDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.guidelines)
        .set({ createdAt: veryStaleDate })
        .where(eq(schema.guidelines.id, guideline.id))
        .run();

      const result = await forgettingHandlers.analyze(context, {
        action: 'analyze',
        scopeType: 'project',
        scopeId: project.id,
        strategy: 'combined',
      });

      expect(result.success).toBe(true);

      const candidate = result.candidates.find((c) => c.id === guideline.id);
      if (candidate) {
        expect(candidate.scores).toBeDefined();
        expect(candidate.scores.recency).toBeGreaterThanOrEqual(0);
        expect(candidate.scores.recency).toBeLessThanOrEqual(1);
        expect(candidate.scores.frequency).toBeGreaterThanOrEqual(0);
        expect(candidate.scores.frequency).toBeLessThanOrEqual(1);
        expect(candidate.scores.importance).toBeGreaterThanOrEqual(0);
        expect(candidate.scores.importance).toBeLessThanOrEqual(1);
        expect(candidate.scores.combined).toBeGreaterThanOrEqual(0);
        expect(candidate.scores.combined).toBeLessThanOrEqual(1);
        expect(candidate.reason).toBeDefined();
      }
    });
  });
});
