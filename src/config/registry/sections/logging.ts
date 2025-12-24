/**
 * Logging Configuration Section
 *
 * Log level and debug settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const loggingSection: ConfigSectionMeta = {
  name: 'logging',
  description: 'Logging configuration.',
  options: {
    level: {
      envKey: 'LOG_LEVEL',
      defaultValue: 'info',
      description: 'Log level: fatal, error, warn, info, debug, or trace.',
      schema: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
    },
    debug: {
      envKey: 'AGENT_MEMORY_DEBUG',
      defaultValue: false,
      description: 'Enable debug mode with additional logging.',
      schema: z.boolean(),
    },
    performance: {
      envKey: 'AGENT_MEMORY_PERF',
      defaultValue: false,
      description: 'Enable performance logging.',
      schema: z.boolean(),
    },
  },
};
