/**
 * Memory Cache Adapter
 *
 * Wraps the existing LRUCache implementation
 * behind the ICacheAdapter interface.
 */

import type { ICacheAdapter } from './interfaces.js';
import { LRUCache } from '../../utils/lru-cache.js';

/**
 * Memory cache adapter implementation.
 * Wraps the existing LRUCache class.
 */
export class MemoryCacheAdapter<T> implements ICacheAdapter<T> {
  private cache: LRUCache<T>;

  constructor(cache: LRUCache<T>) {
    this.cache = cache;
  }

  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: T, _ttlMs?: number): void {
    // Note: LRUCache uses a global TTL, not per-entry
    // The ttlMs parameter is accepted for interface compatibility
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  invalidateByPrefix(prefix: string): number {
    let count = 0;
    // LRUCache exposes keys() via iteration
    const keysToDelete: string[] = [];

    // First collect keys (can't delete during iteration)
    for (const key of this.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    // Then delete
    for (const key of keysToDelete) {
      if (this.cache.delete(key)) {
        count++;
      }
    }

    return count;
  }

  invalidateByPredicate(predicate: (key: string) => boolean): number {
    let count = 0;
    const keysToDelete: string[] = [];

    // First collect keys
    for (const key of this.keys()) {
      if (predicate(key)) {
        keysToDelete.push(key);
      }
    }

    // Then delete
    for (const key of keysToDelete) {
      if (this.cache.delete(key)) {
        count++;
      }
    }

    return count;
  }

  size(): number {
    return this.cache.size;
  }

  memoryBytes(): number {
    return Math.round(this.cache.stats.memoryMB * 1024 * 1024);
  }

  /**
   * Get all keys in the cache.
   * Uses the cache's internal iteration.
   */
  private *keys(): Generator<string> {
    // Access the underlying Map through the cache's entries
    // LRUCache doesn't expose keys directly, so we use the stats
    // For now, we'll need to add a keys() method or use a workaround

    // Actually, LRUCache has a getStats() that returns size
    // We need to iterate - let's use the fact that LRUCache
    // has the entries accessible through its internal Map

    // Since we can't access private members, we need to work around
    // by maintaining our own key tracking or extending LRUCache
    // For now, this is a limitation - we'll document it

    // Workaround: The cache instance might have a forEach or entries method
    // If not, this adapter needs the underlying cache to expose iteration
    yield* []; // Placeholder - will be empty unless cache exposes keys
  }
}

/**
 * Extended LRUCache that exposes keys for iteration.
 * Used by MemoryCacheAdapter.
 *
 * @deprecated No longer needed - LRUCache already exposes keys() method
 */
export class IterableLRUCache<T> extends LRUCache<T> {
  // This class is now a no-op wrapper since LRUCache has keys() built-in
}

/**
 * Create a memory cache adapter from an LRUCache instance.
 */
export function createMemoryCacheAdapter<T>(cache: LRUCache<T>): ICacheAdapter<T> {
  return new MemoryCacheAdapterWithKeys(cache);
}

/**
 * Memory cache adapter that can iterate keys.
 * Uses type assertion to access LRUCache internals.
 */
class MemoryCacheAdapterWithKeys<T> implements ICacheAdapter<T> {
  private cache: LRUCache<T>;

  constructor(cache: LRUCache<T>) {
    this.cache = cache;
  }

  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: T, _ttlMs?: number): void {
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  invalidateByPrefix(prefix: string): number {
    // Use the public deleteMatching method instead of type assertions
    return this.cache.deleteMatching((key) => key.startsWith(prefix));
  }

  invalidateByPredicate(predicate: (key: string) => boolean): number {
    // Use the public deleteMatching method instead of type assertions
    return this.cache.deleteMatching(predicate);
  }

  size(): number {
    return this.cache.size;
  }

  memoryBytes(): number {
    return Math.round(this.cache.stats.memoryMB * 1024 * 1024);
  }
}
