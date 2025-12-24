/**
 * Context Wiring Helper
 *
 * Extracts shared AppContext wiring logic that is common between
 * SQLite and PostgreSQL backends. Used by createAppContext().
 */

import type { Logger } from 'pino';
import type { Pool } from 'pg';
import type Database from 'better-sqlite3';
import type { AppContext } from '../context.js';
import type { Config } from '../../config/index.js';
import type { Runtime } from '../runtime.js';
import type { AppDb } from '../types.js';
import type { Adapters } from '../adapters/index.js';
import type { Repositories } from '../interfaces/repositories.js';
import { createComponentLogger } from '../../utils/logger.js';
import { SecurityService } from '../../services/security.service.js';

import { createServices, type ServiceDependencies } from './services.js';
import { createQueryPipeline, wireQueryCache } from './query-pipeline.js';

/**
 * Input for wireContext - all backend-specific resources resolved
 */
export interface WireContextInput {
  config: Config;
  runtime: Runtime;
  db: AppDb;
  sqlite: Database.Database | undefined;
  repos: Repositories;
  adapters: Adapters;
  logger: Logger;
  /** Database type for service auto-detection */
  dbType: 'sqlite' | 'postgresql';
  /** PostgreSQL pool (for pgvector when dbType is 'postgresql') */
  pgPool?: Pool;
}

/**
 * Wire all shared AppContext components from resolved database connection.
 *
 * This helper extracts the common wiring logic that is identical between
 * SQLite and PostgreSQL backends. The caller is responsible for:
 * - Connection resolution (backend-specific)
 * - Repository creation (needs dbDeps)
 * - Adapter instantiation (needs repos.fileLocks)
 *
 * wireContext handles:
 * - Service creation
 * - Query pipeline setup
 * - Cache wiring
 * - Security service
 * - Final AppContext assembly
 *
 * @param input - All resolved backend-specific resources
 * @returns Fully wired AppContext
 */
export function wireContext(input: WireContextInput): AppContext {
  const { config, runtime, db, sqlite, repos, adapters, logger, dbType, pgPool } = input;

  // Build service dependencies for auto-detection
  const serviceDeps: ServiceDependencies = { dbType, pgPool };

  // Create services with explicit configuration
  const services = createServices(config, runtime, db, serviceDeps);

  // Create query pipeline
  const queryDeps = createQueryPipeline(config, runtime);

  // Wire query cache invalidation
  wireQueryCache(runtime, createComponentLogger('query-cache'));

  // Create security service
  const security = new SecurityService(config);

  return {
    config,
    db,
    sqlite,
    logger,
    queryDeps,
    security,
    runtime,
    services,
    repos,
    adapters,
  };
}
