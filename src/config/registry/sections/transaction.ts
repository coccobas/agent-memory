/**
 * Transaction Configuration Section
 *
 * Database transaction retry settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const transactionSection: ConfigSectionMeta = {
  name: 'transaction',
  description: 'Database transaction retry configuration.',
  options: {
    maxRetries: {
      envKey: 'AGENT_MEMORY_TX_RETRIES',
      defaultValue: 3,
      description: 'Maximum transaction retry attempts.',
      schema: z.number().int().min(0),
    },
    initialDelayMs: {
      envKey: 'AGENT_MEMORY_TX_DELAY_MS',
      defaultValue: 10,
      description: 'Initial delay between transaction retries in milliseconds.',
      schema: z.number().int().min(0),
    },
    maxDelayMs: {
      envKey: 'AGENT_MEMORY_TX_MAX_DELAY_MS',
      defaultValue: 1000,
      description: 'Maximum delay between transaction retries in milliseconds.',
      schema: z.number().int().min(0),
    },
    backoffMultiplier: {
      envKey: 'AGENT_MEMORY_TX_BACKOFF',
      defaultValue: 2,
      description: 'Backoff multiplier for transaction retry delays.',
      schema: z.number().min(1),
    },
  },
};
