/**
 * Suggest Configuration Section
 *
 * Configuration for memory_suggest tool thresholds.
 * Task 61: Configurable confidence thresholds
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const suggestSection: ConfigSectionMeta = {
  name: 'suggest',
  description: 'Memory suggestion tool configuration.',
  options: {
    minConfidence: {
      envKey: 'AGENT_MEMORY_SUGGEST_MIN_CONFIDENCE',
      defaultValue: 0.7,
      description:
        'Minimum confidence threshold for suggestions (0-1). Suggestions below this threshold are filtered out.',
      schema: z.number().min(0).max(1),
      parse: 'number' as const,
    },
    maxSuggestions: {
      envKey: 'AGENT_MEMORY_SUGGEST_MAX_SUGGESTIONS',
      defaultValue: 5,
      description: 'Maximum number of suggestions to return per analysis.',
      schema: z.number().int().min(1).max(50),
      parse: 'int' as const,
    },
    minContentLength: {
      envKey: 'AGENT_MEMORY_SUGGEST_MIN_CONTENT_LENGTH',
      defaultValue: 15,
      description:
        'Minimum character length for matched content to be considered a valid suggestion.',
      schema: z.number().int().min(1).max(500),
      parse: 'int' as const,
    },
  },
};
