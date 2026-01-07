/**
 * memory_conversation tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { conversationHandlers } from '../handlers/conversations.handler.js';

export const memoryConversationDescriptor: ToolDescriptor = {
  name: 'memory_conversation',
  visibility: 'standard',
  description: 'Manage conversation history. Actions: start, add_message, get, list, update, link_context, get_context, search, end, archive',
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
