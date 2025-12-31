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
  },
};
