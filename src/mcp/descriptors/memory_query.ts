import type { ToolDescriptor } from './types.js';
import { handleV2MemoryQuery } from '../../v2/mcp/index.js';

export const memoryQueryDescriptor: ToolDescriptor = {
  name: 'memory_query',
  visibility: 'core',
  description: 'Query V2 memory. Actions: search',
  commonParams: {
    query: { type: 'string' },
    strategy: { type: 'string', enum: ['fts', 'semantic', 'hybrid'] },
    limit: { type: 'number' },
    offset: { type: 'number' },
    includeInactive: { type: 'boolean' },
    types: {
      type: 'array',
      items: { type: 'string', enum: ['guideline', 'knowledge', 'tool', 'experience'] },
    },
    scope: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        id: { type: 'string' },
      },
      required: ['type'],
    },
    tags: {
      type: 'object',
      properties: {
        include: { type: 'array', items: { type: 'string' } },
        require: { type: 'array', items: { type: 'string' } },
        exclude: { type: 'array', items: { type: 'string' } },
      },
    },
    relatedTo: {
      type: 'object',
      properties: {
        entryType: { type: 'string', enum: ['guideline', 'knowledge', 'tool', 'experience'] },
        entryId: { type: 'string' },
        relationType: {
          type: 'string',
          enum: [
            'applies_to',
            'depends_on',
            'conflicts_with',
            'related_to',
            'parent_task',
            'subtask_of',
            'promoted_to',
          ],
        },
        depth: { type: 'number' },
      },
      required: ['entryType', 'entryId'],
    },
  },
  actions: {
    search: {
      contextHandler: (context, params) =>
        handleV2MemoryQuery(context, { action: 'search', ...params }),
    },
  },
};
