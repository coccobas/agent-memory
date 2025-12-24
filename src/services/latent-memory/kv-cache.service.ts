/**
 * KV Cache Service for Tiered Caching of Latent Memories
 *
 * Implements a two-tier caching strategy:
 * - L1: In-memory LRU cache with TTL for fast access
 * - L2: ICacheAdapter (Redis or SQLite) for persistent caching
 *
 * Provides session-scoped caching with write-through semantics
 * for optimal performance of latent memory retrieval operations.
 *
 * @module services/latent-memory/kv-cache
 */

import type { ICacheAdapter } from '../../core/adapters/interfaces.js';
import { LRUCache } from '../../utils/lru-cache.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('kv-cache');

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Source type for latent memory entries.
 * Identifies the origin of the compressed memory.
 */
export type LatentMemorySourceType =
  | 'tool'
  | 'guideline'
  | 'knowledge'
  | 'experience'
  | 'conversation';

/**
 * Compression method used for dimension reduction.
 */
export type CompressionMethod = 'pca' | 'random_projection' | 'quantized';

/**
 * Latent memory entry stored in cache.
 * Contains both full and compressed embeddings for flexible retrieval.
 */
export interface LatentMemory {
  /** Unique identifier for the latent memory */
  id: string;
  /** Type of the source entry */
  sourceType: LatentMemorySourceType;
  /** ID of the source entry */
  sourceId: string;
  /** Full-dimension embedding vector */
  fullEmbedding: number[];
  /** Reduced-dimension embedding vector */
  reducedEmbedding: number[];
  /** Method used for compression */
  compressionMethod: CompressionMethod;
  /** Text preview for debugging/display */
  textPreview: string;
  /** Computed importance score (0-1) */
  importanceScore: number;
  /** ISO timestamp of last access */
  lastAccessedAt: string;
  /** Number of times this memory has been accessed */
  accessCount: number;
}

/**
 * Configuration options for KV cache service.
 */
export interface KVCacheConfig {
  /** Maximum number of entries in L1 cache (default: 1000) */
  l1MaxSize: number;
  /** TTL for L1 cache entries in milliseconds (default: 600000 = 10 min) */
  l1TtlMs: number;
  /** TTL for L2 cache entries in milliseconds (default: 86400000 = 24 hours) */
  l2TtlMs: number;
  /** Whether to scope cache keys to session ID (default: true) */
  sessionScope: boolean;
}

/**
 * Cache statistics for monitoring and debugging.
 */
export interface CacheStats {
  /** Total number of get operations */
  totalGets: number;
  /** Number of L1 cache hits */
  l1Hits: number;
  /** Number of L2 cache hits */
  l2Hits: number;
  /** Number of cache misses */
  misses: number;
  /** L1 hit rate (0-1) */
  l1HitRate: number;
  /** L2 hit rate (0-1) */
  l2HitRate: number;
  /** Overall hit rate (0-1) */
  overallHitRate: number;
  /** Current L1 cache size */
  l1Size: number;
  /** Current L1 cache memory in bytes */
  l1MemoryBytes: number;
  /** Number of write operations */
  totalWrites: number;
  /** Number of delete operations */
  totalDeletes: number;
}

// =============================================================================
// KV CACHE SERVICE
// =============================================================================

/**
 * Tiered cache service for latent memories.
 *
 * Implements a two-tier caching strategy with write-through semantics:
 * 1. L1 (Hot): In-memory LRU cache for frequently accessed memories
 * 2. L2 (Warm): Persistent cache adapter (Redis/SQLite) for larger storage
 *
 * Features:
 * - Session-scoped cache keys for isolation
 * - Automatic TTL management at both levels
 * - LRU eviction in L1 based on access patterns
 * - Write-through caching ensures consistency
 * - Comprehensive statistics tracking
 *
 * @example
 * ```typescript
 * const cache = new KVCacheService(cacheAdapter, {
 *   l1MaxSize: 1000,
 *   l1TtlMs: 600000,  // 10 minutes
 *   l2TtlMs: 86400000, // 24 hours
 *   sessionScope: true
 * });
 *
 * // Store a memory
 * await cache.set(latentMemory, 'session-123');
 *
 * // Retrieve it later
 * const memory = await cache.get('memory-456', 'session-123');
 * ```
 */
