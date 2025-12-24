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
import { SecurityService } from '../services/security.service.js';

// Sub-factory imports
import { createRepositories } from './factory/repositories.js';
import { createServices } from './factory/services.js';
import { createQueryPipeline, wireQueryCache } from './factory/query-pipeline.js';
import { createAdapters } from './adapters/index.js';
import type { Adapters } from './adapters/index.js';
import type Database from 'better-sqlite3';

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

  let db: AppDb;
  let sqlite: Database.Database | undefined;
  let adapters: Adapters;
  let dbDeps: DatabaseDeps;

  if (connection.type === 'postgresql') {
    // PostgreSQL mode
    logger.info({ dbType: 'postgresql' }, 'Using PostgreSQL backend');

    // Get Drizzle db from the adapter
    // Cast through unknown since PG and SQLite Drizzle types are structurally different
    db = connection.adapter.getDb() as unknown as AppDb;
    sqlite = undefined;
    dbDeps = { db, sqlite: undefined };

    // Create repositories (they work with Drizzle which supports both backends)
    const repos = createRepositories(dbDeps);

    // Create adapters with PostgreSQL config
    adapters = createAdapters({
      dbType: 'postgresql',
      config: config.postgresql,
      fileLockRepo: repos.fileLocks,
    });

    // Create services and other components
    const services = createServices(config, effectiveRuntime, db);
    const queryDeps = createQueryPipeline(config, effectiveRuntime);

    // Wire query cache invalidation
    wireQueryCache(effectiveRuntime, createComponentLogger('query-cache'));

    // Create security service
    const security = new SecurityService(config);

    return {
      config,
      db,
      sqlite: undefined,
      logger,
      queryDeps,
      security,
      runtime: effectiveRuntime,
      services,
      repos,
      adapters,
    };
  } else {
    // SQLite mode (default)
    logger.info({ dbType: 'sqlite' }, 'Using SQLite backend');

    db = connection.db;
    sqlite = connection.sqlite;
    dbDeps = { db, sqlite };

    // Create all components using sub-factories
    const repos = createRepositories(dbDeps);
    const services = createServices(config, effectiveRuntime, db);
    const queryDeps = createQueryPipeline(config, effectiveRuntime);

    // Create adapters (abstraction layer for multi-backend support)
    adapters = createAdapters({
      dbType: 'sqlite',
      db,
      sqlite,
      fileLockRepo: repos.fileLocks,
    });

    // Wire query cache invalidation
    wireQueryCache(effectiveRuntime, createComponentLogger('query-cache'));

    // Create security service
    const security = new SecurityService(config);

    return {
      config,
      db,
      sqlite,
      logger,
      queryDeps,
      security,
      runtime: effectiveRuntime,
      services,
      repos,
      adapters,
    };
  }
}
