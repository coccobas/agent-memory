/**
 * Embedding Configuration Section
 *
 * Settings for text embedding generation (OpenAI or local).
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';
import { getEmbeddingProvider } from '../parsers.js';

export const embeddingSection: ConfigSectionMeta = {
  name: 'embedding',
  description: 'Text embedding configuration for semantic search.',
  options: {
    provider: {
      envKey: 'AGENT_MEMORY_EMBEDDING_PROVIDER',
      defaultValue: 'local',
      description: 'Embedding provider: openai (requires API key), local (built-in), or disabled.',
      schema: z.enum(['openai', 'local', 'disabled']),
      // Custom parser with auto-detection based on API key
      parse: () => getEmbeddingProvider(),
    },
    openaiApiKey: {
      envKey: 'AGENT_MEMORY_OPENAI_API_KEY',
      defaultValue: undefined,
      description: 'OpenAI API key for embeddings.',
      schema: z.string().optional(),
      sensitive: true,
    },
    openaiModel: {
      envKey: 'AGENT_MEMORY_OPENAI_MODEL',
      defaultValue: 'text-embedding-3-small',
      description: 'OpenAI embedding model to use.',
      schema: z.string(),
    },
    maxConcurrency: {
      envKey: 'AGENT_MEMORY_EMBEDDING_MAX_CONCURRENCY',
      defaultValue: 16,
      description: 'Maximum concurrent embedding requests.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    maxRetries: {
      envKey: 'AGENT_MEMORY_EMBEDDING_MAX_RETRIES',
      defaultValue: 3,
      description: 'Maximum retry attempts for failed embedding jobs.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    retryDelayMs: {
      envKey: 'AGENT_MEMORY_EMBEDDING_RETRY_DELAY_MS',
      defaultValue: 1000,
      description: 'Base delay in ms between retries (doubles each attempt).',
      schema: z.number().int().min(0),
      parse: 'int',
    },
  },
};
