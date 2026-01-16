/**
 * Adapter Factory and Exports
 *
 * Provides a factory function to create all adapters
 * and exports all adapter interfaces and implementations.
 */

// Interfaces
export type {
  IStorageAdapter,
  ICacheAdapter,
  ILockAdapter,
  IEventAdapter,
  IRateLimiterAdapter,
  ICircuitBreakerStateAdapter,
  CircuitBreakerState,
  CircuitBreakerStateConfig,
  LockInfo,
  AcquireLockOptions,
  AcquireLockResult,
  ListLocksFilter,
  RateLimitCheckResult,
  RateLimitStats,
  RateLimiterBucketConfig,
  EntryEventAdapter,
  Adapters,
  EntryChangedEvent,
} from './interfaces.js';

// FileSystem Adapter
export type { IFileSystemAdapter, FileStat } from './filesystem.adapter.js';
export {
  LocalFileSystemAdapter,
  createLocalFileSystemAdapter,
} from './local-filesystem.adapter.js';

// Implementations - Storage
export { SQLiteStorageAdapter, createSQLiteStorageAdapter } from './sqlite.adapter.js';
export { PostgreSQLStorageAdapter, createPostgreSQLStorageAdapter } from './postgresql.adapter.js';

// Implementations - Local (single-instance)
export {
  MemoryCacheAdapter,
  IterableLRUCache,
  createMemoryCacheAdapter,
} from './memory-cache.adapter.js';
export { LocalLockAdapter, createLocalLockAdapter } from './local-lock.adapter.js';
export { LocalEventAdapter, createLocalEventAdapter } from './local-event.adapter.js';
export {
  LocalRateLimiterAdapter,
  createLocalRateLimiterAdapter,
} from './local-rate-limiter.adapter.js';
export {
  LocalCircuitBreakerAdapter,
  createLocalCircuitBreakerAdapter,
} from './local-circuit-breaker.adapter.js';

// Implementations - Redis (distributed)
export {
  RedisCacheAdapter,
  createRedisCacheAdapter,
  type RedisCacheConfig,
} from './redis-cache.adapter.js';
export {
  RedisLockAdapter,
  createRedisLockAdapter,
  type RedisLockConfig,
} from './redis-lock.adapter.js';
export {
  RedisEventAdapter,
  createRedisEventAdapter,
  type RedisEventConfig,
} from './redis-event.adapter.js';
export {
  RedisRateLimiterAdapter,
  createRedisRateLimiterAdapter,
  type RedisRateLimiterConfig,
} from './redis-rate-limiter.adapter.js';
export {
  RedisCircuitBreakerAdapter,
  createRedisCircuitBreakerAdapter,
  type RedisCircuitBreakerConfig,
  type RedisCircuitBreakerFailMode,
} from './redis-circuit-breaker.adapter.js';

// Dependencies for factory
import type Database from 'better-sqlite3';
import type { Pool } from 'pg';
import type { AppDb } from '../types.js';
import type { IFileLockRepository } from '../interfaces/repositories.js';
import type {
  Adapters,
  ICacheAdapter,
  ILockAdapter,
  EntryEventAdapter,
  IStorageAdapter,
} from './interfaces.js';
import type { DatabaseType, Config } from '../../config/index.js';
import { LRUCache } from '../../utils/lru-cache.js';
import { createSQLiteStorageAdapter } from './sqlite.adapter.js';
import { createPostgreSQLStorageAdapter } from './postgresql.adapter.js';
import { createMemoryCacheAdapter } from './memory-cache.adapter.js';
import { createLocalLockAdapter } from './local-lock.adapter.js';
import { createLocalEventAdapter } from './local-event.adapter.js';
import { createRedisCacheAdapter, type RedisCacheAdapter } from './redis-cache.adapter.js';
import { createRedisLockAdapter, type RedisLockAdapter } from './redis-lock.adapter.js';
import { createRedisEventAdapter, type RedisEventAdapter } from './redis-event.adapter.js';
import {
  createRedisRateLimiterAdapter,
  type RedisRateLimiterAdapter,
} from './redis-rate-limiter.adapter.js';
import { createComponentLogger } from '../../utils/logger.js';
import { createValidationError } from '../errors.js';

const logger = createComponentLogger('adapters');

/**
 * Dependencies required to create SQLite adapters.
 */
export interface SQLiteAdapterDeps {
  dbType: 'sqlite';
  db: AppDb;
  sqlite: Database.Database;
  fileLockRepo: IFileLockRepository;
  cache?: LRUCache<unknown>;
}

/**
 * Dependencies required to create PostgreSQL adapters.
 */
export interface PostgreSQLAdapterDeps {
  dbType: 'postgresql';
  config: Config['postgresql'];
  pool?: Pool; // Optional - if not provided, adapter will create its own
  fileLockRepo: IFileLockRepository;
  cache?: LRUCache<unknown>;
}

/**
 * Union type for all adapter dependencies.
 */
export type AdapterDeps = SQLiteAdapterDeps | PostgreSQLAdapterDeps;

/**
 * Create all adapters from dependencies.
 *
 * Supports both SQLite and PostgreSQL backends based on dbType.
 */
