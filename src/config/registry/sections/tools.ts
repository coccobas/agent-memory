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
      defaultValue: 'core',
      description:
        'Tool visibility level: core (9 tools), standard (+14=23), advanced (+16=39), experimental (+3=42), all (+8=50).',
      schema: z.enum(['core', 'standard', 'advanced', 'experimental', 'all']),
      allowedValues: ['core', 'standard', 'advanced', 'experimental', 'all'] as const,
    },
  },
};
