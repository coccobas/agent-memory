/**
 * Runtime Configuration Section
 *
 * Runtime environment settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const runtimeSection: ConfigSectionMeta = {
  name: 'runtime',
  description: 'Runtime environment configuration.',
  options: {
    nodeEnv: {
      envKey: 'NODE_ENV',
      defaultValue: 'development',
      description: 'Node.js environment: development, production, or test.',
      schema: z.string(),
    },
    projectRoot: {
      envKey: '',
      defaultValue: '',
      description: 'Project root directory (computed, not from env var).',
      schema: z.string(),
    },
    singleInstance: {
      envKey: 'AGENT_MEMORY_SINGLE_INSTANCE',
      defaultValue: true,
      description:
        'Enforce single MCP server instance via PID file. Set to false to allow multiple instances.',
      schema: z.boolean(),
      parse: 'boolean',
    },
  },
};
