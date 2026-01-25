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

const TEST_DB_PATH = './data/test-episode-message-linking.db';
let testDb: TestDb;
let conversationRepo: IConversationRepository;
let episodeRepo: IEpisodeRepository;
let episodeService: EpisodeService;
let testProjectId: string;
let testSessionId: string;

describe('Episode-Message Linking', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    conversationRepo = repos.conversations;
    episodeRepo = repos.episodes!;

    episodeService = createEpisodeService({
      episodeRepo,
      conversationRepo,
    });

    const project = createTestProject(testDb.db, 'Episode Message Test Project');
    testProjectId = project.id;
    const session = createTestSession(testDb.db, testProjectId, 'Episode Message Test Session');
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

  describe('addMessage with episodeId', () => {
    it('should add message with episodeId when provided', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Test Episode',
      });
      await episodeService.start(episode.id);

      const message = await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello during episode',
        episodeId: episode.id,
      });

      expect(message.episodeId).toBe(episode.id);
    });

    it('should add message without episodeId when not provided', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      const message = await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello without episode',
      });

      expect(message.episodeId).toBeNull();
    });
  });

  describe('getMessagesByEpisode', () => {
    it('should retrieve messages linked to an episode', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Test Episode',
      });
      await episodeService.start(episode.id);

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Message 1',
        episodeId: episode.id,
      });
      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Message 2',
        episodeId: episode.id,
      });
      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Message without episode',
      });

      const messages = await conversationRepo.getMessagesByEpisode(episode.id);

      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe('Message 1');
      expect(messages[1].content).toBe('Message 2');
    });

    it('should return empty array when no messages linked', async () => {
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Empty Episode',
      });

      const messages = await conversationRepo.getMessagesByEpisode(episode.id);

      expect(messages).toEqual([]);
    });

    it('should support pagination', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Pagination Episode',
      });
      await episodeService.start(episode.id);

      for (let i = 0; i < 5; i++) {
        await conversationRepo.addMessage({
          conversationId: conversation.id,
          role: 'user',
          content: `Message ${i}`,
          episodeId: episode.id,
        });
      }

      const page1 = await conversationRepo.getMessagesByEpisode(episode.id, 2, 0);
      const page2 = await conversationRepo.getMessagesByEpisode(episode.id, 2, 2);

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
    });
  });

  describe('whatHappened with messages', () => {
    it('should include messages in whatHappened result', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'What Happened Episode',
      });
      await episodeService.start(episode.id);

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'User question',
        episodeId: episode.id,
      });
      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Agent response',
        episodeId: episode.id,
      });

      await episodeService.complete(episode.id, 'Done', 'success');

      const result = await episodeService.whatHappened(episode.id);

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBe(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('User question');
      expect(result.messages[1].role).toBe('agent');
      expect(result.messages[1].content).toBe('Agent response');
      expect(result.metrics.messageCount).toBe(2);
    });

    it('should return empty messages array when no messages linked', async () => {
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'No Messages Episode',
      });
      await episodeService.start(episode.id);
      await episodeService.complete(episode.id, 'Done', 'success');

      const result = await episodeService.whatHappened(episode.id);

      expect(result.messages).toEqual([]);
      expect(result.metrics.messageCount).toBe(0);
    });
  });

  describe('cross-conversation message linking', () => {
    it('should link messages from multiple conversations to same episode', async () => {
      const conversation1 = createTestConversation(testDb.db, testSessionId, testProjectId);
      const conversation2 = createTestConversation(testDb.db, testSessionId, testProjectId);
      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Multi-Conversation Episode',
      });
      await episodeService.start(episode.id);

      await conversationRepo.addMessage({
        conversationId: conversation1.id,
        role: 'user',
        content: 'From conversation 1',
        episodeId: episode.id,
      });
      await conversationRepo.addMessage({
        conversationId: conversation2.id,
        role: 'user',
        content: 'From conversation 2',
        episodeId: episode.id,
      });

      const messages = await conversationRepo.getMessagesByEpisode(episode.id);

      expect(messages.length).toBe(2);
      const contents = messages.map((m) => m.content);
      expect(contents).toContain('From conversation 1');
      expect(contents).toContain('From conversation 2');
    });
  });

  describe('linkMessagesToEpisode', () => {
    it('should link messages within time range to episode', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      const startTime = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 10));

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Message during episode',
      });

      await new Promise((r) => setTimeout(r, 10));
      const endTime = new Date().toISOString();

      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Backfill Episode',
      });

      const linked = await conversationRepo.linkMessagesToEpisode({
        episodeId: episode.id,
        sessionId: testSessionId,
        startTime,
        endTime,
      });

      expect(linked).toBe(1);

      const messages = await conversationRepo.getMessagesByEpisode(episode.id);
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('Message during episode');
    });

    it('should not link messages outside time range', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Message before episode',
      });

      const futureTime = new Date(Date.now() + 60000);
      const startTime = futureTime.toISOString();
      const endTime = new Date(futureTime.getTime() + 60000).toISOString();

      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'No Messages Episode',
      });

      const linked = await conversationRepo.linkMessagesToEpisode({
        episodeId: episode.id,
        sessionId: testSessionId,
        startTime,
        endTime,
      });

      expect(linked).toBe(0);
    });

    it('should not re-link messages already linked to another episode', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const episode1 = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'First Episode',
      });

      const startTime = new Date().toISOString();

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Already linked message',
        episodeId: episode1.id,
      });

      await new Promise((r) => setTimeout(r, 10));
      const endTime = new Date().toISOString();

      const episode2 = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Second Episode',
      });

      const linked = await conversationRepo.linkMessagesToEpisode({
        episodeId: episode2.id,
        sessionId: testSessionId,
        startTime,
        endTime,
      });

      expect(linked).toBe(0);

      const messagesEp1 = await conversationRepo.getMessagesByEpisode(episode1.id);
      expect(messagesEp1.length).toBe(1);

      const messagesEp2 = await conversationRepo.getMessagesByEpisode(episode2.id);
      expect(messagesEp2.length).toBe(0);
    });
  });

  describe('auto-linking on episode completion', () => {
    it('should auto-link messages when episode completes', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Auto-Link Episode',
      });
      await episodeService.start(episode.id);

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Message during active episode',
      });
      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Response during active episode',
      });

      const completedEpisode = await episodeService.complete(episode.id, 'Done', 'success');

      expect(completedEpisode.messagesLinked).toBe(2);

      const messages = await conversationRepo.getMessagesByEpisode(episode.id);
      expect(messages.length).toBe(2);
    });

    it('should auto-link messages when episode fails', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);

      const episode = await episodeService.create({
        scopeType: 'project',
        scopeId: testProjectId,
        sessionId: testSessionId,
        name: 'Failed Episode',
      });
      await episodeService.start(episode.id);

      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Attempted something',
      });

      const failedEpisode = await episodeService.fail(episode.id, 'Something went wrong');

      expect(failedEpisode.messagesLinked).toBe(1);

      const messages = await conversationRepo.getMessagesByEpisode(episode.id);
      expect(messages.length).toBe(1);
    });
  });
});