export class KVCacheService {
  private readonly l1Cache: LRUCache<LatentMemory>;
  private readonly l2Cache: ICacheAdapter<LatentMemory>;
  private readonly config: KVCacheConfig;

  // Statistics tracking
  private stats = {
    totalGets: 0,
    l1Hits: 0,
    l2Hits: 0,
    misses: 0,
    totalWrites: 0,
    totalDeletes: 0,
  };

  /**
   * Create a new KV cache service.
   *
   * @param l2Cache - L2 cache adapter (Redis or SQLite)
   * @param config - Cache configuration options
   */
  constructor(l2Cache: ICacheAdapter<LatentMemory>, config?: Partial<KVCacheConfig>) {
    this.config = {
      l1MaxSize: config?.l1MaxSize ?? 1000,
      l1TtlMs: config?.l1TtlMs ?? 600000, // 10 minutes
      l2TtlMs: config?.l2TtlMs ?? 86400000, // 24 hours
      sessionScope: config?.sessionScope ?? true,
    };

    // Initialize L1 cache with LRU eviction and TTL
    this.l1Cache = new LRUCache<LatentMemory>({
      maxSize: this.config.l1MaxSize,
      ttlMs: this.config.l1TtlMs,
      onEvict: (key, value) => {
        logger.debug({ key, id: value.id }, 'L1 cache entry evicted');
      },
      // Custom size estimator for latent memories
      sizeEstimator: (value: LatentMemory) => {
        // Estimate: 2 embeddings + metadata + overhead
        const fullSize = value.fullEmbedding.length * 8; // float64
        const reducedSize = value.reducedEmbedding.length * 8;
        const metadataSize = 500; // Approximate for strings and metadata
        return fullSize + reducedSize + metadataSize;
      },
    });

    this.l2Cache = l2Cache;

    logger.info(
      {
        l1MaxSize: this.config.l1MaxSize,
        l1TtlMs: this.config.l1TtlMs,
        l2TtlMs: this.config.l2TtlMs,
        sessionScope: this.config.sessionScope,
      },
      'KV cache service initialized'
    );
  }

  /**
   * Get a latent memory from cache.
   *
   * Lookup order:
   * 1. Check L1 cache (in-memory)
   * 2. Check L2 cache (persistent)
   * 3. If found in L2, promote to L1
   *
   * @param key - Memory ID
   * @param sessionId - Optional session ID for scoping
   * @returns The latent memory if found, undefined otherwise
   */
  async get(key: string, sessionId?: string): Promise<LatentMemory | undefined> {
    this.stats.totalGets++;
    const cacheKey = this.buildCacheKey(key, sessionId);

    // L1 lookup
    const l1Result = this.l1Cache.get(cacheKey);
    if (l1Result) {
      this.stats.l1Hits++;
      logger.debug({ key, sessionId, cacheKey }, 'L1 cache hit');

      // Update access metadata
      l1Result.lastAccessedAt = new Date().toISOString();
      l1Result.accessCount++;

      return l1Result;
    }

    // L2 lookup
    const l2Result = this.l2Cache.get(cacheKey);
    if (l2Result) {
      this.stats.l2Hits++;
      logger.debug({ key, sessionId, cacheKey }, 'L2 cache hit, promoting to L1');

      // Update access metadata
      l2Result.lastAccessedAt = new Date().toISOString();
      l2Result.accessCount++;

      // Promote to L1 (write-through)
      this.l1Cache.set(cacheKey, l2Result);

      return l2Result;
    }

    // Miss
    this.stats.misses++;
    logger.debug({ key, sessionId, cacheKey }, 'Cache miss');

    return undefined;
  }

