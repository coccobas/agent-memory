/**
 * Cross-Encoder Re-ranking Configuration Section
 *
 * Settings for LLM-based cross-encoder re-ranking of query results.
 * More accurate than bi-encoder but slower - use for small candidate sets.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const crossEncoderSection: ConfigSectionMeta = {
  name: 'crossEncoder',
  description: 'LLM-based cross-encoder re-ranking for improved result quality.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_CROSS_ENCODER_ENABLED',
      defaultValue: false,
      description: 'Enable LLM-based cross-encoder re-ranking.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    topK: {
      envKey: 'AGENT_MEMORY_CROSS_ENCODER_TOP_K',
      defaultValue: 15,
      description: 'Number of top candidates to score with cross-encoder.',
      schema: z.number().int().min(1).max(50),
      parse: 'int',
    },
    alpha: {
      envKey: 'AGENT_MEMORY_CROSS_ENCODER_ALPHA',
      defaultValue: 0.6,
      description: 'Blend factor: 1.0 = pure cross-encoder, 0.0 = pure original score.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    temperature: {
      envKey: 'AGENT_MEMORY_CROSS_ENCODER_TEMPERATURE',
      defaultValue: 0.1,
      description: 'Temperature for LLM scoring (lower = more deterministic).',
      schema: z.number().min(0).max(2),
      parse: 'number',
    },
    timeoutMs: {
      envKey: 'AGENT_MEMORY_CROSS_ENCODER_TIMEOUT_MS',
      defaultValue: 30000,
      description: 'Timeout for cross-encoder LLM call in milliseconds.',
      schema: z.number().int().min(1000).max(120000),
      parse: 'int',
    },
    model: {
      envKey: 'AGENT_MEMORY_CROSS_ENCODER_MODEL',
      defaultValue: undefined,
      description: 'Optional model override for cross-encoder scoring. Uses extraction model if not set.',
      schema: z.string().optional(),
      parse: 'string',
    },
    baseUrl: {
      envKey: 'AGENT_MEMORY_CROSS_ENCODER_BASE_URL',
      defaultValue: undefined,
      description: 'Optional base URL override for cross-encoder LLM. Uses extraction endpoint if not set.',
      schema: z.string().optional(),
      parse: 'string',
    },
  },
};
