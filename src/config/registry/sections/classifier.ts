/**
 * Classifier Configuration Section
 *
 * Settings for the lightweight local LLM classifier used in hybrid extraction.
 * Uses LM Studio with Qwen3 or similar small models for fast classification.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const classifierSection: ConfigSectionMeta = {
  name: 'classifier',
  description: 'Local LLM classifier for hybrid extraction (regex + LLM fallback).',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_ENABLED',
      defaultValue: false,
      description: 'Enable the local LLM classifier for hybrid extraction.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    baseUrl: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_BASE_URL',
      defaultValue: 'http://localhost:1234/v1',
      description: 'LM Studio API base URL (OpenAI-compatible).',
      schema: z.string().url(),
    },
    model: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_MODEL',
      defaultValue: 'qwen3-1.7b',
      description: 'Model name to use for classification.',
      schema: z.string(),
    },
    timeoutMs: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_TIMEOUT_MS',
      defaultValue: 5000,
      description: 'Request timeout in milliseconds.',
      schema: z.number().int().min(1000).max(30000),
      parse: 'int',
    },
    temperature: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_TEMPERATURE',
      defaultValue: 0.1,
      description: 'Temperature for inference (lower = more deterministic).',
      schema: z.number().min(0).max(2),
      parse: 'number',
    },
    maxTokens: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_MAX_TOKENS',
      defaultValue: 150,
      description: 'Maximum tokens for classifier response.',
      schema: z.number().int().min(50).max(500),
      parse: 'int',
    },
    autoStoreThreshold: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_AUTO_STORE_THRESHOLD',
      defaultValue: 0.85,
      description: 'Confidence threshold for automatic storage (0-1).',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    suggestThreshold: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_SUGGEST_THRESHOLD',
      defaultValue: 0.7,
      description: 'Confidence threshold for surfacing suggestions (0-1).',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    queueMaxSize: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_QUEUE_MAX_SIZE',
      defaultValue: 100,
      description: 'Maximum items in the classification queue.',
      schema: z.number().int().min(10).max(1000),
      parse: 'int',
    },
    queueProcessingIntervalMs: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_QUEUE_INTERVAL_MS',
      defaultValue: 100,
      description: 'Queue processing interval in milliseconds.',
      schema: z.number().int().min(50).max(5000),
      parse: 'int',
    },
    queueMaxConcurrent: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_QUEUE_CONCURRENCY',
      defaultValue: 3,
      description: 'Maximum concurrent classifications.',
      schema: z.number().int().min(1).max(10),
      parse: 'int',
    },
    fallbackThreshold: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_FALLBACK_THRESHOLD',
      defaultValue: 0.7,
      description:
        'Confidence threshold below which to fallback to main extraction LLM (0-1). Set to 0 to disable fallback.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    fallbackEnabled: {
      envKey: 'AGENT_MEMORY_CLASSIFIER_FALLBACK_ENABLED',
      defaultValue: true,
      description:
        'Enable fallback to main extraction LLM for low-confidence local classifications.',
      schema: z.boolean(),
      parse: 'boolean',
    },
  },
};