  /**
   * Store a latent memory in cache (write-through).
   *
   * Writes to both L1 and L2 caches atomically to ensure consistency.
   *
   * @param entry - The latent memory to cache
   * @param sessionId - Optional session ID for scoping
   */
  async set(entry: LatentMemory, sessionId?: string): Promise<void> {
    this.stats.totalWrites++;
    const cacheKey = this.buildCacheKey(entry.id, sessionId);

    // Update access metadata
    const now = new Date().toISOString();
    entry.lastAccessedAt = entry.lastAccessedAt || now;
    entry.accessCount = entry.accessCount || 0;

    // Write to L1
    this.l1Cache.set(cacheKey, entry);

    // Write to L2 with TTL
    this.l2Cache.set(cacheKey, entry, this.config.l2TtlMs);

    logger.debug(
      {
        key: entry.id,
        sessionId,
        cacheKey,
        sourceType: entry.sourceType,
        compressionMethod: entry.compressionMethod,
      },
      'Cache entry stored'
    );
  }

  /**
   * Delete a latent memory from cache.
   *
   * Removes from both L1 and L2 caches.
   *
   * @param key - Memory ID
   * @param sessionId - Optional session ID for scoping
   * @returns True if the entry was found and deleted
   */
  async delete(key: string, sessionId?: string): Promise<boolean> {
    this.stats.totalDeletes++;
    const cacheKey = this.buildCacheKey(key, sessionId);

    const l1Deleted = this.l1Cache.delete(cacheKey);
    const l2Deleted = this.l2Cache.delete(cacheKey);

    const deleted = l1Deleted || l2Deleted;

    if (deleted) {
      logger.debug({ key, sessionId, cacheKey }, 'Cache entry deleted');
    }

    return deleted;
  }

  /**
   * Warm the cache for a session by preloading memories.
   *
   * This is useful for session initialization to reduce cold start latency.
   * The implementation depends on having a way to enumerate session memories,
   * which would typically come from the underlying memory store.
   *
   * @param sessionId - Session ID to warm
   * @returns Number of entries loaded into cache
   */
  async warmSession(sessionId: string): Promise<number> {
    if (!this.config.sessionScope) {
      logger.warn('Session warming called but sessionScope is disabled');
      return 0;
    }

    // Note: This is a placeholder implementation.
    // In a real system, you would query the L2 cache or underlying store
    // for all entries matching the session prefix and load them into L1.

    logger.info({ sessionId }, 'Session cache warming requested');

    // Example: Query L2 for session entries
    // const prefix = `${sessionId}:`;
    // const entries = await this.queryL2ByPrefix(prefix);
    // for (const entry of entries) {
    //   this.l1Cache.set(entry.cacheKey, entry.value);
    // }

    return 0; // Placeholder
  }

  /**
   * Get current cache statistics.
   *
   * @returns Cache statistics including hit rates and sizes
   */
  getStats(): CacheStats {
    const l1HitRate = this.stats.totalGets > 0 ? this.stats.l1Hits / this.stats.totalGets : 0;
    const l2HitRate = this.stats.totalGets > 0 ? this.stats.l2Hits / this.stats.totalGets : 0;
    const overallHitRate =
      this.stats.totalGets > 0
        ? (this.stats.l1Hits + this.stats.l2Hits) / this.stats.totalGets
        : 0;

    return {
      totalGets: this.stats.totalGets,
      l1Hits: this.stats.l1Hits,
      l2Hits: this.stats.l2Hits,
      misses: this.stats.misses,
      l1HitRate,
      l2HitRate,
      overallHitRate,
      l1Size: this.l1Cache.size,
      l1MemoryBytes: this.l1Cache.stats.memoryMB * 1024 * 1024,
      totalWrites: this.stats.totalWrites,
      totalDeletes: this.stats.totalDeletes,
    };
  }

