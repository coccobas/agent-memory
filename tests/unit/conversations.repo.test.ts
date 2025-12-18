import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  schema,
  createTestProject,
  createTestSession,
  createTestConversation,
  createTestMessage,
  createTestContextLink,
  createTestTool,
  createTestKnowledge,
} from '../fixtures/test-helpers.js';
import { conversationRepo } from '../../src/db/repositories/conversations.js';
import { eq } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-conversations-repo.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let testProjectId: string;
let testSessionId: string;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

describe('Conversations Repository', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;

    const project = createTestProject(db, 'Conversation Test Project');
    testProjectId = project.id;
    const session = createTestSession(db, testProjectId, 'Conversation Test Session');
    testSessionId = session.id;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clean up conversations, messages, and context before each test
    db.delete(schema.conversationContext).run();
    db.delete(schema.conversationMessages).run();
    db.delete(schema.conversations).run();
  });

  describe('create', () => {
    it('should create conversation with all fields', () => {
      const conversation = conversationRepo.create({
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

    it('should create conversation with minimal fields', () => {
      const conversation = conversationRepo.create({
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
    it('should get existing conversation', () => {
      const created = createTestConversation(db, testSessionId, testProjectId);
      const conversation = conversationRepo.getById(created.id);

      expect(conversation).toBeDefined();
      expect(conversation?.id).toBe(created.id);
    });

    it('should return undefined for non-existent conversation', () => {
      const conversation = conversationRepo.getById('non-existent-id');
      expect(conversation).toBeUndefined();
    });

    it('should get conversation with messages included', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      createTestMessage(db, conversation.id, 'user', 'Hello', 0);
      createTestMessage(db, conversation.id, 'agent', 'Hi there', 1);

      const result = conversationRepo.getById(conversation.id, true);

      expect(result?.messages).toBeDefined();
      expect(result?.messages?.length).toBe(2);
      expect(result?.messages?.[0].content).toBe('Hello');
      expect(result?.messages?.[1].content).toBe('Hi there');
    });

    it('should get conversation with context included', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      createTestContextLink(db, conversation.id, 'knowledge', knowledge.id);

      const result = conversationRepo.getById(conversation.id, false, true);

      expect(result?.context).toBeDefined();
      expect(result?.context?.length).toBe(1);
      expect(result?.context?.[0].entryType).toBe('knowledge');
      expect(result?.context?.[0].entryId).toBe(knowledge.id);
    });
  });

  describe('list', () => {
    it('should list all conversations', () => {
      createTestConversation(db, testSessionId, testProjectId);
      createTestConversation(db, testSessionId, testProjectId);

      const conversations = conversationRepo.list();

      expect(conversations.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by sessionId', () => {
      const session2 = createTestSession(db, testProjectId, 'Session 2');
      createTestConversation(db, testSessionId, testProjectId);
      createTestConversation(db, session2.id, testProjectId);

      const conversations = conversationRepo.list({ sessionId: testSessionId });

      expect(conversations.length).toBeGreaterThanOrEqual(1);
      conversations.forEach((c) => {
        expect(c.sessionId).toBe(testSessionId);
      });
    });

    it('should filter by projectId', () => {
      createTestConversation(db, testSessionId, testProjectId);
      const project2 = createTestProject(db, 'Project 2');
      createTestConversation(db, undefined, project2.id);

      const conversations = conversationRepo.list({ projectId: testProjectId });

      expect(conversations.length).toBeGreaterThanOrEqual(1);
      conversations.forEach((c) => {
        expect(c.projectId).toBe(testProjectId);
      });
    });

    it('should filter by agentId', () => {
      createTestConversation(db, testSessionId, testProjectId, 'agent-1');
      createTestConversation(db, testSessionId, testProjectId, 'agent-2');

      const conversations = conversationRepo.list({ agentId: 'agent-1' });

      expect(conversations.length).toBeGreaterThanOrEqual(1);
      conversations.forEach((c) => {
        expect(c.agentId).toBe('agent-1');
      });
    });

    it('should filter by status', () => {
      const active = createTestConversation(
        db,
        testSessionId,
        testProjectId,
        undefined,
        undefined,
        'active'
      );
      const completed = createTestConversation(
        db,
        testSessionId,
        testProjectId,
        undefined,
        undefined,
        'completed'
      );

      const activeConversations = conversationRepo.list({ status: 'active' });
      const completedConversations = conversationRepo.list({ status: 'completed' });

      expect(activeConversations.some((c) => c.id === active.id)).toBe(true);
      expect(completedConversations.some((c) => c.id === completed.id)).toBe(true);
    });

    it('should support pagination', () => {
      // Create multiple conversations
      for (let i = 0; i < 5; i++) {
        createTestConversation(db, testSessionId, testProjectId);
      }

      const page1 = conversationRepo.list({}, { limit: 2, offset: 0 });
      const page2 = conversationRepo.list({}, { limit: 2, offset: 2 });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);
      // Should have different conversations
      const page1Ids = new Set(page1.map((c) => c.id));
      const page2Ids = new Set(page2.map((c) => c.id));
      expect([...page1Ids].some((id) => page2Ids.has(id))).toBe(false);
    });
  });

  describe('update', () => {
    it('should update title', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const updated = conversationRepo.update(conversation.id, { title: 'Updated Title' });

      expect(updated?.title).toBe('Updated Title');
    });

    it('should update status to completed and set ended_at', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const updated = conversationRepo.update(conversation.id, { status: 'completed' });

      expect(updated?.status).toBe('completed');
      expect(updated?.endedAt).toBeDefined();
    });

    it('should update status to archived', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const updated = conversationRepo.update(conversation.id, { status: 'archived' });

      expect(updated?.status).toBe('archived');
      expect(updated?.endedAt).toBeDefined();
    });

    it('should update metadata', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const newMetadata = { tags: ['updated'], summary: 'Test summary' };
      const updated = conversationRepo.update(conversation.id, { metadata: newMetadata });

      expect(updated?.metadata).toEqual(newMetadata);
    });

    it('should return undefined for non-existent conversation', () => {
      const updated = conversationRepo.update('non-existent-id', { title: 'New Title' });
      expect(updated).toBeUndefined();
    });
  });

  describe('addMessage', () => {
    it('should add user message', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const message = conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello, world!',
      });

      expect(message).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, world!');
      expect(message.messageIndex).toBe(0);
    });

    it('should add agent message', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const message = conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Hello! How can I help?',
      });

      expect(message.role).toBe('agent');
      expect(message.content).toBe('Hello! How can I help?');
    });

    it('should auto-increment message_index', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const msg1 = conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'First',
      });
      const msg2 = conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Second',
      });
      const msg3 = conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Third',
      });

      expect(msg1.messageIndex).toBe(0);
      expect(msg2.messageIndex).toBe(1);
      expect(msg3.messageIndex).toBe(2);
    });

    it('should add message with context entries', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const message = conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Response',
        contextEntries: [{ type: 'knowledge', id: knowledge.id }],
      });

      expect(message.contextEntries).toBeDefined();
      expect(message.contextEntries?.length).toBe(1);
      expect(message.contextEntries?.[0].id).toBe(knowledge.id);
    });

    it('should add message with tools used', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const message = conversationRepo.addMessage({
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
    it('should get all messages', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'First',
      });
      conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Second',
      });

      const messages = conversationRepo.getMessages(conversation.id);

      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
    });

    it('should support pagination', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      for (let i = 0; i < 5; i++) {
        conversationRepo.addMessage({
          conversationId: conversation.id,
          role: 'user',
          content: `Message ${i}`,
        });
      }

      const page1 = conversationRepo.getMessages(conversation.id, 2, 0);
      const page2 = conversationRepo.getMessages(conversation.id, 2, 2);

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].content).toBe('Message 0');
      expect(page2[0].content).toBe('Message 2');
    });
  });

  describe('linkContext', () => {
    it('should link entry to conversation', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const context = conversationRepo.linkContext({
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

    it('should link entry to message', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const message = conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Response',
      });
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const context = conversationRepo.linkContext({
        conversationId: conversation.id,
        messageId: message.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      expect(context.messageId).toBe(message.id);
    });

    it('should prevent duplicate links', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const context1 = conversationRepo.linkContext({
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });
      // Try to link again - should return existing
      const context2 = conversationRepo.linkContext({
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      expect(context1.id).toBe(context2.id);
    });
  });

  describe('getContextForEntry', () => {
    it('should get conversations using entry', () => {
      const conversation1 = createTestConversation(db, testSessionId, testProjectId);
      const conversation2 = createTestConversation(db, testSessionId, testProjectId);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      createTestContextLink(db, conversation1.id, 'knowledge', knowledge.id);
      createTestContextLink(db, conversation2.id, 'knowledge', knowledge.id);

      const contexts = conversationRepo.getContextForEntry('knowledge', knowledge.id);

      expect(contexts.length).toBe(2);
      const conversationIds = contexts.map((c) => c.conversationId);
      expect(conversationIds).toContain(conversation1.id);
      expect(conversationIds).toContain(conversation2.id);
    });
  });

  describe('getContextForConversation', () => {
    it('should get entries used in conversation', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      const { tool } = createTestTool(db, 'test-tool');
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      createTestContextLink(db, conversation.id, 'tool', tool.id);
      createTestContextLink(db, conversation.id, 'knowledge', knowledge.id);

      const contexts = conversationRepo.getContextForConversation(conversation.id);

      expect(contexts.length).toBe(2);
      const entryTypes = contexts.map((c) => c.entryType);
      expect(entryTypes).toContain('tool');
      expect(entryTypes).toContain('knowledge');
    });
  });

  describe('search', () => {
    it('should search by title', () => {
      const conversation = createTestConversation(
        db,
        testSessionId,
        testProjectId,
        undefined,
        'Search Test Title'
      );
      createTestConversation(db, testSessionId, testProjectId, undefined, 'Other Title');

      const results = conversationRepo.search('Search Test');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((c) => c.id === conversation.id)).toBe(true);
    });

    it('should search by message content', () => {
      const conversation = createTestConversation(db, testSessionId, testProjectId);
      conversationRepo.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'This is a searchable message about authentication',
      });

      const results = conversationRepo.search('authentication');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((c) => c.id === conversation.id)).toBe(true);
    });

    it('should search with filters', () => {
      const conversation = createTestConversation(
        db,
        testSessionId,
        testProjectId,
        'agent-1',
        'Filtered Title'
      );
      createTestConversation(db, testSessionId, testProjectId, 'agent-2', 'Other Title');

      const results = conversationRepo.search('Title', { agentId: 'agent-1' });

      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach((c) => {
        expect(c.agentId).toBe('agent-1');
      });
    });
  });
});







