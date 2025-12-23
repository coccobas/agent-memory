/**
 * memory_conversation tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { conversationHandlers } from '../handlers/conversations.handler.js';

export const memoryConversationDescriptor: ToolDescriptor = {
  name: 'memory_conversation',
  description:
    'Manage conversation history. Actions: start, add_message, get, list, update, link_context, get_context, search, end, archive',
  commonParams: {
    sessionId: { type: 'string', description: 'Session ID (start)' },
    projectId: { type: 'string', description: 'Project ID (start)' },
    agentId: {
      type: 'string',
      description: 'Agent ID (start, add_message, etc.)',
    },
    title: { type: 'string', description: 'Conversation title (start, update)' },
    metadata: { type: 'object', description: 'Optional metadata (start, update)' },
    conversationId: {
      type: 'string',
      description: 'Conversation ID (add_message, get, update, etc.)',
    },
    role: {
      type: 'string',
      enum: ['user', 'agent', 'system'],
      description: 'Message role (add_message)',
    },
    content: { type: 'string', description: 'Message content (add_message)' },
    contextEntries: {
      type: 'array',
      description: 'Memory entries used (add_message)',
    },
    toolsUsed: { type: 'array', description: 'Tools invoked (add_message)' },
    includeMessages: { type: 'boolean', description: 'Include messages (get)' },
    includeContext: { type: 'boolean', description: 'Include context links (get)' },
    status: {
      type: 'string',
      enum: ['active', 'completed', 'archived'],
      description: 'Filter by status (list)',
    },
    messageId: { type: 'string', description: 'Message ID (link_context)' },
    entryType: {
      type: 'string',
      enum: ['tool', 'guideline', 'knowledge'],
      description: 'Entry type (link_context, get_context)',
    },
    entryId: { type: 'string', description: 'Entry ID (link_context, get_context)' },
    relevanceScore: {
      type: 'number',
      description: 'Relevance score 0-1 (link_context)',
    },
    search: { type: 'string', description: 'Search query (search)' },
    generateSummary: {
      type: 'boolean',
      description: 'Generate summary when ending (end)',
    },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    start: { contextHandler: conversationHandlers.start },
    add_message: { contextHandler: conversationHandlers.addMessage },
    get: { contextHandler: conversationHandlers.get },
    list: { contextHandler: conversationHandlers.list },
    update: { contextHandler: conversationHandlers.update },
    link_context: { contextHandler: conversationHandlers.linkContext },
    get_context: { contextHandler: conversationHandlers.getContext },
    search: { contextHandler: conversationHandlers.search },
    end: { contextHandler: conversationHandlers.end },
    archive: { contextHandler: conversationHandlers.archive },
  },
};
