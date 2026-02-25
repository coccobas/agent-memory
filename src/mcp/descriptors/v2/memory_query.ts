import type { ToolDescriptor } from '../types.js';
import { handleV2MemoryQuery } from '../../../v2/mcp/handlers.js';

export const memoryQueryDescriptor: ToolDescriptor = {
  name: 'memory_query',
  visibility: 'core',
  description: 'Search entries and load hierarchical context. Actions: search, context',
  commonParams: {
    scope: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['global', 'org', 'project', 'session', 'topic'] },
        id: { type: 'string' },
      },
      required: ['type'],
    },
    query: { type: 'string', description: 'Search query text' },
    limit: { type: 'number' },
    offset: { type: 'number' },
    types: {
      type: 'array',
      items: { type: 'string', enum: ['guideline', 'knowledge', 'tool', 'experience'] },
    },
    sources: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['remember', 'observe_extract', 'observe_commit', 'hook_capture', 'import'],
      },
      description:
        'Filter by entry origin: remember (manual), hook_capture (auto-extracted), import, etc.',
    },
    tags: {
      type: 'object',
      properties: {
        include: { type: 'array', items: { type: 'string' } },
        require: { type: 'array', items: { type: 'string' } },
        exclude: { type: 'array', items: { type: 'string' } },
      },
    },
    hierarchical: {
      type: 'boolean',
      description: 'Use hierarchical format for ~90% token savings (context action, default: true)',
    },
    includeInactive: { type: 'boolean' },
    strategy: { type: 'string', enum: ['fts', 'semantic', 'hybrid'] },
    tokenBudget: { type: 'number' },
    relatedTo: {
      type: 'object',
      properties: {
        entryType: {
          type: 'string',
          enum: ['guideline', 'knowledge', 'tool', 'experience'],
        },
        entryId: { type: 'string' },
        relationType: { type: 'string' },
        depth: { type: 'number' },
      },
    },
  },
  actions: {
    search: {
      contextHandler: (context, params) =>
        handleV2MemoryQuery(context, { action: 'search', ...params }),
    },
    context: {
      contextHandler: (context, params) =>
        handleV2MemoryQuery(context, { action: 'context', ...params }),
    },
  },
};
