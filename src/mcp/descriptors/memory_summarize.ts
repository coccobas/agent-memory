/**
 * memory_summarize tool descriptor
 *
 * @experimental This feature is under active development. Most actions will return
 * "not implemented" errors. The API may change in future versions.
 *
 * Manages hierarchical summarization of memory entries.
 * Provides multi-level memory consolidation for efficient retrieval and contextual understanding.
 */

import type { ToolDescriptor } from './types.js';
import { summarizeHandlers } from '../handlers/summarize.handler.js';

export const memorySummarizeDescriptor: ToolDescriptor = {
  name: 'memory_summarize',
  visibility: 'advanced',
  description: `Manage hierarchical summaries for efficient memory retrieval at scale.

**EXPERIMENTAL**: This feature is under active development. Most actions will return
"not implemented" errors. The API may change in future versions.

Hierarchical summarization creates multi-level abstractions of memory entries:
- Level 0 (Chunk): Small groups of related entries (5-10 items)
- Level 1 (Topic): Collections of related chunks (3-5 chunks)
- Level 2 (Domain): High-level domain summaries (entire categories)

This enables coarse-to-fine retrieval, where you can start with high-level summaries
and drill down to specific entries as needed.

Actions:
- build: Build hierarchical summaries for a scope (creates all 3 levels)
- status: Get build status and summary counts for a scope
- get: Retrieve a specific summary by ID
- search: Semantic search across summaries with optional level filter
- drill_down: Navigate from a summary to its members and child summaries
- delete: Delete all summaries for a scope

Use cases:
- Large-scale memory retrieval (thousands of entries)
- Contextual understanding at different abstraction levels
- Efficient navigation of memory hierarchy
- Reducing context window usage by loading summaries first

Example: {"action":"build","scopeType":"project","scopeId":"proj-123"}
Example: {"action":"search","query":"authentication patterns","level":1,"limit":5}
Example: {"action":"drill_down","summaryId":"sum_abc123"}`,

  commonParams: {
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope type for summaries',
    },
    scopeId: {
      type: 'string',
      description: 'Scope ID (required for non-global scopes)',
    },
    entryTypes: {
      type: 'array',
      items: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'experience'] },
      description: 'Entry types to include in summaries (default: all)',
    },
    forceRebuild: {
      type: 'boolean',
      description: 'Force rebuild of all summaries, even if they exist (build)',
    },
    similarityThreshold: {
      type: 'number',
      description:
        'Minimum similarity (0-1) for entries to be grouped together (build, default: 0.5). Lower values allow more diverse content to cluster.',
    },
    minGroupSize: {
      type: 'number',
      description:
        'Minimum entries required to form a community (build, default: 3). Lower values create more granular summaries.',
    },
    id: {
      type: 'string',
      description: 'Summary ID (get)',
    },
    query: {
      type: 'string',
      description: 'Search query for semantic matching (search)',
    },
    level: {
      type: 'number',
      description: 'Hierarchy level to search (0=chunk, 1=topic, 2=domain) (search)',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of results to return (search, default: 10)',
    },
    summaryId: {
      type: 'string',
      description: 'Summary ID to drill down from (drill_down)',
    },
  },

  actions: {
    build: {
      contextHandler: (ctx, params) => summarizeHandlers.build(ctx, params),
    },
    status: {
      contextHandler: (ctx, params) => summarizeHandlers.status(ctx, params),
    },
    get: {
      contextHandler: (ctx, params) => summarizeHandlers.get(ctx, params),
    },
    search: {
      contextHandler: (ctx, params) => summarizeHandlers.search(ctx, params),
    },
    drill_down: {
      contextHandler: (ctx, params) => summarizeHandlers.drill_down(ctx, params),
    },
    delete: {
      contextHandler: (ctx, params) => summarizeHandlers.delete(ctx, params),
    },
  },
};
