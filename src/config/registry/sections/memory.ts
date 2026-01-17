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
      description: 'Heap usage threshold (0-1) to trigger critical memory pressure.',
      schema: z.number().min(0).max(1),
    },
    pressureWarningThreshold: {
      envKey: 'AGENT_MEMORY_PRESSURE_WARNING_THRESHOLD',
      defaultValue: 0.75,
      description: 'Heap usage threshold (0-1) to trigger warning-level memory pressure.',
      schema: z.number().min(0).max(1),
    },
    checkIntervalMs: {
      envKey: 'AGENT_MEMORY_MEMORY_CHECK_INTERVAL_MS',
      defaultValue: 30000,
      description: 'Memory check interval in milliseconds.',
      schema: z.number().int().min(1000),
    },
    pressureDebounceMs: {
      envKey: 'AGENT_MEMORY_PRESSURE_DEBOUNCE_MS',
      defaultValue: 5000,
      description: 'Minimum time between pressure events in milliseconds (debounce).',
      schema: z.number().int().min(0),
    },
    eventDrivenEnabled: {
      envKey: 'AGENT_MEMORY_PRESSURE_EVENTS_ENABLED',
      defaultValue: true,
      description: 'Enable event-driven memory pressure detection and automatic responses.',
      schema: z.boolean(),
    },
    autoEvictOnPressure: {
      envKey: 'AGENT_MEMORY_AUTO_EVICT_ON_PRESSURE',
      defaultValue: true,
      description: 'Automatically evict cache entries when memory pressure is detected.',
      schema: z.boolean(),
    },
    autoForgetOnCritical: {
      envKey: 'AGENT_MEMORY_AUTO_FORGET_ON_CRITICAL',
      defaultValue: false,
      description:
        'Automatically run forgetting service when critical memory pressure is detected.',
      schema: z.boolean(),
    },
  },
};
