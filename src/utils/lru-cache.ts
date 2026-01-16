import { HEAP_PRESSURE_THRESHOLD } from './constants.js';

export interface LRUCacheOptions<T = unknown> {
  maxSize: number;
  maxMemoryMB?: number; // Optional memory limit
  ttlMs?: number; // Optional Time To Live
  onEvict?: (key: string, value: T) => void;
  /**
   * Custom size estimator for cached values.
   * If provided, this is used instead of JSON.stringify which can be slow.
   * Return the estimated size in bytes.
   */
  sizeEstimator?: (value: T) => number;
}

interface CacheEntry<T> {
  value: T;
  size: number;
  timestamp: number;
}

// Memory pressure check interval (avoid expensive process.memoryUsage() on every set)
const MEMORY_CHECK_INTERVAL_MS = 100;

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly maxMemoryMB?: number;
  private readonly ttlMs?: number;
  private readonly onEvict?: (key: string, value: T) => void;
  private readonly sizeEstimator?: (value: T) => number;
  private totalBytes: number = 0; // Running total for O(1) memory tracking
  private lastMemoryCheck: number = 0; // Timestamp of last memory check
  private lastPressureResult: boolean = false; // Cached memory pressure result
  // Bug #2 fix: Guard against re-entrant totalBytes updates during eviction callbacks
  private inEviction: boolean = false;

  constructor(options: LRUCacheOptions<T>) {
    this.maxSize = options.maxSize;
    this.maxMemoryMB = options.maxMemoryMB;
    this.ttlMs = options.ttlMs;
    this.onEvict = options.onEvict;
    this.sizeEstimator = options.sizeEstimator;
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
    this.totalBytes += entry.size; // Update running total
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
      // Bug #2 fix: Capture size before deletion and update totalBytes atomically
      // to prevent corruption from re-entrant onEvict callbacks
      const entrySize = entry.size;
      const deleted = this.cache.delete(key);
      if (deleted) {
        this.totalBytes -= entrySize;
        // Bug #2 fix: Ensure totalBytes never goes negative (safety guard)
        if (this.totalBytes < 0) {
          this.totalBytes = 0;
        }
        // Call onEvict after totalBytes is updated to prevent re-entrancy issues
        // If onEvict triggers another cache operation, totalBytes is already consistent
        if (this.onEvict && !this.inEviction) {
          this.inEviction = true;
          try {
            this.onEvict(key, entry.value);
          } finally {
            this.inEviction = false;
          }
        }
      }
      return deleted;
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
    this.totalBytes = 0; // Reset running total
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
   *
   * Uses custom sizeEstimator if provided, otherwise falls back to heuristics.
   * JSON.stringify is only used as a last resort for small values when
   * memory limits are enabled, as it can be expensive for large objects.
   */
  private estimateSize(value: T): number {
    // Use custom estimator if provided (most efficient)
    if (this.sizeEstimator) {
      return this.sizeEstimator(value);
    }

    // Fast path for primitive types
    if (typeof value === 'string') {
      return (value as string).length * 2; // UTF-16 encoding
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return 8;
    }

    if (value === null || value === undefined) {
      return 0;
    }

    // For arrays, use a cheap heuristic based on length
    // Avoids expensive JSON.stringify for large result sets
    if (Array.isArray(value)) {
      const arr = value as unknown[];
      // Estimate ~500 bytes per array item (typical for query results with objects)
      // Add base overhead for the array structure itself
      return 64 + arr.length * 500;
    }

    // For objects with a 'length' or 'size' property, use that as a hint
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;

      // Check for common size indicators
      if (typeof obj.length === 'number') {
        return 64 + obj.length * 500;
      }
      if (typeof obj.size === 'number') {
        return 64 + obj.size * 500;
      }

      // For small objects when memory limit is enabled, use JSON.stringify
      // For large objects or when memory limit is disabled, use fixed estimate
      // Bug #332 fix: Use safe stringify that handles circular references
      if (this.maxMemoryMB !== undefined) {
        try {
          // Only stringify if object appears small (few keys)
          const keys = Object.keys(obj);
          if (keys.length <= 10) {
            const json = this.safeStringify(value);
            return json.length * 2;
          }
        } catch {
          // Fall through to default estimate
        }
      }

      // Conservative estimate for medium-sized objects
      return 2048;
    }

    // Default fallback
    return 2048;
  }

  /**
   * Safely stringify a value, handling circular references.
   * Bug #332 fix: Returns '{}' for objects with circular references instead of throwing.
   */
  private safeStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    try {
      return JSON.stringify(value, (_key, val: unknown) => {
        if (typeof val === 'object' && val !== null) {
          // Type guard ensures val is object, safe for WeakSet operations
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          if (seen.has(val)) {
            return '[Circular]';
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          seen.add(val);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return val;
      });
    } catch {
      return '{}';
    }
  }

  private calculateTotalMemoryMB(): number {
    // O(1) using running total instead of O(n) iteration
    return this.totalBytes / 1024 / 1024;
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

  /**
   * Check if under memory pressure with sampling to avoid expensive syscalls.
   *
   * process.memoryUsage() is expensive (~0.1ms per call), so we sample at
   * MEMORY_CHECK_INTERVAL_MS intervals and cache the result between checks.
   */
  private checkMemoryPressure(): boolean {
    const now = Date.now();

    // Return cached result if within sampling interval
    if (now - this.lastMemoryCheck < MEMORY_CHECK_INTERVAL_MS) {
      return this.lastPressureResult;
    }

    // Perform actual check and cache result
    this.lastMemoryCheck = now;
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;

    // Bug #227 fix: Guard against division by zero if heapTotal is 0
    // This can happen in edge cases during process startup or in constrained environments
    if (heapTotalMB <= 0) {
      this.lastPressureResult = false; // Assume no pressure if we can't determine
      return this.lastPressureResult;
    }

    this.lastPressureResult = heapUsedMB / heapTotalMB > HEAP_PRESSURE_THRESHOLD;

    return this.lastPressureResult;
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
