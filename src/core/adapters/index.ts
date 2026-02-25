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
// LocalLockAdapter removed (v1 file lock feature)
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
// RedisEventAdapter removed (imports from deleted interfaces)
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

// Embedding Queue Adapter
export type {
  IEmbeddingQueueAdapter,
  EmbeddingJob,
  EmbeddingQueueStats,
  EnqueueOptions,
  DequeueResult,
  EmbeddingQueueEvent,
  EmbeddingQueueEventType,
} from './embedding-queue.interface.js';
export {
  RedisEmbeddingQueueAdapter,
  createRedisEmbeddingQueueAdapter,
  type RedisEmbeddingQueueConfig,
} from './redis-embedding-queue.adapter.js';

// V1 adapter factory functions removed — v2 handlers create their own runtime
