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
  description: `Query and aggregate memory. **IMPORTANT: Call this FIRST at conversation start with action:"context" to load project context.**

Actions:
- context: Get aggregated context for a scope (RECOMMENDED FIRST CALL)
- search: Cross-reference search with filters

Quick start: {"action":"context","scopeType":"project","inherit":true}`,
  commonParams: {
    agentId: { type: 'string', description: 'Agent identifier for access control/auditing' },
    types: {
      type: 'array',
      items: { type: 'string', enum: ['tools', 'guidelines', 'knowledge'] },
      description: 'Which sections to search (search)',
    },
    scope: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        id: { type: 'string' },
        inherit: { type: 'boolean' },
      },
      description: 'Scope to search within (search)',
    },
    tags: {
      type: 'object',
      properties: {
        include: { type: 'array', items: { type: 'string' } },
        require: { type: 'array', items: { type: 'string' } },
        exclude: { type: 'array', items: { type: 'string' } },
      },
      description: 'Tag filters (search)',
    },
    search: { type: 'string', description: 'Free-text search (search)' },
    relatedTo: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        id: { type: 'string' },
        relation: {
          type: 'string',
          enum: ['applies_to', 'depends_on', 'conflicts_with', 'related_to'],
        },
        depth: { type: 'number', description: 'Max traversal depth 1-5 (default: 1)' },
        direction: {
          type: 'string',
          enum: ['forward', 'backward', 'both'],
          description: 'Traversal direction (default: both)',
        },
        maxResults: {
          type: 'number',
          description: 'Limit results from traversal (default: 100)',
        },
      },
      description: 'Find related entries (search)',
    },
    followRelations: {
      type: 'boolean',
      description: 'Expand search results to include related entries',
    },
    includeVersions: { type: 'boolean', description: 'Include version history (search)' },
    includeInactive: { type: 'boolean', description: 'Include inactive entries (search)' },
    useFts5: {
      type: 'boolean',
      description: 'Use FTS5 full-text search instead of LIKE queries (default: false)',
    },
    fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Field-specific search: ["name", "description"]',
    },
    fuzzy: { type: 'boolean', description: 'Enable typo tolerance (Levenshtein distance)' },
    createdAfter: { type: 'string', description: 'Filter by creation date (ISO timestamp)' },
    createdBefore: { type: 'string', description: 'Filter by creation date (ISO timestamp)' },
    updatedAfter: { type: 'string', description: 'Filter by update date (ISO timestamp)' },
    updatedBefore: { type: 'string', description: 'Filter by update date (ISO timestamp)' },
    priority: {
      type: 'object',
      properties: {
        min: { type: 'number' },
        max: { type: 'number' },
      },
      description: 'Filter guidelines by priority range (0-100)',
    },
    regex: { type: 'boolean', description: 'Use regex instead of simple match' },
    semanticSearch: {
      type: 'boolean',
      description: 'Enable semantic/vector search (default: true if embeddings available)',
    },
    semanticThreshold: {
      type: 'number',
      description: 'Minimum similarity score for semantic results (0-1, default: 0.7)',
    },
    atTime: {
      type: 'string',
      description: 'Filter knowledge entries valid at this specific point in time (ISO timestamp). Temporal filtering for knowledge graphs.',
    },
    validDuring: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Period start (ISO timestamp)' },
        end: { type: 'string', description: 'Period end (ISO timestamp)' },
      },
      description: 'Filter knowledge entries valid during this period. Returns entries where validity overlaps with the specified range.',
    },
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope type (context)',
    },
    scopeId: { type: 'string', description: 'Scope ID (context)' },
    inherit: { type: 'boolean', description: 'Include parent scopes (context, default true)' },
    compact: { type: 'boolean', description: 'Return compact results' },
    limit: {
      type: 'number',
      description: 'Max results (search) or per type (context as limitPerType)',
    },
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
