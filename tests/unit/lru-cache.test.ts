import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache } from '../../src/utils/lru-cache.js';

describe('LRUCache', () => {
  // Mock process.memoryUsage by default to prevent memory pressure eviction in tests
  let memorySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    memorySpy = vi.spyOn(process, 'memoryUsage');
    // Default to low pressure (10% heap used)
    memorySpy.mockReturnValue({
      heapUsed: 100 * 1024 * 1024,
      heapTotal: 1000 * 1024 * 1024,
      external: 0,
      rss: 0,
      arrayBuffers: 0,
    });
  });

  afterEach(() => {
    memorySpy.mockRestore();
  });
  it('should store and retrieve values', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should enforce maxSize with LRU eviction', () => {
    const cache = new LRUCache<string>({ maxSize: 3 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    // Access 'a' to make it most recently used
    cache.get('a'); // Order: b, c, a

    // Add 'd', should evict 'b' (LRU)
    cache.set('d', '4'); // Order: c, a, d

    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
  });

  it('should respect TTL', async () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string>({ maxSize: 10, ttlMs: 1000 });

    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');

    // Advance time past TTL
    vi.advanceTimersByTime(1100);

    expect(cache.get('key')).toBeUndefined();
    expect(cache.has('key')).toBe(false);
    vi.useRealTimers();
  });

  it('should call onEvict callback', () => {
    const onEvict = vi.fn();
    const cache = new LRUCache<string>({ maxSize: 2, onEvict });

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3'); // Evicts 'a'

    expect(onEvict).toHaveBeenCalledWith('a', '1');
  });

  it('should clear cache', () => {
    const onEvict = vi.fn();
    const cache = new LRUCache<string>({ maxSize: 10, onEvict });
    cache.set('a', '1');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(onEvict).toHaveBeenCalledWith('a', '1');
  });

  it('should evict on memory pressure if implemented', () => {
    vi.useFakeTimers();
    // Low pressure already set in beforeEach
    const cache = new LRUCache<string>({ maxSize: 100 });
    // Fill 10 items
    for (let i = 0; i < 10; i++) cache.set(String(i), 'val');

    expect(cache.size).toBe(10);

    // Advance time past the memory check interval (100ms)
    vi.advanceTimersByTime(150);

    // High pressure
    memorySpy.mockReturnValue({
      heapUsed: 900 * 1024 * 1024,
      heapTotal: 1000 * 1024 * 1024,
      external: 0,
      rss: 0,
      arrayBuffers: 0,
    });

    // Trigger set which should check pressure and evict
    cache.set('new', 'val');

    // Should have evicted batch
    // Batch is 10%. Size was 10. Target 9. Evicts 1. Size 9. Adds 1. Size 10.
    expect(cache.size).toBe(10);
    expect(cache.has('0')).toBe(false); // First one should be evicted
    expect(cache.has('new')).toBe(true);
    vi.useRealTimers();
  });

  it('should handle updating existing keys', () => {
    const cache = new LRUCache<string>({ maxSize: 3 });
    cache.set('a', 'value1');
    cache.set('b', 'value2');
    cache.set('a', 'value1-updated'); // Update existing

    expect(cache.get('a')).toBe('value1-updated');
    expect(cache.size).toBe(2); // Still only 2 entries
  });

  it('should expose keys() method', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    const keys = Array.from(cache.keys());
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  it('should deleteMatching with predicate', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('user:1', 'data1');
    cache.set('user:2', 'data2');
    cache.set('session:1', 'sess1');
    cache.set('session:2', 'sess2');

    const deleted = cache.deleteMatching((key) => key.startsWith('user:'));

    expect(deleted).toBe(2);
    expect(cache.has('user:1')).toBe(false);
    expect(cache.has('user:2')).toBe(false);
    expect(cache.has('session:1')).toBe(true);
    expect(cache.has('session:2')).toBe(true);
  });

  it('should return 0 for deleteMatching when no matches', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('a', '1');

    const deleted = cache.deleteMatching((key) => key.startsWith('nonexistent'));
    expect(deleted).toBe(0);
  });

  it('should evictOldest specified number of entries', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4');

    const evicted = cache.evictOldest(2);

    expect(evicted).toBe(2);
    expect(cache.size).toBe(2);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
  });

  it('should evictOldest all entries if count exceeds size', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('a', '1');
    cache.set('b', '2');

    const evicted = cache.evictOldest(10);

    expect(evicted).toBe(2);
    expect(cache.size).toBe(0);
  });

  it('should evictOldest zero entries when cache is empty', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    const evicted = cache.evictOldest(5);

    expect(evicted).toBe(0);
  });

  it('should evictUntilMemory to reach target', () => {
    const cache = new LRUCache<string>({ maxSize: 100 });

    // Add some large string values
    for (let i = 0; i < 10; i++) {
      cache.set(`key${i}`, 'x'.repeat(100000)); // ~100KB each
    }

    const result = cache.evictUntilMemory(0.5); // Target 0.5MB

    expect(result.evicted).toBeGreaterThan(0);
    expect(result.finalMemoryMB).toBeLessThanOrEqual(0.5);
  });

  it('should evictUntilMemory return 0 when already below target', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('a', 'small');

    const result = cache.evictUntilMemory(10); // 10MB target, cache is tiny

    expect(result.evicted).toBe(0);
    expect(result.finalMemoryMB).toBeLessThan(10);
  });

  it('should delete return false for non-existent key', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    const deleted = cache.delete('nonexistent');

    expect(deleted).toBe(false);
  });

  it('should delete return true for existing key', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('key', 'value');
    const deleted = cache.delete('key');

    expect(deleted).toBe(true);
    expect(cache.has('key')).toBe(false);
  });

  it('should expose stats getter', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('a', '1');
    cache.set('b', '2');

    const stats = cache.stats;

    expect(stats.size).toBe(2);
    expect(typeof stats.memoryMB).toBe('number');
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should respect maxMemoryMB option', () => {
    const cache = new LRUCache<string>({ maxSize: 100, maxMemoryMB: 0.001 }); // 1KB

    // Add entries that exceed memory limit
    for (let i = 0; i < 10; i++) {
      cache.set(`key${i}`, 'x'.repeat(1000)); // ~1KB each
    }

    // Cache should have evicted to stay under memory limit
    const stats = cache.stats;
    expect(stats.memoryMB).toBeLessThanOrEqual(0.001);
  });

  it('should estimate size for strings', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('str', 'hello');

    const stats = cache.stats;
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should estimate size for numbers', () => {
    const cache = new LRUCache<number>({ maxSize: 10 });
    cache.set('num', 42);

    const stats = cache.stats;
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should estimate size for booleans', () => {
    const cache = new LRUCache<boolean>({ maxSize: 10 });
    cache.set('bool', true);

    const stats = cache.stats;
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should estimate size for null', () => {
    const cache = new LRUCache<null>({ maxSize: 10 });
    cache.set('null', null);

    const stats = cache.stats;
    // null has size 0, but cache overhead still exists
    expect(typeof stats.memoryMB).toBe('number');
  });

  it('should estimate size for undefined', () => {
    const cache = new LRUCache<undefined>({ maxSize: 10 });
    cache.set('undef', undefined);

    const stats = cache.stats;
    expect(typeof stats.memoryMB).toBe('number');
  });

  it('should estimate size for objects', () => {
    const cache = new LRUCache<object>({ maxSize: 10 });
    cache.set('obj', { foo: 'bar', nested: { value: 123 } });

    const stats = cache.stats;
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should estimate size for arrays', () => {
    const cache = new LRUCache<unknown[]>({ maxSize: 10 });
    cache.set('arr', [1, 2, 3, 'test']);

    const stats = cache.stats;
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should handle circular references in estimateSize', () => {
    const cache = new LRUCache<any>({ maxSize: 10 });
    const circular: any = { a: 1 };
    circular.self = circular;

    // Should not throw, uses fallback size
    cache.set('circular', circular);

    const stats = cache.stats;
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should evict oldest entries when memory limit exceeded', () => {
    const cache = new LRUCache<string>({ maxSize: 100, maxMemoryMB: 0.003 }); // 3KB

    cache.set('a', 'x'.repeat(1000)); // ~2KB (UTF-16)
    cache.set('b', 'x'.repeat(1000)); // ~2KB
    cache.set('c', 'x'.repeat(1000)); // ~2KB - should trigger eviction

    // Cache should have evicted to stay under memory limit
    // At least one entry should have been evicted
    const hasA = cache.has('a');
    const hasB = cache.has('b');
    const hasC = cache.has('c');

    // At least one should be evicted
    expect(hasA && hasB && hasC).toBe(false);
    // Memory should be under limit
    expect(cache.stats.memoryMB).toBeLessThanOrEqual(0.003);
  });

  it('should handle empty cache operations', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });

    expect(cache.size).toBe(0);
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.has('missing')).toBe(false);
    expect(Array.from(cache.keys())).toEqual([]);

    cache.clear(); // Should not throw
    expect(cache.size).toBe(0);
  });

  it('should call onEvict when updating existing key', () => {
    const onEvict = vi.fn();
    const cache = new LRUCache<string>({ maxSize: 10, onEvict });

    cache.set('key', 'value1');
    cache.set('key', 'value2'); // Update

    expect(onEvict).toHaveBeenCalledWith('key', 'value1');
  });

  it('should use custom sizeEstimator when provided', () => {
    const sizeEstimator = vi.fn().mockReturnValue(100);
    const cache = new LRUCache<string>({ maxSize: 10, sizeEstimator });

    cache.set('key', 'value');

    expect(sizeEstimator).toHaveBeenCalledWith('value');
    expect(cache.stats.memoryMB).toBeCloseTo(100 / 1024 / 1024, 5);
  });

  it('should estimate size for objects with length property', () => {
    const cache = new LRUCache<{ length: number }>({ maxSize: 10 });
    cache.set('obj', { length: 10 });

    const stats = cache.stats;
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should estimate size for objects with size property', () => {
    const cache = new LRUCache<{ size: number }>({ maxSize: 10 });
    cache.set('obj', { size: 5 });

    const stats = cache.stats;
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should use JSON.stringify for small objects with maxMemoryMB', () => {
    const cache = new LRUCache<object>({ maxSize: 10, maxMemoryMB: 1 });
    cache.set('obj', { a: 1, b: 2 });

    const stats = cache.stats;
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should use fixed estimate for large objects with maxMemoryMB', () => {
    const cache = new LRUCache<object>({ maxSize: 10, maxMemoryMB: 1 });
    const largeObj: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      largeObj[`key${i}`] = i;
    }
    cache.set('obj', largeObj);

    const stats = cache.stats;
    expect(stats.memoryMB).toBeGreaterThan(0);
  });

  it('should not call onEvict when clear is called on empty cache', () => {
    const onEvict = vi.fn();
    const cache = new LRUCache<string>({ maxSize: 10, onEvict });

    cache.clear();

    expect(onEvict).not.toHaveBeenCalled();
  });

  it('should evict all entries when evictUntilMemory target is 0', () => {
    const cache = new LRUCache<string>({ maxSize: 10 });
    cache.set('a', 'value1');
    cache.set('b', 'value2');

    const result = cache.evictUntilMemory(0);

    expect(result.evicted).toBe(2);
    expect(cache.size).toBe(0);
  });
});
