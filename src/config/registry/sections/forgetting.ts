/**
 * Forgetting Configuration Section
 *
 * Configuration for memory forgetting and decay mechanisms.
 */

import { z } from 'zod';

export const forgettingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  schedule: z.string().default('0 3 * * *'), // Daily at 3 AM

  recency: z
    .object({
      enabled: z.boolean().default(true),
      staleDays: z.number().min(1).default(90),
      threshold: z.number().min(0).max(1).default(0.3),
    })
    .default({ enabled: true, staleDays: 90, threshold: 0.3 }),

  frequency: z
    .object({
      enabled: z.boolean().default(true),
      minAccessCount: z.number().min(0).default(2),
      lookbackDays: z.number().min(1).default(180),
    })
    .default({ enabled: true, minAccessCount: 2, lookbackDays: 180 }),

  importance: z
    .object({
      enabled: z.boolean().default(true),
      threshold: z.number().min(0).max(1).default(0.4),
    })
    .default({ enabled: true, threshold: 0.4 }),

  // Safety settings
  dryRunDefault: z.boolean().default(true),
  maxEntriesPerRun: z.number().min(1).default(100),
  excludeCritical: z.boolean().default(true),
  excludeHighPriority: z.number().min(0).max(100).default(90),
});

export type ForgettingConfigSchema = z.infer<typeof forgettingConfigSchema>;

/**
 * Environment variable mappings for forgetting config.
 */
export const forgettingEnvMappings = {
  enabled: 'AGENT_MEMORY_FORGETTING_ENABLED',
  schedule: 'AGENT_MEMORY_FORGETTING_SCHEDULE',
  'recency.enabled': 'AGENT_MEMORY_FORGETTING_RECENCY_ENABLED',
  'recency.staleDays': 'AGENT_MEMORY_FORGETTING_RECENCY_STALE_DAYS',
  'recency.threshold': 'AGENT_MEMORY_FORGETTING_RECENCY_THRESHOLD',
  'frequency.enabled': 'AGENT_MEMORY_FORGETTING_FREQUENCY_ENABLED',
  'frequency.minAccessCount': 'AGENT_MEMORY_FORGETTING_FREQUENCY_MIN_ACCESS',
  'frequency.lookbackDays': 'AGENT_MEMORY_FORGETTING_FREQUENCY_LOOKBACK_DAYS',
  'importance.enabled': 'AGENT_MEMORY_FORGETTING_IMPORTANCE_ENABLED',
  'importance.threshold': 'AGENT_MEMORY_FORGETTING_IMPORTANCE_THRESHOLD',
  dryRunDefault: 'AGENT_MEMORY_FORGETTING_DRY_RUN_DEFAULT',
  maxEntriesPerRun: 'AGENT_MEMORY_FORGETTING_MAX_ENTRIES',
  excludeCritical: 'AGENT_MEMORY_FORGETTING_EXCLUDE_CRITICAL',
  excludeHighPriority: 'AGENT_MEMORY_FORGETTING_EXCLUDE_HIGH_PRIORITY',
};
