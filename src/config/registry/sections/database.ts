/**
 * Database Configuration Section
 *
 * SQLite database settings (used when dbType = 'sqlite')
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';
import { parseBoolean } from '../parsers.js';

export const databaseSection: ConfigSectionMeta = {
  name: 'database',
  description: 'SQLite database configuration (used when dbType = "sqlite")',
  options: {
    path: {
      envKey: 'AGENT_MEMORY_DB_PATH',
      defaultValue: 'memory.db',
      description:
        'Path to SQLite database file. Supports ~ expansion. Relative paths resolved from AGENT_MEMORY_DATA_DIR.',
      schema: z.string(),
      parse: 'path',
    },
    skipInit: {
      envKey: 'AGENT_MEMORY_SKIP_INIT',
      defaultValue: false,
      description: 'Skip database initialization on startup. Useful for read-only deployments.',
      schema: z.boolean(),
    },
    verbose: {
      envKey: 'AGENT_MEMORY_PERF',
      defaultValue: false,
      description: 'Enable verbose database logging for performance analysis.',
      schema: z.boolean(),
    },
    devMode: {
      envKey: 'AGENT_MEMORY_DEV_MODE',
      defaultValue: false,
      description: 'Enable development mode with relaxed validation and auto-checksum fixes.',
      schema: z.boolean(),
    },
    autoFixChecksums: {
      envKey: 'AGENT_MEMORY_AUTO_FIX_CHECKSUMS',
      defaultValue: false,
      description: 'Automatically fix checksum mismatches. Defaults to devMode value.',
      schema: z.boolean(),
      // Custom parser: defaults to devMode value if not explicitly set
      parse: (envValue, _defaultValue) => {
        if (envValue !== undefined && envValue !== '') {
          return parseBoolean(envValue, false);
        }
        // Fall back to devMode value
        return parseBoolean(process.env.AGENT_MEMORY_DEV_MODE, false);
      },
    },
    busyTimeoutMs: {
      envKey: 'AGENT_MEMORY_DB_BUSY_TIMEOUT_MS',
      defaultValue: 5000,
      description: 'SQLite busy timeout in milliseconds. How long to wait for locks.',
      schema: z.number().int().positive(),
      parse: 'int',
    },
  },
};
