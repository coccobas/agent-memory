/**
 * Process-scoped Runtime
 *
 * Holds resources that should be shared across all AppContexts in a process.
 * In "both" mode (MCP + REST), a single Runtime is shared by both servers.
 *
 * Rule: No module-level singletons. All process-scoped state lives here.
 */

import type { Config } from '../config/index.js';
import type { RateLimiterConfig } from '../utils/rate-limiter-core.js';
import type { IRateLimiterAdapter, IEventAdapter } from './adapters/interfaces.js';
import { createLocalRateLimiterAdapter } from './adapters/local-rate-limiter.adapter.js';
import { LocalEventAdapter } from './adapters/local-event.adapter.js';
import { createComponentLogger } from '../utils/logger.js';
import { LRUCache } from '../utils/lru-cache.js';
import type { MemoryQueryResult } from '../services/query/pipeline.js';
import { MemoryCoordinator } from './memory-coordinator.js';
import { createEventBus, type EntryChangedEvent } from '../utils/events.js';

// Re-export for backward compatibility
export { MemoryCoordinator } from './memory-coordinator.js';

const logger = createComponentLogger('runtime');

// =============================================================================
// STATS CACHE (inline, previously in services/stats.service.ts)
// =============================================================================

export interface TableCounts {
  organizations: number;
  projects: number;
  sessions: number;
  tools: number;
  guidelines: number;
  knowledge: number;
  tags: number;
  fileLocks: number;
  conflicts: number;
}

export interface StatsCache {
  counts: TableCounts;
  lastUpdated: number;
  isRefreshing: boolean;
}

const DEFAULT_COUNTS: TableCounts = {
  organizations: 0,
  projects: 0,
  sessions: 0,
  tools: 0,
  guidelines: 0,
  knowledge: 0,
  tags: 0,
  fileLocks: 0,
  conflicts: 0,
};

export function createStatsCache(): StatsCache {
  return {
    counts: { ...DEFAULT_COUNTS },
    lastUpdated: 0,
    isRefreshing: false,
  };
}

// =============================================================================
// EMBEDDING PIPELINE
// =============================================================================

export type EntryType = 'tool' | 'guideline' | 'knowledge';

export interface EmbeddingPipeline {
  isAvailable: () => boolean;
  embed: (text: string) => Promise<{
    embedding: number[];
    model: string;
    provider: 'openai' | 'local' | 'disabled';
  }>;
  /** Batch embed multiple texts in a single API call (10-100x faster) */
  embedBatch?: (texts: string[]) => Promise<{
    embeddings: number[][];
    model: string;
    provider: 'openai' | 'local' | 'disabled';
  }>;
  storeEmbedding: (
    entryType: EntryType,
    entryId: string,
    versionId: string,
    text: string,
    embedding: number[],
    model: string
  ) => Promise<void>;
}

// =============================================================================
// RATE LIMITERS
// =============================================================================

export interface RateLimiters {
  perAgent: IRateLimiterAdapter;
  global: IRateLimiterAdapter;
  burst: IRateLimiterAdapter;
}

// =============================================================================
// RUNTIME INTERFACE
// =============================================================================

/**
 * Query cache interface for the pipeline
 */
export interface QueryCache {
  cache: LRUCache<MemoryQueryResult>;
  unsubscribe: (() => void) | null;
}