export function createAdapters(deps: AdapterDeps): Adapters {
  // Create storage adapter based on database type
  let storage: IStorageAdapter;

  if (deps.dbType === 'postgresql') {
    storage = createPostgreSQLStorageAdapter(deps.config);
  } else {
    // SQLite
    storage = createSQLiteStorageAdapter(deps.db, deps.sqlite);
  }

  // Cache adapter wraps LRUCache (create default if not provided)
  const cacheInstance =
    deps.cache ??
    new LRUCache<unknown>({
      maxSize: 1000,
      maxMemoryMB: 100,
    });
  const cache = createMemoryCacheAdapter(cacheInstance);

  // Lock adapter wraps FileLockRepository
  const lock = createLocalLockAdapter(deps.fileLockRepo);

  // Event adapter uses singleton EventBus
  const event = createLocalEventAdapter();

  return {
    storage,
    cache,
    lock,
    event,
  };
}

/**
 * Create a storage adapter based on database type.
 * Utility function for when you only need the storage adapter.
 */
export function createStorageAdapter(
  dbType: DatabaseType,
  deps: { db?: AppDb; sqlite?: Database.Database; config?: Config['postgresql'] }
): IStorageAdapter {
  if (dbType === 'postgresql') {
    if (!deps.config) {
      throw createValidationError('config', 'is required for postgresql storage adapter');
    }
    return createPostgreSQLStorageAdapter(deps.config);
  } else {
    if (!deps.db || !deps.sqlite) {
      throw createValidationError('db and sqlite', 'are required for sqlite storage adapter');
    }
    return createSQLiteStorageAdapter(deps.db, deps.sqlite);
  }
}

// =============================================================================
// REDIS ADAPTER FACTORY
// =============================================================================

/**
 * Redis adapters collection.
 * Contains the Redis-specific adapters that need lifecycle management.
 */
export interface RedisAdapters {
  cache: RedisCacheAdapter;
  lock: RedisLockAdapter;
  event: RedisEventAdapter;
  rateLimiters: {
    perAgent: RedisRateLimiterAdapter;
    global: RedisRateLimiterAdapter;
    burst: RedisRateLimiterAdapter;
  };
}

/**
 * Create Redis adapters from configuration.
 * Returns adapters that need to be connected before use.
 *
 * Usage:
 * ```typescript
 * const redisAdapters = createRedisAdapters(config);
 * await connectRedisAdapters(redisAdapters);
 * // Use adapters...
 * await closeRedisAdapters(redisAdapters);
 * ```
 */
export function createRedisAdapters(config: Config): RedisAdapters {
  const redisConfig = config.redis;
  const rateLimitConfig = config.rateLimit;

  const baseConfig = {
    url: redisConfig.url,
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: redisConfig.db,
    tls: redisConfig.tls,
  };

  const cache = createRedisCacheAdapter({
    ...baseConfig,
    keyPrefix: `${redisConfig.keyPrefix}cache:`,
    defaultTTLMs: redisConfig.cacheTTLMs,
    connectTimeoutMs: redisConfig.connectTimeoutMs,
    maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
  });

  const lock = createRedisLockAdapter({
    ...baseConfig,
    keyPrefix: `${redisConfig.keyPrefix}lock:`,
    defaultTTLMs: redisConfig.lockTTLMs,
    retryCount: redisConfig.lockRetryCount,
    retryDelayMs: redisConfig.lockRetryDelayMs,
  });

  const event = createRedisEventAdapter({
    ...baseConfig,
    channel: redisConfig.eventChannel,
  });

  // Create rate limiter adapters using the rateLimit config section
  const perAgentRateLimiter = createRedisRateLimiterAdapter({
    ...baseConfig,
    keyPrefix: `${redisConfig.keyPrefix}ratelimit:agent:`,
    maxRequests: rateLimitConfig.perAgent.maxRequests,
    windowMs: rateLimitConfig.perAgent.windowMs,
    enabled: rateLimitConfig.enabled,
    minBurstProtection: 100,
  });

  const globalRateLimiter = createRedisRateLimiterAdapter({
    ...baseConfig,
    keyPrefix: `${redisConfig.keyPrefix}ratelimit:global:`,
    maxRequests: rateLimitConfig.global.maxRequests,
    windowMs: rateLimitConfig.global.windowMs,
    enabled: rateLimitConfig.enabled,
    minBurstProtection: 100,
  });

  const burstRateLimiter = createRedisRateLimiterAdapter({
    ...baseConfig,
    keyPrefix: `${redisConfig.keyPrefix}ratelimit:burst:`,
    maxRequests: rateLimitConfig.burst.maxRequests,
    windowMs: rateLimitConfig.burst.windowMs,
    enabled: rateLimitConfig.enabled,
    minBurstProtection: 5,
  });

  return {
    cache,
    lock,
    event,
    rateLimiters: {
      perAgent: perAgentRateLimiter,
      global: globalRateLimiter,
      burst: burstRateLimiter,
    },
  };
}

/**
 * Connect all Redis adapters.
 * Call this after creating adapters and before using them.
 */
