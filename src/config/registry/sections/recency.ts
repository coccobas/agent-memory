/**
 * Recency Configuration Section
 *
 * Time-based decay scoring settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const recencySection: ConfigSectionMeta = {
  name: 'recency',
  description: 'Recency decay scoring configuration.',
  options: {
    defaultDecayHalfLifeDays: {
      envKey: 'AGENT_MEMORY_DECAY_HALF_LIFE_DAYS',
      defaultValue: 14,
      description: 'Default decay half-life in days.',
      schema: z.number().int().min(1),
    },
    defaultRecencyWeight: {
      envKey: 'AGENT_MEMORY_RECENCY_WEIGHT',
      defaultValue: 0.5,
      description: 'Default recency weight in scoring (0-1).',
      schema: z.number().min(0).max(1),
    },
    maxRecencyBoost: {
      envKey: 'AGENT_MEMORY_MAX_RECENCY_BOOST',
      defaultValue: 2.0,
      description: 'Maximum recency boost multiplier.',
      schema: z.number().min(1),
    },
    useUpdatedAt: {
      envKey: 'AGENT_MEMORY_USE_UPDATED_AT',
      defaultValue: true,
      description: 'Use updatedAt (vs createdAt) for recency calculations.',
      schema: z.boolean(),
    },
  },
};

// Per-entry-type decay half-life settings
export const recencyDecayHalfLifeOptions = {
  guideline: {
    envKey: 'AGENT_MEMORY_DECAY_HALF_LIFE_GUIDELINE',
    defaultValue: 30,
    description: 'Decay half-life for guidelines in days (longer = persists).',
    schema: z.number().int().min(1),
  },
  knowledge: {
    envKey: 'AGENT_MEMORY_DECAY_HALF_LIFE_KNOWLEDGE',
    defaultValue: 14,
    description: 'Decay half-life for knowledge in days.',
    schema: z.number().int().min(1),
  },
  tool: {
    envKey: 'AGENT_MEMORY_DECAY_HALF_LIFE_TOOL',
    defaultValue: 7,
    description: 'Decay half-life for tools in days (shorter = decays faster).',
    schema: z.number().int().min(1),
  },
};
