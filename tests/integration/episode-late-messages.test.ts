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

const TEST_DB_PATH = './data/test-episode-late-messages.db';
let testDb: TestDb;
let conversationRepo: IConversationRepository;
let episodeRepo: IEpisodeRepository;
let episodeService: EpisodeService;
let testProjectId: string;
let testSessionId: string;

describe('Episode Late Messages (Race Condition)', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    conversationRepo = repos.conversations;
    episodeRepo = repos.episodes!;

    episodeService = createEpisodeService({
      episodeRepo,
      conversationRepo,
    });

    const project = createTestProject(testDb.db, 'Episode Late Messages Test Project');
    testProjectId = project.id;
    const session = createTestSession(
      testDb.db,
      testProjectId,
      'Episode Late Messages Test Session'
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

  describe('5-second buffer for late-arriving messages', () => {
    it('should link message arriving within 5-second buffer after episode completion', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Late Message Test - Within Buffer',
      });
      await episodeService.start(episode.id);

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Message during episode',
      });

      const completedEpisode = await episodeService.complete(episode.id, 'Done', 'success');

      await new Promise((resolve) => setTimeout(resolve, 2000));

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Late message within 5-second buffer',
      });

      const { messagesLinked } = await episodeService.importAndLinkMessages(episode.id);

      expect(messagesLinked).toBeGreaterThanOrEqual(1);

      const linkedMessages = await conversationRepo.getMessagesByEpisode(episode.id);
      expect(linkedMessages.length).toBeGreaterThanOrEqual(1);
    });

    it('should NOT link message arriving beyond 5-second buffer after episode completion', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Late Message Test - Beyond Buffer',
      });
      await episodeService.start(episode.id);

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Message during episode',
      });

      const completedEpisode = await episodeService.complete(episode.id, 'Done', 'success');

      const messagesLinkedAtCompletion = completedEpisode.messagesLinked || 0;

      await new Promise((resolve) => setTimeout(resolve, 10000));

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Message beyond 5-second buffer - should NOT be linked',
      });

      const { messagesLinked: messagesLinkedAfter } = await episodeService.importAndLinkMessages(
        episode.id
      );

      expect(messagesLinkedAfter).toBe(0);

      const linkedMessages = await conversationRepo.getMessagesByEpisode(episode.id);
      expect(linkedMessages.length).toBe(messagesLinkedAtCompletion);
    }, 15000);
  });
});
