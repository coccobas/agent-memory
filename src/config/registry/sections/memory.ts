/**
 * Memory Configuration Section
 *
 * Heap memory management settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const memorySection: ConfigSectionMeta = {
  name: 'memory',
  description: 'Memory management configuration.',
  options: {
    heapPressureThreshold: {
      envKey: 'AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD',
      defaultValue: 0.85,
      description: 'Heap usage threshold (0-1) to trigger memory pressure handling.',
      schema: z.number().min(0).max(1),
    },
    checkIntervalMs: {
      envKey: 'AGENT_MEMORY_MEMORY_CHECK_INTERVAL_MS',
      defaultValue: 30000,
      description: 'Memory check interval in milliseconds.',
      schema: z.number().int().min(1000),
    },
  },
};
