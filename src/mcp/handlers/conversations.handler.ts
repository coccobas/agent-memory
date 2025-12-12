/**
 * Conversation handlers
 */

import { conversationRepo } from '../../db/repositories/conversations.js';
import { checkPermission } from '../../services/permission.service.js';
import { logAction } from '../../services/audit.service.js';
import { generateConversationSummary } from '../../services/conversation.service.js';
import { createValidationError, createNotFoundError, createPermissionError } from '../errors.js';
import type { ConversationContext } from '../../db/schema.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isBoolean,
  isNumber,
  isObject,
  isArray,
  isConversationRole,
  isConversationStatus,
  isEntryType,
} from '../../utils/type-guards.js';
import type { PermissionEntryType } from '../../db/schema.js';

export const conversationHandlers = {
  start(params: Record<string, unknown>) {
    const sessionId = getOptionalParam(params, 'sessionId', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);
    const title = getOptionalParam(params, 'title', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

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
    const conversationId = getRequiredParam(params, 'conversationId', isString);
    const role = getRequiredParam(params, 'role', isConversationRole);
    const content = getRequiredParam(params, 'content', isString);
    const contextEntriesParam = getOptionalParam(params, 'contextEntries', isArray);
    const toolsUsedParam = getOptionalParam(params, 'toolsUsed', isArray);
    const metadata = getOptionalParam(params, 'metadata', isObject);
    const agentId = getOptionalParam(params, 'agentId', isString);

    // Validate contextEntries structure
    const contextEntries: Array<{ type: PermissionEntryType; id: string }> | undefined =
      contextEntriesParam
        ? contextEntriesParam.map((entry) => {
            if (!isObject(entry)) {
              throw createValidationError(
                'contextEntries',
                'each entry must be an object',
                'Context entries must have type and id properties'
              );
            }
            const entryObj = entry as Record<string, unknown>;
            const type = isEntryType(entryObj.type)
              ? (entryObj.type as PermissionEntryType)
              : (() => {
                  throw createValidationError(
                    'contextEntries[].type',
                    'must be a valid entry type',
                    "Specify 'tool', 'guideline', or 'knowledge'"
                  );
                })();
            const id = isString(entryObj.id)
              ? entryObj.id
              : (() => {
                  throw createValidationError(
                    'contextEntries[].id',
                    'must be a string',
                    'Provide the entry ID'
                  );
                })();
            return { type, id };
          })
        : undefined;

    // Validate toolsUsed structure
    const toolsUsed: string[] | undefined = toolsUsedParam
      ? toolsUsedParam.map((tool, index) => {
          if (!isString(tool)) {
            throw createValidationError(
              'toolsUsed',
              `element at index ${index} must be a string`,
              'All tool names must be strings'
            );
          }
          return tool;
        })
      : undefined;

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
    const id = getRequiredParam(params, 'id', isString);
    const includeMessages = getOptionalParam(params, 'includeMessages', isBoolean);
    const includeContext = getOptionalParam(params, 'includeContext', isBoolean);
    const agentId = getOptionalParam(params, 'agentId', isString);

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
    const sessionId = getOptionalParam(params, 'sessionId', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);
    const filterAgentId = getOptionalParam(params, 'agentId', isString);
    const status = getOptionalParam(params, 'status', isConversationStatus);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);
    // Note: agentId in ConversationListParams is for filtering, permission check uses filterAgentId
    const agentId = filterAgentId;

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
    const id = getRequiredParam(params, 'id', isString);
    const title = getOptionalParam(params, 'title', isString);
    const status = getOptionalParam(params, 'status', isConversationStatus);
    const metadata = getOptionalParam(params, 'metadata', isObject);
    const agentId = getOptionalParam(params, 'agentId', isString);

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
    const conversationId = getRequiredParam(params, 'conversationId', isString);
    const messageId = getOptionalParam(params, 'messageId', isString);
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);
    const relevanceScore = getOptionalParam(params, 'relevanceScore', isNumber);
    const agentId = getOptionalParam(params, 'agentId', isString);

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
    const conversationId = getOptionalParam(params, 'conversationId', isString);
    const entryType = getOptionalParam(params, 'entryType', isEntryType);
    const entryId = getOptionalParam(params, 'entryId', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

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
    const searchQuery = getRequiredParam(params, 'search', isString);
    const sessionId = getOptionalParam(params, 'sessionId', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);
    const filterAgentId = getOptionalParam(params, 'agentId', isString);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);
    // Note: agentId in ConversationSearchParams is for filtering, permission check uses filterAgentId
    const agentId = filterAgentId;

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
    const id = getRequiredParam(params, 'id', isString);
    const generateSummary = getOptionalParam(params, 'generateSummary', isBoolean);
    const agentId = getOptionalParam(params, 'agentId', isString);

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
    const id = getRequiredParam(params, 'id', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

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
