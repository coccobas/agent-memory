/**
 * Vector Database Configuration Section
 *
 * Vector storage settings for semantic search.
 * Supports auto-detection (pgvector for PostgreSQL, LanceDB for SQLite),
 * or explicit backend override.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const vectorDbSection: ConfigSectionMeta = {
  name: 'vectorDb',
  description: 'Vector database configuration for semantic search embeddings.',
  options: {
    backend: {
      envKey: 'AGENT_MEMORY_VECTOR_BACKEND',
      defaultValue: 'auto',
      description:
        'Vector storage backend: auto (pgvector for PostgreSQL, LanceDB for SQLite), pgvector, or lancedb.',
      schema: z.enum(['auto', 'pgvector', 'lancedb']),
      allowedValues: ['auto', 'pgvector', 'lancedb'] as const,
    },
    path: {
      envKey: 'AGENT_MEMORY_VECTOR_DB_PATH',
      defaultValue: 'vectors.lance',
      description: 'Path to LanceDB vector database directory (only used when backend is lancedb).',
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
    quantization: {
      envKey: 'AGENT_MEMORY_VECTOR_QUANTIZATION',
      defaultValue: 'none',
      description:
        'Vector quantization type: none, sq (scalar ~4x), pq (product ~8-32x). Reduces storage but may affect accuracy.',
      schema: z.enum(['none', 'sq', 'pq']),
      allowedValues: ['none', 'sq', 'pq'] as const,
    },
    indexThreshold: {
      envKey: 'AGENT_MEMORY_VECTOR_INDEX_THRESHOLD',
      defaultValue: 256,
      description:
        'Minimum number of vectors before creating a quantized index. LanceDB recommends at least 256.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
  },
};
