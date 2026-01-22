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
    sessionStartDefault: {
      envKey: 'AGENT_MEMORY_CONTEXT_SESSION_START_DEFAULT',
      defaultValue: 2000,
      description: 'Default token budget for session_start purpose.',
      schema: z.number().int().min(100),
    },
    sessionStartMin: {
      envKey: 'AGENT_MEMORY_CONTEXT_SESSION_START_MIN',
      defaultValue: 500,
      description: 'Minimum token budget for session_start purpose.',
      schema: z.number().int().min(100),
    },
    sessionStartMax: {
      envKey: 'AGENT_MEMORY_CONTEXT_SESSION_START_MAX',
      defaultValue: 4000,
      description: 'Maximum token budget for session_start purpose.',
      schema: z.number().int().min(100),
    },
    toolInjectionDefault: {
      envKey: 'AGENT_MEMORY_CONTEXT_TOOL_INJECTION_DEFAULT',
      defaultValue: 1600,
      description: 'Default token budget for tool_injection purpose.',
      schema: z.number().int().min(100),
    },
    toolInjectionMin: {
      envKey: 'AGENT_MEMORY_CONTEXT_TOOL_INJECTION_MIN',
      defaultValue: 200,
      description: 'Minimum token budget for tool_injection purpose.',
      schema: z.number().int().min(100),
    },
    toolInjectionMax: {
      envKey: 'AGENT_MEMORY_CONTEXT_TOOL_INJECTION_MAX',
      defaultValue: 3200,
      description: 'Maximum token budget for tool_injection purpose.',
      schema: z.number().int().min(100),
    },
    queryDefault: {
      envKey: 'AGENT_MEMORY_CONTEXT_QUERY_DEFAULT',
      defaultValue: 4000,
      description: 'Default token budget for query purpose.',
      schema: z.number().int().min(100),
    },
    queryMin: {
      envKey: 'AGENT_MEMORY_CONTEXT_QUERY_MIN',
      defaultValue: 1000,
      description: 'Minimum token budget for query purpose.',
      schema: z.number().int().min(100),
    },
    queryMax: {
      envKey: 'AGENT_MEMORY_CONTEXT_QUERY_MAX',
      defaultValue: 8000,
      description: 'Maximum token budget for query purpose.',
      schema: z.number().int().min(100),
    },
    customDefault: {
      envKey: 'AGENT_MEMORY_CONTEXT_CUSTOM_DEFAULT',
      defaultValue: 2000,
      description: 'Default token budget for custom purpose.',
      schema: z.number().int().min(100),
    },
    customMin: {
      envKey: 'AGENT_MEMORY_CONTEXT_CUSTOM_MIN',
      defaultValue: 200,
      description: 'Minimum token budget for custom purpose.',
      schema: z.number().int().min(100),
    },
    customMax: {
      envKey: 'AGENT_MEMORY_CONTEXT_CUSTOM_MAX',
      defaultValue: 8000,
      description: 'Maximum token budget for custom purpose.',
      schema: z.number().int().min(100),
    },
  },
};

export interface PurposeBudgetConfig {
  default: number;
  min: number;
  max: number;
}

export const complexityMultipliers: Record<string, number> = {
  simple: 1.0,
  moderate: 2.0,
  complex: 4.0,
  critical: 4.0,
};
