/**
 * Health Configuration Section
 *
 * Health check and reconnection settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const healthSection: ConfigSectionMeta = {
  name: 'health',
  description: 'Health check and reconnection configuration.',
  options: {
    checkIntervalMs: {
      envKey: 'AGENT_MEMORY_HEALTH_CHECK_INTERVAL_MS',
      defaultValue: 30000,
      description: 'Health check interval in milliseconds.',
      schema: z.number().int().min(1000),
    },
    maxReconnectAttempts: {
      envKey: 'AGENT_MEMORY_MAX_RECONNECT_ATTEMPTS',
      defaultValue: 3,
      description: 'Maximum reconnection attempts.',
      schema: z.number().int().min(0),
    },
    reconnectBaseDelayMs: {
      envKey: 'AGENT_MEMORY_RECONNECT_BASE_DELAY_MS',
      defaultValue: 1000,
      description: 'Base delay between reconnection attempts in milliseconds.',
      schema: z.number().int().min(100),
    },
    reconnectMaxDelayMs: {
      envKey: 'AGENT_MEMORY_RECONNECT_MAX_DELAY_MS',
      defaultValue: 5000,
      description: 'Maximum delay between reconnection attempts in milliseconds.',
      schema: z.number().int().min(100),
    },
  },
};
