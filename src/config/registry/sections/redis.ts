/**
 * Redis Configuration Section
 *
 * Redis settings for distributed deployments.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const redisSection: ConfigSectionMeta = {
  name: 'redis',
  description: 'Redis configuration for distributed caching, locking, and events.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_REDIS_ENABLED',
      defaultValue: false,
      description: 'Enable Redis for distributed operations.',
      schema: z.boolean(),
    },
    url: {
      envKey: 'AGENT_MEMORY_REDIS_URL',
      defaultValue: undefined,
      description: 'Redis connection URL (overrides host/port if set).',
      schema: z.string().optional(),
      sensitive: true,
    },
    host: {
      envKey: 'AGENT_MEMORY_REDIS_HOST',
      defaultValue: 'localhost',
      description: 'Redis server hostname.',
      schema: z.string(),
    },
    port: {
      envKey: 'AGENT_MEMORY_REDIS_PORT',
      defaultValue: 6379,
      description: 'Redis server port.',
      schema: z.number().int().min(1).max(65535),
      parse: 'port',
    },
    password: {
      envKey: 'AGENT_MEMORY_REDIS_PASSWORD',
      defaultValue: undefined,
      description: 'Redis password.',
      schema: z.string().optional(),
      sensitive: true,
    },
    db: {
      envKey: 'AGENT_MEMORY_REDIS_DB',
      defaultValue: 0,
      description: 'Redis database number.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    tls: {
      envKey: 'AGENT_MEMORY_REDIS_TLS',
      defaultValue: false,
      description: 'Enable TLS/SSL for Redis connections.',
      schema: z.boolean(),
    },
    keyPrefix: {
      envKey: 'AGENT_MEMORY_REDIS_KEY_PREFIX',
      defaultValue: 'agentmem:',
      description: 'Key prefix for namespacing Redis keys.',
      schema: z.string(),
    },
    cacheTTLMs: {
      envKey: 'AGENT_MEMORY_REDIS_CACHE_TTL_MS',
      defaultValue: 3600000,
      description: 'Cache TTL in milliseconds (default: 1 hour).',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    lockTTLMs: {
      envKey: 'AGENT_MEMORY_REDIS_LOCK_TTL_MS',
      defaultValue: 30000,
      description: 'Lock TTL in milliseconds (default: 30 seconds).',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    lockRetryCount: {
      envKey: 'AGENT_MEMORY_REDIS_LOCK_RETRY_COUNT',
      defaultValue: 3,
      description: 'Lock acquisition retry count.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    lockRetryDelayMs: {
      envKey: 'AGENT_MEMORY_REDIS_LOCK_RETRY_DELAY_MS',
      defaultValue: 200,
      description: 'Delay between lock acquisition retries in milliseconds.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    eventChannel: {
      envKey: 'AGENT_MEMORY_REDIS_EVENT_CHANNEL',
      defaultValue: 'agentmem:events',
      description: 'Redis pub/sub channel for events.',
      schema: z.string(),
    },
    connectTimeoutMs: {
      envKey: 'AGENT_MEMORY_REDIS_CONNECT_TIMEOUT_MS',
      defaultValue: 10000,
      description: 'Connection timeout in milliseconds.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    maxRetriesPerRequest: {
      envKey: 'AGENT_MEMORY_REDIS_MAX_RETRIES',
      defaultValue: 3,
      description: 'Maximum retries per Redis request.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
  },
};
