/**
 * Conversation handlers
 */

import { conversationRepo } from '../../db/repositories/conversations.js';
import { checkPermission } from '../../services/permission.service.js';
import { logAction } from '../../services/audit.service.js';
import { generateConversationSummary } from '../../services/conversation.service.js';
import { createValidationError, createNotFoundError, createPermissionError } from '../errors.js';
import type {
  ConversationStartParams,
  ConversationAddMessageParams,
  ConversationGetParams,
  ConversationListParams,
  ConversationUpdateParams,
  ConversationLinkContextParams,
  ConversationGetContextParams,
  ConversationSearchParams,
  ConversationEndParams,
  ConversationArchiveParams,
} from '../types.js';
import type { ConversationContext } from '../../db/schema.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export const conversationHandlers = {
  start(params: Record<string, unknown>) {
    const { sessionId, projectId, agentId, title, metadata } = cast<
      ConversationStartParams & { agentId?: string }
    >(params);

    if (!sessionId && !projectId) {
      throw createValidationError(
        'sessionId or projectId',
        'is required',
        'Provide either a sessionId or projectId to start a conversation'
      );
    }

    // Check permission (write required for create)
    if (agentId) {
      const scopeType = sessionId ? 'session' : 'project';
      const scopeId = sessionId || projectId || null;
      if (!checkPermission(agentId, 'write', 'knowledge', null, scopeType, scopeId)) {
        throw createPermissionError('write', 'conversation');
      }
    }

    const conversation = conversationRepo.create({
      sessionId,
      projectId,
      agentId,
      title,
      metadata,
    });

    // Log audit event
    logAction({
      agentId,
      action: 'create',
      entryType: 'knowledge', // Conversations are tracked as knowledge-type entries
      entryId: conversation.id,
      scopeType: sessionId ? 'session' : 'project',
      scopeId: sessionId || projectId || null,
    });

    return {
      success: true,
      conversation,
    };
  },

  addMessage(params: Record<string, unknown>) {
    const { conversationId, role, content, contextEntries, toolsUsed, metadata, agentId } =
      cast<ConversationAddMessageParams>(params);

    if (!conversationId) {
      throw createValidationError(
        'conversationId',
        'is required',
        'Provide the ID of the conversation to add a message to'
      );
    }
    if (!role) {
      throw createValidationError('role', 'is required', "Specify 'user', 'agent', or 'system'");
    }
    if (!content) {
      throw createValidationError('content', 'is required', 'Provide the message content');
    }

    // Check conversation exists and is active
    const conversation = conversationRepo.getById(conversationId);
    if (!conversation) {
      throw createNotFoundError('Conversation', conversationId);
    }
    if (conversation.status !== 'active') {
      throw createValidationError(
        'conversation',
        `cannot add messages to ${conversation.status} conversation`,
        'Only active conversations can receive new messages'
      );
    }

    // Check permission (write required)
    if (agentId) {
      const scopeType = conversation.sessionId ? 'session' : 'project';
      const scopeId = conversation.sessionId || conversation.projectId || null;
      if (!checkPermission(agentId, 'write', 'knowledge', null, scopeType, scopeId)) {
        throw createPermissionError('write', 'conversation');
      }
    }

    const message = conversationRepo.addMessage({
      conversationId,
      role,
      content,
      contextEntries,
      toolsUsed,
      metadata,
    });

    // Log audit event
    logAction({
      agentId,
      action: 'update',
      entryType: 'knowledge',
      entryId: conversationId,
      scopeType: conversation.sessionId ? 'session' : 'project',
      scopeId: conversation.sessionId || conversation.projectId || null,
    });

    return {
      success: true,
      message,
    };
  },

  get(params: Record<string, unknown>) {
    const { id, includeMessages, includeContext, agentId } = cast<ConversationGetParams>(params);

    if (!id) {
      throw createValidationError('id', 'is required', 'Provide the conversation ID');
    }

    const conversation = conversationRepo.getById(id, includeMessages, includeContext);
    if (!conversation) {
      throw createNotFoundError('Conversation', id);
    }

    // Check permission (read required)
    if (agentId) {
      const scopeType = conversation.sessionId ? 'session' : 'project';
      const scopeId = conversation.sessionId || conversation.projectId || null;
      if (!checkPermission(agentId, 'read', 'knowledge', null, scopeType, scopeId)) {
        throw createPermissionError('read', 'conversation');
      }
    }

    // Log audit event
    logAction({
      agentId,
      action: 'read',
      entryType: 'knowledge',
      entryId: id,
      scopeType: conversation.sessionId ? 'session' : 'project',
      scopeId: conversation.sessionId || conversation.projectId || null,
    });

    return {
      success: true,
      conversation,
    };
  },

  list(params: Record<string, unknown>) {
    const {
      sessionId,
      projectId,
      agentId: filterAgentId,
      status,
      limit,
      offset,
      agentId, // For permission check
    } = cast<ConversationListParams & { agentId?: string }>(params);

    // Check permission (read required)
    if (agentId) {
      const scopeType = sessionId ? 'session' : projectId ? 'project' : 'global';
      const scopeId = sessionId || projectId || null;
      if (!checkPermission(agentId, 'read', 'knowledge', null, scopeType, scopeId)) {
        throw createPermissionError('read', 'conversation');
      }
    }

    const conversations = conversationRepo.list(
      {
        sessionId,
        projectId,
        agentId: filterAgentId,
        status,
      },
      { limit, offset }
    );

    // Log audit event
    logAction({
      agentId,
      action: 'read',
      entryType: 'knowledge',
      scopeType: sessionId ? 'session' : projectId ? 'project' : 'global',
      scopeId: sessionId || projectId || null,
      resultCount: conversations.length,
    });

    return {
      success: true,
      conversations,
      meta: {
        totalCount: conversations.length,
        returnedCount: conversations.length,
        truncated: false,
        hasMore: false,
      },
    };
  },

  update(params: Record<string, unknown>) {
    const { id, title, status, metadata, agentId } = cast<ConversationUpdateParams>(params);

    if (!id) {
      throw createValidationError('id', 'is required', 'Provide the conversation ID');
    }

    if (title === undefined && status === undefined && metadata === undefined) {
      throw createValidationError(
        'updates',
        'at least one field (title, status, metadata) is required',
        'Provide at least one field to update'
      );
    }

    // Check conversation exists
    const existing = conversationRepo.getById(id);
    if (!existing) {
      throw createNotFoundError('Conversation', id);
    }

    // Check permission (write required)
    if (agentId) {
      const scopeType = existing.sessionId ? 'session' : 'project';
      const scopeId = existing.sessionId || existing.projectId || null;
      if (!checkPermission(agentId, 'write', 'knowledge', null, scopeType, scopeId)) {
        throw createPermissionError('write', 'conversation');
      }
    }

    const conversation = conversationRepo.update(id, {
      title,
      status,
      metadata,
    });

    if (!conversation) {
      throw createNotFoundError('Conversation', id);
    }

    // Log audit event
    logAction({
      agentId,
      action: 'update',
      entryType: 'knowledge',
      entryId: id,
      scopeType: conversation.sessionId ? 'session' : 'project',
      scopeId: conversation.sessionId || conversation.projectId || null,
    });

    return {
      success: true,
      conversation,
    };
  },

  linkContext(params: Record<string, unknown>) {
    const { conversationId, messageId, entryType, entryId, relevanceScore, agentId } =
      cast<ConversationLinkContextParams>(params);

    if (!conversationId) {
      throw createValidationError('conversationId', 'is required', 'Provide the conversation ID');
    }
    if (!entryType) {
      throw createValidationError(
        'entryType',
        'is required',
        "Specify 'tool', 'guideline', or 'knowledge'"
      );
    }
    if (!entryId) {
      throw createValidationError('entryId', 'is required', 'Provide the entry ID');
    }

    // Check conversation exists
    const conversation = conversationRepo.getById(conversationId);
    if (!conversation) {
      throw createNotFoundError('Conversation', conversationId);
    }

    // Check permission (read required for entry, write for conversation)
    if (agentId) {
      const scopeType = conversation.sessionId ? 'session' : 'project';
      const scopeId = conversation.sessionId || conversation.projectId || null;
      if (!checkPermission(agentId, 'read', entryType, entryId, scopeType, scopeId)) {
        throw createPermissionError('read', entryType);
      }
      if (!checkPermission(agentId, 'write', 'knowledge', null, scopeType, scopeId)) {
        throw createPermissionError('write', 'conversation');
      }
    }

    const context = conversationRepo.linkContext({
      conversationId,
      messageId,
      entryType,
      entryId,
      relevanceScore,
    });

    // Log audit event
    logAction({
      agentId,
      action: 'update',
      entryType: 'knowledge',
      entryId: conversationId,
      scopeType: conversation.sessionId ? 'session' : 'project',
      scopeId: conversation.sessionId || conversation.projectId || null,
    });

    return {
      success: true,
      context,
    };
  },

  getContext(params: Record<string, unknown>) {
    const { conversationId, entryType, entryId, agentId } =
      cast<ConversationGetContextParams>(params);

    if (!conversationId && (!entryType || !entryId)) {
      throw createValidationError(
        'params',
        'either conversationId OR (entryType and entryId) is required',
        'Provide conversationId to get context for a conversation, or entryType+entryId to get conversations using an entry'
      );
    }

    let contexts: ConversationContext[];

    if (conversationId) {
      // Get context for conversation
      const conversation = conversationRepo.getById(conversationId);
      if (!conversation) {
        throw createNotFoundError('Conversation', conversationId);
      }

      // Check permission (read required)
      if (agentId) {
        const scopeType = conversation.sessionId ? 'session' : 'project';
        const scopeId = conversation.sessionId || conversation.projectId || null;
        if (!checkPermission(agentId, 'read', 'knowledge', null, scopeType, scopeId)) {
          throw createPermissionError('read', 'conversation');
        }
      }

      contexts = conversationRepo.getContextForConversation(conversationId);
    } else {
      // Get context for entry
      if (!entryType || !entryId) {
        throw createValidationError(
          'entryType and entryId',
          'are required when conversationId is not provided',
          'Provide both entryType and entryId to get conversations using an entry'
        );
      }

      // Check permission (read required)
      if (agentId && !checkPermission(agentId, 'read', entryType, entryId, 'global', null)) {
        throw createPermissionError('read', entryType);
      }

      contexts = conversationRepo.getContextForEntry(entryType, entryId);
    }

    // Log audit event
    logAction({
      agentId,
      action: 'read',
      entryType: conversationId ? 'knowledge' : entryType || undefined,
      entryId: conversationId || entryId || undefined,
      resultCount: contexts.length,
    });

    return {
      success: true,
      contexts,
    };
  },

  search(params: Record<string, unknown>) {
    const {
      search: searchQuery,
      sessionId,
      projectId,
      agentId: filterAgentId,
      limit,
      offset,
      agentId,
    } = cast<ConversationSearchParams & { agentId?: string }>(params);

    if (!searchQuery) {
      throw createValidationError('search', 'is required', 'Provide a search query string');
    }

    // Check permission (read required)
    if (agentId) {
      const scopeType = sessionId ? 'session' : projectId ? 'project' : 'global';
      const scopeId = sessionId || projectId || null;
      if (!checkPermission(agentId, 'read', 'knowledge', null, scopeType, scopeId)) {
        throw createPermissionError('read', 'conversation');
      }
    }

    const results = conversationRepo.search(searchQuery, {
      sessionId,
      projectId,
      agentId: filterAgentId,
      limit,
      offset,
    });

    // Log audit event
    logAction({
      agentId,
      action: 'query',
      entryType: 'knowledge',
      scopeType: sessionId ? 'session' : projectId ? 'project' : 'global',
      scopeId: sessionId || projectId || null,
      queryParams: { search: searchQuery },
      resultCount: results.length,
    });

    return {
      success: true,
      conversations: results,
      meta: {
        totalCount: results.length,
        returnedCount: results.length,
        truncated: false,
        hasMore: false,
      },
    };
  },

  end(params: Record<string, unknown>) {
    const { id, generateSummary, agentId } = cast<ConversationEndParams>(params);

    if (!id) {
      throw createValidationError('id', 'is required', 'Provide the conversation ID');
    }

    // Check conversation exists
    const existing = conversationRepo.getById(id);
    if (!existing) {
      throw createNotFoundError('Conversation', id);
    }

    // Check permission (write required)
    if (agentId) {
      const scopeType = existing.sessionId ? 'session' : 'project';
      const scopeId = existing.sessionId || existing.projectId || null;
      if (!checkPermission(agentId, 'write', 'knowledge', null, scopeType, scopeId)) {
        throw createPermissionError('write', 'conversation');
      }
    }

    const conversation = conversationRepo.update(id, {
      status: 'completed',
    });

    if (!conversation) {
      throw createNotFoundError('Conversation', id);
    }

    // Generate summary if requested
    let summary: string | undefined;
    if (generateSummary) {
      summary = generateConversationSummary(id);
    }

    // Log audit event
    logAction({
      agentId,
      action: 'update',
      entryType: 'knowledge',
      entryId: id,
      scopeType: conversation.sessionId ? 'session' : 'project',
      scopeId: conversation.sessionId || conversation.projectId || null,
    });

    return {
      success: true,
      conversation,
      summary,
    };
  },

  archive(params: Record<string, unknown>) {
    const { id, agentId } = cast<ConversationArchiveParams>(params);

    if (!id) {
      throw createValidationError('id', 'is required', 'Provide the conversation ID');
    }

    // Check conversation exists
    const existing = conversationRepo.getById(id);
    if (!existing) {
      throw createNotFoundError('Conversation', id);
    }

    // Check permission (write required)
    if (agentId) {
      const scopeType = existing.sessionId ? 'session' : 'project';
      const scopeId = existing.sessionId || existing.projectId || null;
      if (!checkPermission(agentId, 'write', 'knowledge', null, scopeType, scopeId)) {
        throw createPermissionError('write', 'conversation');
      }
    }

    const conversation = conversationRepo.update(id, {
      status: 'archived',
    });

    if (!conversation) {
      throw createNotFoundError('Conversation', id);
    }

    // Log audit event
    logAction({
      agentId,
      action: 'update',
      entryType: 'knowledge',
      entryId: id,
      scopeType: conversation.sessionId ? 'session' : 'project',
      scopeId: conversation.sessionId || conversation.projectId || null,
    });

    return {
      success: true,
      conversation,
    };
  },
};

