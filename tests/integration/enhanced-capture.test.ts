import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HookLearningService } from '../../src/services/learning/hook-learning.service.js';
import { setupTestDb, createTestContext, cleanupTestDatabases } from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

describe('Enhanced Capture - Integration Tests', () => {
  let context: AppContext;
  let service: HookLearningService;
  let sessionId: string;

  beforeEach(async () => {
    const testDb = setupTestDb(':memory:');
    context = await createTestContext(testDb);

    const { repos } = context;
    const { experiences, knowledge, guidelines, tools, tasks } = repos;

    service = new HookLearningService({
      enabled: true,
      enableTriggerParsing: true,
      enableTaskTracking: true,
      triggerConfidenceThreshold: 0.7,
    });

    service.setDependencies({
      experienceRepo: experiences,
      knowledgeRepo: knowledge,
      guidelineRepo: guidelines,
      toolRepo: tools,
      taskRepo: tasks,
    });

    sessionId = `test-session-${Date.now()}`;
  });

  afterEach(async () => {
    await cleanupTestDatabases();
  });

  describe('Conversation Trigger Parsing', () => {
    it('should capture guideline from "always" rule trigger', async () => {
      const result = await service.onConversationMessage({
        sessionId,
        role: 'user',
        message: 'Remember, we should always use TypeScript strict mode for new projects.',
      });

      expect(result.entriesCreated).toBeGreaterThan(0);
      expect(result.guidelines.length).toBeGreaterThan(0);
    });

    it('should capture knowledge from decision trigger', async () => {
      const result = await service.onConversationMessage({
        sessionId,
        role: 'user',
        message:
          'We decided to use JWT with RS256 for authentication because it provides better security.',
      });

      expect(result.entriesCreated).toBeGreaterThan(0);
      expect(result.knowledge.length).toBeGreaterThan(0);
    });

    it('should capture experience from recovery trigger', async () => {
      const result = await service.onConversationMessage({
        sessionId,
        role: 'assistant',
        message:
          'I fixed the issue by updating the configuration file. That solved the timeout problem.',
      });

      expect(result.entriesCreated).toBeGreaterThan(0);
      expect(result.experiences.length).toBeGreaterThan(0);
    });

    it('should capture tool from command trigger', async () => {
      const result = await service.onConversationMessage({
        sessionId,
        role: 'user',
        message: 'To run the tests, use this command: ```bash\nnpm run test:coverage\n```',
      });

      expect(result.entriesCreated).toBeGreaterThan(0);
      expect(result.tools.length).toBeGreaterThan(0);
    });

    it('should ignore short messages below threshold', async () => {
      const result = await service.onConversationMessage({
        sessionId,
        role: 'user',
        message: 'ok',
      });

      expect(result.entriesCreated).toBe(0);
    });
  });

  describe('Episode Event Capture', () => {
    it('should capture knowledge from decision event', async () => {
      const result = await service.onEpisodeEvent({
        sessionId,
        episodeId: 'ep-123',
        eventType: 'decision',
        message: 'Chose to implement feature using React hooks instead of class components',
      });

      expect(result.captured).toBe(true);
      expect(result.entryType).toBe('knowledge');
    });

    it('should capture experience from checkpoint event', async () => {
      const result = await service.onEpisodeEvent({
        sessionId,
        episodeId: 'ep-123',
        eventType: 'checkpoint',
        message: 'Successfully implemented the authentication flow with JWT tokens',
      });

      expect(result.captured).toBe(true);
      expect(result.entryType).toBe('experience');
    });

    it('should capture experience from completed event', async () => {
      const result = await service.onEpisodeEvent({
        sessionId,
        episodeId: 'ep-123',
        eventType: 'completed',
        message: 'Feature implementation complete with all tests passing',
        data: { outcome: 'success' },
      });

      expect(result.captured).toBe(true);
      expect(result.entryType).toBe('experience');
    });

    it('should not capture error events', async () => {
      const result = await service.onEpisodeEvent({
        sessionId,
        episodeId: 'ep-123',
        eventType: 'error',
        message: 'An error occurred',
      });

      expect(result.captured).toBe(false);
    });

    it('should not capture very short checkpoint messages', async () => {
      const result = await service.onEpisodeEvent({
        sessionId,
        episodeId: 'ep-123',
        eventType: 'checkpoint',
        message: 'Done',
      });

      expect(result.captured).toBe(false);
    });
  });

  describe('Task Tracking at Block Boundaries', () => {
    it('should create task at block start for work request', async () => {
      const result = await service.onBlockStart({
        sessionId,
        userMessage: 'Can you implement user authentication with JWT tokens?',
        messageId: 'msg-123',
      });

      expect(result.taskCreated).toBe(true);
      expect(result.taskId).toBeDefined();
    });

    it('should not create task for non-work messages', async () => {
      const result = await service.onBlockStart({
        sessionId,
        userMessage: 'What is the weather like today?',
        messageId: 'msg-124',
      });

      expect(result.taskCreated).toBe(false);
    });

    it('should update task at block end', async () => {
      const startResult = await service.onBlockStart({
        sessionId,
        userMessage: 'Fix the authentication bug',
        messageId: 'msg-125',
      });

      expect(startResult.taskCreated).toBe(true);

      const endResult = await service.onBlockEnd({
        sessionId,
        messageId: 'msg-125',
        assistantMessage: 'I fixed the authentication bug by updating the token validation logic.',
        success: true,
      });

      expect(endResult.taskUpdated).toBe(true);
      expect(endResult.taskId).toBe(startResult.taskId);
    });

    it('should capture learnings from block end if triggers detected', async () => {
      await service.onBlockStart({
        sessionId,
        userMessage: 'Implement the user profile feature',
        messageId: 'msg-126',
      });

      const endResult = await service.onBlockEnd({
        sessionId,
        messageId: 'msg-126',
        assistantMessage:
          'I implemented the feature and we decided to use Redux for state management.',
        success: true,
      });

      expect(endResult.entriesCreated).toBeGreaterThan(0);
    });
  });

  describe('Real Session Scenario', () => {
    it('should capture comprehensive timeline from realistic session', async () => {
      const messageId1 = 'msg-scenario-1';
      const messageId2 = 'msg-scenario-2';

      await service.onBlockStart({
        sessionId,
        userMessage: 'Implement message linking feature for episodes',
        messageId: messageId1,
      });

      await service.onConversationMessage({
        sessionId,
        role: 'assistant',
        message:
          'I will implement the message linking. We decided to use episode_id as a foreign key in the messages table.',
      });

      await service.onEpisodeEvent({
        sessionId,
        episodeId: 'ep-real-1',
        eventType: 'decision',
        message: 'Use episode_id foreign key in messages table',
      });

      await service.onEpisodeEvent({
        sessionId,
        episodeId: 'ep-real-1',
        eventType: 'checkpoint',
        message: 'Created database migration for episode_id column',
      });

      await service.onBlockEnd({
        sessionId,
        messageId: messageId1,
        assistantMessage: 'Message linking feature is complete. All tests are passing.',
        success: true,
      });

      await service.onBlockStart({
        sessionId,
        userMessage: 'Refactor the duplicate message queries',
        messageId: messageId2,
      });

      await service.onEpisodeEvent({
        sessionId,
        episodeId: 'ep-real-2',
        eventType: 'completed',
        message: 'Refactored message queries - consolidated into single reusable function',
        data: { outcome: 'success' },
      });

      await service.onBlockEnd({
        sessionId,
        messageId: messageId2,
        assistantMessage: 'Refactoring complete. The code is now more maintainable.',
        success: true,
      });

      const stats = service.getSessionStats(sessionId);
      expect(stats.experiencesCreated).toBeGreaterThan(0);
    });
  });
});
