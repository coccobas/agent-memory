/**
 * Circuit Breaker Configuration Section
 *
 * Settings for the circuit breaker pattern that prevents cascading failures.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const circuitBreakerSection: ConfigSectionMeta = {
  name: 'circuitBreaker',
  description: 'Circuit breaker pattern configuration for failure prevention.',
  options: {
    failureThreshold: {
      envKey: 'AGENT_MEMORY_CB_FAILURE_THRESHOLD',
      defaultValue: 5,
      description: 'Number of failures before opening the circuit.',
      schema: z.number().int().min(1),
    },
    resetTimeoutMs: {
      envKey: 'AGENT_MEMORY_CB_RESET_TIMEOUT_MS',
      defaultValue: 30000,
      description: 'Time in milliseconds before attempting to close the circuit.',
      schema: z.number().int().min(1000),
    },
    successThreshold: {
      envKey: 'AGENT_MEMORY_CB_SUCCESS_THRESHOLD',
      defaultValue: 2,
      description: 'Number of successful calls in HALF_OPEN state required to close the circuit.',
      schema: z.number().int().min(1),
    },
    useRedis: {
      envKey: 'AGENT_MEMORY_CB_USE_REDIS',
      defaultValue: false,
      description: 'Use Redis for distributed circuit breaker state sharing.',
      schema: z.boolean(),
    },
    keyPrefix: {
      envKey: 'AGENT_MEMORY_CB_KEY_PREFIX',
      defaultValue: 'agentmem:cb:',
      description: 'Key prefix for circuit breaker state in Redis.',
      schema: z.string(),
    },
    failMode: {
      envKey: 'AGENT_MEMORY_CB_FAIL_MODE',
      defaultValue: 'local-fallback',
      description: 'Behavior when Redis is unavailable: local-fallback (use local state), closed (treat as closed), open (treat as open).',
      schema: z.enum(['local-fallback', 'closed', 'open']),
      allowedValues: ['local-fallback', 'closed', 'open'] as const,
    },
    stateTTLMs: {
      envKey: 'AGENT_MEMORY_CB_STATE_TTL_MS',
      defaultValue: 300000,
      description: 'TTL for circuit breaker state in Redis (default: 5 minutes).',
      schema: z.number().int().min(1000),
      parse: 'int',
    },
  },
};
