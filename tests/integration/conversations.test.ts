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
  createTestContext,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';

const TEST_DB_PATH = './data/test-conversations.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let ctx: AppContext;

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
  beforeAll(async () => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    ctx = await createTestContext(testDb);
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('memory_conversation_start', () => {
    it('should start new conversation', async () => {
      const project = createTestProject(db);
      const result = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'agent-1',
        title: 'Test Conversation',
      });

      expect(result.success).toBe(true);
      expect(result.conversation).toBeDefined();
      expect(result.conversation.title).toBe('Test Conversation');
      expect(result.conversation.status).toBe('active');
    });

    it('should require sessionId or projectId', async () => {
      await expect(conversationHandlers.start(ctx, { agentId: 'agent-1' })).rejects.toThrow(
        /sessionId or projectId.*required/i
      );
    });
  });

  describe('memory_conversation_add_message', () => {
    it('should add message', async () => {
      const project = createTestProject(db);
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'agent-1',
      });

      const result = await conversationHandlers.addMessage(ctx, {
        agentId: 'test-agent',
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello, world!',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message.content).toBe('Hello, world!');
      expect(result.message.role).toBe('user');
    });

    it('should add message with context', async () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'agent-1',
      });

      const result = await conversationHandlers.addMessage(ctx, {
        agentId: 'test-agent',
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

    it('should require conversationId', async () => {
      await expect(
        conversationHandlers.addMessage(ctx, { role: 'user', content: 'Hello' })
      ).rejects.toThrow(/conversationId.*required/i);
    });

    it('should require role', async () => {
      const project = createTestProject(db);
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });

      await expect(
        conversationHandlers.addMessage(ctx, {
          conversationId: conversation.id,
          content: 'Hello',
          agentId: 'test-agent',
        })
      ).rejects.toThrow(/role.*required/i);
    });

    it('should require content', async () => {
      const project = createTestProject(db);
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });

      await expect(
        conversationHandlers.addMessage(ctx, {
          conversationId: conversation.id,
          role: 'user',
          agentId: 'test-agent',
        })
      ).rejects.toThrow(/content.*required/i);
    });
  });

  describe('memory_conversation_get', () => {
    it('should get conversation', async () => {
      const project = createTestProject(db);
      const { conversation: created } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
        title: 'Get Test',
      });

      const result = await conversationHandlers.get(ctx, { id: created.id });

      expect(result.success).toBe(true);
      expect(result.conversation.id).toBe(created.id);
      expect(result.conversation.title).toBe('Get Test');
    });

    it('should get with messages', async () => {
      const project = createTestProject(db);
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });
      await conversationHandlers.addMessage(ctx, {
        agentId: 'test-agent',
        conversationId: conversation.id,
        role: 'user',
        content: 'Message 1',
      });

      const result = await conversationHandlers.get(ctx, {
        id: conversation.id,
        includeMessages: true,
      });

      expect(result.conversation.messages).toBeDefined();
      expect(result.conversation.messages?.length).toBe(1);
    });

    it('should get with context', async () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });
      await conversationHandlers.linkContext(ctx, {
        agentId: 'test-agent',
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      const result = await conversationHandlers.get(ctx, {
        id: conversation.id,
        includeContext: true,
      });

      expect(result.conversation.context).toBeDefined();
      expect(result.conversation.context?.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw error for non-existent conversation', async () => {
      await expect(conversationHandlers.get(ctx, { id: 'non-existent-id' })).rejects.toThrow(
        /not found/i
      );
    });
  });

  describe('memory_conversation_list', () => {
    it('should list conversations', async () => {
      const project = createTestProject(db);
      await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
        title: 'Conv 1',
      });
      await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
        title: 'Conv 2',
      });

      const result = await conversationHandlers.list(ctx, { projectId: project.id });

      expect(result.success).toBe(true);
      expect(result.conversations.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by status', async () => {
      const project = createTestProject(db);
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });
      await conversationHandlers.update(ctx, {
        agentId: 'test-agent',
        id: conversation.id,
        status: 'completed',
      });

      const active = await conversationHandlers.list(ctx, {
        projectId: project.id,
        status: 'active',
      });
      const completed = await conversationHandlers.list(ctx, {
        projectId: project.id,
        status: 'completed',
      });

      expect(completed.conversations.some((c) => c.id === conversation.id)).toBe(true);
    });
  });

  describe('memory_conversation_update', () => {
    it('should update conversation', async () => {
      const project = createTestProject(db);
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
        title: 'Original Title',
      });

      const result = await conversationHandlers.update(ctx, {
        agentId: 'test-agent',
        id: conversation.id,
        title: 'Updated Title',
      });

      expect(result.success).toBe(true);
      expect(result.conversation.title).toBe('Updated Title');
    });

    it('should require id', async () => {
      await expect(conversationHandlers.update(ctx, { title: 'New Title' })).rejects.toThrow(
        /id.*required/i
      );
    });
  });

  describe('memory_conversation_link_context', () => {
    it('should link entry', async () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });

      const result = await conversationHandlers.linkContext(ctx, {
        agentId: 'test-agent',
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
        relevanceScore: 0.95,
      });

      expect(result.success).toBe(true);
      expect(result.context.entryType).toBe('knowledge');
      expect(result.context.entryId).toBe(knowledge.id);
    });

    it('should require conversationId', async () => {
      await expect(
        conversationHandlers.linkContext(ctx, { entryType: 'knowledge', entryId: 'test-id' })
      ).rejects.toThrow(/conversationId.*required/i);
    });
  });

  describe('memory_conversation_get_context', () => {
    it('should get context for entry', async () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });
      await conversationHandlers.linkContext(ctx, {
        agentId: 'test-agent',
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      const result = await conversationHandlers.getContext(ctx, {
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      expect(result.success).toBe(true);
      expect(result.contexts.length).toBeGreaterThanOrEqual(1);
      expect(result.contexts[0].entryId).toBe(knowledge.id);
    });

    it('should get context for conversation', async () => {
      const project = createTestProject(db);
      const { knowledge } = createTestKnowledge(db, 'Test Knowledge');
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });
      await conversationHandlers.linkContext(ctx, {
        agentId: 'test-agent',
        conversationId: conversation.id,
        entryType: 'knowledge',
        entryId: knowledge.id,
      });

      const result = await conversationHandlers.getContext(ctx, {
        conversationId: conversation.id,
      });

      expect(result.success).toBe(true);
      expect(result.contexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('memory_conversation_search', () => {
    it('should search conversations', async () => {
      const project = createTestProject(db);
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
        title: 'Searchable Title',
      });
      await conversationHandlers.addMessage(ctx, {
        agentId: 'test-agent',
        conversationId: conversation.id,
        role: 'user',
        content: 'This is about authentication',
      });

      const result = await conversationHandlers.search(ctx, {
        search: 'authentication',
        projectId: project.id,
      });

      expect(result.success).toBe(true);
      expect(result.conversations.length).toBeGreaterThanOrEqual(1);
    });

    it('should require search query', async () => {
      await expect(conversationHandlers.search(ctx, {})).rejects.toThrow(/search.*required/i);
    });
  });

  describe('memory_conversation_end', () => {
    it('should end conversation', async () => {
      const project = createTestProject(db);
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });

      const result = await conversationHandlers.end(ctx, {
        agentId: 'test-agent',
        id: conversation.id,
      });

      expect(result.success).toBe(true);
      expect(result.conversation.status).toBe('completed');
      expect(result.conversation.endedAt).toBeDefined();
    });

    it('should generate summary if requested', async () => {
      const project = createTestProject(db);
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });
      await conversationHandlers.addMessage(ctx, {
        agentId: 'test-agent',
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello',
      });

      const result = await conversationHandlers.end(ctx, {
        agentId: 'test-agent',
        id: conversation.id,
        generateSummary: true,
      });

      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('Conversation');
    });
  });

  describe('memory_conversation_archive', () => {
    it('should archive conversation', async () => {
      const project = createTestProject(db);
      const { conversation } = await conversationHandlers.start(ctx, {
        projectId: project.id,
        agentId: 'test-agent',
      });

      const result = await conversationHandlers.archive(ctx, {
        agentId: 'test-agent',
        id: conversation.id,
      });

      expect(result.success).toBe(true);
      expect(result.conversation.status).toBe('archived');
    });
  });
});
