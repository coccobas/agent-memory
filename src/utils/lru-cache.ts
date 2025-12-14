import { HEAP_PRESSURE_THRESHOLD } from './constants.js';

export interface LRUCacheOptions {
  maxSize: number;
  maxMemoryMB?: number; // Optional memory limit
  ttlMs?: number; // Optional Time To Live
  onEvict?: (key: string, value: unknown) => void;
}

interface CacheEntry<T> {
  value: T;
  size: number;
  timestamp: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly maxMemoryMB?: number;
  private readonly ttlMs?: number;
  private readonly onEvict?: (key: string, value: unknown) => void;

  constructor(options: LRUCacheOptions) {
    this.maxSize = options.maxSize;
    this.maxMemoryMB = options.maxMemoryMB;
    this.ttlMs = options.ttlMs;
    this.onEvict = options.onEvict;
  }

  set(key: string, value: T): void {
    // If updating existing, delete first to refresh position (LRU)
    if (this.cache.has(key)) {
      this.delete(key);
    }

    const entry: CacheEntry<T> = {
      value,
      size: this.estimateSize(value),
      timestamp: Date.now(),
    };

    // Check memory pressure before adding
    if (this.checkMemoryPressure()) {
      this.evictBatch(0.1); // Evict 10% if under pressure
    }

    this.cache.set(key, entry);
    this.evictToLimits();
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
      this.delete(key);
      return undefined;
    }

    // Refresh position (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.ttlMs && Date.now() - entry.timestamp > this.ttlMs) {
      this.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.onEvict?.(key, entry.value);
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    if (this.onEvict) {
      for (const [key, entry] of this.cache) {
        this.onEvict(key, entry.value);
      }
    }
    this.cache.clear();
  }

  /**
   * Get all keys in the cache (in LRU order, oldest first)
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * Delete all entries whose keys match a predicate
   * @returns Number of entries deleted
   */
  deleteMatching(predicate: (key: string) => boolean): number {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (predicate(key)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.delete(key);
    }
    return keysToDelete.length;
  }

  /**
   * Evict the oldest (least recently used) entries
   * @param count - Number of entries to evict
   * @returns Number of entries actually evicted
   */
  evictOldest(count: number): number {
    let evicted = 0;
    const keysIterator = this.cache.keys();

    while (evicted < count && this.cache.size > 0) {
      const result = keysIterator.next();
      if (result.done) break;

      this.delete(result.value);
      evicted++;
    }

    return evicted;
  }

  /**
   * Evict entries until cache memory is at or below target
   * @param targetMB - Target memory in megabytes
   * @returns Object with evicted count and final memory
   */
  evictUntilMemory(targetMB: number): { evicted: number; finalMemoryMB: number } {
    let evicted = 0;

    while (this.calculateTotalMemoryMB() > targetMB && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.delete(firstKey);
        evicted++;
      } else {
        break;
      }
    }

    return {
      evicted,
      finalMemoryMB: this.calculateTotalMemoryMB(),
    };
  }

  get size(): number {
    return this.cache.size;
  }

  get stats(): { size: number; memoryMB: number } {
    return {
      size: this.size,
      memoryMB: this.calculateTotalMemoryMB(),
    };
  }

  /**
   * Estimate the size of a value in bytes
   * Uses JSON.stringify for serializable objects, with fallbacks for edge cases
   */
  private estimateSize(value: unknown): number {
    try {
      // For strings, use length directly (more efficient)
      if (typeof value === 'string') {
        return value.length * 2; // UTF-16 encoding
      }

      // For numbers/booleans, use fixed small size
      if (typeof value === 'number' || typeof value === 'boolean') {
        return 8;
      }

      // For null/undefined
      if (value === null || value === undefined) {
        return 0;
      }

      // For objects/arrays, use JSON.stringify
      const json = JSON.stringify(value);
      return json.length * 2; // UTF-16 encoding approximation
    } catch {
      // Fallback for circular references or other non-serializable objects
      // Use a conservative estimate based on common query result sizes
      // Average query result is typically 1-5KB
      return 2048;
    }
  }

  private calculateTotalMemoryMB(): number {
    let totalBytes = 0;
    for (const entry of this.cache.values()) {
      totalBytes += entry.size;
    }
    return totalBytes / 1024 / 1024;
  }

  private evictToLimits(): void {
    // Evict by size
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.delete(firstKey);
      else break;
    }

    // Evict by memory if set
    if (this.maxMemoryMB) {
      while (this.calculateTotalMemoryMB() > this.maxMemoryMB && this.cache.size > 0) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.delete(firstKey);
        else break;
      }
    }
  }

  private checkMemoryPressure(): boolean {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    return heapUsedMB / heapTotalMB > HEAP_PRESSURE_THRESHOLD;
  }

  private evictBatch(percentage: number): void {
    const targetSize = Math.floor(this.cache.size * (1 - percentage));
    while (this.cache.size > targetSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.delete(firstKey);
      else break;
    }
  }
}
