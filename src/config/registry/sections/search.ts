/**
 * Search Strategy Configuration Section
 *
 * Controls the default search behavior: auto (hybrid when embeddings available),
 * hybrid (FTS5 + semantic combined), semantic, fts5, or like (legacy).
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const searchStrategyValues = ['auto', 'hybrid', 'semantic', 'fts5', 'like'] as const;
export type SearchStrategy = (typeof searchStrategyValues)[number];

/** Resolved strategy after 'auto' is evaluated - used in pipeline context */
export const resolvedStrategyValues = ['hybrid', 'semantic', 'fts5', 'like'] as const;
export type ResolvedSearchStrategy = (typeof resolvedStrategyValues)[number];

export const searchSection: ConfigSectionMeta = {
  name: 'search',
  description: 'Search strategy configuration for query behavior.',
  options: {
    defaultStrategy: {
      envKey: 'AGENT_MEMORY_SEARCH_DEFAULT_STRATEGY',
      defaultValue: 'auto',
      description:
        'Default search strategy: auto (hybrid when embeddings available), hybrid (FTS5 + semantic), semantic, fts5, or like (legacy).',
      schema: z.enum(searchStrategyValues),
      allowedValues: searchStrategyValues,
    },
    autoSemanticThreshold: {
      envKey: 'AGENT_MEMORY_SEARCH_AUTO_THRESHOLD',
      defaultValue: 0.8,
      description:
        'Minimum embedding coverage ratio (0-1) to enable hybrid mode in auto strategy. Default 0.8 = 80% of entries must have embeddings.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    hybridAlpha: {
      envKey: 'AGENT_MEMORY_SEARCH_HYBRID_ALPHA',
      defaultValue: 0.7,
      description:
        'Blend factor for hybrid mode: 1.0 = pure semantic, 0.0 = pure FTS5. Default 0.7 = 70% semantic weight.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
  },
};
