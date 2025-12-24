/**
 * REST API Configuration Section
 *
 * REST API server settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const restSection: ConfigSectionMeta = {
  name: 'rest',
  description: 'REST API server configuration.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_REST_ENABLED',
      defaultValue: false,
      description: 'Enable REST API server.',
      schema: z.boolean(),
    },
    host: {
      envKey: 'AGENT_MEMORY_REST_HOST',
      defaultValue: '127.0.0.1',
      description: 'REST API server host.',
      schema: z.string(),
    },
    port: {
      envKey: 'AGENT_MEMORY_REST_PORT',
      defaultValue: 8787,
      description: 'REST API server port.',
      schema: z.number().int().min(1).max(65535),
      parse: 'port',
    },
  },
};
