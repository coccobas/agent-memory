/**
 * Extraction Hook Configuration Section
 *
 * Settings for conversation-aware auto-extraction of storable patterns.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const extractionHookSection: ConfigSectionMeta = {
  name: 'extractionHook',
  description: 'Proactive extraction of storable patterns from write operations.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_EXTRACTION_HOOK_ENABLED',
      defaultValue: true, // Enabled by default for better discoverability
      description: 'Enable proactive extraction of storable patterns.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    confidenceThreshold: {
      envKey: 'AGENT_MEMORY_EXTRACTION_CONFIDENCE_THRESHOLD',
      defaultValue: 0.8, // High bar for suggestions
      description: 'Minimum confidence threshold for extraction suggestions (0-1).',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    maxSuggestionsPerResponse: {
      envKey: 'AGENT_MEMORY_EXTRACTION_MAX_SUGGESTIONS',
      defaultValue: 3,
      description: 'Maximum number of extraction suggestions per response.',
      schema: z.number().int().min(1).max(10),
      parse: 'int',
    },
    cooldownMs: {
      envKey: 'AGENT_MEMORY_EXTRACTION_COOLDOWN_MS',
      defaultValue: 5000, // 5 seconds - prevent spam
      description: 'Cooldown period between extraction attempts (milliseconds).',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    scanOnWriteOps: {
      envKey: 'AGENT_MEMORY_EXTRACTION_SCAN_ON_WRITE',
      defaultValue: true,
      description: 'Scan content after write operations for storable patterns.',
      schema: z.boolean(),
      parse: 'boolean',
    },
  },
};
