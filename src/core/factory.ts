/**
 * Application Context Factory — V2 Minimal
 *
 * Creates a minimal AppContext with database connection only.
 * V2 handlers create their own runtime from context.sqlite.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppContext } from './context.js';
import type { Config } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { createDatabaseConnection } from '../db/factory.js';

/**
 * Create a new Application Context
 *
 * Initializes the database (runs migrations) and returns a minimal context.
 * The runtime parameter is accepted for backwards compatibility but ignored —
 * v2 handlers create their own runtime from context.sqlite.
 *
 * @param config - Application configuration
 * @param _runtime - Ignored (kept for backwards compatibility with CLI entry point)
 * @param _options - Ignored (kept for backwards compatibility)
 */
export async function createAppContext(
  config: Config,
  _runtime?: unknown,
  _options?: unknown
): Promise<AppContext> {
  const logger = createComponentLogger('app');

  // Ensure data directory exists for SQLite
  if (config.dbType === 'sqlite') {
    const dbPath = config.database.path;
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.debug({ dir }, 'Created data directory');
    }
  }

  // Initialize database connection (includes migrations)
  const connection = await createDatabaseConnection(config);

  if (connection.type !== 'sqlite') {
    throw new Error('v2 requires SQLite backend');
  }

  logger.info({ dbType: 'sqlite' }, 'AppContext created (v2 minimal)');

  return {
    config,
    db: connection.db,
    sqlite: connection.sqlite,
    logger,
  };
}

/**
 * Shutdown an AppContext.
 * V2 minimal context has no services to drain — this is a no-op.
 * The sqlite connection is closed separately by the server.
 */
export async function shutdownAppContext(_context: AppContext): Promise<void> {
  // No-op for v2 minimal context
}
