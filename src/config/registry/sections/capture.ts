/**
 * Capture Configuration Section
 *
 * Settings for the unified capture service that handles:
 * - Session-end experience extraction
 * - Turn-based knowledge capture
 * - Deduplication settings
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const captureSection: ConfigSectionMeta = {
  name: 'capture',
  description: 'Unified capture service configuration.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_CAPTURE_ENABLED',
      defaultValue: true,
      description: 'Enable the capture service.',
      schema: z.boolean(),
      parse: 'boolean',
    },

    // Session-end capture settings
    sessionEndEnabled: {
      envKey: 'AGENT_MEMORY_CAPTURE_SESSION_END_ENABLED',
      defaultValue: true,
      description: 'Enable experience extraction at session end.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    sessionEndMinTurns: {
      envKey: 'AGENT_MEMORY_CAPTURE_SESSION_END_MIN_TURNS',
      defaultValue: 3,
      description: 'Minimum turns required before session-end capture.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    sessionEndMinTokens: {
      envKey: 'AGENT_MEMORY_CAPTURE_SESSION_END_MIN_TOKENS',
      defaultValue: 500,
      description: 'Minimum tokens required before session-end capture.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    sessionEndExtractExperiences: {
      envKey: 'AGENT_MEMORY_CAPTURE_SESSION_END_EXTRACT_EXPERIENCES',
      defaultValue: true,
      description: 'Extract experiences at session end.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    sessionEndExtractKnowledge: {
      envKey: 'AGENT_MEMORY_CAPTURE_SESSION_END_EXTRACT_KNOWLEDGE',
      defaultValue: true,
      description: 'Extract knowledge at session end.',
      schema: z.boolean(),
      parse: 'boolean',
    },

    // Turn-based capture settings
    turnBasedEnabled: {
      envKey: 'AGENT_MEMORY_CAPTURE_TURN_BASED_ENABLED',
      defaultValue: true,
      description: 'Enable turn-based capture triggers.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    turnBasedTriggerAfterTurns: {
      envKey: 'AGENT_MEMORY_CAPTURE_TURN_BASED_TRIGGER_TURNS',
      defaultValue: 10,
      description: 'Trigger capture after this many turns.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    turnBasedTriggerAfterTokens: {
      envKey: 'AGENT_MEMORY_CAPTURE_TURN_BASED_TRIGGER_TOKENS',
      defaultValue: 5000,
      description: 'Trigger capture after this many tokens.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    turnBasedTriggerOnToolError: {
      envKey: 'AGENT_MEMORY_CAPTURE_TURN_BASED_TRIGGER_ON_ERROR',
      defaultValue: true,
      description: 'Trigger capture when a tool error occurs.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    turnBasedMaxCapturesPerSession: {
      envKey: 'AGENT_MEMORY_CAPTURE_TURN_BASED_MAX_CAPTURES',
      defaultValue: 5,
      description: 'Maximum number of turn-based captures per session.',
      schema: z.number().int().min(0),
      parse: 'int',
    },

    // Deduplication settings
    deduplicationEnabled: {
      envKey: 'AGENT_MEMORY_CAPTURE_DEDUP_ENABLED',
      defaultValue: true,
      description: 'Enable content deduplication.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    deduplicationSimilarityThreshold: {
      envKey: 'AGENT_MEMORY_CAPTURE_DEDUP_THRESHOLD',
      defaultValue: 0.9,
      description: 'Similarity threshold for deduplication (0-1).',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    deduplicationHashAlgorithm: {
      envKey: 'AGENT_MEMORY_CAPTURE_DEDUP_HASH_ALGORITHM',
      defaultValue: 'sha256',
      description: 'Hash algorithm for deduplication.',
      schema: z.enum(['sha256', 'md5']),
    },

    // Confidence thresholds
    confidenceExperience: {
      envKey: 'AGENT_MEMORY_CAPTURE_CONFIDENCE_EXPERIENCE',
      defaultValue: 0.7,
      description: 'Confidence threshold for experience extraction.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    confidenceKnowledge: {
      envKey: 'AGENT_MEMORY_CAPTURE_CONFIDENCE_KNOWLEDGE',
      defaultValue: 0.7,
      description: 'Confidence threshold for knowledge extraction.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    confidenceGuideline: {
      envKey: 'AGENT_MEMORY_CAPTURE_CONFIDENCE_GUIDELINE',
      defaultValue: 0.75,
      description: 'Confidence threshold for guideline extraction.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    confidenceTool: {
      envKey: 'AGENT_MEMORY_CAPTURE_CONFIDENCE_TOOL',
      defaultValue: 0.65,
      description: 'Confidence threshold for tool extraction.',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
  },
};
