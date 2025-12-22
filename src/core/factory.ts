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
import type { DatabaseDeps } from './types.js';
import { getRuntime, isRuntimeRegistered } from './container.js';
import { createComponentLogger } from '../utils/logger.js';
import { createDatabaseConnection } from '../db/factory.js';
import { SecurityService } from '../services/security.service.js';

// Sub-factory imports
import { createRepositories } from './factory/repositories.js';
import { createServices } from './factory/services.js';
import { createQueryPipeline, wireQueryCache } from './factory/query-pipeline.js';

/**
 * Create a new Application Context
 *
 * This factory initializes all core dependencies using specialized sub-factories.
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

  // Ensure data directory exists
  const dbPath = config.database.path;
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.debug({ dir }, 'Created data directory');
  }

  // Initialize Database
  const { db, sqlite } = await createDatabaseConnection(config);
  const dbDeps: DatabaseDeps = { db, sqlite };

  // Create all components using sub-factories
  const repos = createRepositories(dbDeps);
  const services = createServices(config, effectiveRuntime);
  const queryDeps = createQueryPipeline(config, effectiveRuntime);

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
  };
}
