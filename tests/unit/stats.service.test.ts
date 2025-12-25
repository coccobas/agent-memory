/**
 * Unit tests for stats service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import {
  getCachedStats,
  getStatsWithMeta,
  invalidateStatsCache,
  getStatsCacheStatus,
  type TableCounts,
} from '../../src/services/stats.service.js';
import type { Runtime, StatsCache } from '../../src/core/runtime.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock database connection
const mockSqlite = {
  prepare: vi.fn(),
} as unknown as Database.Database;

// Mock container
let mockRuntime: Runtime | null = null;

vi.mock('../../src/db/connection.js', () => ({
  getSqlite: vi.fn(() => mockSqlite),
}));

vi.mock('../../src/core/container.js', () => ({
  getRuntime: vi.fn(() => {
    if (!mockRuntime) {
      throw new Error('Runtime not registered');
    }
    return mockRuntime;
  }),
  isRuntimeRegistered: vi.fn(() => mockRuntime !== null),
}));

// Helper to create a mock stats cache
function createMockStatsCache(): StatsCache {
  return {
    counts: {
      organizations: 0,
      projects: 0,
      sessions: 0,
      tools: 0,
      guidelines: 0,
      knowledge: 0,
      tags: 0,
      fileLocks: 0,
      conflicts: 0,
    },
    lastUpdated: 0,
    isRefreshing: false,
  };
}

// Helper to create mock query result
function createMockQueryResult(counts: Partial<TableCounts> = {}) {
  return [
    { table_name: 'organizations', count: counts.organizations ?? 5 },
    { table_name: 'projects', count: counts.projects ?? 10 },
    { table_name: 'sessions', count: counts.sessions ?? 3 },
    { table_name: 'tools', count: counts.tools ?? 20 },
    { table_name: 'guidelines', count: counts.guidelines ?? 15 },
    { table_name: 'knowledge', count: counts.knowledge ?? 25 },
    { table_name: 'tags', count: counts.tags ?? 8 },
    { table_name: 'file_locks', count: counts.fileLocks ?? 2 },
    { table_name: 'conflicts', count: counts.conflicts ?? 1 },
  ];
}

// Helper to setup database mock
function setupDatabaseMock(counts: Partial<TableCounts> = {}) {
  const mockAll = vi.fn().mockReturnValue(createMockQueryResult(counts));
  const mockPrepare = vi.fn().mockReturnValue({ all: mockAll });
  (mockSqlite.prepare as any) = mockPrepare;
}

// Helper to setup runtime with fresh cache
function setupRuntime(): StatsCache {
  const statsCache = createMockStatsCache();
  mockRuntime = {
    statsCache,
  } as Runtime;
  return statsCache;
}

describe('Stats Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRuntime = null;
    // Reset mockSqlite.prepare to be a fresh mock
    (mockSqlite as any).prepare = vi.fn();
  });

  afterEach(() => {
    vi.clearAllTimers();
    mockRuntime = null;
  });

  describe('getCachedStats', () => {
    it('should return default counts when no runtime available', () => {
      mockRuntime = null;
      setupDatabaseMock({ organizations: 5, projects: 10 });

      const stats = getCachedStats();

      // Without runtime, it should still get fresh data
      expect(stats).toEqual({
        organizations: 5,
        projects: 10,
        sessions: 3,
        tools: 20,
        guidelines: 15,
        knowledge: 25,
        tags: 8,
        fileLocks: 2,
        conflicts: 1,
      });
    });

    it('should perform synchronous refresh on first call (lastUpdated = 0)', () => {
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      expect(statsCache.lastUpdated).toBe(0);

      const stats = getCachedStats();

      // Should have updated the cache
      expect(statsCache.counts).toEqual(stats);
      expect(statsCache.lastUpdated).toBeGreaterThan(0);
      expect(statsCache.isRefreshing).toBe(false);
      expect(stats.organizations).toBe(5);
      expect(stats.projects).toBe(10);
    });

    it('should perform synchronous refresh when forceRefresh is true', () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // First call to populate cache
      getCachedStats();
      const firstTimestamp = statsCache.lastUpdated;

      // Wait a bit and update mock data
      vi.advanceTimersByTime(100);
      setupDatabaseMock({ organizations: 15, projects: 20 });

      // Force refresh
      const stats = getCachedStats(true);

      expect(stats.organizations).toBe(15);
      expect(stats.projects).toBe(20);
      expect(statsCache.lastUpdated).toBeGreaterThan(firstTimestamp);
      expect(statsCache.isRefreshing).toBe(false);

      vi.useRealTimers();
    });

    it('should return cached data and trigger background refresh when stale', async () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // First call - populates cache
      const firstStats = getCachedStats();
      expect(firstStats.organizations).toBe(5);

      // Advance time beyond TTL (60 seconds)
      vi.advanceTimersByTime(61_000);

      // Update mock to return different data
      setupDatabaseMock({ organizations: 15, projects: 20 });

      // Second call - should return stale data immediately
      const staleStats = getCachedStats();
      expect(staleStats.organizations).toBe(5); // Still old data
      expect(statsCache.isRefreshing).toBe(true); // Background refresh started

      // Process the background refresh
      await vi.runAllTimersAsync();

      // Cache should now have new data
      expect(statsCache.counts.organizations).toBe(15);
      expect(statsCache.counts.projects).toBe(20);
      expect(statsCache.isRefreshing).toBe(false);

      vi.useRealTimers();
    });

    it('should return cached data immediately when fresh', () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // First call
      getCachedStats();
      const timestamp = statsCache.lastUpdated;

      // Advance time but still within TTL
      vi.advanceTimersByTime(30_000); // 30 seconds (TTL is 60 seconds)

      // Update mock data (should not be used)
      setupDatabaseMock({ organizations: 99, projects: 99 });

      // Second call - should use cache
      const stats = getCachedStats();

      expect(stats.organizations).toBe(5); // Old cached data
      expect(stats.projects).toBe(10);
      expect(statsCache.lastUpdated).toBe(timestamp); // Not updated
      expect(statsCache.isRefreshing).toBe(false); // No refresh triggered

      vi.useRealTimers();
    });

    it('should handle database errors gracefully', () => {
      const statsCache = setupRuntime();
      const mockPrepare = vi.fn().mockImplementation(() => {
        throw new Error('Database error');
      });
      (mockSqlite.prepare as any) = mockPrepare;

      const stats = getCachedStats();

      // Should return default counts
      expect(stats).toEqual({
        organizations: 0,
        projects: 0,
        sessions: 0,
        tools: 0,
        guidelines: 0,
        knowledge: 0,
        tags: 0,
        fileLocks: 0,
        conflicts: 0,
      });

      // Cache should still be updated with defaults
      expect(statsCache.lastUpdated).toBeGreaterThan(0);
    });

    it('should not trigger multiple background refreshes', async () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // First call to populate
      getCachedStats();

      // Make cache stale
      vi.advanceTimersByTime(61_000);

      // Multiple calls should only trigger one refresh
      getCachedStats();
      getCachedStats();
      getCachedStats();

      expect(statsCache.isRefreshing).toBe(true);

      // Process background refresh
      await vi.runAllTimersAsync();

      expect(statsCache.isRefreshing).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('getStatsWithMeta', () => {
    it('should return counts with lastUpdated timestamp', () => {
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      const result = getStatsWithMeta();

      expect(result.counts.organizations).toBe(5);
      expect(result.counts.projects).toBe(10);
      expect(result.lastUpdated).toBeGreaterThan(0);
      expect(result.lastUpdated).toBe(statsCache.lastUpdated);
    });

    it('should indicate whether cache is stale', () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Fresh cache
      const fresh = getStatsWithMeta();
      expect(fresh.isStale).toBe(false);

      // Make cache stale
      vi.advanceTimersByTime(61_000);

      const stale = getStatsWithMeta();
      expect(stale.isStale).toBe(true);

      vi.useRealTimers();
    });

    it('should update lastUpdated after refresh', async () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      const before = getStatsWithMeta();
      const timestamp1 = before.lastUpdated;

      // Wait a bit to ensure different timestamp
      vi.advanceTimersByTime(10);

      // Force refresh
      getCachedStats(true);

      const after = getStatsWithMeta();
      const timestamp2 = after.lastUpdated;

      expect(timestamp2).toBeGreaterThan(timestamp1);

      vi.useRealTimers();
    });

    it('should handle missing runtime gracefully', () => {
      mockRuntime = null;
      setupDatabaseMock({ organizations: 5, projects: 10 });

      const result = getStatsWithMeta();

      expect(result.counts.organizations).toBe(5);
      expect(result.lastUpdated).toBeGreaterThan(0);
      expect(result.isStale).toBe(true); // No runtime means stale
    });
  });

  describe('invalidateStatsCache', () => {
    it('should mark cache as stale by setting lastUpdated to 0', () => {
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Populate cache
      getCachedStats();
      expect(statsCache.lastUpdated).toBeGreaterThan(0);

      // Invalidate
      invalidateStatsCache();

      expect(statsCache.lastUpdated).toBe(0);
    });

    it('should trigger refresh on next getCachedStats call', () => {
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Populate cache
      getCachedStats();

      // Invalidate
      invalidateStatsCache();

      // Update mock data
      setupDatabaseMock({ organizations: 15, projects: 20 });

      // Next call should refresh synchronously
      const stats = getCachedStats();

      expect(stats.organizations).toBe(15);
      expect(stats.projects).toBe(20);
      expect(statsCache.lastUpdated).toBeGreaterThan(0);
    });

    it('should handle missing runtime gracefully', () => {
      mockRuntime = null;

      // Should not throw
      expect(() => invalidateStatsCache()).not.toThrow();
    });
  });

  describe('getStatsCacheStatus', () => {
    it('should return hasCache: false when no runtime', () => {
      mockRuntime = null;

      const status = getStatsCacheStatus();

      expect(status.hasCache).toBe(false);
      expect(status.isStale).toBe(true);
      expect(status.isRefreshing).toBe(false);
      expect(status.ageMs).toBe(0);
    });

    it('should return hasCache: true but stale for new cache', () => {
      const statsCache = setupRuntime();

      const status = getStatsCacheStatus();

      expect(status.hasCache).toBe(true);
      expect(status.isStale).toBe(true); // lastUpdated = 0
      expect(status.isRefreshing).toBe(false);
      expect(status.ageMs).toBe(0);
    });

    it('should return isRefreshing status correctly', async () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Populate cache
      getCachedStats();

      // Make stale and trigger background refresh
      vi.advanceTimersByTime(61_000);
      getCachedStats();

      const statusDuringRefresh = getStatsCacheStatus();
      expect(statusDuringRefresh.isRefreshing).toBe(true);

      // Complete refresh
      await vi.runAllTimersAsync();

      const statusAfterRefresh = getStatsCacheStatus();
      expect(statusAfterRefresh.isRefreshing).toBe(false);

      vi.useRealTimers();
    });

    it('should calculate ageMs correctly', () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Populate cache
      getCachedStats();

      // Advance time
      vi.advanceTimersByTime(5_000); // 5 seconds

      const status = getStatsCacheStatus();

      expect(status.ageMs).toBeGreaterThanOrEqual(5_000);
      expect(status.ageMs).toBeLessThan(6_000);

      vi.useRealTimers();
    });

    it('should indicate cache is fresh when within TTL', () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Populate cache
      getCachedStats();

      // Advance time but within TTL (60 seconds)
      vi.advanceTimersByTime(30_000);

      const status = getStatsCacheStatus();

      expect(status.hasCache).toBe(true);
      expect(status.isStale).toBe(false);
      expect(status.ageMs).toBeGreaterThanOrEqual(30_000);

      vi.useRealTimers();
    });

    it('should indicate cache is stale when beyond TTL', () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Populate cache
      getCachedStats();

      // Advance time beyond TTL
      vi.advanceTimersByTime(61_000);

      const status = getStatsCacheStatus();

      expect(status.hasCache).toBe(true);
      expect(status.isStale).toBe(true);
      expect(status.ageMs).toBeGreaterThanOrEqual(61_000);

      vi.useRealTimers();
    });
  });

  describe('Background refresh', () => {
    it('should not block during background refresh', async () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Populate cache
      getCachedStats();

      // Make stale
      vi.advanceTimersByTime(61_000);

      // Update mock data
      setupDatabaseMock({ organizations: 15, projects: 20 });

      // This call should return immediately with stale data
      const result = getCachedStats();

      // Should return old data immediately (not wait for refresh)
      expect(result.organizations).toBe(5); // Old data
      expect(statsCache.isRefreshing).toBe(true); // Background refresh started

      vi.useRealTimers();
    });

    it('should update cache after background refresh completes', async () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Populate cache
      getCachedStats();

      // Make stale
      vi.advanceTimersByTime(61_000);

      // Update mock data
      setupDatabaseMock({ organizations: 15, projects: 20 });

      // Trigger background refresh
      getCachedStats();

      // Cache should still have old data
      expect(statsCache.counts.organizations).toBe(5);

      // Process background tasks
      await vi.runAllTimersAsync();

      // Cache should now have new data
      expect(statsCache.counts.organizations).toBe(15);
      expect(statsCache.counts.projects).toBe(20);

      vi.useRealTimers();
    });

    it('should handle errors in background refresh', async () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Populate cache
      getCachedStats();

      // Make stale
      vi.advanceTimersByTime(61_000);

      // Make database throw error
      const mockPrepare = vi.fn().mockImplementation(() => {
        throw new Error('Database error');
      });
      (mockSqlite.prepare as any) = mockPrepare;

      // Trigger background refresh
      getCachedStats();

      // Process background tasks - should not throw
      await expect(vi.runAllTimersAsync()).resolves.not.toThrow();

      // isRefreshing should be reset even on error
      expect(statsCache.isRefreshing).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('Query result parsing', () => {
    it('should correctly parse all table counts', () => {
      const statsCache = setupRuntime();
      setupDatabaseMock({
        organizations: 1,
        projects: 2,
        sessions: 3,
        tools: 4,
        guidelines: 5,
        knowledge: 6,
        tags: 7,
        fileLocks: 8,
        conflicts: 9,
      });

      const stats = getCachedStats();

      expect(stats.organizations).toBe(1);
      expect(stats.projects).toBe(2);
      expect(stats.sessions).toBe(3);
      expect(stats.tools).toBe(4);
      expect(stats.guidelines).toBe(5);
      expect(stats.knowledge).toBe(6);
      expect(stats.tags).toBe(7);
      expect(stats.fileLocks).toBe(8);
      expect(stats.conflicts).toBe(9);
    });

    it('should handle missing tables with default values', () => {
      const statsCache = setupRuntime();
      const mockAll = vi.fn().mockReturnValue([
        { table_name: 'organizations', count: 5 },
        { table_name: 'projects', count: 10 },
        // Missing other tables
      ]);
      const mockPrepare = vi.fn().mockReturnValue({ all: mockAll });
      (mockSqlite.prepare as any) = mockPrepare;

      const stats = getCachedStats();

      expect(stats.organizations).toBe(5);
      expect(stats.projects).toBe(10);
      // Should have defaults for missing tables
      expect(stats.sessions).toBe(0);
      expect(stats.tools).toBe(0);
      expect(stats.guidelines).toBe(0);
    });

    it('should handle zero counts', () => {
      const statsCache = setupRuntime();
      setupDatabaseMock({
        organizations: 0,
        projects: 0,
        sessions: 0,
        tools: 0,
        guidelines: 0,
        knowledge: 0,
        tags: 0,
        fileLocks: 0,
        conflicts: 0,
      });

      const stats = getCachedStats();

      expect(stats.organizations).toBe(0);
      expect(stats.projects).toBe(0);
      expect(stats.sessions).toBe(0);
    });

    it('should handle large counts', () => {
      const statsCache = setupRuntime();
      setupDatabaseMock({
        organizations: 1000000,
        projects: 5000000,
        sessions: 100000,
        tools: 2000000,
        guidelines: 3000000,
        knowledge: 10000000,
        tags: 500000,
        fileLocks: 10,
        conflicts: 5,
      });

      const stats = getCachedStats();

      expect(stats.organizations).toBe(1000000);
      expect(stats.projects).toBe(5000000);
      expect(stats.knowledge).toBe(10000000);
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid consecutive calls', () => {
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Multiple rapid calls
      const stats1 = getCachedStats();
      const stats2 = getCachedStats();
      const stats3 = getCachedStats();

      // All should return same cached data
      expect(stats1).toEqual(stats2);
      expect(stats2).toEqual(stats3);

      // Should only query database once
      expect(mockSqlite.prepare).toHaveBeenCalledTimes(1);
    });

    it('should handle alternating forceRefresh calls', () => {
      const statsCache = setupRuntime();

      // First call
      setupDatabaseMock({ organizations: 5, projects: 10 });
      const stats1 = getCachedStats(true);
      expect(stats1.organizations).toBe(5);
      expect(stats1.projects).toBe(10);

      // Second call with new data
      setupDatabaseMock({ organizations: 6, projects: 11 });
      const stats2 = getCachedStats(true);
      expect(stats2.organizations).toBe(6);
      expect(stats2.projects).toBe(11);

      // Third call with new data
      setupDatabaseMock({ organizations: 7, projects: 12 });
      const stats3 = getCachedStats(true);
      expect(stats3.organizations).toBe(7);
      expect(stats3.projects).toBe(12);

      // Final cache state should match last refresh
      expect(statsCache.counts.organizations).toBe(7);
      expect(statsCache.counts.projects).toBe(12);
    });

    it('should handle cache transitions from no runtime to runtime', () => {
      mockRuntime = null;
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Call without runtime
      const stats1 = getCachedStats();
      expect(stats1.organizations).toBe(5);

      // Setup runtime
      const statsCache = setupRuntime();

      // Call with runtime - should refresh
      const stats2 = getCachedStats();
      expect(stats2.organizations).toBe(5);
      expect(statsCache.lastUpdated).toBeGreaterThan(0);
    });

    it('should handle empty query results', () => {
      const statsCache = setupRuntime();
      const mockAll = vi.fn().mockReturnValue([]);
      const mockPrepare = vi.fn().mockReturnValue({ all: mockAll });
      (mockSqlite.prepare as any) = mockPrepare;

      const stats = getCachedStats();

      // Should return all defaults
      expect(stats).toEqual({
        organizations: 0,
        projects: 0,
        sessions: 0,
        tools: 0,
        guidelines: 0,
        knowledge: 0,
        tags: 0,
        fileLocks: 0,
        conflicts: 0,
      });
    });

    it('should handle unknown table names in results', () => {
      const statsCache = setupRuntime();
      const mockAll = vi.fn().mockReturnValue([
        { table_name: 'organizations', count: 5 },
        { table_name: 'unknown_table', count: 99 },
        { table_name: 'projects', count: 10 },
      ]);
      const mockPrepare = vi.fn().mockReturnValue({ all: mockAll });
      (mockSqlite.prepare as any) = mockPrepare;

      const stats = getCachedStats();

      // Should parse known tables and ignore unknown
      expect(stats.organizations).toBe(5);
      expect(stats.projects).toBe(10);
      expect((stats as any).unknown_table).toBeUndefined();
    });
  });

  describe('Integration scenarios', () => {
    it('should support typical health check pattern', () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // First health check - cold cache
      const check1 = getCachedStats();
      expect(check1.organizations).toBe(5);

      // Subsequent health checks within TTL - should be fast
      vi.advanceTimersByTime(10_000); // 10 seconds
      const check2 = getCachedStats();
      expect(check2).toEqual(check1);

      vi.advanceTimersByTime(20_000); // 30 seconds total
      const check3 = getCachedStats();
      expect(check3).toEqual(check1);

      // Should only query once (initial)
      expect(mockSqlite.prepare).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should support monitoring dashboard pattern', async () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Initial load
      const initial = getStatsWithMeta();
      expect(initial.isStale).toBe(false);

      // Dashboard polling every 30 seconds
      vi.advanceTimersByTime(30_000);
      const poll1 = getStatsWithMeta();
      expect(poll1.isStale).toBe(false);

      vi.advanceTimersByTime(30_000);
      const poll2 = getStatsWithMeta();
      expect(poll2.isStale).toBe(false);

      // After 61 seconds, should detect stale
      vi.advanceTimersByTime(1_000);
      const poll3 = getStatsWithMeta();
      expect(poll3.isStale).toBe(true);

      vi.useRealTimers();
    });

    it('should support admin invalidation pattern', async () => {
      vi.useFakeTimers();
      const statsCache = setupRuntime();
      setupDatabaseMock({ organizations: 5, projects: 10 });

      // Initial state
      getCachedStats();

      // Admin makes a change and invalidates cache
      setupDatabaseMock({ organizations: 6, projects: 11 });
      invalidateStatsCache();

      // Next call gets fresh data
      const updated = getCachedStats();
      expect(updated.organizations).toBe(6);
      expect(updated.projects).toBe(11);

      vi.useRealTimers();
    });
  });
});
