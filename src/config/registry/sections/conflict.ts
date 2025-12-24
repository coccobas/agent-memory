/**
 * Conflict Configuration Section
 *
 * Conflict detection settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const conflictSection: ConfigSectionMeta = {
  name: 'conflict',
  description: 'Conflict detection configuration.',
  options: {
    windowMs: {
      envKey: 'AGENT_MEMORY_CONFLICT_WINDOW_MS',
      defaultValue: 5000,
      description: 'Conflict detection window in milliseconds.',
      schema: z.number().int().min(0),
    },
    highErrorCorrelationThreshold: {
      envKey: 'AGENT_MEMORY_HIGH_ERROR_CORRELATION_THRESHOLD',
      defaultValue: 0.7,
      description: 'Threshold for high error correlation detection (0-1).',
      schema: z.number().min(0).max(1),
    },
  },
};