export async function connectRedisAdapters(adapters: RedisAdapters): Promise<void> {
  logger.info('Connecting Redis adapters...');

  await Promise.all([
    adapters.cache.connect(),
    adapters.lock.connect(),
    adapters.event.connect(),
    adapters.rateLimiters.perAgent.connect(),
    adapters.rateLimiters.global.connect(),
    adapters.rateLimiters.burst.connect(),
  ]);

  logger.info('Redis adapters connected');
}

/**
 * Close all Redis adapters.
 * Call this during graceful shutdown.
 */
export async function closeRedisAdapters(adapters: RedisAdapters): Promise<void> {
  logger.info('Closing Redis adapters...');

  await Promise.all([
    adapters.cache.close(),
    adapters.lock.close(),
    adapters.event.close(),
    adapters.rateLimiters.perAgent.stop(),
    adapters.rateLimiters.global.stop(),
    adapters.rateLimiters.burst.stop(),
  ]);

  logger.info('Redis adapters closed');
}

/**
 * Result of adapter creation with Redis support.
 * Includes lifecycle management functions for Redis adapters.
 */
export interface AdaptersWithRedis extends Adapters {
  redis?: RedisAdapters;
  /**
   * Connect Redis adapters if present.
   * Returns true if Redis was connected, false if using local adapters.
   * On connection failure, automatically falls back to local event adapter.
   */
  connectRedis(): Promise<boolean>;
  /**
   * Close Redis adapters if present.
   */
  closeRedis(): Promise<void>;
  /**
   * Check if Redis event adapter is active (connected and in use).
   */
  isRedisEventActive(): boolean;
}

/**
 * Create adapters with Redis support and auto-detection.
 *
 * If Redis is enabled in config, creates Redis-backed cache, lock, and event
 * adapters for distributed deployments. Otherwise falls back to local adapters.
 *
 * The returned object includes:
 * - `connectRedis()`: Connect Redis adapters with graceful fallback
 * - `closeRedis()`: Close Redis adapters during shutdown
 * - `isRedisEventActive()`: Check if Redis events are in use
 *
 * Usage:
 * ```typescript
 * const adapters = createAdaptersWithConfig(deps, config);
 * const redisConnected = await adapters.connectRedis();
 * // Use adapters.event - automatically uses Redis or local based on connection
 * await adapters.closeRedis();
 * ```
 */
export function createAdaptersWithConfig(
  deps: AdapterDeps,
  config: Config
): AdaptersWithRedis {
  // Create base adapters (storage is always local - SQLite or PostgreSQL)
  const baseAdapters = createAdapters(deps);

  // If Redis is not enabled, return local adapters with no-op lifecycle methods
  if (!config.redis.enabled) {
    return {
      ...baseAdapters,
      connectRedis: async () => false,
      closeRedis: async () => {},
      isRedisEventActive: () => false,
    };
  }

  // Create Redis adapters
  const redisAdapters = createRedisAdapters(config);
  logger.info('Redis adapters created (not yet connected)');

  // Track whether Redis event adapter is actively in use
  let redisEventActive = false;

  // Create result with mutable event adapter (can fall back to local)
  const result: AdaptersWithRedis = {
    storage: baseAdapters.storage,
    cache: redisAdapters.cache as ICacheAdapter,
    lock: redisAdapters.lock as ILockAdapter,
    event: redisAdapters.event as EntryEventAdapter, // Start with Redis, may fallback
    redis: redisAdapters,

    /**
     * Connect Redis adapters with graceful fallback for events.
     * If Redis connection fails, the event adapter falls back to local EventBus.
     */
    async connectRedis(): Promise<boolean> {
      try {
        logger.info('Connecting Redis adapters...');

        // Try to connect all Redis adapters
        await Promise.all([
          redisAdapters.cache.connect(),
          redisAdapters.lock.connect(),
          redisAdapters.event.connect(),
          redisAdapters.rateLimiters.perAgent.connect(),
          redisAdapters.rateLimiters.global.connect(),
          redisAdapters.rateLimiters.burst.connect(),
        ]);

        redisEventActive = true;
        logger.info('Redis adapters connected - using Redis for event coordination');
        return true;
      } catch (error) {
        // Redis connection failed - fallback to local event adapter
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Redis connection failed - falling back to local event adapter'
        );

        // Replace event adapter with local implementation
        result.event = baseAdapters.event;
        redisEventActive = false;

        // Try to close any partially connected Redis adapters
        try {
          await closeRedisAdapters(redisAdapters);
        } catch (closeError) {
          logger.debug(
            { error: closeError instanceof Error ? closeError.message : String(closeError) },
            'Error closing partial Redis connections during fallback'
          );
        }

        return false;
      }
    },

    /**
     * Close Redis adapters if they were connected.
     */
    async closeRedis(): Promise<void> {
      if (result.redis) {
        try {
          await closeRedisAdapters(result.redis);
          redisEventActive = false;
        } catch (error) {
          logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            'Error closing Redis adapters'
          );
        }
      }
    },

    /**
     * Check if Redis event adapter is actively in use.
     */
    isRedisEventActive(): boolean {
      return redisEventActive;
    },
  };

  return result;
}
