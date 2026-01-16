/**
 * Security Configuration Section
 *
 * Authentication and security settings.
 *
 * SIMPLIFIED AUTH MODEL:
 * - AGENT_MEMORY_API_KEY: Single key for all authentication (MCP, REST, admin)
 * - AGENT_MEMORY_DEV_MODE: Single flag to enable dev mode (bypasses all auth)
 *
 * Legacy variables are still supported for backward compatibility but are deprecated.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const securitySection: ConfigSectionMeta = {
  name: 'security',
  description: 'Security and authentication configuration.',
  options: {
    // ===========================================
    // NEW SIMPLIFIED CONFIG (preferred)
    // ===========================================
    apiKey: {
      envKey: 'AGENT_MEMORY_API_KEY',
      defaultValue: undefined,
      description:
        'Unified API key for all authentication (MCP, REST API, admin operations). ' +
        'This is the only key you need to configure.',
      schema: z.string().optional(),
      sensitive: true,
    },
    devMode: {
      envKey: 'AGENT_MEMORY_DEV_MODE',
      defaultValue: false,
      description:
        'Enable development mode. When true, all permission checks and authentication ' +
        'are bypassed. Use for local development only.',
      schema: z.boolean(),
    },

    // ===========================================
    // LEGACY CONFIG (deprecated, still supported)
    // ===========================================
    restAuthDisabled: {
      envKey: 'AGENT_MEMORY_REST_AUTH_DISABLED',
      defaultValue: false,
      description:
        '[DEPRECATED] Disable REST API authentication. Use AGENT_MEMORY_DEV_MODE=true instead.',
      schema: z.boolean(),
    },
    restApiKey: {
      envKey: 'AGENT_MEMORY_REST_API_KEY',
      defaultValue: undefined,
      description: '[DEPRECATED] REST API key. Use AGENT_MEMORY_API_KEY instead.',
      schema: z.string().optional(),
      sensitive: true,
    },
    restApiKeys: {
      envKey: 'AGENT_MEMORY_REST_API_KEYS',
      defaultValue: undefined,
      description:
        '[DEPRECATED] Multiple REST API keys as JSON or CSV. Use AGENT_MEMORY_API_KEY instead.',
      schema: z.string().optional(),
      sensitive: true,
    },
    restAgentId: {
      envKey: 'AGENT_MEMORY_REST_AGENT_ID',
      defaultValue: 'rest-api',
      description: 'Default agent ID for REST API requests when using the unified API key.',
      schema: z.string(),
    },
    csrfSecret: {
      envKey: 'AGENT_MEMORY_CSRF_SECRET',
      defaultValue: undefined,
      description:
        'Secret key for CSRF token HMAC signing (min 32 chars). ' +
        'Falls back to API_KEY if not set.',
      schema: z.string().min(32).optional(),
      sensitive: true,
    },
  },
};
