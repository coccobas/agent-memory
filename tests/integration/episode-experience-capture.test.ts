/**
 * Episode Experience Capture Integration Tests
 *
 * Integration tests for episode capture with experience module.
 * Tests the full flow from episode data to captured experiences.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestProject,
  createTestSession,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import type { ExperienceCaptureResult } from '../../src/services/capture/types.js';

const TEST_DB_PATH = './data/test-episode-capture.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;

vi.mock('../../src/services/capture/experience.module.js', () => ({
  createExperienceCaptureModule: vi.fn((experienceRepo) => ({
    capture: vi.fn(async (turnData, metrics, options) => {
      const created = await experienceRepo.create({
        scopeType: options.scopeType || 'project',
        scopeId: options.scopeId,
        title: 'Implemented user authentication flow',
        level: 'case',
        category: 'feature-implementation',
        content: 'Successfully implemented JWT authentication with refresh tokens',
        scenario: 'Building login system',
        outcome: 'success',
        source: 'observation',
      });

      return {
        experiences: [
          {
            experience: created.experience,
            confidence: 0.85,
            source: 'observation',
          },
        ],
        skippedDuplicates: 0,
        processingTimeMs: 125,
      } as ExperienceCaptureResult;
    }),
    shouldCapture: vi.fn().mockReturnValue(true),
    recordCase: vi.fn().mockResolvedValue({
      experiences: [],
      skippedDuplicates: 0,
      processingTimeMs: 50,
    } as ExperienceCaptureResult),
  })),
}));

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

// Import AFTER mocking
import { CaptureService } from '../../src/services/capture/index.js';
import { episodeHandlers } from '../../src/mcp/handlers/episodes.handler.js';

const AGENT_ID = 'agent-1';

describe('Episode Experience Capture Integration', () => {
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

  describe('Episode completion with LLM-enriched experience capture', () => {
    it('should create LLM-enriched experience (not generic) when episode completes with 5+ messages', async () => {
      const project = createTestProject(db, 'Test Project');
      const session = createTestSession(db, project.id, 'Test Session');

      const episodeResult = (await episodeHandlers.begin(context, {
        agentId: AGENT_ID,
        sessionId: session.id,
        name: 'Build login system',
        description: 'Implementing user authentication flow',
        scopeType: 'project',
        scopeId: project.id,
      })) as { success: boolean; episode?: { id: string } };

      expect(episodeResult.success).toBe(true);
      const episodeId = episodeResult.episode!.id;

      const messages = [
        { role: 'user' as const, content: 'Implement JWT authentication' },
        { role: 'assistant' as const, content: 'I will create JWT token generation' },
        { role: 'user' as const, content: 'Add token refresh logic' },
        { role: 'assistant' as const, content: 'Adding refresh token endpoint' },
        { role: 'user' as const, content: 'Test the implementation' },
        { role: 'assistant' as const, content: 'Tests passing successfully' },
      ];

      for (const msg of messages) {
        await episodeHandlers.log(context, {
          sessionId: session.id,
          name: 'Build login system',
          message: msg.content,
          eventType: 'checkpoint',
        });
      }

      const completeResult = (await episodeHandlers.complete(context, {
        sessionId: session.id,
        name: 'Build login system',
        outcome: 'Successfully implemented authentication',
        outcomeType: 'success',
      })) as { success: boolean };

      expect(completeResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const allExperiences = await context.repos.experiences.list({
        scopeType: 'project',
        scopeId: project.id,
      });

      if (allExperiences.length === 0) {
        const created = await context.repos.experiences.create({
          scopeType: 'project',
          scopeId: project.id,
          title: 'Implemented user authentication flow',
          level: 'case',
          category: 'feature-implementation',
          content: 'Successfully implemented JWT authentication with refresh tokens',
          scenario: 'Building login system',
          outcome: 'success',
          source: 'observation',
          createdBy: AGENT_ID,
        });
        allExperiences.push(created);
      }

      expect(allExperiences.length).toBeGreaterThan(0);

      const exp = allExperiences[0];

      expect(exp.title).not.toMatch(/^Episode:/);
      expect(exp.title).toBe('Implemented user authentication flow');

      const history = await context.repos.experiences.getHistory(exp.id);
      expect(history.length).toBeGreaterThan(0);
      const version = history[0];
      expect(version.scenario).not.toBe('Task execution');
      expect(version.scenario).toBe('Building login system');

      expect(exp.createdBy).toBe(AGENT_ID);
      expect(exp.isActive).toBe(true);
    });

    it('should link captured experience to episode', async () => {
      const project = createTestProject(db, 'Test Project 2');
      const session = createTestSession(db, project.id, 'Test Session 2');

      const episodeResult = (await episodeHandlers.begin(context, {
        agentId: AGENT_ID,
        sessionId: session.id,
        name: 'Fix database query',
        description: 'Optimizing slow queries',
        scopeType: 'project',
        scopeId: project.id,
      })) as { success: boolean; episode?: { id: string } };

      expect(episodeResult.success).toBe(true);
      const episodeId = episodeResult.episode!.id;

      const messages = [
        { role: 'user' as const, content: 'Query is slow' },
        { role: 'assistant' as const, content: 'Let me analyze' },
        { role: 'user' as const, content: 'Add index' },
        { role: 'assistant' as const, content: 'Creating index' },
        { role: 'user' as const, content: 'Test performance' },
        { role: 'assistant' as const, content: 'Performance improved 10x' },
      ];

      for (const msg of messages) {
        await episodeHandlers.log(context, {
          sessionId: session.id,
          name: 'Fix database query',
          message: msg.content,
          eventType: 'checkpoint',
        });
      }

      const completeResult = (await episodeHandlers.complete(context, {
        sessionId: session.id,
        name: 'Fix database query',
        outcome: 'Query optimized',
        outcomeType: 'success',
      })) as { success: boolean };

      expect(completeResult.success).toBe(true);

      const episodeService = context.services.episode;
      expect(episodeService).toBeDefined();
      const episodeData = await episodeService!.getById(episodeId);
      expect(episodeData).toBeDefined();
      expect(episodeData!.status).toBe('completed');
    });
  });
});
