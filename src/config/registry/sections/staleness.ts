/**
 * Staleness Configuration Section
 *
 * Settings for detecting stale/outdated memory entries.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const stalenessSection: ConfigSectionMeta = {
  name: 'staleness',
  description: 'Staleness detection configuration for context injection.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_STALENESS_ENABLED',
      defaultValue: true,
      description: 'Enable staleness warnings during context injection.',
      schema: z.boolean(),
    },
    ageDays: {
      envKey: 'AGENT_MEMORY_STALENESS_AGE_DAYS',
      defaultValue: 90,
      description: 'Entries older than this (in days) are considered potentially stale.',
      schema: z.number().int().min(1),
    },
    recencyThreshold: {
      envKey: 'AGENT_MEMORY_STALENESS_RECENCY_THRESHOLD',
      defaultValue: 0.2,
      description: 'Recency score below this threshold triggers a staleness warning (0-1).',
      schema: z.number().min(0).max(1),
    },
    accessDays: {
      envKey: 'AGENT_MEMORY_STALENESS_ACCESS_DAYS',
      defaultValue: 60,
      description: 'Entries not accessed within this many days may be flagged as stale.',
      schema: z.number().int().min(1),
    },
    excludeFromInjection: {
      envKey: 'AGENT_MEMORY_STALENESS_EXCLUDE',
      defaultValue: false,
      description: 'If true, exclude stale entries from injection. If false, include with warning.',
      schema: z.boolean(),
    },
  },
};
