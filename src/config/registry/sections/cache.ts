/**
 * Cache Configuration Section
 *
 * Query cache and memory limits.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const cacheSection: ConfigSectionMeta = {
  name: 'cache',
  description: 'Cache configuration for query results and prepared statements.',
  options: {
    totalLimitMB: {
      envKey: 'AGENT_MEMORY_CACHE_LIMIT_MB',
      defaultValue: 512,
      description: 'Total cache memory limit in megabytes.',
      schema: z.number().int().min(1),
    },
    queryCacheTTLMs: {
      envKey: 'AGENT_MEMORY_QUERY_CACHE_TTL_MS',
      defaultValue: 5 * 60 * 1000,
      description: 'Query cache TTL in milliseconds.',
      schema: z.number().int().min(0),
    },
    scopeCacheTTLMs: {
      envKey: 'AGENT_MEMORY_SCOPE_CACHE_TTL_MS',
      defaultValue: 10 * 60 * 1000,
      description: 'Scope cache TTL in milliseconds.',
      schema: z.number().int().min(0),
    },
    maxPreparedStatements: {
      envKey: 'AGENT_MEMORY_MAX_PREPARED_STATEMENTS',
      defaultValue: 500,
      description: 'Maximum number of prepared statements to cache.',
      schema: z.number().int().min(1),
    },
    queryCacheSize: {
      envKey: 'AGENT_MEMORY_QUERY_CACHE_SIZE',
      defaultValue: 1000,
      description: 'Maximum number of query results to cache.',
      schema: z.number().int().min(1),
    },
    queryCacheMemoryMB: {
      envKey: 'AGENT_MEMORY_QUERY_CACHE_MEMORY_MB',
      defaultValue: 200,
      description: 'Query cache memory limit in megabytes.',
      schema: z.number().int().min(1),
    },
    pressureThreshold: {
      envKey: 'AGENT_MEMORY_CACHE_PRESSURE_THRESHOLD',
      defaultValue: 0.75,
      description: 'Cache pressure threshold (0-1) to trigger eviction.',
      schema: z.number().min(0).max(1),
    },
    evictionTarget: {
      envKey: 'AGENT_MEMORY_CACHE_EVICTION_TARGET',
      defaultValue: 0.6,
      description: 'Target cache usage (0-1) after eviction.',
      schema: z.number().min(0).max(1),
    },
  },
};
