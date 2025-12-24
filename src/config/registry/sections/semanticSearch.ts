/**
 * Semantic Search Configuration Section
 *
 * Vector similarity search settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const semanticSearchSection: ConfigSectionMeta = {
  name: 'semanticSearch',
  description: 'Semantic search configuration.',
  options: {
    defaultThreshold: {
      envKey: 'AGENT_MEMORY_SEMANTIC_THRESHOLD',
      defaultValue: 0.7,
      description: 'Default similarity threshold for semantic search (0-1).',
      schema: z.number().min(0).max(1),
    },
    scoreWeight: {
      envKey: 'AGENT_MEMORY_SEMANTIC_SCORE_WEIGHT',
      defaultValue: 0.7,
      description: 'Weight of semantic score in combined scoring (0-1).',
      schema: z.number().min(0).max(1),
    },
    duplicateThreshold: {
      envKey: 'AGENT_MEMORY_DUPLICATE_THRESHOLD',
      defaultValue: 0.8,
      description: 'Similarity threshold for duplicate detection (0-1).',
      schema: z.number().min(0).max(1),
    },
  },
};
