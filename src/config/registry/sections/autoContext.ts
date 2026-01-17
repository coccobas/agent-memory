/**
 * Auto-Context Configuration Section
 *
 * Settings for automatic context detection from working directory.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const autoContextSection: ConfigSectionMeta = {
  name: 'autoContext',
  description: 'Auto-context detection from working directory.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_AUTO_CONTEXT',
      defaultValue: true,
      description: 'Enable automatic context detection from working directory.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    defaultAgentId: {
      envKey: 'AGENT_MEMORY_DEFAULT_AGENT_ID',
      defaultValue: 'claude-code',
      description: 'Default agentId when not specified in tool calls.',
      schema: z.string(),
    },
    cacheTTLMs: {
      envKey: 'AGENT_MEMORY_AUTO_CONTEXT_CACHE_TTL_MS',
      defaultValue: 5000,
      description: 'Cache TTL for auto-detected context (milliseconds).',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    autoProject: {
      envKey: 'AGENT_MEMORY_AUTO_PROJECT',
      defaultValue: true,
      description:
        'Automatically create a project on first write operation if none exists for the current working directory.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    autoSession: {
      envKey: 'AGENT_MEMORY_AUTO_SESSION',
      defaultValue: true,
      description: 'Automatically create a session on first write operation if none exists.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    autoSessionName: {
      envKey: 'AGENT_MEMORY_AUTO_SESSION_NAME',
      defaultValue: 'Auto-session',
      description: 'Default name for auto-created sessions.',
      schema: z.string(),
    },
    sessionTimeoutEnabled: {
      envKey: 'AGENT_MEMORY_SESSION_TIMEOUT_ENABLED',
      defaultValue: true,
      description: 'Enable automatic session timeout for inactive sessions.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    sessionInactivityMs: {
      envKey: 'AGENT_MEMORY_SESSION_INACTIVITY_MS',
      defaultValue: 1800000, // 30 minutes
      description: 'Milliseconds of inactivity before auto-ending a session.',
      schema: z.number().int().min(60000), // At least 1 minute
      parse: 'int',
    },
    sessionTimeoutCheckMs: {
      envKey: 'AGENT_MEMORY_SESSION_TIMEOUT_CHECK_MS',
      defaultValue: 300000, // 5 minutes
      description: 'Interval in milliseconds between timeout checks.',
      schema: z.number().int().min(10000), // At least 10 seconds
      parse: 'int',
    },
  },
};
