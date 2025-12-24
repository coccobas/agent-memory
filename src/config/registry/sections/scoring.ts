/**
 * Scoring Configuration Section
 *
 * Query result scoring weights.
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
