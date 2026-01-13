/**
 * Query pipeline factory functions
 *
 * Creates query pipeline dependencies for the context.
 */

import type { Logger } from 'pino';
import type { Config } from '../../config/index.js';
import type { Runtime } from '../runtime.js';
import type { IEventAdapter } from '../adapters/interfaces.js';
import type { EntryChangedEvent } from '../../utils/events.js';
import type { FeedbackQueueProcessor } from '../../services/feedback/queue.js';
import type { IQueryRewriteService } from '../../services/query-rewrite/types.js';
import type { EntityIndex } from '../../services/query/entity-index.js';
import type { ExtractedEntity } from '../../services/query/entity-extractor.js';
import type { IEmbeddingService, IVectorService } from '../context.js';
import { getDb, getSqlite, getPreparedStatement } from '../../db/connection.js';
import {
  createDependencies,
  wireQueryCacheInvalidation,
  type PipelineDependencies,
} from '../../services/query/index.js';
import { createComponentLogger } from '../../utils/logger.js';

/**
 * Options for creating query pipeline dependencies
 */
export interface QueryPipelineOptions {
  /** Feedback queue for RL training data collection (optional) */
  feedbackQueue?: FeedbackQueueProcessor;
  /** Query rewrite service for HyDE and expansion (optional) */
  queryRewriteService?: IQueryRewriteService;
  /** Entity index for entity-aware retrieval (optional) */
  entityIndex?: EntityIndex;
  /** Embedding service for neural re-ranking (optional) */
  embeddingService?: IEmbeddingService;
  /** Vector service for semantic similarity search (optional) */
  vectorService?: IVectorService;
}

/**
 * Create query pipeline dependencies
 *
 * @param config - Application configuration
 * @param runtime - Runtime with query cache
 * @param options - Optional configuration including feedback queue
 * @returns Pipeline dependencies
 */
export function createQueryPipeline(
  config: Config,
  runtime: Runtime,
  options?: QueryPipelineOptions
): PipelineDependencies {
  const logger = createComponentLogger('query-pipeline');

  // Wire feedback queue if provided
  const feedback = options?.feedbackQueue
    ? {
        enqueue: (batch: Parameters<FeedbackQueueProcessor['enqueue']>[0]) =>
          options.feedbackQueue!.enqueue(batch),
        isAccepting: () => options.feedbackQueue!.isAccepting(),
      }
    : undefined;

  // Wire query rewrite service if provided
  const queryRewriteService = options?.queryRewriteService
    ? {
        rewrite: (input: Parameters<IQueryRewriteService['rewrite']>[0]) =>
          options.queryRewriteService!.rewrite(input),
        isAvailable: () => options.queryRewriteService!.isAvailable(),
      }
    : undefined;

  // Wire entity index if provided
  const entityIndex = options?.entityIndex
    ? {
        lookupMultiple: (entities: ExtractedEntity[]) =>
          options.entityIndex!.lookupMultiple(entities),
      }
    : undefined;

  // Wire embedding service if provided
  const embeddingService = options?.embeddingService
    ? {
        embed: (text: string) => options.embeddingService!.embed(text),
        embedBatch: (texts: string[]) => options.embeddingService!.embedBatch(texts),
        isAvailable: () => options.embeddingService!.isAvailable(),
      }
    : undefined;

  // Wire vector service if provided
  const vectorService = options?.vectorService
    ? {
        searchSimilar: (embedding: number[], entryTypes: string[], limit?: number) =>
          options.vectorService!.searchSimilar(embedding, entryTypes, limit),
        isAvailable: () => options.vectorService!.isAvailable(),
      }
    : undefined;

  return createDependencies({
    getDb: () => getDb(),
    getSqlite: () => getSqlite(),
    getPreparedStatement: (sql: string) => getPreparedStatement(sql),
    cache: runtime.queryCache.cache,
    perfLog: config.logging.performance,
    logger,
    feedback,
    queryRewriteService,
    entityIndex,
    embeddingService,
    vectorService,
  });
}

// Bug #216 fix: Track wiring state to prevent race conditions
// The check-then-set pattern in wireQueryCache was not atomic, allowing
// concurrent calls to create orphaned subscriptions
const wiringInProgress = new WeakMap<Runtime, boolean>();

/**
 * Wire query cache invalidation to entry change events
 *
 * Should be called once during context creation.
 *
 * @param eventAdapter - The event adapter to subscribe to
 * @param runtime - Runtime with query cache
 * @param logger - Optional logger (creates one if not provided)
 */
export function wireQueryCache(
  eventAdapter: IEventAdapter<EntryChangedEvent>,
  runtime: Runtime,
  logger?: Logger
): void {
  // Bug #216 fix: Use double-check locking pattern to prevent orphaned subscriptions
  // First check without lock (fast path)
  if (runtime.queryCache.unsubscribe) {
    return;
  }

  // Check if wiring is already in progress for this runtime
  if (wiringInProgress.get(runtime)) {
    return;
  }

  // Mark wiring as in progress before setting up subscription
  wiringInProgress.set(runtime, true);

  try {
    // Second check after acquiring "lock" (another call may have completed)
    if (!runtime.queryCache.unsubscribe) {
      const effectiveLogger = logger ?? createComponentLogger('query-cache');
      runtime.queryCache.unsubscribe = wireQueryCacheInvalidation(
        eventAdapter,
        runtime.queryCache.cache,
        effectiveLogger
      );
    }
  } finally {
    // Always clear the in-progress flag
    wiringInProgress.delete(runtime);
  }
}
