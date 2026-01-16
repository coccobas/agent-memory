import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyticsHandlers,
  getUsageStatsHandler,
  getTrendsHandler,
  getSubtaskStatsHandler,
  getErrorCorrelationHandler,
  getLowDiversityHandler,
} from '../../src/mcp/handlers/analytics.handler.js';
import * as analyticsService from '../../src/services/analytics.service.js';
import * as errorCorrelationService from '../../src/services/error-correlation.service.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/analytics.service.js');
vi.mock('../../src/services/error-correlation.service.js');

describe('Analytics Handler', () => {
  let mockContext: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {} as any,
    };
  });

  describe('getUsageStatsHandler', () => {
    it('should return usage stats', () => {
      const mockStats = {
        totalEntries: 100,
        entriesByType: { tool: 30, guideline: 40, knowledge: 30 },
        totalOperations: 500,
        operationsByType: { create: 200, read: 250, update: 50 },
      };

      vi.mocked(analyticsService.getUsageStats).mockReturnValue(mockStats);

      const result = getUsageStatsHandler(mockContext, {});

      expect(result.stats).toEqual(mockStats);
      expect(result.filters).toBeDefined();
    });

    it('should pass filter parameters', () => {
      vi.mocked(analyticsService.getUsageStats).mockReturnValue({} as any);

      getUsageStatsHandler(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-123',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(analyticsService.getUsageStats).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'project',
          scopeId: 'proj-123',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        }),
        mockContext.db
      );
    });

    it('should return filter info in response', () => {
      vi.mocked(analyticsService.getUsageStats).mockReturnValue({} as any);

      const result = getUsageStatsHandler(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-123',
      });

      expect(result.filters.scopeType).toBe('project');
      expect(result.filters.scopeId).toBe('proj-123');
    });
  });

  describe('getTrendsHandler', () => {
    it('should return trend data', () => {
      const mockTrends = {
        dataPoints: [
          { date: '2024-01-01', count: 10 },
          { date: '2024-01-02', count: 15 },
        ],
        totalCount: 25,
      };

      vi.mocked(analyticsService.getTrends).mockReturnValue(mockTrends);

      const result = getTrendsHandler(mockContext, {});

      expect(result.trends).toEqual(mockTrends);
      expect(result.filters).toBeDefined();
    });

    it('should pass filter parameters', () => {
      vi.mocked(analyticsService.getTrends).mockReturnValue({} as any);

      getTrendsHandler(mockContext, {
        scopeType: 'org',
        scopeId: 'org-123',
        startDate: '2024-01-01',
        endDate: '2024-06-30',
      });

      expect(analyticsService.getTrends).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'org',
          scopeId: 'org-123',
          startDate: '2024-01-01',
          endDate: '2024-06-30',
        }),
        mockContext.db
      );
    });
  });

  describe('getSubtaskStatsHandler', () => {
    it('should return subtask stats', () => {
      const mockStats = {
        subtasks: [
          { type: 'research', count: 50, avgDuration: 120 },
          { type: 'implementation', count: 30, avgDuration: 300 },
        ],
      };

      vi.mocked(analyticsService.getSubtaskStats).mockReturnValue(mockStats);

      const result = getSubtaskStatsHandler(mockContext, { projectId: 'proj-123' });

      expect(result).toEqual(mockStats);
    });

    it('should pass project and subtask type filters', () => {
      vi.mocked(analyticsService.getSubtaskStats).mockReturnValue({} as any);

      getSubtaskStatsHandler(mockContext, {
        projectId: 'proj-123',
        subtaskType: 'research',
      });

      expect(analyticsService.getSubtaskStats).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-123',
          subtaskType: 'research',
        }),
        mockContext.db
      );
    });
  });

  describe('getErrorCorrelationHandler', () => {
    it('should calculate error correlation between agents', () => {
      const mockCorrelation = {
        agentA: 'agent-1',
        agentB: 'agent-2',
        correlation: 0.75,
        sampleSize: 100,
      };

      vi.mocked(errorCorrelationService.calculateErrorCorrelation).mockReturnValue(mockCorrelation);

      const result = getErrorCorrelationHandler(mockContext, {
        agentA: 'agent-1',
        agentB: 'agent-2',
      });

      expect(result).toEqual(mockCorrelation);
    });

    it('should throw when agentA is missing', () => {
      expect(() => getErrorCorrelationHandler(mockContext, { agentB: 'agent-2' })).toThrow();
    });

    it('should throw when agentB is missing', () => {
      expect(() => getErrorCorrelationHandler(mockContext, { agentA: 'agent-1' })).toThrow();
    });

    it('should pass time window filter', () => {
      vi.mocked(errorCorrelationService.calculateErrorCorrelation).mockReturnValue({} as any);

      const timeWindow = { start: '2024-01-01', end: '2024-06-30' };
      getErrorCorrelationHandler(mockContext, {
        agentA: 'agent-1',
        agentB: 'agent-2',
        timeWindow,
      });

      expect(errorCorrelationService.calculateErrorCorrelation).toHaveBeenCalledWith(
        expect.objectContaining({ timeWindow }),
        mockContext.db
      );
    });
  });

  describe('getLowDiversityHandler', () => {
    it('should detect low diversity in project', () => {
      const mockResult = {
        lowDiversityPairs: [{ agentA: 'agent-1', agentB: 'agent-2', similarity: 0.95 }],
        threshold: 0.9,
      };

      vi.mocked(errorCorrelationService.detectLowDiversity).mockReturnValue(mockResult);

      const result = getLowDiversityHandler(mockContext, { projectId: 'proj-123' });

      expect(result).toEqual(mockResult);
      expect(errorCorrelationService.detectLowDiversity).toHaveBeenCalledWith(
        'proj-123',
        mockContext.db
      );
    });

    it('should use scopeId when projectId is not provided', () => {
      vi.mocked(errorCorrelationService.detectLowDiversity).mockReturnValue({} as any);

      getLowDiversityHandler(mockContext, { scopeId: 'scope-123' });

      expect(errorCorrelationService.detectLowDiversity).toHaveBeenCalledWith(
        'scope-123',
        mockContext.db
      );
    });

    it('should throw when neither projectId nor scopeId is provided', () => {
      expect(() => getLowDiversityHandler(mockContext, {})).toThrow();
    });
  });

  describe('analyticsHandlers export', () => {
    it('should export all handlers', () => {
      expect(analyticsHandlers.get_stats).toBe(getUsageStatsHandler);
      expect(analyticsHandlers.get_trends).toBe(getTrendsHandler);
      expect(analyticsHandlers.get_subtask_stats).toBe(getSubtaskStatsHandler);
      expect(analyticsHandlers.get_error_correlation).toBe(getErrorCorrelationHandler);
      expect(analyticsHandlers.get_low_diversity).toBe(getLowDiversityHandler);
    });
  });
});
