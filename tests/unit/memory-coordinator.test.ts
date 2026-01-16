/**
 * Unit tests for memory coordinator
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCoordinator } from '../../src/utils/memory-coordinator.js';
import { LRUCache } from '../../src/utils/lru-cache.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock config
vi.mock('../../src/config/index.js', () => ({
  config: {
    cache: {
      pressureThreshold: 0.8,
      evictionTarget: 0.7,
      totalLimitMB: 100,
    },
    memory: {
      checkIntervalMs: 60000,
    },
  },
}));

describe('MemoryCoordinator', () => {
  let coordinator: MemoryCoordinator;

  beforeEach(() => {
    vi.useFakeTimers();
    coordinator = new MemoryCoordinator({
      totalLimitMB: 10,
      pressureThreshold: 0.8,
      checkIntervalMs: 1000,
    });
  });

  afterEach(() => {
    coordinator.stopMonitoring();
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should create coordinator with default config', () => {
      const coord = new MemoryCoordinator();

      const config = coord.getConfig();
      expect(config).toHaveProperty('totalLimitMB');
      expect(config).toHaveProperty('pressureThreshold');
      expect(config).toHaveProperty('checkIntervalMs');

      coord.stopMonitoring();
    });

    it('should accept partial config', () => {
      const coord = new MemoryCoordinator({
        totalLimitMB: 50,
      });

      const config = coord.getConfig();
      expect(config.totalLimitMB).toBe(50);
      expect(config.pressureThreshold).toBeGreaterThan(0);
      expect(config.checkIntervalMs).toBeGreaterThan(0);

      coord.stopMonitoring();
    });

    it('should start monitoring automatically', () => {
      const coord = new MemoryCoordinator({ checkIntervalMs: 1000 });

      // Monitoring should be active
      // (verified by stopMonitoring not throwing)
      expect(() => coord.stopMonitoring()).not.toThrow();
    });
  });

  describe('register', () => {
    it('should register cache', () => {
      const cache = new LRUCache<string>({ maxBytes: 1024 });

      coordinator.register('test-cache', cache, 5);

      const breakdown = coordinator.getMemoryBreakdown();
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0]).toMatchObject({
        name: 'test-cache',
        priority: 5,
      });
    });

    it('should clamp priority to 0-10 range', () => {
      const cache1 = new LRUCache<string>({ maxBytes: 1024 });
      const cache2 = new LRUCache<string>({ maxBytes: 1024 });
      const cache3 = new LRUCache<string>({ maxBytes: 1024 });

      coordinator.register('cache1', cache1, -5); // Should clamp to 0
      coordinator.register('cache2', cache2, 15); // Should clamp to 10
      coordinator.register('cache3', cache3, 5); // Normal

      const breakdown = coordinator.getMemoryBreakdown();
      const priorities = breakdown.map((b) => b.priority);

      expect(priorities).toContain(0); // Clamped from -5
      expect(priorities).toContain(10); // Clamped from 15
      expect(priorities).toContain(5); // Normal
    });

    it('should default priority to 5', () => {
      const cache = new LRUCache<string>({ maxBytes: 1024 });

      coordinator.register('test-cache', cache);

      const breakdown = coordinator.getMemoryBreakdown();
      expect(breakdown[0]?.priority).toBe(5);
    });

    it('should replace existing cache with same name', () => {
      const cache1 = new LRUCache<string>({ maxBytes: 1024 });
      const cache2 = new LRUCache<string>({ maxBytes: 2048 });

      coordinator.register('test-cache', cache1, 5);
      coordinator.register('test-cache', cache2, 7);

      const breakdown = coordinator.getMemoryBreakdown();
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0]?.priority).toBe(7);
    });

    it('should register multiple caches', () => {
      const cache1 = new LRUCache<string>({ maxBytes: 1024 });
      const cache2 = new LRUCache<string>({ maxBytes: 2048 });
      const cache3 = new LRUCache<string>({ maxBytes: 4096 });

      coordinator.register('cache1', cache1, 3);
      coordinator.register('cache2', cache2, 5);
      coordinator.register('cache3', cache3, 8);

      const breakdown = coordinator.getMemoryBreakdown();
      expect(breakdown).toHaveLength(3);
    });
  });

  describe('unregister', () => {
    it('should unregister cache', () => {
      const cache = new LRUCache<string>({ maxBytes: 1024 });

      coordinator.register('test-cache', cache);
      coordinator.unregister('test-cache');

      const breakdown = coordinator.getMemoryBreakdown();
      expect(breakdown).toHaveLength(0);
    });

    it('should handle unregister of non-existent cache', () => {
      expect(() => {
        coordinator.unregister('nonexistent');
      }).not.toThrow();
    });

    it('should not affect other caches', () => {
      const cache1 = new LRUCache<string>({ maxBytes: 1024 });
      const cache2 = new LRUCache<string>({ maxBytes: 2048 });

      coordinator.register('cache1', cache1);
      coordinator.register('cache2', cache2);

      coordinator.unregister('cache1');

      const breakdown = coordinator.getMemoryBreakdown();
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0]?.name).toBe('cache2');
    });
  });

  describe('getTotalMemoryMB', () => {
    it('should return 0 for no caches', () => {
      const total = coordinator.getTotalMemoryMB();
      expect(total).toBe(0);
    });

    it('should sum memory across all caches', () => {
      const cache1 = new LRUCache<string>({ maxBytes: 1024 * 1024 }); // ~1 MB
      const cache2 = new LRUCache<string>({ maxBytes: 2 * 1024 * 1024 }); // ~2 MB

      // Add some data
      cache1.set('key1', 'x'.repeat(500 * 1024));
      cache2.set('key2', 'x'.repeat(1000 * 1024));

      coordinator.register('cache1', cache1);
      coordinator.register('cache2', cache2);

      const total = coordinator.getTotalMemoryMB();
      expect(total).toBeGreaterThan(0);
    });

    it('should update when cache contents change', () => {
      const cache = new LRUCache<string>({ maxBytes: 10 * 1024 * 1024 });

      coordinator.register('cache', cache);

      const before = coordinator.getTotalMemoryMB();

      cache.set('key1', 'x'.repeat(1024 * 1024));

      const after = coordinator.getTotalMemoryMB();
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('getMemoryBreakdown', () => {
    it('should return empty array for no caches', () => {
      const breakdown = coordinator.getMemoryBreakdown();
      expect(breakdown).toEqual([]);
    });

    it('should return breakdown for each cache', () => {
      const cache1 = new LRUCache<string>({ maxBytes: 1024 });
      const cache2 = new LRUCache<string>({ maxBytes: 2048 });

      coordinator.register('cache1', cache1, 3);
      coordinator.register('cache2', cache2, 7);

      const breakdown = coordinator.getMemoryBreakdown();

      expect(breakdown).toHaveLength(2);
      expect(breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'cache1',
            priority: 3,
            memoryMB: expect.any(Number),
          }),
          expect.objectContaining({
            name: 'cache2',
            priority: 7,
            memoryMB: expect.any(Number),
          }),
        ])
      );
    });
  });

  describe('isMemoryPressureHigh', () => {
    it('should return false when under threshold', () => {
      const cache = new LRUCache<string>({ maxBytes: 1024 * 1024 });

      coordinator.register('cache', cache);

      expect(coordinator.isMemoryPressureHigh()).toBe(false);
    });

    it('should return true when over threshold', () => {
      const cache = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });

      // Fill cache beyond threshold (80% of 10MB = 8MB)
      for (let i = 0; i < 20; i++) {
        cache.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      coordinator.register('cache', cache);

      expect(coordinator.isMemoryPressureHigh()).toBe(true);
    });

    it('should use configured pressure threshold', () => {
      const coord = new MemoryCoordinator({
        totalLimitMB: 10,
        pressureThreshold: 0.5, // 50%
        checkIntervalMs: 1000,
      });

      const cache = new LRUCache<string>({ maxBytes: 10 * 1024 * 1024 });

      // Fill to 60% of limit (above 50% threshold)
      cache.set('key1', 'x'.repeat(6 * 1024 * 1024));

      coord.register('cache', cache);

      expect(coord.isMemoryPressureHigh()).toBe(true);

      coord.stopMonitoring();
    });
  });

  describe('evictIfNeeded', () => {
    it('should not evict when under limit', () => {
      const cache = new LRUCache<string>({ maxBytes: 1024 * 1024 });
      cache.set('key1', 'value1');

      coordinator.register('cache', cache);

      coordinator.evictIfNeeded();

      expect(cache.get('key1')).toBe('value1');
    });

    it('should evict when over limit', () => {
      const cache = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });

      // Fill cache beyond limit
      for (let i = 0; i < 30; i++) {
        cache.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      const initialSize = cache.stats.size;
      coordinator.register('cache', cache);

      coordinator.evictIfNeeded();

      const finalSize = cache.stats.size;
      expect(finalSize).toBeLessThan(initialSize);
    });

    it('should evict from lowest priority caches first', () => {
      const lowPriorityCache = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });
      const highPriorityCache = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });

      // Fill both caches
      for (let i = 0; i < 15; i++) {
        lowPriorityCache.set(`key${i}`, 'x'.repeat(500 * 1024));
        highPriorityCache.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      coordinator.register('low-priority', lowPriorityCache, 2);
      coordinator.register('high-priority', highPriorityCache, 8);

      const lowInitialSize = lowPriorityCache.stats.size;
      const highInitialSize = highPriorityCache.stats.size;

      coordinator.evictIfNeeded();

      // Low priority cache should lose more entries
      const lowEvicted = lowInitialSize - lowPriorityCache.stats.size;
      const highEvicted = highInitialSize - highPriorityCache.stats.size;

      expect(lowEvicted).toBeGreaterThanOrEqual(highEvicted);
    });

    it('should target eviction threshold', () => {
      const cache = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });

      // Fill beyond limit
      for (let i = 0; i < 30; i++) {
        cache.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      coordinator.register('cache', cache);

      coordinator.evictIfNeeded();

      const finalMemory = coordinator.getTotalMemoryMB();
      const limit = coordinator.getConfig().totalLimitMB;

      expect(finalMemory).toBeLessThanOrEqual(limit);
    });

    it('should use partial eviction instead of full clear', () => {
      const cache = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });

      // Fill cache
      for (let i = 0; i < 25; i++) {
        cache.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      coordinator.register('cache', cache);

      coordinator.evictIfNeeded();

      // Some entries should remain
      expect(cache.stats.size).toBeGreaterThan(0);
    });
  });

  describe('Monitoring', () => {
    it('should run periodic eviction checks', () => {
      const cache = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });

      // Fill beyond limit
      for (let i = 0; i < 30; i++) {
        cache.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      coordinator.register('cache', cache);

      const initialSize = cache.stats.size;

      // Advance time to trigger check
      vi.advanceTimersByTime(1000);

      const finalSize = cache.stats.size;
      expect(finalSize).toBeLessThanOrEqual(initialSize);
    });

    it('should handle errors during monitoring', () => {
      // Create a cache that will error
      const badCache = new LRUCache<string>({ maxBytes: 1024 });
      vi.spyOn(badCache, 'stats', 'get').mockImplementation(() => {
        throw new Error('Stats error');
      });

      coordinator.register('bad-cache', badCache);

      // Should not throw
      expect(() => {
        vi.advanceTimersByTime(1000);
      }).not.toThrow();
    });
  });

  describe('stopMonitoring', () => {
    it('should stop periodic checks', () => {
      const cache = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });

      // Fill beyond limit
      for (let i = 0; i < 30; i++) {
        cache.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      coordinator.register('cache', cache);
      coordinator.stopMonitoring();

      const initialSize = cache.stats.size;

      // Advance time - should not trigger eviction
      vi.advanceTimersByTime(5000);

      const finalSize = cache.stats.size;
      expect(finalSize).toBe(initialSize);
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        coordinator.stopMonitoring();
        coordinator.stopMonitoring();
      }).not.toThrow();
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = coordinator.getConfig();

      expect(config).toHaveProperty('totalLimitMB');
      expect(config).toHaveProperty('pressureThreshold');
      expect(config).toHaveProperty('checkIntervalMs');
    });

    it('should return copy of config', () => {
      const config1 = coordinator.getConfig();
      const config2 = coordinator.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      coordinator.updateConfig({ totalLimitMB: 20 });

      const config = coordinator.getConfig();
      expect(config.totalLimitMB).toBe(20);
    });

    it('should trigger immediate eviction if needed', () => {
      const cache = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });

      // Fill beyond new limit
      for (let i = 0; i < 30; i++) {
        cache.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      coordinator.register('cache', cache);

      const initialSize = cache.stats.size;

      // Lower limit to trigger eviction
      coordinator.updateConfig({ totalLimitMB: 5 });

      const finalSize = cache.stats.size;
      expect(finalSize).toBeLessThan(initialSize);
    });

    it('should restart monitoring if interval changed', () => {
      const stopSpy = vi.spyOn(coordinator, 'stopMonitoring');

      coordinator.updateConfig({ checkIntervalMs: 2000 });

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should not restart monitoring if interval unchanged', () => {
      const currentInterval = coordinator.getConfig().checkIntervalMs;
      const stopSpy = vi.spyOn(coordinator, 'stopMonitoring');

      coordinator.updateConfig({ totalLimitMB: 20 });

      // Stop should only be called once (if at all, from constructor)
      expect(stopSpy).not.toHaveBeenCalled();
    });

    it('should merge with existing config', () => {
      coordinator.updateConfig({ totalLimitMB: 20 });

      const config = coordinator.getConfig();
      expect(config.totalLimitMB).toBe(20);
      expect(config.pressureThreshold).toBe(0.8); // Unchanged
      expect(config.checkIntervalMs).toBe(1000); // Unchanged
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      const cache = new LRUCache<string>({ maxBytes: 1024 * 1024 });
      cache.set('key1', 'value1');

      coordinator.register('cache', cache);

      const stats = coordinator.getStats();

      expect(stats).toHaveProperty('totalMemoryMB');
      expect(stats).toHaveProperty('limitMB');
      expect(stats).toHaveProperty('utilizationPct');
      expect(stats).toHaveProperty('pressureThreshold');
      expect(stats).toHaveProperty('isUnderPressure');
      expect(stats).toHaveProperty('cacheCount');
      expect(stats).toHaveProperty('breakdown');
    });

    it('should calculate utilization percentage', () => {
      const cache = new LRUCache<string>({ maxBytes: 5 * 1024 * 1024 });

      // Fill to ~50% of limit
      cache.set('key1', 'x'.repeat(5 * 1024 * 1024));

      coordinator.register('cache', cache);

      const stats = coordinator.getStats();
      expect(stats.utilizationPct).toBeGreaterThan(0);
      expect(stats.utilizationPct).toBeLessThanOrEqual(100);
    });

    it('should include pressure status', () => {
      const cache = new LRUCache<string>({ maxBytes: 1024 });

      coordinator.register('cache', cache);

      const stats = coordinator.getStats();
      expect(typeof stats.isUnderPressure).toBe('boolean');
    });

    it('should include breakdown', () => {
      const cache1 = new LRUCache<string>({ maxBytes: 1024 });
      const cache2 = new LRUCache<string>({ maxBytes: 2048 });

      coordinator.register('cache1', cache1, 3);
      coordinator.register('cache2', cache2, 7);

      const stats = coordinator.getStats();
      expect(stats.breakdown).toHaveLength(2);
      expect(stats.cacheCount).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty caches', () => {
      const cache = new LRUCache<string>({ maxBytes: 1024 });

      coordinator.register('empty-cache', cache);

      expect(() => {
        coordinator.evictIfNeeded();
      }).not.toThrow();
    });

    it('should handle cache with single entry', () => {
      const cache = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });
      cache.set('key1', 'x'.repeat(15 * 1024 * 1024));

      coordinator.register('cache', cache);

      coordinator.evictIfNeeded();

      // Should evict or reduce to meet limit
      expect(coordinator.getTotalMemoryMB()).toBeLessThanOrEqual(10);
    });

    it('should handle multiple caches with same priority', () => {
      const cache1 = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });
      const cache2 = new LRUCache<string>({ maxBytes: 20 * 1024 * 1024 });

      for (let i = 0; i < 15; i++) {
        cache1.set(`key${i}`, 'x'.repeat(500 * 1024));
        cache2.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      coordinator.register('cache1', cache1, 5);
      coordinator.register('cache2', cache2, 5);

      expect(() => {
        coordinator.evictIfNeeded();
      }).not.toThrow();
    });

    it('should handle very small memory limit', () => {
      const coord = new MemoryCoordinator({
        totalLimitMB: 0.1, // 100 KB
        pressureThreshold: 0.8,
        checkIntervalMs: 1000,
      });

      const cache = new LRUCache<string>({ maxBytes: 1024 * 1024 });
      cache.set('key1', 'x'.repeat(500 * 1024));

      coord.register('cache', cache);

      expect(() => {
        coord.evictIfNeeded();
      }).not.toThrow();

      coord.stopMonitoring();
    });

    it('should handle zero pressure threshold', () => {
      const coord = new MemoryCoordinator({
        totalLimitMB: 10,
        pressureThreshold: 0,
        checkIntervalMs: 1000,
      });

      const cache = new LRUCache<string>({ maxBytes: 1024 });
      cache.set('key1', 'value');

      coord.register('cache', cache);

      // Any memory should trigger pressure
      expect(coord.isMemoryPressureHigh()).toBe(true);

      coord.stopMonitoring();
    });

    it('should handle concurrent registration and eviction', () => {
      const cache1 = new LRUCache<string>({ maxBytes: 10 * 1024 * 1024 });
      const cache2 = new LRUCache<string>({ maxBytes: 10 * 1024 * 1024 });

      for (let i = 0; i < 15; i++) {
        cache1.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      coordinator.register('cache1', cache1);

      // Trigger eviction
      coordinator.evictIfNeeded();

      // Register another cache during eviction
      for (let i = 0; i < 15; i++) {
        cache2.set(`key${i}`, 'x'.repeat(500 * 1024));
      }

      coordinator.register('cache2', cache2);

      expect(() => {
        coordinator.evictIfNeeded();
      }).not.toThrow();
    });
  });
});
