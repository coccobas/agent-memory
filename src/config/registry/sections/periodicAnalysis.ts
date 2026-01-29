/**
 * Periodic Analysis Configuration Section
 *
 * Periodic tool outcome analysis configuration.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const periodicAnalysisSection: ConfigSectionMeta = {
  name: 'periodicAnalysis',
  description: 'Periodic tool outcome analysis configuration.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_PERIODIC_ANALYSIS_ENABLED',
      defaultValue: true,
      description: 'Enable periodic tool outcome analysis.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    toolCountThreshold: {
      envKey: 'AGENT_MEMORY_PERIODIC_ANALYSIS_THRESHOLD',
      defaultValue: 20,
      description: 'Number of tools before triggering analysis.',
      schema: z.number().int().min(5),
      parse: 'int',
    },
    minSuccessCount: {
      envKey: 'AGENT_MEMORY_PERIODIC_ANALYSIS_MIN_SUCCESS',
      defaultValue: 5,
      description: 'Minimum success count before analysis.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    analysisTimeoutMs: {
      envKey: 'AGENT_MEMORY_PERIODIC_ANALYSIS_TIMEOUT_MS',
      defaultValue: 30000,
      description: 'Timeout for LLM analysis call.',
      schema: z.number().int().min(1000),
      parse: 'int',
    },
  },
};
