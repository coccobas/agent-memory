/**
 * memory_latent tool descriptor
 *
 * Manages latent memory and KV-cache for efficient context injection.
 * Provides optimized memory representations suitable for fast LLM context loading.
 */

import type { ToolDescriptor } from './types.js';
import { latentMemoryHandlers } from '../handlers/latent-memory.handler.js';

export const memoryLatentDescriptor: ToolDescriptor = {
  name: 'memory_latent',
  description: `Manage latent memory and KV-cache for efficient context injection.

Latent memory provides optimized, pre-processed representations of memory entries
suitable for fast loading into LLM context windows. Uses KV-cache techniques to
minimize redundant computation and enable sub-millisecond context retrieval.

Actions:
- create: Create latent memory from source entry (tool/guideline/knowledge/experience)
- get: Retrieve cached latent memory by source type and ID
- search: Semantic search across latent memories with similarity scores
- inject: Build formatted context block for LLM injection (JSON/markdown/natural language)
- warm_session: Preload session-relevant memories into cache for faster access
- stats: Get cache statistics (hit rates, size, access times)
- prune: Remove stale cache entries older than specified days

Use cases:
- Fast context loading for agent sessions
- Semantic memory retrieval for related knowledge
- Efficient memory warm-up before high-throughput operations
- Cache management and optimization`,

  commonParams: {
    sourceType: {
      type: 'string',
      enum: ['tool', 'guideline', 'knowledge', 'experience'],
      description: 'Type of source entry (create, get)',
    },
    sourceId: {
      type: 'string',
      description: 'ID of source entry (create, get)',
    },
    text: {
      type: 'string',
      description: 'Optional text override instead of fetching from source (create)',
    },
    query: {
      type: 'string',
      description: 'Search query for semantic matching (search)',
    },
    sessionId: {
      type: 'string',
      description: 'Session ID for context injection or warming (inject, warm_session)',
    },
    conversationId: {
      type: 'string',
      description: 'Conversation ID for context injection (inject)',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of results to return (search, warm_session)',
    },
    format: {
      type: 'string',
      enum: ['json', 'markdown', 'natural_language'],
      description: 'Output format for context injection (inject, default: markdown)',
    },
    maxTokens: {
      type: 'number',
      description: 'Maximum tokens for injected context (inject)',
    },
    staleDays: {
      type: 'number',
      description: 'Days of inactivity before pruning entries (prune, default: 30)',
    },
  },

  actions: {
    create: {
      contextHandler: (ctx, params) => latentMemoryHandlers.create(ctx, params),
    },
    get: {
      contextHandler: (ctx, params) => latentMemoryHandlers.get(ctx, params),
    },
    search: {
      contextHandler: (ctx, params) => latentMemoryHandlers.search(ctx, params),
    },
    inject: {
      contextHandler: (ctx, params) => latentMemoryHandlers.inject(ctx, params),
    },
    warm_session: {
      contextHandler: (ctx, params) => latentMemoryHandlers.warm_session(ctx, params),
    },
    stats: {
      contextHandler: (ctx, params) => latentMemoryHandlers.stats(ctx, params),
    },
    prune: {
      contextHandler: (ctx, params) => latentMemoryHandlers.prune(ctx, params),
    },
  },
};
