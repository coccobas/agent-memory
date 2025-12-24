/**
 * Rate Limit Configuration Section
 *
 * Request rate limiting settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const rateLimitSection: ConfigSectionMeta = {
  name: 'rateLimit',
  description: 'Rate limiting configuration for API requests.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_RATE_LIMIT',
      defaultValue: true,
      description: 'Enable rate limiting. Set to "0" to disable.',
      schema: z.boolean(),
      // Special: "0" disables, anything else enables
      parse: (envValue, _defaultValue) => envValue !== '0',
    },
  },
};

// Nested rate limit settings
export const rateLimitPerAgentOptions = {
  maxRequests: {
    envKey: 'AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX',
    defaultValue: 500,
    description: 'Maximum requests per agent per window.',
    schema: z.number().int().min(1),
    parse: 'int' as const,
  },
  windowMs: {
    envKey: 'AGENT_MEMORY_RATE_LIMIT_PER_AGENT_WINDOW_MS',
    defaultValue: 60000,
    description: 'Per-agent rate limit window in milliseconds.',
    schema: z.number().int().min(1000),
    parse: 'int' as const,
  },
};

export const rateLimitGlobalOptions = {
  maxRequests: {
    envKey: 'AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX',
    defaultValue: 5000,
    description: 'Maximum global requests per window.',
    schema: z.number().int().min(1),
    parse: 'int' as const,
  },
  windowMs: {
    envKey: 'AGENT_MEMORY_RATE_LIMIT_GLOBAL_WINDOW_MS',
    defaultValue: 60000,
    description: 'Global rate limit window in milliseconds.',
    schema: z.number().int().min(1000),
    parse: 'int' as const,
  },
};

export const rateLimitBurstOptions = {
  maxRequests: {
    envKey: 'AGENT_MEMORY_RATE_LIMIT_BURST_MAX',
    defaultValue: 50,
    description: 'Maximum burst requests per second.',
    schema: z.number().int().min(1),
    parse: 'int' as const,
  },
  windowMs: {
    envKey: 'AGENT_MEMORY_RATE_LIMIT_BURST_WINDOW_MS',
    defaultValue: 1000,
    description: 'Burst rate limit window in milliseconds.',
    schema: z.number().int().min(100),
    parse: 'int' as const,
  },
};