export interface Runtime {
  memoryCoordinator: MemoryCoordinator;
  rateLimiters: RateLimiters;
  embeddingPipeline: EmbeddingPipeline | null;
  statsCache: StatsCache;
  queryCache: QueryCache;
  /** Event bus for entry change events (cache invalidation, etc.) */
  eventBus: IEventAdapter<EntryChangedEvent>;
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export interface RuntimeConfig {
  cache: {
    totalLimitMB: number;
    pressureThreshold: number;
  };
  memory: {
    checkIntervalMs: number;
  };
  rateLimit: {
    enabled: boolean;
    perAgent: RateLimiterConfig;
    global: RateLimiterConfig;
    burst: RateLimiterConfig;
  };
  queryCache: {
    maxSize: number;
    maxMemoryMB: number;
    ttlMs: number;
  };
}

/**
 * Create a new Runtime instance
 *
 * @param config - Configuration for runtime components
 * @returns Fully initialized Runtime
 */
export function createRuntime(config: RuntimeConfig): Runtime {
  logger.info('Creating process-scoped runtime');

  const memoryCoordinator = new MemoryCoordinator({
    totalLimitMB: config.cache.totalLimitMB,
    pressureThreshold: config.cache.pressureThreshold,
    checkIntervalMs: config.memory.checkIntervalMs,
  });

  const rateLimiters: RateLimiters = {
    perAgent: createLocalRateLimiterAdapter({
      ...config.rateLimit.perAgent,
      enabled: config.rateLimit.enabled,
    }),
    global: createLocalRateLimiterAdapter({
      ...config.rateLimit.global,
      enabled: config.rateLimit.enabled,
    }),
    burst: createLocalRateLimiterAdapter({
      ...config.rateLimit.burst,
      enabled: config.rateLimit.enabled,
    }),
  };

  const statsCache = createStatsCache();

  // Create query cache (owned by Runtime, not module-level)
  const queryCacheInstance = new LRUCache<MemoryQueryResult>({
    maxSize: config.queryCache.maxSize,
    maxMemoryMB: config.queryCache.maxMemoryMB,
    ttlMs: config.queryCache.ttlMs,
  });

  // Register with memory coordinator for pressure management
  memoryCoordinator.register('query-pipeline', queryCacheInstance, 5);

  const queryCache: QueryCache = {
    cache: queryCacheInstance,
    unsubscribe: null, // Set by wireQueryCacheInvalidation after event bus is available
  };

  // Create event bus for entry change events
  // This is owned by Runtime to ensure single instance across all AppContexts
  // LocalEventAdapter wraps the EventBus and provides the IEventAdapter interface
  const eventBus = new LocalEventAdapter(createEventBus());
  logger.debug('Event bus created');

  logger.info('Runtime created successfully');

  return {
    memoryCoordinator,
    rateLimiters,
    embeddingPipeline: null, // Wired later via registerEmbeddingPipeline
    statsCache,
    queryCache,
    eventBus,
  };
}

/**
 * Shutdown the Runtime, releasing all resources
 *
 * @param runtime - The Runtime to shut down
 */
export async function shutdownRuntime(runtime: Runtime): Promise<void> {
  logger.info('Shutting down runtime');

  // Unsubscribe from entry change events
  if (runtime.queryCache.unsubscribe) {
    runtime.queryCache.unsubscribe();
    runtime.queryCache.unsubscribe = null;
  }

  // Clear the query cache
  runtime.queryCache.cache.clear();

  // Clear the event bus
  runtime.eventBus.clear();

  runtime.memoryCoordinator.stopMonitoring();
  await runtime.rateLimiters.perAgent.stop();
  await runtime.rateLimiters.global.stop();
  await runtime.rateLimiters.burst.stop();

  logger.info('Runtime shutdown complete');
}

/**
 * Register an embedding pipeline with the runtime
 *
 * @param runtime - The runtime to register with
 * @param pipeline - The embedding pipeline implementation
 */
export function registerEmbeddingPipeline(
  runtime: Runtime,
  pipeline: EmbeddingPipeline | null
): void {
  runtime.embeddingPipeline = pipeline;
  if (pipeline) {
    logger.debug('Embedding pipeline registered with runtime');
  }
}

/**
 * Swap rate limiters in the runtime (e.g., from local to Redis).
 * Stops the old rate limiters before replacing them.
 *
 * @param runtime - The runtime to update
 * @param rateLimiters - The new rate limiters to use
 */
export async function setRateLimiters(
  runtime: Runtime,
  rateLimiters: RateLimiters
): Promise<void> {
  logger.info('Swapping rate limiters');

  // Stop old rate limiters
  await runtime.rateLimiters.perAgent.stop();
  await runtime.rateLimiters.global.stop();
  await runtime.rateLimiters.burst.stop();

  // Set new ones
  runtime.rateLimiters = rateLimiters;

  logger.debug('Rate limiters swapped successfully');
}

/**
 * Extract RuntimeConfig from full Config
 */
export function extractRuntimeConfig(config: Config): RuntimeConfig {
  return {
    cache: {
      totalLimitMB: config.cache.totalLimitMB,
      pressureThreshold: config.cache.pressureThreshold,
    },
    memory: {
      checkIntervalMs: config.memory.checkIntervalMs,
    },
    rateLimit: {
      enabled: config.rateLimit.enabled,
      perAgent: config.rateLimit.perAgent,
      global: config.rateLimit.global,
      burst: config.rateLimit.burst,
    },
    queryCache: {
      maxSize: config.cache.queryCacheSize,
      maxMemoryMB: config.cache.queryCacheMemoryMB,
      ttlMs: config.cache.queryCacheTTLMs,
    },
  };
}
