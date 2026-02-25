import type { ToolDescriptor } from '../types.js';
import { handleV2MemoryTopic } from '../../../v2/mcp/topic-handler.js';

export const memoryTopicDescriptor: ToolDescriptor = {
  name: 'memory_topic',
  visibility: 'core',
  description:
    'Manage topics — persistent smart folders that group related transcripts. ' +
    'Actions: create, list, assign, move, merge',
  commonParams: {
    projectId: { type: 'string', description: 'Project external ID' },
    topicScopeId: { type: 'string', description: 'Topic scope ID' },
    transcriptId: { type: 'string', description: 'Transcript ID (for assign/move)' },
    name: { type: 'string', description: 'Topic name (for create)' },
    description: { type: 'string', description: 'Topic description (for create)' },
    agentId: { type: 'string', description: 'Agent ID' },
    sourceTopicScopeId: { type: 'string', description: 'Source topic scope ID (for merge)' },
    targetTopicScopeId: { type: 'string', description: 'Target topic scope ID (for move/merge)' },
    includeArchived: { type: 'boolean', description: 'Include archived topics in list' },
    limit: { type: 'number', description: 'Max results' },
    offset: { type: 'number', description: 'Pagination offset' },
  },
  actions: {
    create: {
      contextHandler: (context, params) =>
        handleV2MemoryTopic(context, { action: 'create', ...params }),
    },
    list: {
      contextHandler: (context, params) =>
        handleV2MemoryTopic(context, { action: 'list', ...params }),
    },
    assign: {
      contextHandler: (context, params) =>
        handleV2MemoryTopic(context, { action: 'assign', ...params }),
    },
    move: {
      contextHandler: (context, params) =>
        handleV2MemoryTopic(context, { action: 'move', ...params }),
    },
    merge: {
      contextHandler: (context, params) =>
        handleV2MemoryTopic(context, { action: 'merge', ...params }),
    },
  },
};
