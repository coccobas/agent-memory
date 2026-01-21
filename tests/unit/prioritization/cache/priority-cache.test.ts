/**
 * Tests for Priority Cache
 *
 * TDD: Tests written first to define expected behavior.
 *
 * The cache stores computed priority scores to avoid recomputation.
 * Uses LRU eviction and TTL-based expiration.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PriorityCache,
  createPriorityCache,
  resetPriorityCache,
  getPriorityCache,
} from '../../../../src/services/prioritization/cache/priority-cache.js';
import type { SmartPriorityResult } from '../../../../src/services/prioritization/types.js';

describe('Priority Cache', () => {
  let cache: PriorityCache;

  const defaultConfig = {
    maxSize: 1000,
    ttlMs: 300000, // 5 minutes
    enabled: true,
  };

  const sampleResult: SmartPriorityResult = {
    entryId: 'entry-1',
    entryType: 'knowledge',
    adaptiveWeight: 1.15,
    usefulnessScore: 0.8,
    contextSimilarityBoost: 1.1,
    compositePriorityScore: 0.95,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    resetPriorityCache();
    cache = new PriorityCache(defaultConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('should store and retrieve cached scores', () => {
      cache.set('entry-1', sampleResult);

      const retrieved = cache.get('entry-1');

      expect(retrieved).toEqual(sampleResult);
    });

    it('should return null for missing entries', () => {
      const retrieved = cache.get('nonexistent');

      expect(retrieved).toBeNull();
    });

    it('should overwrite existing entries', () => {
      cache.set('entry-1', sampleResult);

      const updatedResult: SmartPriorityResult = {
        ...sampleResult,
        compositePriorityScore: 1.0,
      };
      cache.set('entry-1', updatedResult);

      const retrieved = cache.get('entry-1');
      expect(retrieved?.compositePriorityScore).toBe(1.0);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL (5 min)', () => {
      cache.set('entry-1', sampleResult);

      // Fast-forward 4 minutes - should still be valid
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(cache.get('entry-1')).not.toBeNull();

      // Fast-forward another 2 minutes (total 6 min) - should be expired
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(cache.get('entry-1')).toBeNull();
    });

    it('should update timestamp on set', () => {
      cache.set('entry-1', sampleResult);

      // Fast-forward 4 minutes
      vi.advanceTimersByTime(4 * 60 * 1000);

      // Update the entry
      cache.set('entry-1', sampleResult);

      // Fast-forward another 4 minutes (total 8 min from original, 4 from update)
      vi.advanceTimersByTime(4 * 60 * 1000);

      // Should still be valid (only 4 min since update)
      expect(cache.get('entry-1')).not.toBeNull();
    });
  });

  describe('max size limit', () => {
    it('should respect max size limit (LRU eviction)', () => {
      const smallCache = new PriorityCache({ ...defaultConfig, maxSize: 3 });

      smallCache.set('entry-1', { ...sampleResult, entryId: 'entry-1' });
      smallCache.set('entry-2', { ...sampleResult, entryId: 'entry-2' });
      smallCache.set('entry-3', { ...sampleResult, entryId: 'entry-3' });

      // Access entry-1 to make it recently used
      smallCache.get('entry-1');

      // Add entry-4, should evict entry-2 (least recently used)
      smallCache.set('entry-4', { ...sampleResult, entryId: 'entry-4' });

      expect(smallCache.get('entry-1')).not.toBeNull(); // Recently accessed
      expect(smallCache.get('entry-2')).toBeNull(); // Evicted
      expect(smallCache.get('entry-3')).not.toBeNull(); // Still there
      expect(smallCache.get('entry-4')).not.toBeNull(); // Newly added
    });

    it('should maintain size at max limit', () => {
      const smallCache = new PriorityCache({ ...defaultConfig, maxSize: 2 });

      smallCache.set('entry-1', { ...sampleResult, entryId: 'entry-1' });
      smallCache.set('entry-2', { ...sampleResult, entryId: 'entry-2' });
      smallCache.set('entry-3', { ...sampleResult, entryId: 'entry-3' });

      const stats = smallCache.getStats();
      expect(stats.size).toBe(2);
    });
  });

  describe('invalidation', () => {
    it('should invalidate specific entries', () => {
      cache.set('entry-1', sampleResult);
      cache.set('entry-2', { ...sampleResult, entryId: 'entry-2' });

      cache.invalidate('entry-1');

      expect(cache.get('entry-1')).toBeNull();
      expect(cache.get('entry-2')).not.toBeNull();
    });

    it('should invalidate all entries', () => {
      cache.set('entry-1', sampleResult);
      cache.set('entry-2', { ...sampleResult, entryId: 'entry-2' });

      cache.invalidateAll();

      expect(cache.get('entry-1')).toBeNull();
      expect(cache.get('entry-2')).toBeNull();
    });

    it('should invalidate on new feedback (via invalidateAll)', () => {
      cache.set('entry-1', sampleResult);

      // Simulate new feedback by invalidating all
      cache.invalidateAll();

      expect(cache.get('entry-1')).toBeNull();
    });
  });

  describe('disabled state', () => {
    it('should not return scores when disabled', () => {
      const disabledCache = new PriorityCache({
        ...defaultConfig,
        enabled: false,
      });

      disabledCache.set('entry-1', sampleResult);

      expect(disabledCache.get('entry-1')).toBeNull();
    });

    it('should not store when disabled', () => {
      const disabledCache = new PriorityCache({
        ...defaultConfig,
        enabled: false,
      });

      disabledCache.set('entry-1', sampleResult);

      const stats = disabledCache.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should report cache stats', () => {
      cache.set('entry-1', sampleResult);
      cache.set('entry-2', { ...sampleResult, entryId: 'entry-2' });

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(1000);
      expect(stats.enabled).toBe(true);
    });

    it('should track hit rate', () => {
      cache.set('entry-1', sampleResult);

      cache.get('entry-1'); // Hit
      cache.get('entry-1'); // Hit
      cache.get('entry-2'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });
  });

  describe('batch operations', () => {
    it('should set multiple entries at once', () => {
      const entries: SmartPriorityResult[] = [
        { ...sampleResult, entryId: 'entry-1' },
        { ...sampleResult, entryId: 'entry-2' },
        { ...sampleResult, entryId: 'entry-3' },
      ];

      cache.setBatch(entries);

      expect(cache.get('entry-1')).not.toBeNull();
      expect(cache.get('entry-2')).not.toBeNull();
      expect(cache.get('entry-3')).not.toBeNull();
    });

    it('should get multiple entries at once', () => {
      cache.set('entry-1', { ...sampleResult, entryId: 'entry-1' });
      cache.set('entry-2', { ...sampleResult, entryId: 'entry-2' });

      const results = cache.getBatch(['entry-1', 'entry-2', 'entry-3']);

      expect(results.get('entry-1')).not.toBeNull();
      expect(results.get('entry-2')).not.toBeNull();
      expect(results.has('entry-3')).toBe(false); // Not in cache
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance via getPriorityCache', () => {
      const instance1 = getPriorityCache(defaultConfig);
      const instance2 = getPriorityCache(defaultConfig);

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton via resetPriorityCache', () => {
      const instance1 = getPriorityCache(defaultConfig);
      instance1.set('entry-1', sampleResult);

      resetPriorityCache();

      const instance2 = getPriorityCache(defaultConfig);
      expect(instance2.get('entry-1')).toBeNull();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('createPriorityCache', () => {
    it('should create new cache instance', () => {
      const cache1 = createPriorityCache(defaultConfig);
      const cache2 = createPriorityCache(defaultConfig);

      expect(cache1).not.toBe(cache2);
    });
  });
});
