/**
 * Auto-Tagging Configuration Section
 *
 * Settings for automatic tag inference and attachment.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const autoTaggingSection: ConfigSectionMeta = {
  name: 'autoTagging',
  description: 'Automatic tag inference and attachment for memory entries.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_AUTO_TAGGING_ENABLED',
      defaultValue: true,
      description: 'Enable automatic tag inference and attachment.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    maxTags: {
      envKey: 'AGENT_MEMORY_AUTO_TAGGING_MAX_TAGS',
      defaultValue: 3,
      description: 'Maximum number of tags to auto-apply per entry.',
      schema: z.number().int().min(1).max(10),
      parse: 'int',
    },
    minConfidence: {
      envKey: 'AGENT_MEMORY_AUTO_TAGGING_MIN_CONFIDENCE',
      defaultValue: 0.6,
      description: 'Minimum confidence threshold for tag inference (0-1).',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    skipIfUserProvided: {
      envKey: 'AGENT_MEMORY_AUTO_TAGGING_SKIP_IF_USER_PROVIDED',
      defaultValue: true,
      description: 'Skip auto-tagging if user provides explicit tags.',
      schema: z.boolean(),
      parse: 'boolean',
    },
  },
};
