/**
 * Re-ranking Configuration Section
 *
 * Settings for neural re-ranking of query results.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const rerankSection: ConfigSectionMeta = {
  name: 'rerank',
  description: 'Neural re-ranking configuration for improved result quality.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_RERANK_ENABLED',
      defaultValue: true,
      description: 'Enable neural re-ranking of query results.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    topK: {
      envKey: 'AGENT_MEMORY_RERANK_TOP_K',
      defaultValue: 20,
      description: 'Number of top candidates to re-rank (others pass through).',
      schema: z.number().int().min(1).max(100),
      parse: 'int',
    },
    alpha: {
      envKey: 'AGENT_MEMORY_RERANK_ALPHA',
      defaultValue: 0.5,
      description: 'Blend factor: 1.0 = pure semantic, 0.0 = pure original score.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    minScoreThreshold: {
      envKey: 'AGENT_MEMORY_RERANK_MIN_SCORE',
      defaultValue: 0.1,
      description: 'Minimum score threshold to apply re-ranking.',
      schema: z.number().min(0),
      parse: 'number',
    },
    semanticQueriesOnly: {
      envKey: 'AGENT_MEMORY_RERANK_SEMANTIC_ONLY',
      defaultValue: true,
      description: 'Only re-rank semantic search queries (not keyword searches).',
      schema: z.boolean(),
      parse: 'boolean',
    },
  },
};
