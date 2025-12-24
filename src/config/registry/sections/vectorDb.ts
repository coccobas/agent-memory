/**
 * Vector Database Configuration Section
 *
 * LanceDB vector storage settings for semantic search.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const vectorDbSection: ConfigSectionMeta = {
  name: 'vectorDb',
  description: 'Vector database configuration for semantic search embeddings.',
  options: {
    path: {
      envKey: 'AGENT_MEMORY_VECTOR_DB_PATH',
      defaultValue: 'vectors.lance',
      description: 'Path to LanceDB vector database directory.',
      schema: z.string(),
      parse: 'path',
    },
    distanceMetric: {
      envKey: 'AGENT_MEMORY_DISTANCE_METRIC',
      defaultValue: 'cosine',
      description: 'Distance metric for vector similarity: cosine, l2, or dot.',
      schema: z.enum(['cosine', 'l2', 'dot']),
      allowedValues: ['cosine', 'l2', 'dot'] as const,
    },
  },
};
