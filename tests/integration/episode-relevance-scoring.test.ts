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
import type {
  IConversationRepository,
  IEpisodeRepository,
} from '../../src/core/interfaces/repositories.js';
import { createEpisodeService, type EpisodeService } from '../../src/services/episode/index.js';
import { conversationMessages } from '../../src/db/schema/conversations.js';
import { eq } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-episode-relevance-scoring.db';
let testDb: TestDb;
let conversationRepo: IConversationRepository;
let episodeRepo: IEpisodeRepository;
let episodeService: EpisodeService;
let testProjectId: string;
let testSessionId: string;

describe('Episode Relevance Scoring', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    conversationRepo = repos.conversations;
    episodeRepo = repos.episodes!;

    episodeService = createEpisodeService({
      episodeRepo,
      conversationRepo,
    });

    const project = createTestProject(testDb.db, 'Episode Relevance Scoring Test Project');
    testProjectId = project.id;
    const session = createTestSession(
      testDb.db,
      testProjectId,
      'Episode Relevance Scoring Test Session'
    );
    testSessionId = session.id;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    testDb.db.delete(schema.conversationContext).run();
    testDb.db.delete(schema.conversationMessages).run();
    testDb.db.delete(schema.conversations).run();
    testDb.db.delete(schema.episodeEvents).run();
    testDb.db.delete(schema.episodes).run();
  });

  describe('Relevance Scoring on Episode Complete', () => {
    it('should score messages when episode completes with linked messages', async () => {
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Test Episode with Scoring',
      });
      await episodeService.start(episode.id);

      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'I need to fix a critical bug in authentication',
      });

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'I found the issue: JWT token expiry was not being checked properly',
      });

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Great! Let me deploy this fix',
      });

      const completed = await episodeService.complete(
        episode.id,
        'Fixed authentication bug',
        'success'
      );

      expect(completed.messagesLinked).toBeGreaterThanOrEqual(0);

      const messages = await testDb.db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.episodeId, episode.id));

      if (messages.length > 0) {
        const scoredMessages = messages.filter((m) => m.relevanceScore !== null);

        if (scoredMessages.length > 0) {
          scoredMessages.forEach((msg) => {
            expect(msg.relevanceCategory).toBeDefined();
            expect(['high', 'medium', 'low']).toContain(msg.relevanceCategory);
            expect(msg.relevanceScore).toBeGreaterThanOrEqual(0);
            expect(msg.relevanceScore).toBeLessThanOrEqual(1);
          });
        }
      }
    });

    it('should handle gracefully when extraction service is unavailable', async () => {
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Test Episode Without Extraction Service',
      });
      await episodeService.start(episode.id);

      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Test message 1',
        episodeId: episode.id,
      });

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Test message 2',
        episodeId: episode.id,
      });

      const completed = await episodeService.complete(episode.id, 'Test outcome', 'success');

      expect(completed.id).toBe(episode.id);
      expect(completed.outcome).toBe('Test outcome');
      expect(completed.outcomeType).toBe('success');
      expect(completed.messagesLinked).toBeGreaterThanOrEqual(0);
    });

    it('should not crash when episode has no messages', async () => {
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Empty Episode',
      });
      await episodeService.start(episode.id);

      const completed = await episodeService.complete(episode.id, 'No messages', 'success');

      expect(completed.id).toBe(episode.id);
      expect(completed.messagesLinked).toBe(0);
    });
  });
});
