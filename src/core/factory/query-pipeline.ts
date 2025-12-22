/**
 * Query pipeline factory functions
 *
 * Creates query pipeline dependencies for the context.
 */

import type { Logger } from 'pino';
import type { Config } from '../../config/index.js';
import type { Runtime } from '../runtime.js';
import { getDb, getPreparedStatement } from '../../db/connection.js';
import { createDependencies, wireQueryCacheInvalidation, type PipelineDependencies } from '../../services/query/index.js';
import { createComponentLogger } from '../../utils/logger.js';

/**
 * Create query pipeline dependencies
 *
 * @param config - Application configuration
 * @param runtime - Runtime with query cache
 * @returns Pipeline dependencies
 */
export function createQueryPipeline(config: Config, runtime: Runtime): PipelineDependencies {
  const logger = createComponentLogger('query-pipeline');

  return createDependencies({
    getDb: () => getDb(),
    getPreparedStatement: (sql: string) => getPreparedStatement(sql),
    cache: runtime.queryCache.cache,
    perfLog: config.logging.performance,
    logger,
  });
}

/**
 * Wire query cache invalidation to entry change events
 *
 * Should be called once during context creation.
 *
 * @param runtime - Runtime with query cache
 * @param logger - Optional logger (creates one if not provided)
 */
export function wireQueryCache(runtime: Runtime, logger?: Logger): void {
  if (!runtime.queryCache.unsubscribe) {
    const effectiveLogger = logger ?? createComponentLogger('query-cache');
    runtime.queryCache.unsubscribe = wireQueryCacheInvalidation(
      runtime.queryCache.cache,
      effectiveLogger
    );
  }
}
