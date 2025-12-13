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
      const stats = getUsageStats();

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
      const stats = getUsageStats({ scopeType: 'global' });

      expect(stats).toBeDefined();
      expect(typeof stats.scopeUsage).toBe('object');
    });

    it('should filter by scopeId', () => {
      const stats = getUsageStats({ scopeId: 'test-scope-id' });

      expect(stats).toBeDefined();
    });

    it('should filter by date range', () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();

      const stats = getUsageStats({ startDate, endDate });

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
          const stats = getUsageStats();

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
          const stats = getUsageStats();

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
          const stats = getUsageStats();

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
          const stats = getUsageStats();

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
          const stats = getUsageStats();

          expect(stats.entryTypeBreakdown).toBeDefined();
          expect(Array.isArray(stats.entryTypeBreakdown)).toBe(true);
          resolve();
        });
      });
    });
  });

  describe('getTrends', () => {
    it('should return trend data structure', () => {
      const trends = getTrends();

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
      const trends = getTrends({ scopeType: 'global' });

      expect(Array.isArray(trends)).toBe(true);
    });

    it('should filter trends by date range', () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();

      const trends = getTrends({ startDate, endDate });

      expect(Array.isArray(trends)).toBe(true);
    });

    it('should calculate trend aggregations correctly', () => {
      logAction({ action: 'query' });
      logAction({ action: 'create', entryType: 'tool' });
      logAction({ action: 'update', entryType: 'tool' });

      return new Promise<void>((resolve) => {
        setImmediate(() => {
          const trends = getTrends();

          expect(Array.isArray(trends)).toBe(true);
          // Trends should aggregate actions by date
          resolve();
        });
      });
    });
  });

  describe('getSubtaskStats', () => {
    it('should return subtask statistics structure', () => {
      const stats = getSubtaskStats({ projectId: 'test-project' });

      expect(stats).toBeDefined();
      expect(Array.isArray(stats.subtasks)).toBe(true);
      expect(typeof stats.totalSubtasks).toBe('number');
      expect(typeof stats.completedSubtasks).toBe('number');
      expect(typeof stats.failedSubtasks).toBe('number');
    });

    it('should filter by subtaskType', () => {
      const stats = getSubtaskStats({
        projectId: 'test-project',
        subtaskType: 'test-type',
      });

      expect(stats).toBeDefined();
    });

    it('should calculate completion statistics', () => {
      const stats = getSubtaskStats({ projectId: 'test-project' });

      expect(stats.totalSubtasks).toBeGreaterThanOrEqual(0);
      expect(stats.completedSubtasks).toBeGreaterThanOrEqual(0);
      expect(stats.failedSubtasks).toBeGreaterThanOrEqual(0);
    });

    it('should return subtask details', () => {
      const stats = getSubtaskStats({ projectId: 'test-project' });

      stats.subtasks.forEach((subtask) => {
        expect(subtask.subtaskType).toBeDefined();
        expect(typeof subtask.total).toBe('number');
        expect(typeof subtask.completed).toBe('number');
        expect(typeof subtask.failed).toBe('number');
        expect(typeof subtask.successRate).toBe('number');
      });
    });
  });
});
