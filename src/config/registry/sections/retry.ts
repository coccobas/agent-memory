/**
 * Retry Configuration Section
 *
 * Network operation retry settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const retrySection: ConfigSectionMeta = {
  name: 'retry',
  description: 'Network operation retry configuration.',
  options: {
    maxAttempts: {
      envKey: 'AGENT_MEMORY_RETRY_MAX_ATTEMPTS',
      defaultValue: 3,
      description: 'Maximum retry attempts.',
      schema: z.number().int().min(1),
    },
    initialDelayMs: {
      envKey: 'AGENT_MEMORY_RETRY_INITIAL_DELAY_MS',
      defaultValue: 100,
      description: 'Initial delay between retries in milliseconds.',
      schema: z.number().int().min(0),
    },
    maxDelayMs: {
      envKey: 'AGENT_MEMORY_RETRY_MAX_DELAY_MS',
      defaultValue: 5000,
      description: 'Maximum delay between retries in milliseconds.',
      schema: z.number().int().min(0),
    },
    backoffMultiplier: {
      envKey: 'AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER',
      defaultValue: 2,
      description: 'Backoff multiplier for retry delays.',
      schema: z.number().min(1),
    },
  },
};
