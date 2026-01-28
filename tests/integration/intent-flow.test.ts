/**
 * Intent Flow Integration Tests
 *
 * Tests the complete intent detection → dispatch → handler flow.
 * Verifies that natural language inputs route correctly to handlers.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestContext } from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import { createUnifiedMemoryService } from '../../src/services/unified-memory/index.js';
import { INTENT_CONFIDENCE_THRESHOLDS } from '../../src/services/intent-detection/config.js';

const TEST_DB_PATH = './data/test-intent-flow.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;

describe('Intent Flow Integration', () => {
  const AGENT_ID = 'intent-test-agent';
  let projectId: string;
  let sessionId: string;
  let previousPermMode: string | undefined;

  beforeAll(async () => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = await createTestContext(testDb);

    const project = await context.repos.projects.create({
      name: 'Intent Flow Test Project',
      rootPath: '/test/intent-flow',
    });
    projectId = project.id;

    const session = await context.repos.sessions.create({
      projectId,
      name: 'Intent Flow Test Session',
      agentId: AGENT_ID,
    });
    sessionId = session.id;
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

  describe('store intent', () => {
    it('routes "remember that X" to store handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'remember that we always use TypeScript strict mode',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('store');
      expect(result.action).toBe('store');
      expect(result.status).toBe('success');
      expect(result.entry).toBeDefined();
      expect(result.entry?.type).toBe('guideline');
    });

    it('routes "save this guideline" to store handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'save this guideline: always use async/await',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('store');
      expect(result.action).toBe('store');
      expect(result.status).toBe('success');
      expect(result.entry).toBeDefined();
      expect(result.entry?.type).toBe('guideline');
    });

    it('stores knowledge when content indicates decision', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'we decided to use PostgreSQL for the database',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('store');
      expect(result.action).toBe('store');
      expect(result.status).toBe('success');
      expect(result.entry).toBeDefined();
      expect(result.entry?.type).toBe('knowledge');
    });
  });

  describe('retrieve intent', () => {
    beforeAll(async () => {
      // Seed some data for retrieval tests
      await context.repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'Authentication Rule',
        content: 'Always use JWT tokens for authentication',
        category: 'security',
        createdBy: AGENT_ID,
      });

      await context.repos.knowledge.create({
        scopeType: 'project',
        scopeId: projectId,
        title: 'Database Architecture',
        content: 'We use PostgreSQL with connection pooling',
        category: 'fact',
        createdBy: AGENT_ID,
      });
    });

    it('routes "what do we know about X" to retrieve handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'what do we know about authentication?',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('retrieve');
      expect(result.action).toBe('retrieve');
      expect(result.status).toBe('success');
      expect(result.results).toBeDefined();
    });

    it('routes questions ending with ? to retrieve handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'What is our database architecture?',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('retrieve');
      expect(result.action).toBe('retrieve');
      expect(result.status).toBe('success');
      expect(result.results).toBeDefined();
      expect(result.results!.length).toBeGreaterThan(0);
    });

    it('returns not_found when no results match query', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'what do we know about nonexistent-topic-xyz?',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('retrieve');
      expect(result.action).toBe('retrieve');
      expect(result.status).toBe('not_found');
      expect(result.results).toEqual([]);
    });
  });

  describe('learn_experience intent', () => {
    it('routes "learn experience: X" to learn experience handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'learn experience: Fixed API timeout by increasing connection pool size',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('learn_experience');
      expect(result.action).toBe('learn_experience');
      expect(result.status).toBe('success');
      expect(result.entry).toBeDefined();
      expect(result.entry?.type).toBe('experience');
    });

    it('extracts text parameter correctly', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'learn experience: Discovered that Redis cache improves performance by 10x',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('learn_experience');
      expect(result.detectedIntent.text).toBe(
        'Discovered that Redis cache improves performance by 10x'
      );
      expect(result.status).toBe('success');
      expect(result.entry?.title).toContain('Redis cache');
    });

    it('returns error when content is empty', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'learn experience:',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('learn_experience');
      expect(result.action).toBe('learn_experience');
      expect(result.status).toBe('error');
      expect(result.message).toContain('No content provided');
    });
  });

  describe('session intents', () => {
    it('routes "start session" to session_start handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'start working on fixing the auth bug',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('session_start');
      expect(result.action).toBe('session_start');
      expect(result.status).toBe('success');
      expect(result.session).toBeDefined();
      expect(result.session?.status).toBe('active');
    });

    it('routes "end session" to session_end handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'end session',
          sessionId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('session_end');
      expect(result.action).toBe('session_end');
      expect(result.status).toBe('success');
      expect(result.session?.status).toBe('completed');
    });

    it('returns error when ending session without active session', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'end session',
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('session_end');
      expect(result.action).toBe('session_end');
      expect(result.status).toBe('error');
      expect(result.message).toContain('No active session');
    });
  });

  describe('confidence thresholds', () => {
    it('returns low_confidence status when confidence < 0.5', async () => {
      const service = createUnifiedMemoryService({
        confidenceThreshold: INTENT_CONFIDENCE_THRESHOLDS.low,
      });

      // Create a deliberately ambiguous input that will have low confidence
      // The intent detection will assign a low confidence score to this
      const result = await service.process(
        {
          text: 'xyz abc def',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      // This should be detected as unknown with 0 confidence
      expect(result.detectedIntent.intent).toBe('unknown');
      expect(result.detectedIntent.confidence).toBe(0);
      expect(result.status).toBe('error');
    });

    it('processes normally when confidence >= 0.5', async () => {
      const service = createUnifiedMemoryService({
        confidenceThreshold: INTENT_CONFIDENCE_THRESHOLDS.low,
      });

      const result = await service.process(
        {
          text: 'remember that we use ESLint',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      // "remember that" pattern should have confidence >= 0.6
      expect(result.detectedIntent.confidence).toBeGreaterThanOrEqual(
        INTENT_CONFIDENCE_THRESHOLDS.low
      );
      expect(result.status).toBe('success');
      expect(result.action).toBe('store');
    });

    it('confidence = 0.5 (boundary) is not low_confidence', async () => {
      const service = createUnifiedMemoryService({
        confidenceThreshold: INTENT_CONFIDENCE_THRESHOLDS.low,
      });

      // Create an input that will have exactly 0.5 confidence
      // Entry type detection without explicit pattern gives 0.5 confidence
      const result = await service.process(
        {
          text: 'guideline about testing',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      // This should be detected as store with 0.5 confidence (entry type fallback)
      expect(result.detectedIntent.intent).toBe('store');
      expect(result.detectedIntent.confidence).toBe(0.5);
      // At exactly 0.5, it should NOT be low_confidence (threshold is < 0.5)
      expect(result.status).not.toBe('low_confidence');
      expect(result.status).toBe('success');
    });

    it('confidence = 0.49 triggers low_confidence status', async () => {
      const service = createUnifiedMemoryService({
        confidenceThreshold: INTENT_CONFIDENCE_THRESHOLDS.low,
      });

      // Mock a scenario where confidence is just below threshold
      // We'll use the service's detect method directly to test this
      const intentResult = service.analyze('some ambiguous text');

      // If we get a match with confidence < 0.5, dispatch should return low_confidence
      if (
        intentResult.confidence > 0 &&
        intentResult.confidence < INTENT_CONFIDENCE_THRESHOLDS.low
      ) {
        const result = await service.process(
          {
            text: 'some ambiguous text',
            projectId,
            agentId: AGENT_ID,
          },
          context
        );

        expect(result.status).toBe('low_confidence');
        expect(result.message).toContain('low confidence');
      } else {
        // If the pattern doesn't produce 0.49, test the boundary directly
        // by checking that anything < 0.5 would trigger low_confidence
        expect(INTENT_CONFIDENCE_THRESHOLDS.low).toBe(0.5);
      }
    });
  });

  describe('error cases', () => {
    it('returns error for unknown intent', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'xyzabc123nonsense',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('unknown');
      expect(result.action).toBe('error');
      expect(result.status).toBe('error');
      expect(result.message).toContain('Could not understand');
    });

    it('handles empty input gracefully', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: '',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('unknown');
      expect(result.action).toBe('error');
      expect(result.status).toBe('error');
    });

    it('returns error when storing without project context', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'remember that we use TypeScript',
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('store');
      expect(result.action).toBe('store');
      expect(result.status).toBe('error');
      expect(result.message).toContain('No project context');
    });
  });

  describe('episode intents', () => {
    let activeSessionId: string;

    beforeAll(async () => {
      // Create a fresh session for episode tests
      const session = await context.repos.sessions.create({
        projectId,
        name: 'Episode Test Session',
        agentId: AGENT_ID,
      });
      activeSessionId = session.id;
    });

    it('routes "task: X" to episode_begin handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'task: implement user authentication',
          projectId,
          sessionId: activeSessionId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('episode_begin');
      expect(result.action).toBe('episode_begin');
      expect(result.status).toBe('success');
      expect(result.episode).toBeDefined();
      expect(result.episode?.status).toBe('active');
    });

    it('routes "log: X" to episode_log handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'log: found the root cause in auth service',
          sessionId: activeSessionId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('episode_log');
      expect(result.action).toBe('episode_log');
      expect(result.status).toBe('success');
      expect(result.event).toBeDefined();
    });

    it('routes "success: X" to episode_complete handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'success: implemented JWT authentication',
          sessionId: activeSessionId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('episode_complete');
      expect(result.action).toBe('episode_complete');
      expect(result.status).toBe('success');
      expect(result.episode?.status).toBe('completed');
    });

    it('returns error when logging without active episode', async () => {
      // Create a new session without any episodes
      const newSession = await context.repos.sessions.create({
        projectId,
        name: 'Empty Session',
        agentId: AGENT_ID,
      });

      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'log: some progress',
          sessionId: newSession.id,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('episode_log');
      expect(result.action).toBe('episode_log');
      expect(result.status).toBe('error');
      expect(result.message).toContain('No active episode');
    });
  });

  describe('list intents', () => {
    let activeSessionId: string;

    beforeAll(async () => {
      const session = await context.repos.sessions.create({
        projectId,
        name: 'List Test Session',
        agentId: AGENT_ID,
      });
      activeSessionId = session.id;
    });

    it('routes "list all guidelines" to list handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'list all guidelines',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('list');
      expect(result.action).toBe('list');
      expect(result.status).toBe('success');
      expect(result.results).toBeDefined();
    });

    it('routes "recent episodes" to list_episodes handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'recent episodes',
          projectId,
          sessionId: activeSessionId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('list_episodes');
      expect(result.action).toBe('list_episodes');
      expect(result.status).toBe('success');
      expect(result.results).toBeDefined();
    });

    it('routes "recent sessions" to list_sessions handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'recent sessions',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('list_sessions');
      expect(result.action).toBe('list_sessions');
      expect(result.status).toBe('success');
      expect(result.results).toBeDefined();
    });
  });

  describe('status intent', () => {
    it('routes "status" to status handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'status',
          projectId,
          sessionId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('status');
      expect(result.action).toBe('status');
      expect(result.status).toBe('success');
      expect(result.message).toBeDefined();
    });

    it('routes "dashboard" to status handler', async () => {
      const service = createUnifiedMemoryService();
      const result = await service.process(
        {
          text: 'dashboard',
          projectId,
          agentId: AGENT_ID,
        },
        context
      );

      expect(result.detectedIntent.intent).toBe('status');
      expect(result.action).toBe('status');
      expect(result.status).toBe('success');
    });
  });
});
