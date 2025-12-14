import { describe, it, expect, vi } from 'vitest';
import { LRUCache } from '../../src/utils/lru-cache.js';

describe('LRUCache', () => {
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
        const memorySpy = vi.spyOn(process, 'memoryUsage');

        // Low pressure first
        memorySpy.mockReturnValue({
            heapUsed: 100 * 1024 * 1024,
            heapTotal: 1000 * 1024 * 1024,
            external: 0,
            rss: 0,
            arrayBuffers: 0
        });

        const cache = new LRUCache<string>({ maxSize: 100 });
        // Fill 10 items
        for (let i = 0; i < 10; i++) cache.set(String(i), 'val');

        expect(cache.size).toBe(10);

        // High pressure
        memorySpy.mockReturnValue({
            heapUsed: 900 * 1024 * 1024,
            heapTotal: 1000 * 1024 * 1024,
            external: 0,
            rss: 0,
            arrayBuffers: 0
        });

        // Trigger set which should check pressure and evict
        cache.set('new', 'val');

        // Should have evicted batch
        // Batch is 10%. Size was 10. Target 9. Evicts 1. Size 9. Adds 1. Size 10.
        // Wait? If it evicts 1, then adds 1, size is 10.
        // If I didn't evict, size would be 11.
        // So expect size to be 10.
        // But if implementation was strict 10% of TOTAL including new...
        // My implementation: evicts BEFORE set.
        // (10 * 0.9) = 9. Loop while > 9.
        // 10 is > 9. Evicts 1. Size 9.
        // Sets 'new'. Size 10.

        expect(cache.size).toBe(10);
        expect(cache.has('0')).toBe(false); // First one should be evicted
        expect(cache.has('new')).toBe(true);

        memorySpy.mockRestore();
    });
});
