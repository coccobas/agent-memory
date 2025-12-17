/**
 * Integration tests for analytics handler
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';
import { analyticsHandlers } from '../../src/mcp/handlers/analytics.handler.js';

const TEST_DB_PATH = './data/test-analytics-handler.db';
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

describe('Analytics Handler Integration', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('get_stats', () => {
    it('should return usage statistics', () => {
      const result = analyticsHandlers.get_stats({});

      expect(result).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.filters).toBeDefined();
      expect(Array.isArray(result.stats.mostQueriedEntries)).toBe(true);
      expect(Array.isArray(result.stats.queryFrequency)).toBe(true);
    });

    it('should filter by scopeType', () => {
      const result = analyticsHandlers.get_stats({ scopeType: 'global' });

      expect(result.filters.scopeType).toBe('global');
      expect(result.stats).toBeDefined();
    });

    it('should filter by scopeId', () => {
      const result = analyticsHandlers.get_stats({ scopeId: 'test-scope-id' });

      expect(result.filters.scopeId).toBe('test-scope-id');
    });

    it('should filter by date range', () => {
      const startDate = '2024-01-01T00:00:00Z';
      const endDate = '2024-12-31T23:59:59Z';

      const result = analyticsHandlers.get_stats({ startDate, endDate });

      expect(result.filters.startDate).toBe(startDate);
      expect(result.filters.endDate).toBe(endDate);
    });
  });

  describe('get_trends', () => {
    it('should return trend data', () => {
      const result = analyticsHandlers.get_trends({});

      expect(result).toBeDefined();
      expect(result.trends).toBeDefined();
      expect(Array.isArray(result.trends)).toBe(true);
      expect(result.filters).toBeDefined();
    });

    it('should filter trends by scopeType', () => {
      const result = analyticsHandlers.get_trends({ scopeType: 'project' });

      expect(result.filters.scopeType).toBe('project');
    });

    it('should filter trends by date range', () => {
      const startDate = '2024-01-01T00:00:00Z';
      const endDate = '2024-12-31T23:59:59Z';

      const result = analyticsHandlers.get_trends({ startDate, endDate });

      expect(result.filters.startDate).toBe(startDate);
      expect(result.filters.endDate).toBe(endDate);
    });
  });

  describe('get_subtask_stats', () => {
    it('should return subtask statistics', () => {
      const result = analyticsHandlers.get_subtask_stats({ projectId: 'test-project' });

      expect(result).toBeDefined();
      expect(Array.isArray(result.subtasks)).toBe(true);
      expect(typeof result.totalSubtasks).toBe('number');
      expect(typeof result.completedSubtasks).toBe('number');
      expect(typeof result.failedSubtasks).toBe('number');
    });

    it('should filter by subtaskType', () => {
      const result = analyticsHandlers.get_subtask_stats({
        projectId: 'test-project',
        subtaskType: 'test-type',
      });

      expect(result).toBeDefined();
    });

    it('should filter by date range', () => {
      const startDate = '2024-01-01T00:00:00Z';
      const endDate = '2024-12-31T23:59:59Z';

      const result = analyticsHandlers.get_subtask_stats({
        projectId: 'test-project',
        startDate,
        endDate,
      });

      expect(result).toBeDefined();
    });
  });

  describe('get_error_correlation', () => {
    it('should calculate error correlation', () => {
      const result = analyticsHandlers.get_error_correlation({
        agentA: 'agent-1',
        agentB: 'agent-2',
      });

      expect(result).toBeDefined();
      expect(typeof result.correlation).toBe('number');
      expect(result.correlation).toBeGreaterThanOrEqual(-1);
      expect(result.correlation).toBeLessThanOrEqual(1);
      expect(typeof result.sharedErrors).toBe('number');
      expect(typeof result.totalTasks).toBe('number');
      expect(typeof result.recommendation).toBe('string');
    });

    it('should require agentA and agentB', () => {
      expect(() => {
        analyticsHandlers.get_error_correlation({ agentA: 'agent-1' });
      }).toThrow('agentA and agentB are required');

      expect(() => {
        analyticsHandlers.get_error_correlation({ agentB: 'agent-2' });
      }).toThrow('agentA and agentB are required');
    });

    it('should accept time window', () => {
      const timeWindow = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-12-31T23:59:59Z',
      };

      const result = analyticsHandlers.get_error_correlation({
        agentA: 'agent-1',
        agentB: 'agent-2',
        timeWindow,
      });

      expect(result).toBeDefined();
    });
  });

  describe('get_low_diversity', () => {
    it('should require projectId', () => {
      expect(() => {
        analyticsHandlers.get_low_diversity({});
      }).toThrow('projectId is required');
    });

    it('should detect low diversity', () => {
      const result = analyticsHandlers.get_low_diversity({ projectId: 'test-project' });

      expect(result).toBeDefined();
      expect(Array.isArray(result.agentPairs)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });
});


