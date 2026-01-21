/**
 * Priority Cache
 *
 * LRU cache with TTL for computed priority scores.
 * Avoids recomputation during the same query pipeline run.
 *
 * Features:
 * - LRU eviction when max size is reached
 * - TTL-based expiration (default 5 minutes)
 * - Batch get/set operations
 * - Singleton pattern for global cache
 */

import type { SmartPriorityResult } from '../types.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Priority cache configuration.
 */
export interface PriorityCacheConfig {
  /** Maximum number of entries */
  maxSize: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
  /** Whether the cache is enabled */
  enabled: boolean;
}

// =============================================================================
// CACHE ENTRY
// =============================================================================

interface CacheEntry {
  result: SmartPriorityResult;
  timestamp: number;
}

// =============================================================================
// CACHE STATS
// =============================================================================

/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  enabled: boolean;
  hits: number;
  misses: number;
}

// =============================================================================
// PRIORITY CACHE
// =============================================================================

/**
 * LRU cache for priority scores with TTL expiration.
 */
export class PriorityCache {
  private readonly cache = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly config: PriorityCacheConfig) {}

  /**
   * Gets a cached priority result.
   *
   * @param entryId - Entry ID to get
   * @returns Cached result or null if not found/expired/disabled
   */
  get(entryId: string): SmartPriorityResult | null {
    if (!this.config.enabled) {
      return null;
    }

    const entry = this.cache.get(entryId);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL expiration
    if (this.isExpired(entry)) {
      this.cache.delete(entryId);
      this.misses++;
      return null;
    }

    // Move to end for LRU ordering (delete and re-add)
    this.cache.delete(entryId);
    this.cache.set(entryId, entry);

    this.hits++;
    return entry.result;
  }

  /**
   * Sets a priority result in the cache.
   *
   * @param entryId - Entry ID to cache
   * @param result - Priority result to cache
   */
  set(entryId: string, result: SmartPriorityResult): void {
    if (!this.config.enabled) {
      return;
    }

    // Remove existing to update order
    this.cache.delete(entryId);

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      } else {
        break;
      }
    }

    // Add new entry
    this.cache.set(entryId, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Gets multiple entries at once.
   *
   * @param entryIds - Entry IDs to get
   * @returns Map of entry ID to result (only includes found entries)
   */
  getBatch(entryIds: string[]): Map<string, SmartPriorityResult> {
    const results = new Map<string, SmartPriorityResult>();

    for (const id of entryIds) {
      const result = this.get(id);
      if (result !== null) {
        results.set(id, result);
      }
    }

    return results;
  }

  /**
   * Sets multiple entries at once.
   *
   * @param results - Priority results to cache
   */
  setBatch(results: SmartPriorityResult[]): void {
    for (const result of results) {
      this.set(result.entryId, result);
    }
  }

  /**
   * Invalidates a specific entry.
   *
   * @param entryId - Entry ID to invalidate
   */
  invalidate(entryId: string): void {
    this.cache.delete(entryId);
  }

  /**
   * Invalidates all cached entries.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics.
   *
   * @returns Cache stats
   */
  getStats(): CacheStats {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      enabled: this.config.enabled,
      hits: this.hits,
      misses: this.misses,
    };
  }

  /**
   * Checks if an entry is expired based on TTL.
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.config.ttlMs;
  }
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let singletonCache: PriorityCache | null = null;

/**
 * Gets the singleton PriorityCache instance.
 *
 * @param config - Cache configuration
 * @returns Singleton cache instance
 */
export function getPriorityCache(config: PriorityCacheConfig): PriorityCache {
  if (!singletonCache) {
    singletonCache = new PriorityCache(config);
  }
  return singletonCache;
}

/**
 * Resets the singleton cache (for testing).
 */
export function resetPriorityCache(): void {
  singletonCache = null;
}

/**
 * Creates a new PriorityCache instance.
 *
 * @param config - Cache configuration
 * @returns New cache instance
 */
export function createPriorityCache(config: PriorityCacheConfig): PriorityCache {
  return new PriorityCache(config);
}
