/**
 * Unit tests for KVCacheService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  KVCacheService,
  type KVCacheConfig,
  type LatentMemory,
} from '../../src/services/latent-memory/kv-cache.service.js';
import type { ICacheAdapter } from '../../src/core/adapters/interfaces.js';

describe('KVCacheService', () => {
  let service: KVCacheService;
  let mockL2Cache: ICacheAdapter<LatentMemory>;

  const mockMemory: LatentMemory = {
    id: 'mem-123',
    sourceType: 'knowledge',
    sourceId: 'entry-123',
    fullEmbedding: [0.1, 0.2, 0.3],
    reducedEmbedding: [0.1, 0.2],
    compressionMethod: 'quantized',
    textPreview: 'Test memory',
    importanceScore: 0.7,
    lastAccessedAt: new Date().toISOString(),
    accessCount: 0,
  };

  beforeEach(() => {
    // Mock L2 cache adapter
    mockL2Cache = {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
      delete: vi.fn().mockReturnValue(false),
      clear: vi.fn(),
      invalidateByPrefix: vi.fn().mockReturnValue(0),
    };

    service = new KVCacheService(mockL2Cache);
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const config: Partial<KVCacheConfig> = {
        l1MaxSize: 500,
        l1TtlMs: 300000,
        l2TtlMs: 43200000,
        sessionScope: false,
      };
      const svc = new KVCacheService(mockL2Cache, config);
      expect(svc).toBeDefined();
    });
  });

  describe('get', () => {
    it('should return undefined for cache miss', async () => {
      const result = await service.get('mem-123');

      expect(result).toBeUndefined();
    });

    it('should return cached value from L1', async () => {
      await service.set(mockMemory);

      const result = await service.get('mem-123');

      expect(result).toEqual(mockMemory);
      expect(mockL2Cache.get).not.toHaveBeenCalled();
    });

    it('should return cached value from L2 and promote to L1', async () => {
      vi.mocked(mockL2Cache.get).mockReturnValue(mockMemory);

      const result = await service.get('mem-123');

      expect(result).toEqual(mockMemory);
      expect(mockL2Cache.get).toHaveBeenCalledWith('mem-123');

      // Verify promotion to L1 by checking subsequent call doesn't hit L2
      vi.mocked(mockL2Cache.get).mockClear();
      const result2 = await service.get('mem-123');
      expect(result2).toEqual(mockMemory);
      expect(mockL2Cache.get).not.toHaveBeenCalled();
    });

    it('should update access metadata on L1 hit', async () => {
      await service.set(mockMemory);
      const initialAccessCount = mockMemory.accessCount;

      const result = await service.get('mem-123');

      expect(result?.accessCount).toBe(initialAccessCount + 1);
      expect(result?.lastAccessedAt).toBeDefined();
    });

    it('should update access metadata on L2 hit', async () => {
      vi.mocked(mockL2Cache.get).mockReturnValue(mockMemory);
      const initialAccessCount = mockMemory.accessCount;

      const result = await service.get('mem-123');

      expect(result?.accessCount).toBe(initialAccessCount + 1);
      expect(result?.lastAccessedAt).toBeDefined();
    });

    it('should use session-scoped key when sessionId provided', async () => {
      const config: Partial<KVCacheConfig> = { sessionScope: true };
      const svc = new KVCacheService(mockL2Cache, config);

      await svc.set(mockMemory, 'session-123');
      const result = await svc.get('mem-123', 'session-123');

      expect(result).toEqual(mockMemory);
    });

    it('should not find entry with different sessionId', async () => {
      const config: Partial<KVCacheConfig> = { sessionScope: true };
      const svc = new KVCacheService(mockL2Cache, config);

      await svc.set(mockMemory, 'session-123');
      const result = await svc.get('mem-123', 'session-456');

      expect(result).toBeUndefined();
    });

    it('should track L1 hits in stats', async () => {
      await service.set(mockMemory);
      await service.get('mem-123');

      const stats = service.getStats();
      expect(stats.l1Hits).toBe(1);
      expect(stats.totalGets).toBe(1);
    });

    it('should track L2 hits in stats', async () => {
      vi.mocked(mockL2Cache.get).mockReturnValue(mockMemory);
      await service.get('mem-123');

      const stats = service.getStats();
      expect(stats.l2Hits).toBe(1);
      expect(stats.totalGets).toBe(1);
    });

    it('should track misses in stats', async () => {
      await service.get('mem-999');

      const stats = service.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.totalGets).toBe(1);
    });
  });

  describe('set', () => {
    it('should write to both L1 and L2 caches', async () => {
      await service.set(mockMemory);

      expect(mockL2Cache.set).toHaveBeenCalledWith('mem-123', mockMemory, expect.any(Number));

      const result = await service.get('mem-123');
      expect(result).toEqual(mockMemory);
    });

    it('should use custom TTL for L2', async () => {
      const config: Partial<KVCacheConfig> = { l2TtlMs: 43200000 };
      const svc = new KVCacheService(mockL2Cache, config);

      await svc.set(mockMemory);

      expect(mockL2Cache.set).toHaveBeenCalledWith('mem-123', mockMemory, 43200000);
    });

    it('should use session-scoped key when sessionId provided', async () => {
      const config: Partial<KVCacheConfig> = { sessionScope: true };
      const svc = new KVCacheService(mockL2Cache, config);

      await svc.set(mockMemory, 'session-123');

      expect(mockL2Cache.set).toHaveBeenCalledWith(
        'session-123:mem-123',
        mockMemory,
        expect.any(Number)
      );
    });

    it('should update existing entry and refresh position', async () => {
      await service.set(mockMemory);
      const updatedMemory = { ...mockMemory, importanceScore: 0.9 };
      await service.set(updatedMemory);

      const result = await service.get('mem-123');
      expect(result?.importanceScore).toBe(0.9);
    });

    it('should initialize access metadata if missing', async () => {
      const memoryNoMetadata = {
        ...mockMemory,
        lastAccessedAt: undefined as unknown as string,
        accessCount: undefined as unknown as number,
      };
      await service.set(memoryNoMetadata);

      const result = await service.get('mem-123');
      expect(result?.lastAccessedAt).toBeDefined();
      // Access count will be 1 because get() increments it
      expect(result?.accessCount).toBe(1);
    });

    it('should track writes in stats', async () => {
      await service.set(mockMemory);

      const stats = service.getStats();
      expect(stats.totalWrites).toBe(1);
    });
  });

  describe('delete', () => {
    it('should delete from both L1 and L2 caches', async () => {
      await service.set(mockMemory);

      const deleted = await service.delete('mem-123');

      expect(deleted).toBe(true);
      expect(mockL2Cache.delete).toHaveBeenCalledWith('mem-123');

      const result = await service.get('mem-123');
      expect(result).toBeUndefined();
    });

    it('should return false when entry not found', async () => {
      const deleted = await service.delete('mem-999');

      expect(deleted).toBe(false);
    });

    it('should use session-scoped key when sessionId provided', async () => {
      const config: Partial<KVCacheConfig> = { sessionScope: true };
      const svc = new KVCacheService(mockL2Cache, config);

      await svc.set(mockMemory, 'session-123');
      await svc.delete('mem-123', 'session-123');

      expect(mockL2Cache.delete).toHaveBeenCalledWith('session-123:mem-123');
    });

    it('should track deletes in stats', async () => {
      await service.set(mockMemory);
      await service.delete('mem-123');

      const stats = service.getStats();
      expect(stats.totalDeletes).toBe(1);
    });
  });

  describe('warmSession', () => {
    it('should return 0 for placeholder implementation', async () => {
      const count = await service.warmSession('session-123');

      expect(count).toBe(0);
    });

    it('should warn when sessionScope is disabled', async () => {
      const config: Partial<KVCacheConfig> = { sessionScope: false };
      const svc = new KVCacheService(mockL2Cache, config);

      const count = await svc.warmSession('session-123');

      expect(count).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = service.getStats();

      expect(stats).toEqual({
        totalGets: 0,
        l1Hits: 0,
        l2Hits: 0,
        misses: 0,
        l1HitRate: 0,
        l2HitRate: 0,
        overallHitRate: 0,
        l1Size: 0,
        l1MemoryBytes: 0,
        totalWrites: 0,
        totalDeletes: 0,
      });
    });

    it('should calculate hit rates correctly', async () => {
      // 2 L1 hits
      await service.set(mockMemory);
      await service.get('mem-123');
      await service.get('mem-123');

      // 1 L2 hit
      vi.mocked(mockL2Cache.get).mockReturnValue({ ...mockMemory, id: 'mem-456' });
      await service.get('mem-456');

      // 1 miss
      vi.mocked(mockL2Cache.get).mockReturnValue(undefined);
      await service.get('mem-999');

      const stats = service.getStats();

      expect(stats.totalGets).toBe(4);
      expect(stats.l1Hits).toBe(2);
      expect(stats.l2Hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.l1HitRate).toBe(0.5); // 2/4
      expect(stats.l2HitRate).toBe(0.25); // 1/4
      expect(stats.overallHitRate).toBe(0.75); // 3/4
    });

    it('should track L1 size', async () => {
      await service.set(mockMemory);

      const stats = service.getStats();

      expect(stats.l1Size).toBe(1);
    });

    it('should estimate L1 memory usage', async () => {
      await service.set(mockMemory);

      const stats = service.getStats();

      expect(stats.l1MemoryBytes).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear both L1 and L2 caches', () => {
      service.set(mockMemory);
      service.clear();

      expect(mockL2Cache.clear).toHaveBeenCalled();

      const stats = service.getStats();
      expect(stats.l1Size).toBe(0);
    });

    it('should reset statistics', async () => {
      await service.set(mockMemory);
      await service.get('mem-123');

      service.clear();

      const stats = service.getStats();
      expect(stats.totalGets).toBe(0);
      expect(stats.totalWrites).toBe(0);
      expect(stats.l1Hits).toBe(0);
    });
  });

  describe('invalidateSession', () => {
    it('should invalidate all entries for a session', () => {
      const config: Partial<KVCacheConfig> = { sessionScope: true };
      const svc = new KVCacheService(mockL2Cache, config);

      // Add multiple entries for the session
      svc.set({ ...mockMemory, id: 'mem-1' }, 'session-123');
      svc.set({ ...mockMemory, id: 'mem-2' }, 'session-123');
      svc.set({ ...mockMemory, id: 'mem-3' }, 'session-456');

      vi.mocked(mockL2Cache.invalidateByPrefix).mockReturnValue(2);

      const count = svc.invalidateSession('session-123');

      expect(count).toBeGreaterThan(0);
      expect(mockL2Cache.invalidateByPrefix).toHaveBeenCalledWith('session-123:');
    });

    it('should warn when sessionScope is disabled', () => {
      const config: Partial<KVCacheConfig> = { sessionScope: false };
      const svc = new KVCacheService(mockL2Cache, config);

      const count = svc.invalidateSession('session-123');

      expect(count).toBe(0);
    });

    it('should return count from L2 when higher than L1', () => {
      const config: Partial<KVCacheConfig> = { sessionScope: true };
      const svc = new KVCacheService(mockL2Cache, config);

      vi.mocked(mockL2Cache.invalidateByPrefix).mockReturnValue(10);

      const count = svc.invalidateSession('session-123');

      expect(count).toBe(10);
    });
  });

  describe('invalidateBySourceType', () => {
    it('should invalidate entries by source type', () => {
      service.set({ ...mockMemory, sourceType: 'knowledge' });
      service.set({ ...mockMemory, id: 'mem-2', sourceType: 'tool' });
      service.set({ ...mockMemory, id: 'mem-3', sourceType: 'knowledge' });

      const count = service.invalidateBySourceType('knowledge');

      expect(count).toBe(2);
    });

    it('should only invalidate L1 cache', () => {
      service.set(mockMemory);

      service.invalidateBySourceType('knowledge');

      // L2 delete should not be called
      expect(mockL2Cache.delete).not.toHaveBeenCalled();
    });

    it('should return 0 when no entries match', () => {
      service.set({ ...mockMemory, sourceType: 'tool' });

      const count = service.invalidateBySourceType('knowledge');

      expect(count).toBe(0);
    });

    it('should handle all source types', () => {
      service.set({ ...mockMemory, sourceType: 'tool' });
      service.set({ ...mockMemory, id: 'mem-2', sourceType: 'guideline' });
      service.set({ ...mockMemory, id: 'mem-3', sourceType: 'experience' });
      service.set({ ...mockMemory, id: 'mem-4', sourceType: 'conversation' });

      expect(service.invalidateBySourceType('tool')).toBe(1);
      expect(service.invalidateBySourceType('guideline')).toBe(1);
      expect(service.invalidateBySourceType('experience')).toBe(1);
      expect(service.invalidateBySourceType('conversation')).toBe(1);
    });
  });

  describe('logStats', () => {
    it('should log current statistics', () => {
      service.set(mockMemory);
      service.get('mem-123');

      // Should not throw
      expect(() => service.logStats()).not.toThrow();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when maxSize is reached', async () => {
      const config: Partial<KVCacheConfig> = { l1MaxSize: 2 };
      const svc = new KVCacheService(mockL2Cache, config);

      await svc.set({ ...mockMemory, id: 'mem-1' });
      await svc.set({ ...mockMemory, id: 'mem-2' });
      await svc.set({ ...mockMemory, id: 'mem-3' });

      const stats = svc.getStats();
      expect(stats.l1Size).toBeLessThanOrEqual(2);
    });

    it('should keep recently accessed entries', async () => {
      const config: Partial<KVCacheConfig> = { l1MaxSize: 2 };
      const svc = new KVCacheService(mockL2Cache, config);

      await svc.set({ ...mockMemory, id: 'mem-1' });
      await svc.set({ ...mockMemory, id: 'mem-2' });
      await svc.get('mem-1'); // Access mem-1 to make it recently used
      await svc.set({ ...mockMemory, id: 'mem-3' });

      // mem-1 should still be in cache, mem-2 should be evicted
      const mem1 = await svc.get('mem-1');
      expect(mem1).toBeDefined();
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const config: Partial<KVCacheConfig> = { l1TtlMs: 100 };
      const svc = new KVCacheService(mockL2Cache, config);

      await svc.set(mockMemory);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = await svc.get('mem-123');
      expect(result).toBeUndefined();
    });

    it('should return value before TTL expires', async () => {
      const config: Partial<KVCacheConfig> = { l1TtlMs: 1000 };
      const svc = new KVCacheService(mockL2Cache, config);

      await svc.set(mockMemory);

      const result = await svc.get('mem-123');
      expect(result).toBeDefined();
    });
  });

  describe('memory estimation', () => {
    it('should estimate memory based on embedding sizes', async () => {
      const largeMemory: LatentMemory = {
        ...mockMemory,
        fullEmbedding: new Array(1536).fill(0.5),
        reducedEmbedding: new Array(256).fill(0.5),
      };

      await service.set(largeMemory);

      const stats = service.getStats();
      expect(stats.l1MemoryBytes).toBeGreaterThan(0);
    });
  });
});
