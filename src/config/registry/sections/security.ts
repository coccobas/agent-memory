/**
 * Security Configuration Section
 *
 * Authentication and security settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const securitySection: ConfigSectionMeta = {
  name: 'security',
  description: 'Security and authentication configuration.',
  options: {
    restAuthDisabled: {
      envKey: 'AGENT_MEMORY_REST_AUTH_DISABLED',
      defaultValue: false,
      description: 'Disable REST API authentication (not recommended for production).',
      schema: z.boolean(),
    },
    restApiKey: {
      envKey: 'AGENT_MEMORY_REST_API_KEY',
      defaultValue: undefined,
      description: 'Single REST API key for authentication.',
      schema: z.string().optional(),
      sensitive: true,
    },
    restApiKeys: {
      envKey: 'AGENT_MEMORY_REST_API_KEYS',
      defaultValue: undefined,
      description: 'Multiple REST API keys as JSON or CSV (key:agentId format).',
      schema: z.string().optional(),
      sensitive: true,
    },
    restAgentId: {
      envKey: 'AGENT_MEMORY_REST_AGENT_ID',
      defaultValue: 'rest-api',
      description: 'Default agent ID for REST API requests.',
      schema: z.string(),
    },
  },
};
