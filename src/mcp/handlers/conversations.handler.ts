/**
 * Conversation handlers
 *
 * Context-aware handlers that receive AppContext for dependency injection.
 */

import type { AppContext } from '../../core/context.js';
import { logAction } from '../../services/audit.service.js';
import { createConversationService } from '../../services/conversation.service.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';
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
import {
  validateTextLength,
  validateArrayLength,
  SIZE_LIMITS,
} from '../../services/validation.service.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import type { PermissionEntryType } from '../../db/schema.js';
import { requirePermission } from '../helpers/permissions.js';
import type { TurnData } from '../../services/capture/index.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('conversations');

export const conversationHandlers = {
  async start(context: AppContext, params: Record<string, unknown>) {
    const sessionId = getOptionalParam(params, 'sessionId', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);
    // Security: agentId required for audit trail on write operations
    const agentId = getRequiredParam(params, 'agentId', isString);
    const title = getOptionalParam(params, 'title', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    // Validate input sizes
    if (title) {
      validateTextLength(title, 'title', SIZE_LIMITS.TITLE_MAX_LENGTH);
    }

    if (!sessionId && !projectId) {
      throw createValidationError(
        'sessionId or projectId',
        'is required',
        'Provide either a sessionId or projectId to start a conversation'
      );
    }

    // Check permission (write required for create)
    const scopeType = sessionId ? 'session' : 'project';
    const scopeId = sessionId || projectId || null;
    requirePermission(
      context.services.permission,
      agentId,
      'write',
      scopeType,
      scopeId,
      'knowledge'
    );

    const conversation = await context.repos.conversations.create({
      sessionId,
      projectId,
      agentId,
      title,
      metadata,
    });

    // Log audit event
    logAction(
      {
        agentId,
        action: 'create',
        entryType: 'knowledge', // Conversations are tracked as knowledge-type entries
        entryId: conversation.id,
        scopeType: sessionId ? 'session' : 'project',
        scopeId: sessionId || projectId || null,
      },
      context.db
    );

    return formatTimestamps({
      success: true,
      conversation,
    });
  },

  async addMessage(context: AppContext, params: Record<string, unknown>) {
    const conversationId = getRequiredParam(params, 'conversationId', isString);
    const role = getRequiredParam(params, 'role', isConversationRole);
    const content = getRequiredParam(params, 'content', isString);
    const contextEntriesParam = getOptionalParam(params, 'contextEntries', isArray);
    const toolsUsedParam = getOptionalParam(params, 'toolsUsed', isArray);
    const metadata = getOptionalParam(params, 'metadata', isObject);
    // Security: agentId required for audit trail on write operations
    const agentId = getRequiredParam(params, 'agentId', isString);

    // Validate input sizes
    validateTextLength(content, 'content', SIZE_LIMITS.CONTENT_MAX_LENGTH);
    if (contextEntriesParam) {
      validateArrayLength(contextEntriesParam, 'contextEntries', 50);
    }
    if (toolsUsedParam) {
      validateArrayLength(toolsUsedParam, 'toolsUsed', 100);
    }

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
            const entryObj = entry;
            const type = isEntryType(entryObj.type)
              ? entryObj.type
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
    const conversation = await context.repos.conversations.getById(conversationId);
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
    const addMsgScopeType = conversation.sessionId ? 'session' : 'project';
    const addMsgScopeId = conversation.sessionId || conversation.projectId || null;
    requirePermission(
      context.services.permission,
      agentId,
      'write',
      addMsgScopeType,
      addMsgScopeId,
      'knowledge'
    );

    const message = await context.repos.conversations.addMessage({
      conversationId,
      role,
      content,
      contextEntries,
      toolsUsed,
      metadata,
    });

    // Log audit event
    logAction(
      {
        agentId,
        action: 'update',
        entryType: 'knowledge',
        entryId: conversationId,
        scopeType: conversation.sessionId ? 'session' : 'project',
        scopeId: conversation.sessionId || conversation.projectId || null,
      },
      context.db
    );

    // Trigger capture service on turn complete (non-blocking)
    if (conversation.sessionId) {
      const captureService = context.services.capture;
      if (captureService) {
        // Map 'agent' role to 'assistant' for capture service
        const turnRole = role === 'agent' ? 'assistant' : role;
        const turnData: TurnData = {
          role: turnRole as 'user' | 'assistant' | 'system',
          content,
          toolCalls: toolsUsed?.map((name) => ({ name, input: {}, success: true })),
          timestamp: new Date().toISOString(),
        };
        captureService.onTurnComplete(conversation.sessionId, turnData).catch((error) => {
          logger.error(
            {
              sessionId: conversation.sessionId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Turn capture failed'
          );
        });
      }

      // Trigger incremental extraction via TriggerOrchestrator (non-blocking)
      const triggerOrchestrator = context.services.triggerOrchestrator;
      if (triggerOrchestrator) {
        // Build message for trigger detection
        const triggerMessage = {
          id: message.id,
          role: role as 'user' | 'assistant' | 'system',
          content,
          timestamp: new Date().toISOString(),
          metadata: {
            sessionId: conversation.sessionId,
            toolName: toolsUsed?.[0],
            toolSuccess: true,
          },
        };

        // Build session context for trigger detection
        const sessionContext = {
          sessionId: conversation.sessionId,
          projectId: conversation.projectId || undefined,
          agentId,
          messages: [triggerMessage], // Current message for detection
          extractionCount: 0,
          recentErrors: [],
        };

        triggerOrchestrator.processMessage(triggerMessage, sessionContext).catch((error) => {
          logger.error(
            {
              sessionId: conversation.sessionId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Trigger processing failed'
          );
        });
      }
    }

    return formatTimestamps({
      success: true,
      message,
    });
  },

  async get(context: AppContext, params: Record<string, unknown>) {
    // Accept both 'id' and 'conversationId' for consistency with other conversation actions
    const id = params.id
      ? getRequiredParam(params, 'id', isString)
      : params.conversationId
        ? getRequiredParam(params, 'conversationId', isString)
        : (() => {
            throw createValidationError(
              'id',
              'missing required parameter',
              "Provide 'id' or 'conversationId'"
            );
          })();
    const includeMessages = getOptionalParam(params, 'includeMessages', isBoolean);
    const includeContext = getOptionalParam(params, 'includeContext', isBoolean);
    const agentId = getOptionalParam(params, 'agentId', isString);

    const conversation = await context.repos.conversations.getById(
      id,
      includeMessages,
      includeContext
    );
    if (!conversation) {
      throw createNotFoundError('Conversation', id);
    }

    // Check permission (read required)
    const getScopeType = conversation.sessionId ? 'session' : 'project';
    const getScopeId = conversation.sessionId || conversation.projectId || null;
    requirePermission(
      context.services.permission,
      agentId,
      'read',
      getScopeType,
      getScopeId,
      'knowledge'
    );

    // Log audit event
    logAction(
      {
        agentId,
        action: 'read',
        entryType: 'knowledge',
        entryId: id,
        scopeType: conversation.sessionId ? 'session' : 'project',
        scopeId: conversation.sessionId || conversation.projectId || null,
      },
      context.db
    );

    return formatTimestamps({
      success: true,
      conversation,
    });
  },

  async list(context: AppContext, params: Record<string, unknown>) {
    const sessionId = getOptionalParam(params, 'sessionId', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);
    const filterAgentId = getOptionalParam(params, 'agentId', isString);
    const status = getOptionalParam(params, 'status', isConversationStatus);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);
    // Note: agentId in ConversationListParams is for filtering, permission check uses filterAgentId
    const agentId = filterAgentId;

    // Check permission (read required)
    const listScopeType = sessionId ? 'session' : projectId ? 'project' : 'global';
    const listScopeId = sessionId || projectId || null;
    requirePermission(
      context.services.permission,
      agentId,
      'read',
      listScopeType,
      listScopeId,
      'knowledge'
    );

    const conversations = await context.repos.conversations.list(
      {
        sessionId,
        projectId,
        agentId: filterAgentId,
        status,
      },
      { limit, offset }
    );

    // Log audit event
    logAction(
      {
        agentId,
        action: 'read',
        entryType: 'knowledge',
        scopeType: sessionId ? 'session' : projectId ? 'project' : 'global',
        scopeId: sessionId || projectId || null,
        resultCount: conversations.length,
      },
      context.db
    );

    return formatTimestamps({
      success: true,
      conversations,
      meta: {
        totalCount: conversations.length,
        returnedCount: conversations.length,
        truncated: false,
        hasMore: false,
      },
    });
  },

  async update(context: AppContext, params: Record<string, unknown>) {
    // Accept both 'id' and 'conversationId' for consistency with other conversation actions
    const id = params.id
      ? getRequiredParam(params, 'id', isString)
      : params.conversationId
        ? getRequiredParam(params, 'conversationId', isString)
        : (() => {
            throw createValidationError(
              'id',
              'missing required parameter',
              "Provide 'id' or 'conversationId'"
            );
          })();
    const title = getOptionalParam(params, 'title', isString);
    const status = getOptionalParam(params, 'status', isConversationStatus);
    const metadata = getOptionalParam(params, 'metadata', isObject);
    // Security: agentId required for audit trail on write operations
    const agentId = getRequiredParam(params, 'agentId', isString);

    // Validate input sizes
    if (title) {
      validateTextLength(title, 'title', SIZE_LIMITS.TITLE_MAX_LENGTH);
    }

    if (title === undefined && status === undefined && metadata === undefined) {
      throw createValidationError(
        'updates',
        'at least one field (title, status, metadata) is required',
        'Provide at least one field to update'
      );
    }

    // Check conversation exists
    const existing = await context.repos.conversations.getById(id);
    if (!existing) {
      throw createNotFoundError('Conversation', id);
    }

    // Check permission (write required)
    const updateScopeType = existing.sessionId ? 'session' : 'project';
    const updateScopeId = existing.sessionId || existing.projectId || null;
    requirePermission(
      context.services.permission,
      agentId,
      'write',
      updateScopeType,
      updateScopeId,
      'knowledge'
    );

    const conversation = await context.repos.conversations.update(id, {
      title,
      status,
      metadata,
    });

    if (!conversation) {
      throw createNotFoundError('Conversation', id);
    }

    // Log audit event
    logAction(
      {
        agentId,
        action: 'update',
        entryType: 'knowledge',
        entryId: id,
        scopeType: conversation.sessionId ? 'session' : 'project',
        scopeId: conversation.sessionId || conversation.projectId || null,
      },
      context.db
    );

    return formatTimestamps({
      success: true,
      conversation,
    });
  },

  async linkContext(context: AppContext, params: Record<string, unknown>) {
    const conversationId = getRequiredParam(params, 'conversationId', isString);
    const messageId = getOptionalParam(params, 'messageId', isString);
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);
    const relevanceScore = getOptionalParam(params, 'relevanceScore', isNumber);
    // Security: agentId required for audit trail on write operations
    const agentId = getRequiredParam(params, 'agentId', isString);

    // Check conversation exists
    const conversation = await context.repos.conversations.getById(conversationId);
    if (!conversation) {
      throw createNotFoundError('Conversation', conversationId);
    }

    // Check permission (read required for entry, write for conversation)
    const linkScopeType = conversation.sessionId ? 'session' : 'project';
    const linkScopeId = conversation.sessionId || conversation.projectId || null;
    requirePermission(
      context.services.permission,
      agentId,
      'read',
      linkScopeType,
      linkScopeId,
      entryType
    );
    requirePermission(
      context.services.permission,
      agentId,
      'write',
      linkScopeType,
      linkScopeId,
      'knowledge'
    );

    const linkedContext = await context.repos.conversations.linkContext({
      conversationId,
      messageId,
      entryType,
      entryId,
      relevanceScore,
    });

    // Log audit event
    logAction(
      {
        agentId,
        action: 'update',
        entryType: 'knowledge',
        entryId: conversationId,
        scopeType: conversation.sessionId ? 'session' : 'project',
        scopeId: conversation.sessionId || conversation.projectId || null,
      },
      context.db
    );

    return formatTimestamps({
      success: true,
      context: linkedContext,
    });
  },

  async getContext(context: AppContext, params: Record<string, unknown>) {
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
      const conversation = await context.repos.conversations.getById(conversationId);
      if (!conversation) {
        throw createNotFoundError('Conversation', conversationId);
      }

      // Check permission (read required)
      const ctxScopeType = conversation.sessionId ? 'session' : 'project';
      const ctxScopeId = conversation.sessionId || conversation.projectId || null;
      requirePermission(
        context.services.permission,
        agentId,
        'read',
        ctxScopeType,
        ctxScopeId,
        'knowledge'
      );

      contexts = await context.repos.conversations.getContextForConversation(conversationId);
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
      requirePermission(context.services.permission, agentId, 'read', 'global', null, entryType);

      contexts = await context.repos.conversations.getContextForEntry(entryType, entryId);
    }

    // Log audit event
    logAction(
      {
        agentId,
        action: 'read',
        entryType: conversationId ? 'knowledge' : entryType || undefined,
        entryId: conversationId || entryId || undefined,
        resultCount: contexts.length,
      },
      context.db
    );

    return formatTimestamps({
      success: true,
      contexts,
    });
  },

  async search(context: AppContext, params: Record<string, unknown>) {
    const searchQuery = getRequiredParam(params, 'search', isString);
    const sessionId = getOptionalParam(params, 'sessionId', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);
    const filterAgentId = getOptionalParam(params, 'agentId', isString);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);
    // Note: agentId in ConversationSearchParams is for filtering, permission check uses filterAgentId
    const agentId = filterAgentId;

    // Validate input sizes
    validateTextLength(searchQuery, 'search', SIZE_LIMITS.CONTENT_MAX_LENGTH);

    // Check permission (read required)
    const searchScopeType = sessionId ? 'session' : projectId ? 'project' : 'global';
    const searchScopeId = sessionId || projectId || null;
    requirePermission(
      context.services.permission,
      agentId,
      'read',
      searchScopeType,
      searchScopeId,
      'knowledge'
    );

    const results = await context.repos.conversations.search(searchQuery, {
      sessionId,
      projectId,
      agentId: filterAgentId,
      limit,
      offset,
    });

    // Log audit event
    logAction(
      {
        agentId,
        action: 'query',
        entryType: 'knowledge',
        scopeType: sessionId ? 'session' : projectId ? 'project' : 'global',
        scopeId: sessionId || projectId || null,
        queryParams: { search: searchQuery },
        resultCount: results.length,
      },
      context.db
    );

    return formatTimestamps({
      success: true,
      conversations: results,
      meta: {
        totalCount: results.length,
        returnedCount: results.length,
        truncated: false,
        hasMore: false,
      },
    });
  },

  async end(context: AppContext, params: Record<string, unknown>) {
    // Accept both 'id' and 'conversationId' for consistency with other conversation actions
    const id = params.id
      ? getRequiredParam(params, 'id', isString)
      : params.conversationId
        ? getRequiredParam(params, 'conversationId', isString)
        : (() => {
            throw createValidationError(
              'id',
              'missing required parameter',
              "Provide 'id' or 'conversationId'"
            );
          })();
    const generateSummary = getOptionalParam(params, 'generateSummary', isBoolean);
    // Security: agentId required for audit trail on write operations
    const agentId = getRequiredParam(params, 'agentId', isString);

    // Check conversation exists
    const existing = await context.repos.conversations.getById(id);
    if (!existing) {
      throw createNotFoundError('Conversation', id);
    }

    // Check permission (write required)
    const endScopeType = existing.sessionId ? 'session' : 'project';
    const endScopeId = existing.sessionId || existing.projectId || null;
    requirePermission(
      context.services.permission,
      agentId,
      'write',
      endScopeType,
      endScopeId,
      'knowledge'
    );

    const conversation = await context.repos.conversations.update(id, {
      status: 'completed',
    });

    if (!conversation) {
      throw createNotFoundError('Conversation', id);
    }

    // Generate summary if requested
    let summary: string | undefined;
    if (generateSummary) {
      const conversationService = createConversationService(context.repos.conversations);
      summary = await conversationService.generateConversationSummary(id);
    }

    // Log audit event
    logAction(
      {
        agentId,
        action: 'update',
        entryType: 'knowledge',
        entryId: id,
        scopeType: conversation.sessionId ? 'session' : 'project',
        scopeId: conversation.sessionId || conversation.projectId || null,
      },
      context.db
    );

    return formatTimestamps({
      success: true,
      conversation,
      summary,
    });
  },

  async archive(context: AppContext, params: Record<string, unknown>) {
    // Accept both 'id' and 'conversationId' for consistency with other conversation actions
    const id = params.id
      ? getRequiredParam(params, 'id', isString)
      : params.conversationId
        ? getRequiredParam(params, 'conversationId', isString)
        : (() => {
            throw createValidationError(
              'id',
              'missing required parameter',
              "Provide 'id' or 'conversationId'"
            );
          })();
    // Security: agentId required for audit trail on write operations
    const agentId = getRequiredParam(params, 'agentId', isString);

    // Check conversation exists
    const existing = await context.repos.conversations.getById(id);
    if (!existing) {
      throw createNotFoundError('Conversation', id);
    }

    // Check permission (write required)
    const archiveScopeType = existing.sessionId ? 'session' : 'project';
    const archiveScopeId = existing.sessionId || existing.projectId || null;
    requirePermission(
      context.services.permission,
      agentId,
      'write',
      archiveScopeType,
      archiveScopeId,
      'knowledge'
    );

    const conversation = await context.repos.conversations.update(id, {
      status: 'archived',
    });

    if (!conversation) {
      throw createNotFoundError('Conversation', id);
    }

    // Log audit event
    logAction(
      {
        agentId,
        action: 'update',
        entryType: 'knowledge',
        entryId: id,
        scopeType: conversation.sessionId ? 'session' : 'project',
        scopeId: conversation.sessionId || conversation.projectId || null,
      },
      context.db
    );

    return formatTimestamps({
      success: true,
      conversation,
    });
  },
};
