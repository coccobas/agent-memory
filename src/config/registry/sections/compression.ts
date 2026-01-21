/**
 * Compression Configuration Section
 *
 * Settings for context compression during injection.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const compressionSection: ConfigSectionMeta = {
  name: 'compression',
  description: 'Context compression configuration for injection.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_COMPRESSION_ENABLED',
      defaultValue: true,
      description: 'Enable automatic compression when context exceeds budget.',
      schema: z.boolean(),
    },
    hierarchicalThreshold: {
      envKey: 'AGENT_MEMORY_COMPRESSION_HIERARCHICAL_THRESHOLD',
      defaultValue: 1500,
      description: 'Token threshold above which to apply hierarchical grouping compression.',
      schema: z.number().int().min(100),
    },
    llmThreshold: {
      envKey: 'AGENT_MEMORY_COMPRESSION_LLM_THRESHOLD',
      defaultValue: 3000,
      description: 'Token threshold above which to apply LLM-based summarization.',
      schema: z.number().int().min(100),
    },
    indicateCompression: {
      envKey: 'AGENT_MEMORY_COMPRESSION_INDICATE',
      defaultValue: true,
      description: 'Include an indicator when compression was applied.',
      schema: z.boolean(),
    },
  },
};
