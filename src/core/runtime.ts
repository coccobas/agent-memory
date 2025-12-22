/**
 * Process-scoped Runtime
 *
 * Holds resources that should be shared across all AppContexts in a process.
 * In "both" mode (MCP + REST), a single Runtime is shared by both servers.
 *
 * Rule: No module-level singletons. All process-scoped state lives here.
 */

import type { Config } from '../config/index.js';
import { RateLimiter, type RateLimiterConfig } from '../utils/rate-limiter-core.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('runtime');

// =============================================================================
// MEMORY COORDINATOR (inline, previously in utils/memory-coordinator.ts)
// =============================================================================

import { LRUCache } from '../utils/lru-cache.js';
import type { MemoryQueryResult } from '../services/query/pipeline.js';

interface CacheEntry {
  name: string;
  cache: LRUCache<unknown>;
  priority: number;
}

interface MemoryCoordinatorConfig {
  totalLimitMB: number;
  pressureThreshold: number;
  checkIntervalMs: number;
}

export class MemoryCoordinator {
  private caches = new Map<string, CacheEntry>();
  private coordinatorConfig: MemoryCoordinatorConfig;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: MemoryCoordinatorConfig) {
    this.coordinatorConfig = { ...config };
    this.startMonitoring();
  }

  register<T>(name: string, cache: LRUCache<T>, priority: number = 5): void {
    if (this.caches.has(name)) {
      logger.warn({ name }, 'Cache already registered, replacing');
    }
    this.caches.set(name, {
      name,
      cache: cache as LRUCache<unknown>,
      priority: Math.max(0, Math.min(10, priority)),
    });
    logger.debug({ name, priority, totalCaches: this.caches.size }, 'Cache registered');
  }

  unregister(name: string): void {
    if (this.caches.delete(name)) {
      logger.debug({ name, totalCaches: this.caches.size }, 'Cache unregistered');
    }
  }

  getTotalMemoryMB(): number {
    let total = 0;
    for (const { cache } of this.caches.values()) {
      total += cache.stats.memoryMB;
    }
    return total;
  }

  getMemoryBreakdown(): Array<{ name: string; memoryMB: number; priority: number }> {
    return Array.from(this.caches.values()).map(({ name, cache, priority }) => ({
      name,
      memoryMB: cache.stats.memoryMB,
      priority,
    }));
  }

  isMemoryPressureHigh(): boolean {
    const total = this.getTotalMemoryMB();
    const threshold = this.coordinatorConfig.totalLimitMB * this.coordinatorConfig.pressureThreshold;
    return total > threshold;
  }

  evictIfNeeded(): void {
    const totalMemory = this.getTotalMemoryMB();
    if (totalMemory <= this.coordinatorConfig.totalLimitMB) {
      return;
    }

    logger.info(
      {
        totalMemoryMB: totalMemory,
        limitMB: this.coordinatorConfig.totalLimitMB,
        overageMB: totalMemory - this.coordinatorConfig.totalLimitMB,
      },
      'Memory limit exceeded, starting eviction'
    );

    const targetMemoryMB = this.coordinatorConfig.totalLimitMB * 0.8; // 80% target
    const memoryToFree = totalMemory - targetMemoryMB;

    const sortedCaches = Array.from(this.caches.values()).sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.cache.stats.memoryMB - a.cache.stats.memoryMB;
    });

    let totalFreed = 0;
    let totalEntriesEvicted = 0;

    for (const { name, cache, priority } of sortedCaches) {
      if (totalFreed >= memoryToFree) break;

      const beforeMemory = cache.stats.memoryMB;
      const remainingToFree = memoryToFree - totalFreed;
      const cacheTargetMB = Math.max(0, beforeMemory - remainingToFree);
      const result = cache.evictUntilMemory(cacheTargetMB);

      const freedMemory = beforeMemory - cache.stats.memoryMB;
      totalFreed += freedMemory;
      totalEntriesEvicted += result.evicted;

      if (result.evicted > 0) {
        logger.info(
          {
            cacheName: name,
            priority,
            freedMB: freedMemory.toFixed(2),
            entriesEvicted: result.evicted,
            entriesRemaining: cache.stats.size,
          },
          'Partial cache eviction due to memory pressure'
        );
      }
    }

    logger.info(
      {
        initialMemoryMB: totalMemory.toFixed(2),
        finalMemoryMB: this.getTotalMemoryMB().toFixed(2),
        freedMB: totalFreed.toFixed(2),
        totalEntriesEvicted,
      },
      'Memory eviction completed'
    );
  }

  private startMonitoring(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      try {
        this.evictIfNeeded();
      } catch (error) {
        logger.error({ error }, 'Error during memory check');
      }
    }, this.coordinatorConfig.checkIntervalMs);

    this.checkInterval.unref();
    logger.debug(
      { intervalMs: this.coordinatorConfig.checkIntervalMs, limitMB: this.coordinatorConfig.totalLimitMB },
      'Memory monitoring started'
    );
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.debug('Memory monitoring stopped');
    }
  }

  getConfig(): MemoryCoordinatorConfig {
    return { ...this.coordinatorConfig };
  }

  getStats() {
    const totalMemory = this.getTotalMemoryMB();
    return {
      totalMemoryMB: totalMemory,
      limitMB: this.coordinatorConfig.totalLimitMB,
      utilizationPct: (totalMemory / this.coordinatorConfig.totalLimitMB) * 100,
      pressureThreshold: this.coordinatorConfig.pressureThreshold,
      isUnderPressure: this.isMemoryPressureHigh(),
      cacheCount: this.caches.size,
      breakdown: this.getMemoryBreakdown(),
    };
  }
}

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
  perAgent: RateLimiter;
  global: RateLimiter;
  burst: RateLimiter;
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
    perAgent: new RateLimiter({
      ...config.rateLimit.perAgent,
      enabled: config.rateLimit.enabled,
    }),
    global: new RateLimiter({
      ...config.rateLimit.global,
      enabled: config.rateLimit.enabled,
    }),
    burst: new RateLimiter({
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

  logger.info('Runtime created successfully');

  return {
    memoryCoordinator,
    rateLimiters,
    embeddingPipeline: null, // Wired later via registerEmbeddingPipeline
    statsCache,
    queryCache,
  };
}

/**
 * Shutdown the Runtime, releasing all resources
 *
 * @param runtime - The Runtime to shut down
 */
export function shutdownRuntime(runtime: Runtime): void {
  logger.info('Shutting down runtime');

  // Unsubscribe from entry change events
  if (runtime.queryCache.unsubscribe) {
    runtime.queryCache.unsubscribe();
    runtime.queryCache.unsubscribe = null;
  }

  // Clear the query cache
  runtime.queryCache.cache.clear();

  runtime.memoryCoordinator.stopMonitoring();
  runtime.rateLimiters.perAgent.stop();
  runtime.rateLimiters.global.stop();
  runtime.rateLimiters.burst.stop();

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
