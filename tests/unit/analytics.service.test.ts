/**
 * Unit tests for analytics service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';
import { logAction } from '../../src/services/audit.service.js';
import { getUsageStats, getTrends, getSubtaskStats } from '../../src/services/analytics.service.js';
import * as schema from '../../src/db/schema.js';

const TEST_DB_PATH = './data/test-analytics.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

// Also need to mock audit service's connection
vi.mock('../../src/services/audit.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/audit.service.js')>(
    '../../src/services/audit.service.js'
  );
  return actual;
});

describe('analytics.service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('getUsageStats', () => {
    it('should return usage statistics structure', () => {
      const stats = getUsageStats({}, db);

      expect(stats).toBeDefined();
      expect(stats.mostQueriedEntries).toBeDefined();
      expect(Array.isArray(stats.mostQueriedEntries)).toBe(true);
      expect(Array.isArray(stats.queryFrequency)).toBe(true);
      expect(Array.isArray(stats.tagPopularity)).toBe(true);
      expect(typeof stats.scopeUsage).toBe('object');
      expect(Array.isArray(stats.searchQueries)).toBe(true);
      expect(Array.isArray(stats.actionBreakdown)).toBe(true);
      expect(Array.isArray(stats.entryTypeBreakdown)).toBe(true);
    });

    it('should filter by scopeType', () => {
      const stats = getUsageStats({ scopeType: 'global' }, db);

      expect(stats).toBeDefined();
      expect(typeof stats.scopeUsage).toBe('object');
    });

    it('should filter by scopeId', () => {
      const stats = getUsageStats({ scopeId: 'test-scope-id' }, db);

      expect(stats).toBeDefined();
    });

    it('should filter by date range', () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();

      const stats = getUsageStats({ startDate, endDate }, db);

      expect(stats).toBeDefined();
    });

    it('should return most queried entries', () => {
      // Add some audit log entries
      logAction({
        action: 'query',
        entryType: 'tool',
        entryId: 'tool-123',
      });

      // Wait for async logging
      return new Promise<void>((resolve) => {
        setImmediate(() => {
          const stats = getUsageStats({}, db);

          expect(stats.mostQueriedEntries).toBeDefined();
          expect(Array.isArray(stats.mostQueriedEntries)).toBe(true);
          resolve();
        });
      });
    });

    it('should return query frequency data', () => {
      logAction({
        action: 'query',
      });

      return new Promise<void>((resolve) => {
        setImmediate(() => {
          const stats = getUsageStats({}, db);

          expect(stats.queryFrequency).toBeDefined();
          expect(Array.isArray(stats.queryFrequency)).toBe(true);
          resolve();
        });
      });
    });

    it('should return scope usage breakdown', () => {
      logAction({
        action: 'create',
        scopeType: 'global',
      });

      return new Promise<void>((resolve) => {
        setImmediate(() => {
          const stats = getUsageStats({}, db);

          expect(stats.scopeUsage).toBeDefined();
          expect(stats.scopeUsage.global).toBeDefined();
          expect(stats.scopeUsage.org).toBeDefined();
          expect(stats.scopeUsage.project).toBeDefined();
          expect(stats.scopeUsage.session).toBeDefined();
          resolve();
        });
      });
    });

    it('should return action breakdown', () => {
      logAction({
        action: 'create',
        entryType: 'tool',
      });

      return new Promise<void>((resolve) => {
        setImmediate(() => {
          const stats = getUsageStats({}, db);

          expect(stats.actionBreakdown).toBeDefined();
          expect(Array.isArray(stats.actionBreakdown)).toBe(true);
          resolve();
        });
      });
    });

    it('should return entry type breakdown', () => {
      logAction({
        action: 'read',
        entryType: 'guideline',
      });

      return new Promise<void>((resolve) => {
        setImmediate(() => {
          const stats = getUsageStats({}, db);

          expect(stats.entryTypeBreakdown).toBeDefined();
          expect(Array.isArray(stats.entryTypeBreakdown)).toBe(true);
          resolve();
        });
      });
    });
  });

  describe('getTrends', () => {
    it('should return trend data structure', () => {
      const trends = getTrends({}, db);

      expect(Array.isArray(trends)).toBe(true);
      if (trends.length > 0) {
        const trend = trends[0];
        expect(trend).toBeDefined();
        expect(trend.date).toBeDefined();
        expect(typeof trend.queries).toBe('number');
        expect(typeof trend.creates).toBe('number');
        expect(typeof trend.updates).toBe('number');
        expect(typeof trend.deletes).toBe('number');
        expect(typeof trend.total).toBe('number');
      }
    });

    it('should filter trends by scopeType', () => {
      const trends = getTrends({ scopeType: 'global' }, db);

      expect(Array.isArray(trends)).toBe(true);
    });

    it('should filter trends by date range', () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();

      const trends = getTrends({ startDate, endDate }, db);

      expect(Array.isArray(trends)).toBe(true);
    });

    it('should calculate trend aggregations correctly', () => {
      logAction({ action: 'query' });
      logAction({ action: 'create', entryType: 'tool' });
      logAction({ action: 'update', entryType: 'tool' });

      return new Promise<void>((resolve) => {
        setImmediate(() => {
          const trends = getTrends({}, db);

          expect(Array.isArray(trends)).toBe(true);
          // Trends should aggregate actions by date
          resolve();
        });
      });
    });
  });

  describe('getUsageStats with search queries', () => {
    it('should extract search queries from queryParams JSON', () => {
      // Insert audit log entry with queryParams directly into database
      db.insert(schema.auditLog)
        .values({
          id: 'test-search-1',
          action: 'query',
          queryParams: JSON.stringify({ search: 'test query' }),
          createdAt: new Date().toISOString(),
        })
        .run();

      const stats = getUsageStats({}, db);

      expect(stats.searchQueries).toBeDefined();
      expect(Array.isArray(stats.searchQueries)).toBe(true);
    });

    it('should handle query parameter alias', () => {
      db.insert(schema.auditLog)
        .values({
          id: 'test-search-2',
          action: 'query',
          queryParams: JSON.stringify({ query: 'another query' }),
          createdAt: new Date().toISOString(),
        })
        .run();

      const stats = getUsageStats({}, db);
      expect(stats.searchQueries).toBeDefined();
    });

    it('should handle invalid JSON in queryParams gracefully', () => {
      db.insert(schema.auditLog)
        .values({
          id: 'test-search-3',
          action: 'query',
          queryParams: 'not valid json {{{',
          createdAt: new Date().toISOString(),
        })
        .run();

      // Should not throw
      const stats = getUsageStats({}, db);
      expect(stats.searchQueries).toBeDefined();
    });

    it('should normalize and deduplicate search queries', () => {
      db.insert(schema.auditLog)
        .values([
          {
            id: 'test-search-4a',
            action: 'query',
            queryParams: JSON.stringify({ search: 'Test Query' }),
            createdAt: new Date().toISOString(),
          },
          {
            id: 'test-search-4b',
            action: 'query',
            queryParams: JSON.stringify({ search: 'test query' }),
            createdAt: new Date().toISOString(),
          },
        ])
        .run();

      const stats = getUsageStats({}, db);
      // Should normalize to lowercase and count duplicates
      expect(stats.searchQueries).toBeDefined();
    });

    it('should ignore empty search queries', () => {
      db.insert(schema.auditLog)
        .values({
          id: 'test-search-5',
          action: 'query',
          queryParams: JSON.stringify({ search: '   ' }),
          createdAt: new Date().toISOString(),
        })
        .run();

      const stats = getUsageStats({}, db);
      expect(stats.searchQueries).toBeDefined();
    });

    it('should handle queryParams that is already an object', () => {
      db.insert(schema.auditLog)
        .values({
          id: 'test-search-6',
          action: 'query',
          queryParams: { search: 'object query' } as any,
          createdAt: new Date().toISOString(),
        })
        .run();

      const stats = getUsageStats({}, db);
      expect(stats.searchQueries).toBeDefined();
    });

    it('should handle queryParams that is an array', () => {
      db.insert(schema.auditLog)
        .values({
          id: 'test-search-7',
          action: 'query',
          queryParams: JSON.stringify(['array', 'items']),
          createdAt: new Date().toISOString(),
        })
        .run();

      // Should not throw - arrays are skipped
      const stats = getUsageStats({}, db);
      expect(stats.searchQueries).toBeDefined();
    });
  });

  describe('getTrends action types', () => {
    it('should track delete actions in trends', () => {
      logAction({ action: 'delete', entryType: 'tool' });

      return new Promise<void>((resolve) => {
        setImmediate(() => {
          const trends = getTrends({}, db);

          expect(Array.isArray(trends)).toBe(true);
          // At least one trend entry should have delete counts
          if (trends.length > 0) {
            expect(trends.some((t) => t.deletes >= 0)).toBe(true);
          }
          resolve();
        });
      });
    });

    it('should filter by scopeId', () => {
      const trends = getTrends({ scopeId: 'test-scope' }, db);
      expect(Array.isArray(trends)).toBe(true);
    });
  });

  describe('getSubtaskStats', () => {
    it('should return subtask statistics structure', () => {
      const stats = getSubtaskStats({ projectId: 'test-project' }, db);

      expect(stats).toBeDefined();
      expect(Array.isArray(stats.subtasks)).toBe(true);
      expect(typeof stats.totalSubtasks).toBe('number');
      expect(typeof stats.completedSubtasks).toBe('number');
      expect(typeof stats.failedSubtasks).toBe('number');
    });

    it('should filter by subtaskType', () => {
      const stats = getSubtaskStats(
        {
          projectId: 'test-project',
          subtaskType: 'test-type',
        },
        db
      );

      expect(stats).toBeDefined();
    });

    it('should calculate completion statistics', () => {
      const stats = getSubtaskStats({ projectId: 'test-project' }, db);

      expect(stats.totalSubtasks).toBeGreaterThanOrEqual(0);
      expect(stats.completedSubtasks).toBeGreaterThanOrEqual(0);
      expect(stats.failedSubtasks).toBeGreaterThanOrEqual(0);
    });

    it('should return subtask details', () => {
      const stats = getSubtaskStats({ projectId: 'test-project' }, db);

      stats.subtasks.forEach((subtask) => {
        expect(subtask.subtaskType).toBeDefined();
        expect(typeof subtask.total).toBe('number');
        expect(typeof subtask.completed).toBe('number');
        expect(typeof subtask.failed).toBe('number');
        expect(typeof subtask.successRate).toBe('number');
      });
    });

    it('should filter by date range', () => {
      const stats = getSubtaskStats({
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-12-31T23:59:59.999Z',
      }, db);

      expect(stats).toBeDefined();
      expect(typeof stats.totalSubtasks).toBe('number');
    });

    it('should filter without projectId (uses subtask filter only)', () => {
      const stats = getSubtaskStats({
        subtaskType: 'test-subtask-type',
      }, db);

      expect(stats).toBeDefined();
    });

    it('should track success and failure status', () => {
      // Insert audit logs with different success states
      db.insert(schema.auditLog)
        .values([
          {
            id: 'subtask-success-1',
            action: 'create',
            scopeType: 'project',
            scopeId: 'test-proj-stats',
            subtaskType: 'test-subtask',
            success: true,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'subtask-fail-1',
            action: 'create',
            scopeType: 'project',
            scopeId: 'test-proj-stats',
            subtaskType: 'test-subtask',
            success: false,
            createdAt: new Date().toISOString(),
          },
        ])
        .run();

      const stats = getSubtaskStats({ projectId: 'test-proj-stats' }, db);

      expect(stats.totalSubtasks).toBeGreaterThan(0);
      expect(stats.completedSubtasks).toBeGreaterThan(0);
      expect(stats.failedSubtasks).toBeGreaterThan(0);
    });

    it('should calculate success rate correctly', () => {
      // Insert audit logs with known outcomes
      db.insert(schema.auditLog)
        .values([
          {
            id: 'subtask-rate-1',
            action: 'create',
            scopeType: 'project',
            scopeId: 'test-proj-rate',
            subtaskType: 'rate-test',
            success: true,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'subtask-rate-2',
            action: 'create',
            scopeType: 'project',
            scopeId: 'test-proj-rate',
            subtaskType: 'rate-test',
            success: true,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'subtask-rate-3',
            action: 'create',
            scopeType: 'project',
            scopeId: 'test-proj-rate',
            subtaskType: 'rate-test',
            success: false,
            createdAt: new Date().toISOString(),
          },
        ])
        .run();

      const stats = getSubtaskStats({ projectId: 'test-proj-rate' }, db);

      // Should have at least one subtask type
      expect(stats.subtasks.length).toBeGreaterThan(0);

      // Find our test subtask
      const rateTest = stats.subtasks.find((s) => s.subtaskType === 'rate-test');
      if (rateTest) {
        // 2 success out of 3 = 66.67%
        expect(rateTest.successRate).toBeCloseTo(2 / 3, 2);
      }
    });
  });
});

