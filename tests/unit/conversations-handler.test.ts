import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conversationHandlers } from '../../src/mcp/handlers/conversations.handler.js';
import * as auditService from '../../src/services/audit.service.js';
import * as permissionsHelper from '../../src/mcp/helpers/permissions.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/audit.service.js');
vi.mock('../../src/mcp/helpers/permissions.js');
vi.mock('../../src/services/capture/index.js', () => ({
  getCaptureService: () => null,
}));
vi.mock('../../src/services/conversation.service.js', () => ({
  createConversationService: () => ({
    generateConversationSummary: vi.fn().mockResolvedValue('Test summary'),
  }),
}));

describe('Conversations Handler', () => {
  let mockContext: AppContext;
  let mockConversationsRepo: {
    create: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    addMessage: ReturnType<typeof vi.fn>;
    linkContext: ReturnType<typeof vi.fn>;
    getContextForConversation: ReturnType<typeof vi.fn>;
    getContextForEntry: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auditService.logAction).mockReturnValue(undefined);
    vi.mocked(permissionsHelper.requirePermission).mockReturnValue(undefined);
    mockConversationsRepo = {
      create: vi.fn(),
      getById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      addMessage: vi.fn(),
      linkContext: vi.fn(),
      getContextForConversation: vi.fn(),
      getContextForEntry: vi.fn(),
      search: vi.fn(),
    };
    mockContext = {
      db: {} as any,
      repos: {
        conversations: mockConversationsRepo,
      } as any,
      services: {
        permission: {},
      } as any,
    };
  });

  describe('start', () => {
    it('should start a conversation with sessionId', async () => {
      const mockConversation = { id: 'conv-1', sessionId: 'sess-1', status: 'active' };
      mockConversationsRepo.create.mockResolvedValue(mockConversation);

      const result = await conversationHandlers.start(mockContext, {
        sessionId: 'sess-1',
        agentId: 'agent-1',
        title: 'Test Conversation',
      });

      expect(result.success).toBe(true);
      expect(result.conversation).toEqual(mockConversation);
    });

    it('should start a conversation with projectId', async () => {
      mockConversationsRepo.create.mockResolvedValue({ id: 'conv-1' });

      await conversationHandlers.start(mockContext, {
        projectId: 'proj-1',
        agentId: 'agent-1',
      });

      expect(mockConversationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-1' })
      );
    });

    it('should throw when neither sessionId nor projectId provided', async () => {
      await expect(
        conversationHandlers.start(mockContext, { agentId: 'agent-1' })
      ).rejects.toThrow();
    });

    it('should throw when agentId is missing', async () => {
      await expect(
        conversationHandlers.start(mockContext, { sessionId: 'sess-1' })
      ).rejects.toThrow();
    });
  });

  describe('addMessage', () => {
    it('should add a message to conversation', async () => {
      const mockMessage = { id: 'msg-1', role: 'user', content: 'Hello' };
      mockConversationsRepo.getById.mockResolvedValue({
        id: 'conv-1',
        status: 'active',
        sessionId: 'sess-1',
      });
      mockConversationsRepo.addMessage.mockResolvedValue(mockMessage);

      const result = await conversationHandlers.addMessage(mockContext, {
        conversationId: 'conv-1',
        agentId: 'agent-1',
        role: 'user',
        content: 'Hello',
      });

      expect(result.success).toBe(true);
      expect(result.message).toEqual(mockMessage);
    });

    it('should throw when conversation not found', async () => {
      mockConversationsRepo.getById.mockResolvedValue(null);

      await expect(
        conversationHandlers.addMessage(mockContext, {
          conversationId: 'nonexistent',
          agentId: 'agent-1',
          role: 'user',
          content: 'Hello',
        })
      ).rejects.toThrow();
    });

    it('should throw when conversation is not active', async () => {
      mockConversationsRepo.getById.mockResolvedValue({
        id: 'conv-1',
        status: 'completed',
      });

      await expect(
        conversationHandlers.addMessage(mockContext, {
          conversationId: 'conv-1',
          agentId: 'agent-1',
          role: 'user',
          content: 'Hello',
        })
      ).rejects.toThrow('cannot add messages');
    });

    it('should validate contextEntries structure', async () => {
      mockConversationsRepo.getById.mockResolvedValue({ id: 'conv-1', status: 'active' });

      await expect(
        conversationHandlers.addMessage(mockContext, {
          conversationId: 'conv-1',
          agentId: 'agent-1',
          role: 'user',
          content: 'Hello',
          contextEntries: ['invalid'],
        })
      ).rejects.toThrow();
    });

    it('should validate toolsUsed structure', async () => {
      mockConversationsRepo.getById.mockResolvedValue({ id: 'conv-1', status: 'active' });

      await expect(
        conversationHandlers.addMessage(mockContext, {
          conversationId: 'conv-1',
          agentId: 'agent-1',
          role: 'user',
          content: 'Hello',
          toolsUsed: [123],
        })
      ).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should get a conversation', async () => {
      const mockConversation = { id: 'conv-1', title: 'Test' };
      mockConversationsRepo.getById.mockResolvedValue(mockConversation);

      const result = await conversationHandlers.get(mockContext, {
        id: 'conv-1',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.conversation).toEqual(mockConversation);
    });

    it('should throw when conversation not found', async () => {
      mockConversationsRepo.getById.mockResolvedValue(null);

      await expect(
        conversationHandlers.get(mockContext, { id: 'nonexistent' })
      ).rejects.toThrow();
    });

    it('should pass include options', async () => {
      mockConversationsRepo.getById.mockResolvedValue({ id: 'conv-1' });

      await conversationHandlers.get(mockContext, {
        id: 'conv-1',
        includeMessages: true,
        includeContext: true,
      });

      expect(mockConversationsRepo.getById).toHaveBeenCalledWith('conv-1', true, true);
    });
  });

  describe('list', () => {
    it('should list conversations', async () => {
      const mockConversations = [
        { id: 'conv-1', title: 'Conv 1' },
        { id: 'conv-2', title: 'Conv 2' },
      ];
      mockConversationsRepo.list.mockResolvedValue(mockConversations);

      const result = await conversationHandlers.list(mockContext, { agentId: 'agent-1' });

      expect(result.success).toBe(true);
      expect(result.conversations).toEqual(mockConversations);
    });

    it('should filter by sessionId', async () => {
      mockConversationsRepo.list.mockResolvedValue([]);

      await conversationHandlers.list(mockContext, {
        sessionId: 'sess-1',
        agentId: 'agent-1',
      });

      expect(mockConversationsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'sess-1' }),
        expect.anything()
      );
    });

    it('should filter by status', async () => {
      mockConversationsRepo.list.mockResolvedValue([]);

      await conversationHandlers.list(mockContext, {
        status: 'active',
        agentId: 'agent-1',
      });

      expect(mockConversationsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
        expect.anything()
      );
    });
  });

  describe('update', () => {
    it('should update a conversation', async () => {
      const updatedConversation = { id: 'conv-1', title: 'Updated Title' };
      mockConversationsRepo.getById.mockResolvedValue({ id: 'conv-1' });
      mockConversationsRepo.update.mockResolvedValue(updatedConversation);

      const result = await conversationHandlers.update(mockContext, {
        id: 'conv-1',
        agentId: 'agent-1',
        title: 'Updated Title',
      });

      expect(result.success).toBe(true);
      expect(result.conversation.title).toBe('Updated Title');
    });

    it('should throw when no update fields provided', async () => {
      await expect(
        conversationHandlers.update(mockContext, {
          id: 'conv-1',
          agentId: 'agent-1',
        })
      ).rejects.toThrow('at least one field');
    });

    it('should throw when conversation not found', async () => {
      mockConversationsRepo.getById.mockResolvedValue(null);

      await expect(
        conversationHandlers.update(mockContext, {
          id: 'nonexistent',
          agentId: 'agent-1',
          title: 'New Title',
        })
      ).rejects.toThrow();
    });
  });

  describe('end', () => {
    it('should end a conversation', async () => {
      mockConversationsRepo.getById.mockResolvedValue({ id: 'conv-1', status: 'active' });
      mockConversationsRepo.update.mockResolvedValue({ id: 'conv-1', status: 'completed' });

      const result = await conversationHandlers.end(mockContext, {
        id: 'conv-1',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.conversation.status).toBe('completed');
    });

    it('should generate summary if requested', async () => {
      mockConversationsRepo.getById.mockResolvedValue({ id: 'conv-1' });
      mockConversationsRepo.update.mockResolvedValue({ id: 'conv-1', status: 'completed' });

      const result = await conversationHandlers.end(mockContext, {
        id: 'conv-1',
        agentId: 'agent-1',
        generateSummary: true,
      });

      expect(result.summary).toBe('Test summary');
    });
  });

  describe('archive', () => {
    it('should archive a conversation', async () => {
      mockConversationsRepo.getById.mockResolvedValue({ id: 'conv-1' });
      mockConversationsRepo.update.mockResolvedValue({ id: 'conv-1', status: 'archived' });

      const result = await conversationHandlers.archive(mockContext, {
        id: 'conv-1',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.conversation.status).toBe('archived');
    });
  });

  describe('search', () => {
    it('should search conversations', async () => {
      const mockResults = [{ id: 'conv-1', title: 'Matching' }];
      mockConversationsRepo.search.mockResolvedValue(mockResults);

      const result = await conversationHandlers.search(mockContext, {
        search: 'test query',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.conversations).toEqual(mockResults);
    });

    it('should pass filter options', async () => {
      mockConversationsRepo.search.mockResolvedValue([]);

      await conversationHandlers.search(mockContext, {
        search: 'query',
        sessionId: 'sess-1',
        projectId: 'proj-1',
        limit: 10,
        offset: 5,
        agentId: 'agent-1',
      });

      expect(mockConversationsRepo.search).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          sessionId: 'sess-1',
          projectId: 'proj-1',
          limit: 10,
          offset: 5,
        })
      );
    });
  });

  describe('linkContext', () => {
    it('should link context to conversation', async () => {
      const mockLinkedContext = { conversationId: 'conv-1', entryType: 'knowledge', entryId: 'k-1' };
      mockConversationsRepo.getById.mockResolvedValue({ id: 'conv-1' });
      mockConversationsRepo.linkContext.mockResolvedValue(mockLinkedContext);

      const result = await conversationHandlers.linkContext(mockContext, {
        conversationId: 'conv-1',
        entryType: 'knowledge',
        entryId: 'k-1',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.context).toEqual(mockLinkedContext);
    });

    it('should pass relevance score', async () => {
      mockConversationsRepo.getById.mockResolvedValue({ id: 'conv-1' });
      mockConversationsRepo.linkContext.mockResolvedValue({});

      await conversationHandlers.linkContext(mockContext, {
        conversationId: 'conv-1',
        entryType: 'guideline',
        entryId: 'g-1',
        relevanceScore: 0.95,
        agentId: 'agent-1',
      });

      expect(mockConversationsRepo.linkContext).toHaveBeenCalledWith(
        expect.objectContaining({ relevanceScore: 0.95 })
      );
    });
  });

  describe('getContext', () => {
    it('should get context for conversation', async () => {
      const mockContexts = [{ entryType: 'knowledge', entryId: 'k-1' }];
      mockConversationsRepo.getById.mockResolvedValue({ id: 'conv-1' });
      mockConversationsRepo.getContextForConversation.mockResolvedValue(mockContexts);

      const result = await conversationHandlers.getContext(mockContext, {
        conversationId: 'conv-1',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.contexts).toEqual(mockContexts);
    });

    it('should get context for entry', async () => {
      const mockContexts = [{ conversationId: 'conv-1' }];
      mockConversationsRepo.getContextForEntry.mockResolvedValue(mockContexts);

      const result = await conversationHandlers.getContext(mockContext, {
        entryType: 'knowledge',
        entryId: 'k-1',
        agentId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.contexts).toEqual(mockContexts);
    });

    it('should throw when neither conversationId nor entry provided', async () => {
      await expect(
        conversationHandlers.getContext(mockContext, { agentId: 'agent-1' })
      ).rejects.toThrow();
    });
  });
});
