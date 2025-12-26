/**
 * Scoring Configuration Section
 *
 * Query result scoring weights and feedback scoring configuration.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const scoringSection: ConfigSectionMeta = {
  name: 'scoring',
  description: 'Query scoring configuration.',
  options: {},
};

// Nested scoring weights
export const scoringWeightOptions = {
  explicitRelation: {
    envKey: 'AGENT_MEMORY_SCORE_EXPLICIT_RELATION',
    defaultValue: 50,
    description: 'Score weight for explicit relations.',
    schema: z.number().int().min(0),
  },
  tagMatch: {
    envKey: 'AGENT_MEMORY_SCORE_TAG_MATCH',
    defaultValue: 10,
    description: 'Score weight for tag matches.',
    schema: z.number().int().min(0),
  },
  scopeProximity: {
    envKey: 'AGENT_MEMORY_SCORE_SCOPE_PROXIMITY',
    defaultValue: 20,
    description: 'Score weight for scope proximity.',
    schema: z.number().int().min(0),
  },
  textMatch: {
    envKey: 'AGENT_MEMORY_SCORE_TEXT_MATCH',
    defaultValue: 30,
    description: 'Score weight for text matches.',
    schema: z.number().int().min(0),
  },
  priorityMax: {
    envKey: 'AGENT_MEMORY_SCORE_PRIORITY_MAX',
    defaultValue: 20,
    description: 'Maximum score for priority.',
    schema: z.number().int().min(0),
  },
  semanticMax: {
    envKey: 'AGENT_MEMORY_SCORE_SEMANTIC_MAX',
    defaultValue: 40,
    description: 'Maximum score for semantic similarity.',
    schema: z.number().int().min(0),
  },
  recencyMax: {
    envKey: 'AGENT_MEMORY_SCORE_RECENCY_MAX',
    defaultValue: 100,
    description: 'Maximum score for recency.',
    schema: z.number().int().min(0),
  },
};

// Feedback scoring configuration
export const feedbackScoringOptions = {
  enabled: {
    envKey: 'AGENT_MEMORY_FEEDBACK_SCORING_ENABLED',
    defaultValue: true,
    description: 'Enable feedback-based score multipliers.',
    schema: z.boolean(),
    parse: 'boolean' as const,
  },
  boostPerPositive: {
    envKey: 'AGENT_MEMORY_FEEDBACK_BOOST_PER_POSITIVE',
    defaultValue: 0.02,
    description: 'Score boost per positive feedback (e.g., 0.02 = +2%).',
    schema: z.number().min(0).max(1),
    parse: 'number' as const,
  },
  boostMax: {
    envKey: 'AGENT_MEMORY_FEEDBACK_BOOST_MAX',
    defaultValue: 0.10,
    description: 'Maximum boost from positive feedback (e.g., 0.10 = +10%).',
    schema: z.number().min(0).max(1),
    parse: 'number' as const,
  },
  penaltyPerNegative: {
    envKey: 'AGENT_MEMORY_FEEDBACK_PENALTY_PER_NEGATIVE',
    defaultValue: 0.10,
    description: 'Score penalty per negative feedback (e.g., 0.10 = -10%).',
    schema: z.number().min(0).max(1),
    parse: 'number' as const,
  },
  penaltyMax: {
    envKey: 'AGENT_MEMORY_FEEDBACK_PENALTY_MAX',
    defaultValue: 0.50,
    description: 'Maximum penalty from negative feedback (e.g., 0.50 = -50%).',
    schema: z.number().min(0).max(1),
    parse: 'number' as const,
  },
  cacheTTLMs: {
    envKey: 'AGENT_MEMORY_FEEDBACK_CACHE_TTL_MS',
    defaultValue: 60000,
    description: 'TTL for feedback score cache in milliseconds.',
    schema: z.number().int().min(0),
    parse: 'int' as const,
  },
  cacheMaxSize: {
    envKey: 'AGENT_MEMORY_FEEDBACK_CACHE_MAX_SIZE',
    defaultValue: 1000,
    description: 'Maximum number of entries in feedback score cache.',
    schema: z.number().int().min(0),
    parse: 'int' as const,
  },
};

// Entity scoring configuration (for entity-aware retrieval)
export const entityScoringOptions = {
  enabled: {
    envKey: 'AGENT_MEMORY_ENTITY_FILTER_ENABLED',
    defaultValue: true,
    description: 'Enable entity-aware retrieval filtering.',
    schema: z.boolean(),
    parse: 'boolean' as const,
  },
  exactMatchBoost: {
    envKey: 'AGENT_MEMORY_SCORE_ENTITY_MATCH_EXACT',
    defaultValue: 25,
    description: 'Score boost for exact entity match (all entities in query match entry).',
    schema: z.number().int().min(0),
    parse: 'int' as const,
  },
  partialMatchBoost: {
    envKey: 'AGENT_MEMORY_SCORE_ENTITY_MATCH_PARTIAL',
    defaultValue: 10,
    description: 'Base score boost for partial entity match (scaled by match ratio).',
    schema: z.number().int().min(0),
    parse: 'int' as const,
  },
};
