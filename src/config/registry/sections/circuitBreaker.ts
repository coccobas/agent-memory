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
  },
};
