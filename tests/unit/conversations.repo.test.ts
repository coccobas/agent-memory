import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  schema,
  createTestProject,
  createTestSession,
  createTestConversation,
  createTestMessage,
  createTestContextLink,
  createTestTool,
  createTestKnowledge,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { IConversationRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-conversations-repo.db';
let testDb: TestDb;
let conversationRepo: IConversationRepository;
let testProjectId: string;
let testSessionId: string;

describe('Conversations Repository', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    conversationRepo = repos.conversations;

    const project = createTestProject(testDb.db, 'Conversation Test Project');
    testProjectId = project.id;
    const session = createTestSession(testDb.db, testProjectId, 'Conversation Test Session');
    testSessionId = session.id;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clean up conversations, messages, and context before each test
    testDb.db.delete(schema.conversationContext).run();
    testDb.db.delete(schema.conversationMessages).run();
    testDb.db.delete(schema.conversations).run();
  });

  describe('create', () => {
    it('should create conversation with all fields', async () => {
      const conversation = await conversationRepo.create({
        sessionId: testSessionId,
        projectId: testProjectId,
        agentId: 'agent-1',
        title: 'Test Conversation',
        metadata: { tags: ['test'] },
      });

      expect(conversation).toBeDefined();
      expect(conversation.id).toBeDefined();
      expect(conversation.sessionId).toBe(testSessionId);
      expect(conversation.projectId).toBe(testProjectId);
      expect(conversation.agentId).toBe('agent-1');
      expect(conversation.title).toBe('Test Conversation');
      expect(conversation.status).toBe('active');
      expect(conversation.startedAt).toBeDefined();
    });

    it('should create conversation with minimal fields', async () => {
      const conversation = await conversationRepo.create({
        projectId: testProjectId,
      });

      expect(conversation).toBeDefined();
      expect(conversation.id).toBeDefined();
      expect(conversation.projectId).toBe(testProjectId);
      expect(conversation.status).toBe('active');
      expect(conversation.startedAt).toBeDefined();
    });
  });

  describe('getById', () => {
    it('should get existing conversation', async () => {
      const created = createTestConversation(testDb.db, testSessionId, testProjectId);
      const conversation = await conversationRepo.getById(created.id);

      expect(conversation).toBeDefined();
      expect(conversation?.id).toBe(created.id);
    });

    it('should return undefined for non-existent conversation', async () => {
      const conversation = await conversationRepo.getById('non-existent-id');
      expect(conversation).toBeUndefined();
    });

    it('should get conversation with messages included', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      createTestMessage(testDb.db, conversation.id, 'user', 'Hello', 0);
      createTestMessage(testDb.db, conversation.id, 'agent', 'Hi there', 1);

      const result = await conversationRepo.getById(conversation.id, true);

      expect(result?.messages).toBeDefined();
      expect(result?.messages?.length).toBe(2);
      expect(result?.messages?.[0].content).toBe('Hello');
      expect(result?.messages?.[1].content).toBe('Hi there');
    });

    it('should get conversation with context included', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(testDb.db, 'Test Knowledge');
      createTestContextLink(testDb.db, conversation.id, 'knowledge', knowledge.id);

      const result = await conversationRepo.getById(conversation.id, false, true);

      expect(result?.context).toBeDefined();
      expect(result?.context?.length).toBe(1);
      expect(result?.context?.[0].entryType).toBe('knowledge');
      expect(result?.context?.[0].entryId).toBe(knowledge.id);
    });
  });

  describe('list', () => {
    it('should list all conversations', async () => {
      createTestConversation(testDb.db, testSessionId, testProjectId);
      createTestConversation(testDb.db, testSessionId, testProjectId);

      const conversations = await conversationRepo.list();

      expect(conversations.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by sessionId', async () => {
      const session2 = createTestSession(testDb.db, testProjectId, 'Session 2');
      createTestConversation(testDb.db, testSessionId, testProjectId);
      createTestConversation(testDb.db, session2.id, testProjectId);

      const conversations = await conversationRepo.list({ sessionId: testSessionId });

      expect(conversations.length).toBeGreaterThanOrEqual(1);
      conversations.forEach((c) => {
        expect(c.sessionId).toBe(testSessionId);
      });
    });

    it('should filter by projectId', async () => {
      createTestConversation(testDb.db, testSessionId, testProjectId);
      const project2 = createTestProject(testDb.db, 'Project 2');
      createTestConversation(testDb.db, undefined, project2.id);

      const conversations = await conversationRepo.list({ projectId: testProjectId });

      expect(conversations.length).toBeGreaterThanOrEqual(1);
      conversations.forEach((c) => {
        expect(c.projectId).toBe(testProjectId);
      });
    });

    it('should filter by agentId', async () => {
      createTestConversation(testDb.db, testSessionId, testProjectId, 'agent-1');
      createTestConversation(testDb.db, testSessionId, testProjectId, 'agent-2');

      const conversations = await conversationRepo.list({ agentId: 'agent-1' });

      expect(conversations.length).toBeGreaterThanOrEqual(1);
      conversations.forEach((c) => {
        expect(c.agentId).toBe('agent-1');
      });
    });

    it('should filter by status', async () => {
      const active = createTestConversation(
        testDb.db,
        testSessionId,
        testProjectId,
        undefined,
        undefined,
        'active'
      );
      const completed = createTestConversation(
        testDb.db,
        testSessionId,
        testProjectId,
        undefined,
        undefined,
        'completed'
      );

      const activeConversations = await conversationRepo.list({ status: 'active' });
      const completedConversations = await conversationRepo.list({ status: 'completed' });

      expect(activeConversations.some((c) => c.id === active.id)).toBe(true);
      expect(completedConversations.some((c) => c.id === completed.id)).toBe(true);
    });

    it('should support pagination', async () => {
      // Create multiple conversations
      for (let i = 0; i < 5; i++) {
        createTestConversation(testDb.db, testSessionId, testProjectId);
      }

      const page1 = await conversationRepo.list({}, { limit: 2, offset: 0 });
      const page2 = await conversationRepo.list({}, { limit: 2, offset: 2 });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);
      // Should have different conversations
      const page1Ids = new Set(page1.map((c) => c.id));
      const page2Ids = new Set(page2.map((c) => c.id));
      expect([...page1Ids].some((id) => page2Ids.has(id))).toBe(false);
    });
  });

  describe('update', () => {
    it('should update title', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const updated = await conversationRepo.update(conversation.id, { title: 'Updated Title' });

      expect(updated?.title).toBe('Updated Title');
    });

    it('should update status to completed and set ended_at', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const updated = await conversationRepo.update(conversation.id, { status: 'completed' });

      expect(updated?.status).toBe('completed');
      expect(updated?.endedAt).toBeDefined();
    });

    it('should update status to archived', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const updated = await conversationRepo.update(conversation.id, { status: 'archived' });

      expect(updated?.status).toBe('archived');
      expect(updated?.endedAt).toBeDefined();
    });

    it('should update metadata', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const newMetadata = { tags: ['updated'], summary: 'Test summary' };
      const updated = await conversationRepo.update(conversation.id, { metadata: newMetadata });

      expect(updated?.metadata).toEqual(newMetadata);
    });

    it('should return undefined for non-existent conversation', async () => {
      const updated = await conversationRepo.update('non-existent-id', { title: 'New Title' });
      expect(updated).toBeUndefined();
    });
  });

  describe('addMessage', () => {
    it('should add user message', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const message = await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello, world!',
      });

      expect(message).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, world!');
      expect(message.messageIndex).toBe(0);
    });

    it('should add agent message', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const message = await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Hello! How can I help?',
      });

      expect(message.role).toBe('agent');
      expect(message.content).toBe('Hello! How can I help?');
    });

    it('should auto-increment message_index', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const msg1 = await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'First',
      });
      const msg2 = await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Second',
      });
      const msg3 = await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Third',
      });

      expect(msg1.messageIndex).toBe(0);
      expect(msg2.messageIndex).toBe(1);
      expect(msg3.messageIndex).toBe(2);
    });

    it('should add message with context entries', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(testDb.db, 'Test Knowledge');
      const message = await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Response',
        contextEntries: [{ type: 'knowledge', id: knowledge.id }],
      });

      expect(message.contextEntries).toBeDefined();
      expect(message.contextEntries?.length).toBe(1);
      expect(message.contextEntries?.[0].id).toBe(knowledge.id);
    });

    it('should add message with tools used', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const message = await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Response',
        toolsUsed: ['memory_query', 'memory_knowledge'],
      });

      expect(message.toolsUsed).toBeDefined();
      expect(message.toolsUsed?.length).toBe(2);
      expect(message.toolsUsed).toContain('memory_query');
    });
  });

  describe('getMessages', () => {
    it('should get all messages', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'First',
      });
      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Second',
      });

      const messages = await conversationRepo.getMessages(conversation.id);

      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
    });

    it('should support pagination', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      for (let i = 0; i < 5; i++) {
        await conversationRepo.addMessage({
          conversationId: conversation.id,
          role: 'user',
          content: `Message ${i}`,
        });
      }

      const page1 = await conversationRepo.getMessages(conversation.id, 2, 0);
      const page2 = await conversationRepo.getMessages(conversation.id, 2, 2);

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].content).toBe('Message 0');
      expect(page2[0].content).toBe('Message 2');
    });
  });

  describe('linkContext', () => {
    it('should link entry to conversation', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(testDb.db, 'Test Knowledge');
      const context = await conversationRepo.linkContext({
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
        relevanceScore: 0.95,
      });

      expect(context).toBeDefined();
      expect(context.conversationId).toBe(conversation.id);
      expect(context.entryType).toBe('knowledge');
      expect(context.entryId).toBe(knowledge.id);
      expect(context.relevanceScore).toBe(0.95);
    });

    it('should link entry to message', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const message = await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Response',
      });
      const { knowledge } = createTestKnowledge(testDb.db, 'Test Knowledge');
      const context = await conversationRepo.linkContext({
        conversationId: conversation.id,
        messageId: message.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      expect(context.messageId).toBe(message.id);
    });

    it('should prevent duplicate links', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(testDb.db, 'Test Knowledge');
      const context1 = await conversationRepo.linkContext({
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });
      // Try to link again - should return existing
      const context2 = await conversationRepo.linkContext({
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      expect(context1.id).toBe(context2.id);
    });
  });

  describe('getContextForEntry', () => {
    it('should get conversations using entry', async () => {
      const conversation1 = createTestConversation(testDb.db, testSessionId, testProjectId);
      const conversation2 = createTestConversation(testDb.db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(testDb.db, 'Test Knowledge');
      createTestContextLink(testDb.db, conversation1.id, 'knowledge', knowledge.id);
      createTestContextLink(testDb.db, conversation2.id, 'knowledge', knowledge.id);

      const contexts = await conversationRepo.getContextForEntry('knowledge', knowledge.id);

      expect(contexts.length).toBe(2);
      const conversationIds = contexts.map((c) => c.conversationId);
      expect(conversationIds).toContain(conversation1.id);
      expect(conversationIds).toContain(conversation2.id);
    });
  });

  describe('getContextForConversation', () => {
    it('should get entries used in conversation', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      const { tool } = createTestTool(testDb.db, 'test-tool');
      const { knowledge } = createTestKnowledge(testDb.db, 'Test Knowledge');
      createTestContextLink(testDb.db, conversation.id, 'tool', tool.id);
      createTestContextLink(testDb.db, conversation.id, 'knowledge', knowledge.id);

      const contexts = await conversationRepo.getContextForConversation(conversation.id);

      expect(contexts.length).toBe(2);
      const entryTypes = contexts.map((c) => c.entryType);
      expect(entryTypes).toContain('tool');
      expect(entryTypes).toContain('knowledge');
    });
  });

  describe('search', () => {
    it('should search by title', async () => {
      const conversation = createTestConversation(
        testDb.db,
        testSessionId,
        testProjectId,
        undefined,
        'Search Test Title'
      );
      createTestConversation(testDb.db, testSessionId, testProjectId, undefined, 'Other Title');

      const results = await conversationRepo.search('Search Test');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((c) => c.id === conversation.id)).toBe(true);
    });

    it('should search by message content', async () => {
      const conversation = createTestConversation(testDb.db, testSessionId, testProjectId);
      await conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'This is a searchable message about authentication',
      });

      const results = await conversationRepo.search('authentication');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((c) => c.id === conversation.id)).toBe(true);
    });

    it('should search with filters', async () => {
      const conversation = createTestConversation(
        testDb.db,
        testSessionId,
        testProjectId,
        'agent-1',
        'Filtered Title'
      );
      createTestConversation(testDb.db, testSessionId, testProjectId, 'agent-2', 'Other Title');

      const results = await conversationRepo.search('Title', { agentId: 'agent-1' });

      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach((c) => {
        expect(c.agentId).toBe('agent-1');
      });
    });
  });
});


