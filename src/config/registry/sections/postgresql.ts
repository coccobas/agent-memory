/**
 * PostgreSQL Configuration Section
 *
 * PostgreSQL database settings (used when dbType = 'postgresql')
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const postgresqlSection: ConfigSectionMeta = {
  name: 'postgresql',
  description: 'PostgreSQL database configuration (used when dbType = "postgresql")',
  options: {
    host: {
      envKey: 'AGENT_MEMORY_PG_HOST',
      defaultValue: 'localhost',
      description: 'PostgreSQL server hostname.',
      schema: z.string(),
    },
    port: {
      envKey: 'AGENT_MEMORY_PG_PORT',
      defaultValue: 5432,
      description: 'PostgreSQL server port.',
      schema: z.number().int().min(1).max(65535),
      parse: 'port',
    },
    database: {
      envKey: 'AGENT_MEMORY_PG_DATABASE',
      defaultValue: 'agent_memory',
      description: 'PostgreSQL database name.',
      schema: z.string(),
    },
    user: {
      envKey: 'AGENT_MEMORY_PG_USER',
      defaultValue: 'postgres',
      description: 'PostgreSQL username.',
      schema: z.string(),
    },
    password: {
      envKey: 'AGENT_MEMORY_PG_PASSWORD',
      defaultValue: '',
      description: 'PostgreSQL password.',
      schema: z.string(),
      sensitive: true,
    },
    ssl: {
      envKey: 'AGENT_MEMORY_PG_SSL',
      defaultValue: false,
      description: 'Enable SSL/TLS for PostgreSQL connections.',
      schema: z.boolean(),
    },
    poolMin: {
      envKey: 'AGENT_MEMORY_PG_POOL_MIN',
      defaultValue: 2,
      description: 'Minimum connections in the connection pool.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    poolMax: {
      envKey: 'AGENT_MEMORY_PG_POOL_MAX',
      defaultValue: 10,
      description: 'Maximum connections in the connection pool.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    idleTimeoutMs: {
      envKey: 'AGENT_MEMORY_PG_IDLE_TIMEOUT_MS',
      defaultValue: 30000,
      description: 'Idle connection timeout in milliseconds.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    connectionTimeoutMs: {
      envKey: 'AGENT_MEMORY_PG_CONNECTION_TIMEOUT_MS',
      defaultValue: 10000,
      description: 'Connection acquisition timeout in milliseconds.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    statementTimeoutMs: {
      envKey: 'AGENT_MEMORY_PG_STATEMENT_TIMEOUT_MS',
      defaultValue: 30000,
      description: 'Statement timeout in milliseconds. 0 = no timeout.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
  },
};
