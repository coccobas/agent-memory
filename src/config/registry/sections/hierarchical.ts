/**
 * Hierarchical Retrieval Configuration Section
 *
 * Settings for coarse-to-fine retrieval through summary hierarchies.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const hierarchicalSection: ConfigSectionMeta = {
  name: 'hierarchical',
  description: 'Hierarchical retrieval configuration for efficient large-scale search.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_HIERARCHICAL_ENABLED',
      defaultValue: true,
      description: 'Enable hierarchical retrieval through summary layers.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    minEntriesThreshold: {
      envKey: 'AGENT_MEMORY_HIERARCHICAL_MIN_ENTRIES',
      defaultValue: 100,
      description: 'Minimum entries in scope to use hierarchical retrieval.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    maxCandidates: {
      envKey: 'AGENT_MEMORY_HIERARCHICAL_MAX_CANDIDATES',
      defaultValue: 100,
      description: 'Maximum candidate entries from hierarchical retrieval.',
      schema: z.number().int().min(1).max(1000),
      parse: 'int',
    },
    expansionFactor: {
      envKey: 'AGENT_MEMORY_HIERARCHICAL_EXPANSION',
      defaultValue: 3,
      description: 'How many candidates to expand at each hierarchy level.',
      schema: z.number().int().min(1).max(10),
      parse: 'int',
    },
    minSimilarity: {
      envKey: 'AGENT_MEMORY_HIERARCHICAL_MIN_SIMILARITY',
      defaultValue: 0.5,
      description: 'Minimum similarity threshold for hierarchical matching.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    semanticQueriesOnly: {
      envKey: 'AGENT_MEMORY_HIERARCHICAL_SEMANTIC_ONLY',
      defaultValue: true,
      description: 'Only use hierarchical retrieval for semantic queries.',
      schema: z.boolean(),
      parse: 'boolean',
    },
  },
};
