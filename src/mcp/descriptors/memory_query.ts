/**
 * memory_query tool descriptor
 *
 * This tool has special handling for the 'context' action which maps
 * 'limit' to 'limitPerType'. This is handled in the custom handler.
 */

import type { ToolDescriptor } from './types.js';
import { queryHandlers } from '../handlers/query.handler.js';

export const memoryQueryDescriptor: ToolDescriptor = {
  name: 'memory_query',
  visibility: 'core',
  description: 'Query and aggregate memory. Actions: search, context',
  commonParams: {
    agentId: { type: 'string' },
    types: { type: 'array', items: { type: 'string', enum: ['tools', 'guidelines', 'knowledge'] } },
    scope: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        id: { type: 'string' },
        inherit: { type: 'boolean' },
      },
    },
    tags: {
      type: 'object',
      properties: {
        include: { type: 'array', items: { type: 'string' } },
        require: { type: 'array', items: { type: 'string' } },
        exclude: { type: 'array', items: { type: 'string' } },
      },
    },
    search: { type: 'string', description: 'Free-text search' },
    relatedTo: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        id: { type: 'string' },
        relation: { type: 'string', enum: ['applies_to', 'depends_on', 'conflicts_with', 'related_to'] },
        depth: { type: 'number' },
        direction: { type: 'string', enum: ['forward', 'backward', 'both'] },
        maxResults: { type: 'number' },
      },
    },
    followRelations: { type: 'boolean' },
    includeVersions: { type: 'boolean' },
    includeInactive: { type: 'boolean' },
    useFts5: { type: 'boolean' },
    fields: { type: 'array', items: { type: 'string' } },
    fuzzy: { type: 'boolean' },
    createdAfter: { type: 'string' },
    createdBefore: { type: 'string' },
    updatedAfter: { type: 'string' },
    updatedBefore: { type: 'string' },
    priority: { type: 'object', properties: { min: { type: 'number' }, max: { type: 'number' } } },
    regex: { type: 'boolean' },
    semanticSearch: { type: 'boolean' },
    semanticThreshold: { type: 'number' },
    atTime: { type: 'string', description: 'ISO timestamp for temporal filter' },
    validDuring: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string' },
    inherit: { type: 'boolean', description: 'Include parent scopes (default true)' },
    compact: { type: 'boolean' },
    hierarchical: { type: 'boolean', description: 'Return ~1.5k token summary instead of ~15k full entries' },
    limit: { type: 'number' },
  },
  actions: {
    search: {
      contextHandler: (context, params) => queryHandlers.query(context, params),
    },
    context: {
      contextHandler: (context, params) => {
        // Map limit to limitPerType for context action
        const contextParams = { ...params };
        if ('limit' in contextParams && !('limitPerType' in contextParams)) {
          (contextParams as Record<string, unknown>).limitPerType = contextParams.limit;
          delete (contextParams as Record<string, unknown>).limit;
        }
        return queryHandlers.context(context, contextParams);
      },
    },
  },
};
