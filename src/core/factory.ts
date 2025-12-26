/**
 * Application Context Factory
 *
 * Main factory function for creating AppContext.
 * Sub-factories are located in ./factory/ for better organization.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppContext } from './context.js';
import type { Config } from '../config/index.js';
import type { Runtime } from './runtime.js';
import type { DatabaseDeps, AppDb } from './types.js';
import { getRuntime, isRuntimeRegistered } from './container.js';
import { createComponentLogger } from '../utils/logger.js';
import { createDatabaseConnection } from '../db/factory.js';

// Sub-factory imports
import { createRepositories } from './factory/repositories.js';
import { wireContext } from './factory/context-wiring.js';
import {
  createAdaptersWithConfig,
  connectRedisAdapters,
  closeRedisAdapters,
  type RedisAdapters,
} from './adapters/index.js';

/**
 * Create a new Application Context
 *
 * This factory initializes all core dependencies using specialized sub-factories.
 * Supports both SQLite and PostgreSQL backends based on config.dbType.
 *
 * @param config - The application configuration
 * @param runtime - Optional runtime. If not provided, uses the one registered with the container.
 * @returns Fully initialized AppContext
 */
export async function createAppContext(config: Config, runtime?: Runtime): Promise<AppContext> {
  // Get runtime from container if not provided
  const effectiveRuntime = runtime ?? (isRuntimeRegistered() ? getRuntime() : null);
  if (!effectiveRuntime) {
    throw new Error(
      'Runtime not available. Either pass runtime to createAppContext() or call registerRuntime() first.'
    );
  }

  const logger = createComponentLogger('app');

  // For SQLite mode, ensure data directory exists
  if (config.dbType === 'sqlite') {
    const dbPath = config.database.path;
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.debug({ dir }, 'Created data directory');
    }
  }

  // Initialize Database - returns discriminated union based on dbType
  const connection = await createDatabaseConnection(config);

  // Resolve backend-specific resources
  let db: AppDb;
  let sqlite: DatabaseDeps['sqlite'];

  if (connection.type === 'postgresql') {
    logger.info({ dbType: 'postgresql' }, 'Using PostgreSQL backend');
    // Cast through unknown since PG and SQLite Drizzle types are structurally different
    db = connection.adapter.getDb() as unknown as AppDb;
    sqlite = undefined;
  } else {
    logger.info({ dbType: 'sqlite' }, 'Using SQLite backend');
    db = connection.db;
    sqlite = connection.sqlite;
  }

  // Create database dependencies and repositories
  const dbDeps: DatabaseDeps = { db, sqlite };
  const repos = createRepositories(dbDeps);

  // Create adapters (backend-specific, needs repos.fileLocks)
  // Uses createAdaptersWithConfig to support Redis when enabled
  const adapterDeps =
    connection.type === 'postgresql'
      ? {
          dbType: 'postgresql' as const,
          config: config.postgresql,
          fileLockRepo: repos.fileLocks,
        }
      : {
          dbType: 'sqlite' as const,
          db,
          sqlite: sqlite!,
          fileLockRepo: repos.fileLocks,
        };

  const adapters = createAdaptersWithConfig(adapterDeps, config);

  // Connect Redis adapters if they were created
  if ('redis' in adapters && adapters.redis) {
    logger.info('Connecting Redis adapters for distributed deployment');
    await connectRedisAdapters(adapters.redis);
  }

  // Wire all shared components and assemble AppContext
  return await wireContext({
    config,
    runtime: effectiveRuntime,
    db,
    sqlite,
    repos,
    adapters,
    logger,
    dbType: connection.type,
    pgPool: connection.type === 'postgresql' ? connection.pool : undefined,
  });
}

/**
 * Shutdown an AppContext, releasing adapter resources.
 *
 * This closes Redis connections if they were created during context initialization.
 * Call this during graceful shutdown alongside shutdownRuntime().
 *
 * @param context - The AppContext to shut down
 * @param options - Shutdown options
 */
export async function shutdownAppContext(
  context: AppContext,
  options?: { drainFeedbackQueue?: boolean }
): Promise<void> {
  const logger = createComponentLogger('app');

  // Drain or stop feedback queue if it exists
  if (context.services?.feedbackQueue) {
    if (options?.drainFeedbackQueue) {
      logger.info('Draining feedback queue before shutdown');
      await context.services.feedbackQueue.drain();
    } else {
      logger.info('Stopping feedback queue');
      await context.services.feedbackQueue.stop();
    }
  }

  // Close Redis adapters if they exist
  if (context.adapters && 'redis' in context.adapters && context.adapters.redis) {
    logger.info('Closing Redis adapters');
    await closeRedisAdapters(context.adapters.redis as RedisAdapters);
  }

  // Close vector service if it exists
  if (context.services?.vector) {
    context.services.vector.close();
  }

  logger.info('AppContext shutdown complete');
}
