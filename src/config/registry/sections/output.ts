/**
 * Output Configuration Section
 *
 * Response formatting settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const outputSection: ConfigSectionMeta = {
  name: 'output',
  description: 'Output formatting configuration.',
  options: {
    format: {
      envKey: 'AGENT_MEMORY_OUTPUT_FORMAT',
      defaultValue: 'json',
      description:
        'Output format: json (verbose), compact (one-line), or terminal (rich formatting).',
      schema: z.enum(['json', 'compact', 'terminal']),
    },
  },
};
