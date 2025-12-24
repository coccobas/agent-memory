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
  LockInfo,
  AcquireLockOptions,
  AcquireLockResult,
  ListLocksFilter,
  EntryEventAdapter,
  Adapters,
  EntryChangedEvent,
} from './interfaces.js';

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
import { createComponentLogger } from '../../utils/logger.js';

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
 * Legacy adapter deps for backwards compatibility.
 * @deprecated Use AdapterDeps with dbType instead
 */
export interface LegacyAdapterDeps {
  db: AppDb;
  sqlite: Database.Database;
  fileLockRepo: IFileLockRepository;
  cache?: LRUCache<unknown>;
}

/**
 * Create all adapters from dependencies.
 *
 * Supports both SQLite and PostgreSQL backends based on dbType.
 */
export function createAdapters(deps: AdapterDeps | LegacyAdapterDeps): Adapters {
  // Handle legacy deps (no dbType = SQLite)
  const effectiveDeps: AdapterDeps =
    'dbType' in deps ? deps : { ...deps, dbType: 'sqlite' as const };

  // Create storage adapter based on database type
  let storage: IStorageAdapter;

  if (effectiveDeps.dbType === 'postgresql') {
    storage = createPostgreSQLStorageAdapter(effectiveDeps.config);
  } else {
    // SQLite
    const sqliteDeps = effectiveDeps as SQLiteAdapterDeps;
    storage = createSQLiteStorageAdapter(sqliteDeps.db, sqliteDeps.sqlite);
  }

  // Cache adapter wraps LRUCache (create default if not provided)
  const cacheInstance =
    effectiveDeps.cache ??
    new LRUCache<unknown>({
      maxSize: 1000,
      maxMemoryMB: 100,
    });
  const cache = createMemoryCacheAdapter(cacheInstance);

  // Lock adapter wraps FileLockRepository
  const lock = createLocalLockAdapter(effectiveDeps.fileLockRepo);

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
      throw new Error('PostgreSQL config required for postgresql storage adapter');
    }
    return createPostgreSQLStorageAdapter(deps.config);
  } else {
    if (!deps.db || !deps.sqlite) {
      throw new Error('db and sqlite required for sqlite storage adapter');
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
}

/**
 * Create Redis adapters from configuration.
 * Returns adapters that need to be connected before use.
 *
 * Usage:
 * ```typescript
 * const redisAdapters = createRedisAdapters(config.redis);
 * await connectRedisAdapters(redisAdapters);
 * // Use adapters...
 * await closeRedisAdapters(redisAdapters);
 * ```
 */
export function createRedisAdapters(redisConfig: Config['redis']): RedisAdapters {
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

  return { cache, lock, event };
}

/**
 * Connect all Redis adapters.
 * Call this after creating adapters and before using them.
 */
export async function connectRedisAdapters(adapters: RedisAdapters): Promise<void> {
  logger.info('Connecting Redis adapters...');

  await Promise.all([adapters.cache.connect(), adapters.lock.connect(), adapters.event.connect()]);

  logger.info('Redis adapters connected');
}

/**
 * Close all Redis adapters.
 * Call this during graceful shutdown.
 */
export async function closeRedisAdapters(adapters: RedisAdapters): Promise<void> {
  logger.info('Closing Redis adapters...');

  await Promise.all([adapters.cache.close(), adapters.lock.close(), adapters.event.close()]);

  logger.info('Redis adapters closed');
}

/**
 * Create adapters with Redis support.
 *
 * If Redis is enabled in config, creates Redis-backed cache, lock, and event
 * adapters for distributed deployments. Otherwise falls back to local adapters.
 *
 * Note: If Redis adapters are created, they need to be connected before use
 * and closed during shutdown. The returned object includes a `redis` property
 * with the Redis adapters for lifecycle management.
 */
export function createAdaptersWithConfig(
  deps: AdapterDeps | LegacyAdapterDeps,
  config: Config
): Adapters & { redis?: RedisAdapters } {
  // Create base adapters (storage is always local - SQLite or PostgreSQL)
  const baseAdapters = createAdapters(deps);

  // If Redis is not enabled, return local adapters
  if (!config.redis.enabled) {
    return baseAdapters;
  }

  // Create Redis adapters
  const redisAdapters = createRedisAdapters(config.redis);

  logger.info('Redis adapters created (not yet connected)');

  return {
    storage: baseAdapters.storage,
    cache: redisAdapters.cache as ICacheAdapter,
    lock: redisAdapters.lock as ILockAdapter,
    event: redisAdapters.event as EntryEventAdapter,
    redis: redisAdapters,
  };
}
