/**
 * memory_conversation tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { conversationHandlers } from '../handlers/conversations.handler.js';

export const memoryConversationDescriptor: ToolDescriptor = {
  name: 'memory_conversation',
  visibility: 'advanced',
  description:
    'Manage conversation audit logs. Records and retrieves conversation history for debugging and analysis. Actions: start, add_message, get, list, update, link_context, get_context, search, end, archive',
  commonParams: {
    sessionId: { type: 'string' },
    projectId: { type: 'string' },
    agentId: { type: 'string' },
    title: { type: 'string' },
    metadata: { type: 'object' },
    conversationId: { type: 'string' },
    role: { type: 'string', enum: ['user', 'agent', 'system'] },
    content: { type: 'string' },
    contextEntries: { type: 'array' },
    toolsUsed: { type: 'array' },
    includeMessages: { type: 'boolean' },
    includeContext: { type: 'boolean' },
    status: { type: 'string', enum: ['active', 'completed', 'archived'] },
    messageId: { type: 'string' },
    entryType: { type: 'string', enum: ['tool', 'guideline', 'knowledge'] },
    entryId: { type: 'string' },
    relevanceScore: { type: 'number' },
    search: { type: 'string' },
    generateSummary: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    start: { contextHandler: (ctx, params) => conversationHandlers.start(ctx, params) },
    add_message: { contextHandler: (ctx, params) => conversationHandlers.addMessage(ctx, params) },
    get: { contextHandler: (ctx, params) => conversationHandlers.get(ctx, params) },
    list: { contextHandler: (ctx, params) => conversationHandlers.list(ctx, params) },
    update: { contextHandler: (ctx, params) => conversationHandlers.update(ctx, params) },
    link_context: {
      contextHandler: (ctx, params) => conversationHandlers.linkContext(ctx, params),
    },
    get_context: { contextHandler: (ctx, params) => conversationHandlers.getContext(ctx, params) },
    search: { contextHandler: (ctx, params) => conversationHandlers.search(ctx, params) },
    end: { contextHandler: (ctx, params) => conversationHandlers.end(ctx, params) },
    archive: { contextHandler: (ctx, params) => conversationHandlers.archive(ctx, params) },
  },
};
