/**
 * Tools Configuration Section
 *
 * Settings for tool visibility and progressive disclosure.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const toolsSection: ConfigSectionMeta = {
  name: 'tools',
  description: 'Tool visibility and progressive disclosure settings.',
  options: {
    visibility: {
      envKey: 'AGENT_MEMORY_TOOL_VISIBILITY',
      defaultValue: 'standard',
      description:
        'Tool visibility level: core (10 tools), standard (16), advanced (32), all (42+).',
      schema: z.enum(['core', 'standard', 'advanced', 'all']),
      allowedValues: ['core', 'standard', 'advanced', 'all'] as const,
    },
  },
};
