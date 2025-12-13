import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestProject,
  createTestSession,
  createTestConversation,
  createTestMessage,
  createTestKnowledge,
  createTestTool,
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-conversations.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { conversationHandlers } from '../../src/mcp/handlers/conversations.handler.js';

describe('Conversations Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('memory_conversation_start', () => {
    it('should start new conversation', () => {
      const project = createTestProject(db);
      const result = conversationHandlers.start({
        projectId: project.id,
        agentId: 'agent-1',
        title: 'Test Conversation',
      });

      expect(result.success).toBe(true);
      expect(result.conversation).toBeDefined();
      expect(result.conversation.title).toBe('Test Conversation');
      expect(result.conversation.status).toBe('active');
    });

    it('should require sessionId or projectId', () => {
      expect(() => {
        conversationHandlers.start({ agentId: 'agent-1' });
      }).toThrow(/sessionId or projectId.*required/i);
    });
  });

  describe('memory_conversation_add_message', () => {
    it('should add message', () => {
      const project = createTestProject(db);
      const { conversation } = conversationHandlers.start({
        projectId: project.id,
        agentId: 'agent-1',
      });

      const result = conversationHandlers.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello, world!',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message.content).toBe('Hello, world!');
      expect(result.message.role).toBe('user');
    });

    it('should add message with context', () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const { conversation } = conversationHandlers.start({
        projectId: project.id,
        agentId: 'agent-1',
      });

      const result = conversationHandlers.addMessage({
        conversationId: conversation.id,
        role: 'agent',
        content: 'Response',
        contextEntries: [{ type: 'knowledge', id: knowledge.id }],
        toolsUsed: ['memory_query'],
      });

      expect(result.success).toBe(true);
      expect(result.message.contextEntries).toBeDefined();
      expect(result.message.toolsUsed).toContain('memory_query');
    });

    it('should require conversationId', () => {
      expect(() => {
        conversationHandlers.addMessage({ role: 'user', content: 'Hello' });
      }).toThrow(/conversationId.*required/i);
    });

    it('should require role', () => {
      const project = createTestProject(db);
      const { conversation } = conversationHandlers.start({ projectId: project.id });

      expect(() => {
        conversationHandlers.addMessage({ conversationId: conversation.id, content: 'Hello' });
      }).toThrow(/role.*required/i);
    });

    it('should require content', () => {
      const project = createTestProject(db);
      const { conversation } = conversationHandlers.start({ projectId: project.id });

      expect(() => {
        conversationHandlers.addMessage({ conversationId: conversation.id, role: 'user' });
      }).toThrow(/content.*required/i);
    });
  });

  describe('memory_conversation_get', () => {
    it('should get conversation', () => {
      const project = createTestProject(db);
      const { conversation: created } = conversationHandlers.start({
        projectId: project.id,
        title: 'Get Test',
      });

      const result = conversationHandlers.get({ id: created.id });

      expect(result.success).toBe(true);
      expect(result.conversation.id).toBe(created.id);
      expect(result.conversation.title).toBe('Get Test');
    });

    it('should get with messages', () => {
      const project = createTestProject(db);
      const { conversation } = conversationHandlers.start({ projectId: project.id });
      conversationHandlers.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Message 1',
      });

      const result = conversationHandlers.get({ id: conversation.id, includeMessages: true });

      expect(result.conversation.messages).toBeDefined();
      expect(result.conversation.messages?.length).toBe(1);
    });

    it('should get with context', () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const { conversation } = conversationHandlers.start({ projectId: project.id });
      conversationHandlers.linkContext({
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      const result = conversationHandlers.get({ id: conversation.id, includeContext: true });

      expect(result.conversation.context).toBeDefined();
      expect(result.conversation.context?.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw error for non-existent conversation', () => {
      expect(() => {
        conversationHandlers.get({ id: 'non-existent-id' });
      }).toThrow(/not found/i);
    });
  });

  describe('memory_conversation_list', () => {
    it('should list conversations', () => {
      const project = createTestProject(db);
      conversationHandlers.start({ projectId: project.id, title: 'Conv 1' });
      conversationHandlers.start({ projectId: project.id, title: 'Conv 2' });

      const result = conversationHandlers.list({ projectId: project.id });

      expect(result.success).toBe(true);
      expect(result.conversations.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by status', () => {
      const project = createTestProject(db);
      const { conversation } = conversationHandlers.start({ projectId: project.id });
      conversationHandlers.update({ id: conversation.id, status: 'completed' });

      const active = conversationHandlers.list({ projectId: project.id, status: 'active' });
      const completed = conversationHandlers.list({ projectId: project.id, status: 'completed' });

      expect(completed.conversations.some((c) => c.id === conversation.id)).toBe(true);
    });
  });

  describe('memory_conversation_update', () => {
    it('should update conversation', () => {
      const project = createTestProject(db);
      const { conversation } = conversationHandlers.start({
        projectId: project.id,
        title: 'Original Title',
      });

      const result = conversationHandlers.update({
        id: conversation.id,
        title: 'Updated Title',
      });

      expect(result.success).toBe(true);
      expect(result.conversation.title).toBe('Updated Title');
    });

    it('should require id', () => {
      expect(() => {
        conversationHandlers.update({ title: 'New Title' });
      }).toThrow(/id.*required/i);
    });
  });

  describe('memory_conversation_link_context', () => {
    it('should link entry', () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const { conversation } = conversationHandlers.start({ projectId: project.id });

      const result = conversationHandlers.linkContext({
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
        relevanceScore: 0.95,
      });

      expect(result.success).toBe(true);
      expect(result.context.entryType).toBe('knowledge');
      expect(result.context.entryId).toBe(knowledge.id);
    });

    it('should require conversationId', () => {
      expect(() => {
        conversationHandlers.linkContext({ entryType: 'knowledge', entryId: 'test-id' });
      }).toThrow(/conversationId.*required/i);
    });
  });

  describe('memory_conversation_get_context', () => {
    it('should get context for entry', () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const { conversation } = conversationHandlers.start({ projectId: project.id });
      conversationHandlers.linkContext({
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      const result = conversationHandlers.getContext({
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      expect(result.success).toBe(true);
      expect(result.contexts.length).toBeGreaterThanOrEqual(1);
      expect(result.contexts[0].entryId).toBe(knowledge.id);
    });

    it('should get context for conversation', () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const { conversation } = conversationHandlers.start({ projectId: project.id });
      conversationHandlers.linkContext({
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      const result = conversationHandlers.getContext({
        conversationId: conversation.id,
      });

      expect(result.success).toBe(true);
      expect(result.contexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('memory_conversation_search', () => {
    it('should search conversations', () => {
      const project = createTestProject(db);
      const { conversation } = conversationHandlers.start({
        projectId: project.id,
        title: 'Searchable Title',
      });
      conversationHandlers.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'This is about authentication',
      });

      const result = conversationHandlers.search({
        search: 'authentication',
        projectId: project.id,
      });

      expect(result.success).toBe(true);
      expect(result.conversations.length).toBeGreaterThanOrEqual(1);
    });

    it('should require search query', () => {
      expect(() => {
        conversationHandlers.search({});
      }).toThrow(/search.*required/i);
    });
  });

  describe('memory_conversation_end', () => {
    it('should end conversation', () => {
      const project = createTestProject(db);
      const { conversation } = conversationHandlers.start({ projectId: project.id });

      const result = conversationHandlers.end({ id: conversation.id });

      expect(result.success).toBe(true);
      expect(result.conversation.status).toBe('completed');
      expect(result.conversation.endedAt).toBeDefined();
    });

    it('should generate summary if requested', () => {
      const project = createTestProject(db);
      const { conversation } = conversationHandlers.start({ projectId: project.id });
      conversationHandlers.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello',
      });

      const result = conversationHandlers.end({
        id: conversation.id,
        generateSummary: true,
      });

      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('Conversation');
    });
  });

  describe('memory_conversation_archive', () => {
    it('should archive conversation', () => {
      const project = createTestProject(db);
      const { conversation } = conversationHandlers.start({ projectId: project.id });

      const result = conversationHandlers.archive({ id: conversation.id });

      expect(result.success).toBe(true);
      expect(result.conversation.status).toBe('archived');
    });
  });
});

