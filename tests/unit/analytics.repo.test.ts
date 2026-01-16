/**
 * Unit tests for analytics repository
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
  type TestDb,
} from '../fixtures/test-helpers.js';
import { createAnalyticsRepository } from '../../src/db/repositories/analytics.js';
import type { IAnalyticsRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-analytics-repo.db';
let testDb: TestDb;
let analyticsRepo: IAnalyticsRepository;

describe('analyticsRepo', () => {
  let testOrgId: string;
  let testProjectId: string;

  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    analyticsRepo = createAnalyticsRepository(testDb.db as any);

    // Create test org and project
    const org = createTestOrg(testDb.db, 'Analytics Test Org');
    testOrgId = org.id;
    const project = createTestProject(testDb.db, 'Analytics Test Project', org.id);
    testProjectId = project.id;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('getUsageStats', () => {
    it('should return usage stats with no filters', async () => {
      const stats = await analyticsRepo.getUsageStats();

      expect(stats).toBeDefined();
      expect(stats.mostQueriedEntries).toBeDefined();
      expect(stats.queryFrequency).toBeDefined();
      expect(stats.tagPopularity).toBeDefined();
      expect(stats.scopeUsage).toBeDefined();
      expect(stats.searchQueries).toBeDefined();
      expect(stats.actionBreakdown).toBeDefined();
      expect(stats.entryTypeBreakdown).toBeDefined();
    });

    it('should return usage stats with scope filter', async () => {
      const stats = await analyticsRepo.getUsageStats({
        scopeType: 'project',
        scopeId: testProjectId,
      });

      expect(stats).toBeDefined();
      expect(Array.isArray(stats.mostQueriedEntries)).toBe(true);
      expect(Array.isArray(stats.queryFrequency)).toBe(true);
      expect(Array.isArray(stats.tagPopularity)).toBe(true);
    });

    it('should return usage stats with date range filter', async () => {
      const stats = await analyticsRepo.getUsageStats({
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
      });

      expect(stats).toBeDefined();
      expect(Array.isArray(stats.mostQueriedEntries)).toBe(true);
    });

    it('should return usage stats with all filters', async () => {
      const stats = await analyticsRepo.getUsageStats({
        scopeType: 'global',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
      });

      expect(stats).toBeDefined();
      expect(stats.scopeUsage).toBeDefined();
      expect(typeof stats.scopeUsage.global).toBe('number');
    });

    it('should handle empty results gracefully', async () => {
      const stats = await analyticsRepo.getUsageStats({
        scopeType: 'project',
        scopeId: 'non-existent-project',
      });

      expect(stats.mostQueriedEntries).toEqual([]);
      expect(stats.queryFrequency).toEqual([]);
    });

    it('should return scope usage breakdown', async () => {
      const stats = await analyticsRepo.getUsageStats();

      expect(stats.scopeUsage).toBeDefined();
      expect(typeof stats.scopeUsage.global).toBe('number');
      expect(typeof stats.scopeUsage.org).toBe('number');
      expect(typeof stats.scopeUsage.project).toBe('number');
      expect(typeof stats.scopeUsage.session).toBe('number');
    });

    it('should return action breakdown', async () => {
      const stats = await analyticsRepo.getUsageStats();

      expect(Array.isArray(stats.actionBreakdown)).toBe(true);
      stats.actionBreakdown.forEach((item) => {
        expect(item).toHaveProperty('action');
        expect(item).toHaveProperty('count');
      });
    });

    it('should return entry type breakdown', async () => {
      const stats = await analyticsRepo.getUsageStats();

      expect(Array.isArray(stats.entryTypeBreakdown)).toBe(true);
      stats.entryTypeBreakdown.forEach((item) => {
        expect(item).toHaveProperty('entryType');
        expect(item).toHaveProperty('count');
      });
    });

    it('should return search queries', async () => {
      const stats = await analyticsRepo.getUsageStats();

      expect(Array.isArray(stats.searchQueries)).toBe(true);
      stats.searchQueries.forEach((item) => {
        expect(item).toHaveProperty('query');
        expect(item).toHaveProperty('count');
      });
    });
  });

  describe('getTrends', () => {
    it('should return trend data array with no filters', async () => {
      const trends = await analyticsRepo.getTrends();

      expect(Array.isArray(trends)).toBe(true);
    });

    it('should return trends with scope filter', async () => {
      const trends = await analyticsRepo.getTrends({
        scopeType: 'project',
        scopeId: testProjectId,
      });

      expect(Array.isArray(trends)).toBe(true);
    });

    it('should return trends with date range', async () => {
      const trends = await analyticsRepo.getTrends({
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
      });

      expect(Array.isArray(trends)).toBe(true);
    });

    it('should return empty array when no data', async () => {
      const trends = await analyticsRepo.getTrends({
        scopeType: 'project',
        scopeId: 'non-existent-project',
      });

      expect(trends).toEqual([]);
    });

    it('should return trend items with correct structure', async () => {
      const trends = await analyticsRepo.getTrends();

      if (trends.length > 0) {
        const trend = trends[0];
        expect(trend).toHaveProperty('date');
        expect(trend).toHaveProperty('queries');
        expect(trend).toHaveProperty('creates');
        expect(trend).toHaveProperty('updates');
        expect(trend).toHaveProperty('deletes');
        expect(trend).toHaveProperty('total');
      }
    });
  });

  describe('getSubtaskStats', () => {
    it('should return subtask stats with no filters', async () => {
      const stats = await analyticsRepo.getSubtaskStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalSubtasks).toBe('number');
      expect(typeof stats.completedSubtasks).toBe('number');
      expect(typeof stats.failedSubtasks).toBe('number');
      expect(Array.isArray(stats.subtasks)).toBe(true);
    });

    it('should return subtask stats with project filter', async () => {
      const stats = await analyticsRepo.getSubtaskStats({
        projectId: testProjectId,
      });

      expect(stats).toBeDefined();
      expect(typeof stats.totalSubtasks).toBe('number');
      expect(typeof stats.completedSubtasks).toBe('number');
      expect(typeof stats.failedSubtasks).toBe('number');
    });

    it('should return subtask stats with type filter', async () => {
      const stats = await analyticsRepo.getSubtaskStats({
        subtaskType: 'feature',
      });

      expect(stats).toBeDefined();
      expect(typeof stats.totalSubtasks).toBe('number');
      expect(Array.isArray(stats.subtasks)).toBe(true);
    });

    it('should handle empty results', async () => {
      const stats = await analyticsRepo.getSubtaskStats({
        projectId: 'non-existent-project',
      });

      expect(stats.totalSubtasks).toBe(0);
      expect(stats.completedSubtasks).toBe(0);
      expect(stats.failedSubtasks).toBe(0);
      expect(stats.subtasks).toEqual([]);
    });

    it('should return subtasks array with correct structure', async () => {
      const stats = await analyticsRepo.getSubtaskStats();

      expect(Array.isArray(stats.subtasks)).toBe(true);
      stats.subtasks.forEach((item) => {
        expect(item).toHaveProperty('subtaskType');
        expect(item).toHaveProperty('total');
        expect(item).toHaveProperty('completed');
        expect(item).toHaveProperty('failed');
        expect(item).toHaveProperty('successRate');
        expect(typeof item.subtaskType).toBe('string');
        expect(typeof item.total).toBe('number');
        expect(typeof item.completed).toBe('number');
        expect(typeof item.failed).toBe('number');
        expect(typeof item.successRate).toBe('number');
      });
    });

    it('should return date-filtered subtask stats', async () => {
      const stats = await analyticsRepo.getSubtaskStats({
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
      });

      expect(stats).toBeDefined();
      expect(typeof stats.totalSubtasks).toBe('number');
      expect(Array.isArray(stats.subtasks)).toBe(true);
    });
  });
});
