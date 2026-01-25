import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  createTestProject,
  createTestSession,
  createTestConversation,
  schema,
  type TestDb,
} from '../fixtures/test-helpers.js';
import { episodeHandlers } from '../../src/mcp/handlers/episodes.handler.js';
import type { AppContext } from '../../src/core/context.js';
import { createEpisodeService } from '../../src/services/episode/index.js';

const TEST_DB_PATH = './data/test-episode-conversation-autolink.db';
let testDb: TestDb;
let testProjectId: string;
let testSessionId: string;
let mockContext: AppContext;

describe('Episode auto-link to conversation (E2E via handlers)', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);

    const episodeService = createEpisodeService({
      episodeRepo: repos.episodes!,
      conversationRepo: repos.conversations,
    });

    const project = createTestProject(testDb.db, 'Auto-link Test Project');
    testProjectId = project.id;
    const session = createTestSession(testDb.db, testProjectId, 'Auto-link Test Session');
    testSessionId = session.id;

    // Create mock context for handlers
    mockContext = {
      db: testDb.sqlite,
      repos,
      services: {
        episode: episodeService,
      },
    } as AppContext;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clear in correct order to avoid FK issues
    testDb.db.delete(schema.episodeEvents).run();
    testDb.db.delete(schema.episodes).run();
    testDb.db.delete(schema.conversationContext).run();
    testDb.db.delete(schema.conversationMessages).run();
    testDb.db.delete(schema.conversations).run();
  });

  describe('add handler auto-links to conversation', () => {
    it('should auto-link episode to active conversation when sessionId provided', async () => {
      // 1. Create an active conversation for the session
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      // 2. Call add handler with ONLY sessionId - no conversationId
      const result = await episodeHandlers.add(mockContext, {
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId, // Only sessionId!
        name: 'Auto-linked Episode',
      });

      // 3. Verify auto-link happened
      expect(result.success).toBe(true);
      expect(result.episode.conversationId).toBe(conversation.id);
    });

    it('should NOT override explicit conversationId', async () => {
      // 1. Create two conversations
      const conversation1 = createTestConversation(testDb.db, testSessionId, testProjectId);
      const _conversation2 = createTestConversation(testDb.db, testSessionId, testProjectId);

      // 2. Call add handler with explicit conversationId
      const result = await episodeHandlers.add(mockContext, {
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        conversationId: conversation1.id, // Explicit!
        name: 'Explicitly-linked Episode',
      });

      // 3. Verify explicit conversationId is preserved
      expect(result.success).toBe(true);
      expect(result.episode.conversationId).toBe(conversation1.id);
    });

    it('should handle no active conversation gracefully', async () => {
      // No conversation created - just call handler with sessionId
      const result = await episodeHandlers.add(mockContext, {
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'No Conversation Episode',
      });

      // Should succeed with null conversationId
      expect(result.success).toBe(true);
      expect(result.episode.conversationId).toBeNull();
    });
  });

  describe('begin handler auto-links to conversation', () => {
    it('should auto-link episode to active conversation via begin', async () => {
      // 1. Create an active conversation for the session
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      // 2. Call begin handler with ONLY sessionId
      const result = await episodeHandlers.begin(mockContext, {
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Begin Auto-linked Episode',
      });

      // 3. Verify auto-link happened and episode is started
      expect(result.success).toBe(true);
      expect(result.episode.conversationId).toBe(conversation.id);
      expect(result.episode.status).toBe('active');
    });

    it('should NOT override explicit conversationId in begin', async () => {
      // 1. Create two conversations
      const conversation1 = createTestConversation(testDb.db, testSessionId, testProjectId);
      const _conversation2 = createTestConversation(testDb.db, testSessionId, testProjectId);

      // 2. Call begin handler with explicit conversationId
      const result = await episodeHandlers.begin(mockContext, {
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        conversationId: conversation1.id, // Explicit!
        name: 'Begin Explicit Episode',
      });

      // 3. Verify explicit conversationId is preserved
      expect(result.success).toBe(true);
      expect(result.episode.conversationId).toBe(conversation1.id);
    });
  });
});
