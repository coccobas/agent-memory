/**
 * Context Budget Configuration Section
 *
 * Settings for dynamic token budget allocation during context injection.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const contextBudgetSection: ConfigSectionMeta = {
  name: 'contextBudget',
  description: 'Dynamic context budget configuration for injection.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_CONTEXT_BUDGET_ENABLED',
      defaultValue: true,
      description: 'Enable dynamic context budgeting based on task complexity.',
      schema: z.boolean(),
    },
    baseBudget: {
      envKey: 'AGENT_MEMORY_CONTEXT_BASE_BUDGET',
      defaultValue: 2000,
      description: 'Base token budget for simple tasks.',
      schema: z.number().int().min(100),
    },
    maxBudget: {
      envKey: 'AGENT_MEMORY_CONTEXT_MAX_BUDGET',
      defaultValue: 8000,
      description: 'Maximum token budget for complex tasks.',
      schema: z.number().int().min(100),
    },
    compressionReserve: {
      envKey: 'AGENT_MEMORY_CONTEXT_COMPRESSION_RESERVE',
      defaultValue: 0.2,
      description: 'Reserve this fraction of budget for compression overhead (0-0.5).',
      schema: z.number().min(0).max(0.5),
    },
  },
};

/**
 * Complexity multipliers for different task types
 */
export const complexityMultipliers: Record<string, number> = {
  simple: 1.0,
  moderate: 2.0,
  complex: 4.0,
};