  /**
   * Clear all cache entries.
   *
   * Clears both L1 and L2 caches and resets statistics.
   */
  clear(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();

    // Reset statistics
    this.stats = {
      totalGets: 0,
      l1Hits: 0,
      l2Hits: 0,
      misses: 0,
      totalWrites: 0,
      totalDeletes: 0,
    };

    logger.info('Cache cleared');
  }

  /**
   * Invalidate all entries for a session.
   *
   * @param sessionId - Session ID to invalidate
   * @returns Number of entries invalidated
   */
  invalidateSession(sessionId: string): number {
    if (!this.config.sessionScope) {
      logger.warn('Session invalidation called but sessionScope is disabled');
      return 0;
    }

    const prefix = `${sessionId}:`;

    // Invalidate in L1
    const l1Count = this.l1Cache.deleteMatching((key) => key.startsWith(prefix));

    // Invalidate in L2
    const l2Count = this.l2Cache.invalidateByPrefix(prefix);

    const total = Math.max(l1Count, l2Count);

    logger.info({ sessionId, l1Count, l2Count, total }, 'Session cache invalidated');

    return total;
  }

  /**
   * Invalidate entries by source type.
   *
   * Note: This requires the cache key to include source type information,
   * or it needs to scan all entries (expensive).
   *
   * @param sourceType - Source type to invalidate
   * @returns Number of entries invalidated
   */
  invalidateBySourceType(sourceType: LatentMemorySourceType): number {
    // For efficient invalidation, we'd need source type in the cache key.
    // Current implementation requires scanning L1 entries.
    // L2 invalidation is not practical without key structure changes.

    let count = 0;

    // Only invalidate L1 (scanning L2 is too expensive)
    // Convert iterator to array to avoid downlevelIteration issues
    const keys = Array.from(this.l1Cache.keys());
    for (const key of keys) {
      const entry = this.l1Cache.get(key);
      if (entry && entry.sourceType === sourceType) {
        this.l1Cache.delete(key);
        count++;
      }
    }

    logger.info({ sourceType, count }, 'Entries invalidated by source type');

    return count;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Build a cache key from memory ID and optional session ID.
   *
   * Format:
   * - With session scope: `{sessionId}:{sourceType}:{sourceId}`
   * - Without session scope: `{sourceType}:{sourceId}`
   *
   * Note: This implementation uses simple `{id}` format but can be extended
   * to include sourceType for better invalidation capabilities.
   *
   * @param key - Memory ID
   * @param sessionId - Optional session ID
   * @returns Cache key string
   */
  private buildCacheKey(key: string, sessionId?: string): string {
    if (this.config.sessionScope && sessionId) {
      return `${sessionId}:${key}`;
    }
    return key;
  }

  /**
   * Log cache statistics periodically (for debugging).
   */
  logStats(): void {
    const stats = this.getStats();
    logger.info(
      {
        totalGets: stats.totalGets,
        l1HitRate: (stats.l1HitRate * 100).toFixed(2) + '%',
        l2HitRate: (stats.l2HitRate * 100).toFixed(2) + '%',
        overallHitRate: (stats.overallHitRate * 100).toFixed(2) + '%',
        l1Size: stats.l1Size,
        l1MemoryMB: (stats.l1MemoryBytes / 1024 / 1024).toFixed(2),
        totalWrites: stats.totalWrites,
        totalDeletes: stats.totalDeletes,
      },
      'Cache statistics'
    );
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a KV cache service with default configuration.
 *
 * @param l2Cache - L2 cache adapter
 * @param config - Optional configuration overrides
 * @returns Configured KV cache service
 */
export function createKVCacheService(
  l2Cache: ICacheAdapter<LatentMemory>,
  config?: Partial<KVCacheConfig>
): KVCacheService {
  return new KVCacheService(l2Cache, config);
}
