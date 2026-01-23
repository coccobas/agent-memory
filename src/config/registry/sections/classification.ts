/**
 * Classification Configuration Section
 *
 * Hybrid classification settings for memory_remember tool.
 * Combines fast regex patterns with LLM fallback and learns from corrections.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const classificationSection: ConfigSectionMeta = {
  name: 'classification',
  description: 'Hybrid classification configuration for entry type detection.',
  options: {
    highConfidenceThreshold: {
      envKey: 'AGENT_MEMORY_CLASSIFICATION_HIGH_THRESHOLD',
      defaultValue: 0.85,
      description:
        'Confidence threshold above which regex result is used directly without LLM verification.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    lowConfidenceThreshold: {
      envKey: 'AGENT_MEMORY_CLASSIFICATION_LOW_THRESHOLD',
      defaultValue: 0.6,
      description: 'Confidence threshold below which LLM fallback is always used (if available).',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    enableLLMFallback: {
      envKey: 'AGENT_MEMORY_CLASSIFICATION_LLM_FALLBACK',
      defaultValue: true,
      description:
        'Enable LLM fallback for ambiguous classifications. Requires extraction provider to be configured.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    preferLLM: {
      envKey: 'AGENT_MEMORY_CLASSIFICATION_PREFER_LLM',
      defaultValue: true,
      description:
        'Always use LLM for classification when available (more accurate). Falls back to regex if LLM unavailable or fails.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    feedbackDecayDays: {
      envKey: 'AGENT_MEMORY_CLASSIFICATION_FEEDBACK_DECAY_DAYS',
      defaultValue: 30,
      description:
        'Number of days for feedback time decay. Recent feedback has more influence than older feedback.',
      schema: z.number().int().min(1).max(365),
      parse: 'int',
    },
    maxPatternBoost: {
      envKey: 'AGENT_MEMORY_CLASSIFICATION_MAX_PATTERN_BOOST',
      defaultValue: 0.15,
      description:
        'Maximum confidence boost from positive feedback (pattern multiplier ceiling above 1.0).',
      schema: z.number().min(0).max(0.5),
      parse: 'number',
    },
    maxPatternPenalty: {
      envKey: 'AGENT_MEMORY_CLASSIFICATION_MAX_PATTERN_PENALTY',
      defaultValue: 0.3,
      description:
        'Maximum confidence penalty from negative feedback (pattern multiplier floor below 1.0).',
      schema: z.number().min(0).max(0.5),
      parse: 'number',
    },
    cacheSize: {
      envKey: 'AGENT_MEMORY_CLASSIFICATION_CACHE_SIZE',
      defaultValue: 500,
      description: 'Maximum number of cached classification results.',
      schema: z.number().int().min(10).max(10000),
      parse: 'int',
    },
    cacheTTLMs: {
      envKey: 'AGENT_MEMORY_CLASSIFICATION_CACHE_TTL_MS',
      defaultValue: 300000, // 5 minutes
      description: 'Cache TTL in milliseconds for classification results.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    learningRate: {
      envKey: 'AGENT_MEMORY_CLASSIFICATION_LEARNING_RATE',
      defaultValue: 0.1,
      description:
        'Learning rate (alpha) for exponential moving average when updating pattern confidence.',
      schema: z.number().min(0.01).max(1),
      parse: 'number',
    },
  },
};
