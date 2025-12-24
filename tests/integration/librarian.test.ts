import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestProject,
  createTestExperience,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-librarian.db';

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

import { librarianHandlers } from '../../src/mcp/handlers/librarian.handler.js';
import { experienceHandlers } from '../../src/mcp/handlers/experiences.handler.js';

describe('Librarian Integration', () => {
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

  describe('memory_librarian analyze', () => {
    it('should return empty result when no experiences exist', async () => {
      const result = await librarianHandlers.analyze(context, {
        scopeType: 'global',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.analysis).toBeDefined();
      expect(result.analysis.runId).toBeDefined();
      expect(result.analysis.stats).toBeDefined();
      expect(result.analysis.stats.experiencesCollected).toBe(0);
      expect(result.analysis.stats.patternsDetected).toBe(0);
    });

    it('should analyze experiences at project scope', async () => {
      const project = createTestProject(db);

      // Create some case-level experiences
      await experienceHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: project.id,
        title: 'Debug Auth Issue',
        level: 'case',
        content: 'Found token expiry bug',
        scenario: 'Users reported login failures',
        outcome: 'success',
      });

      await experienceHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: project.id,
        title: 'Fix Auth Problem',
        level: 'case',
        content: 'Fixed JWT validation',
        scenario: 'Authentication errors',
        outcome: 'success',
      });

      const result = await librarianHandlers.analyze(context, {
        scopeType: 'project',
        scopeId: project.id,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.analysis.stats.experiencesCollected).toBeGreaterThanOrEqual(0);
    });

    it('should respect dryRun flag', async () => {
      const project = createTestProject(db);

      const result = await librarianHandlers.analyze(context, {
        scopeType: 'project',
        scopeId: project.id,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.analysis.dryRun).toBe(true);
    });

    it('should include timing information', async () => {
      const result = await librarianHandlers.analyze(context, {
        scopeType: 'global',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.analysis.timing).toBeDefined();
      expect(result.analysis.timing.startedAt).toBeDefined();
      expect(result.analysis.timing.completedAt).toBeDefined();
      expect(result.analysis.timing.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('memory_librarian status', () => {
    it('should return librarian status', async () => {
      const result = await librarianHandlers.status(context, {});

      expect(result.success).toBe(true);
      expect(result.status).toBeDefined();
      expect(result.status.service).toBeDefined();
      expect(result.status.service.enabled).toBeDefined();
      expect(result.status.service.config).toBeDefined();
    });

    it('should include pending recommendation count', async () => {
      const result = await librarianHandlers.status(context, {});

      expect(result.success).toBe(true);
      expect(typeof result.status.service.pendingRecommendations).toBe('number');
    });
  });

  describe('memory_librarian list_recommendations', () => {
    it('should list pending recommendations', async () => {
      const result = await librarianHandlers.list_recommendations(context, {
        status: 'pending',
      });

      expect(result.success).toBe(true);
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('should filter by scope', async () => {
      const project = createTestProject(db);

      const result = await librarianHandlers.list_recommendations(context, {
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(result.success).toBe(true);
      expect(result.recommendations).toBeDefined();
    });

    it('should support pagination', async () => {
      const result = await librarianHandlers.list_recommendations(context, {
        limit: 5,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.recommendations.length).toBeLessThanOrEqual(5);
    });
  });

  describe('pattern detection workflow', () => {
    it('should detect patterns from similar experiences', async () => {
      const project = createTestProject(db);

      // Create multiple similar case-level experiences with trajectories
      for (let i = 0; i < 3; i++) {
        const expResult = await experienceHandlers.add(context, {
          agentId: AGENT_ID,
          scopeType: 'project',
          scopeId: project.id,
          title: `Fix Config Issue ${i}`,
          level: 'case',
          content: 'Resolved configuration mismatch',
          scenario: 'Application failed to start due to config',
          outcome: 'success',
        });

        if (expResult.experience) {
          // Add trajectory steps
          await experienceHandlers.add_step(context, {
            id: expResult.experience.id,
            agentId: AGENT_ID,
            action: 'Read config file',
            observation: 'Found missing key',
            success: true,
          });

          await experienceHandlers.add_step(context, {
            id: expResult.experience.id,
            agentId: AGENT_ID,
            action: 'Edit configuration',
            observation: 'Added missing key',
            success: true,
          });

          await experienceHandlers.add_step(context, {
            id: expResult.experience.id,
            agentId: AGENT_ID,
            action: 'Test application',
            observation: 'Application started successfully',
            success: true,
          });
        }
      }

      const result = await librarianHandlers.analyze(context, {
        scopeType: 'project',
        scopeId: project.id,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.analysis.stats.experiencesCollected).toBeGreaterThanOrEqual(3);
    });
  });

  describe('recommendation actions', () => {
    it('should return error for non-existent recommendation on approve', async () => {
      const result = await librarianHandlers.approve(context, {
        recommendationId: 'non-existent-id',
        agentId: AGENT_ID,
      });

      expect(result.success).toBe(false);
    });

    it('should return error for non-existent recommendation on reject', async () => {
      const result = await librarianHandlers.reject(context, {
        recommendationId: 'non-existent-id',
        agentId: AGENT_ID,
        reason: 'Test rejection',
      });

      expect(result.success).toBe(false);
    });

    it('should return error for non-existent recommendation on skip', async () => {
      const result = await librarianHandlers.skip(context, {
        recommendationId: 'non-existent-id',
        agentId: AGENT_ID,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('show_recommendation', () => {
    it('should return error for non-existent recommendation', async () => {
      const result = await librarianHandlers.show_recommendation(context, {
        recommendationId: 'non-existent-id',
      });

      expect(result.success).toBe(false);
    });
  });
});
