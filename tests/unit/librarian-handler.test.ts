import { describe, it, expect, vi, beforeEach } from 'vitest';
import { librarianHandlers } from '../../src/mcp/handlers/librarian.handler.js';
import * as librarianIndex from '../../src/services/librarian/index.js';
import * as schedulerService from '../../src/services/librarian/scheduler.service.js';
import type { AppContext } from '../../src/core/context.js';

// Mock the librarian services
const mockRecommendationStore = {
  list: vi.fn(),
  count: vi.fn(),
  getById: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  skip: vi.fn(),
};

const mockLibrarianService = {
  analyze: vi.fn(),
  getStatus: vi.fn(),
  getRecommendationStore: vi.fn().mockReturnValue(mockRecommendationStore),
};

vi.mock('../../src/services/librarian/index.js', () => ({
  getLibrarianService: vi.fn(),
  initializeLibrarianService: vi.fn(),
}));

vi.mock('../../src/services/librarian/scheduler.service.js', () => ({
  getLibrarianSchedulerStatus: vi.fn().mockReturnValue({
    enabled: true,
    interval: 3600000,
    lastRun: new Date().toISOString(),
  }),
}));

describe('Librarian Handler', () => {
  let mockContext: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(librarianIndex.getLibrarianService).mockReturnValue(mockLibrarianService as any);
    vi.mocked(librarianIndex.initializeLibrarianService).mockReturnValue(mockLibrarianService as any);

    mockContext = {
      db: {} as any,
      sqlite: {} as any,
      repos: {} as any,
      services: {} as any,
    };
  });

  describe('analyze', () => {
    it('should run pattern detection analysis', async () => {
      mockLibrarianService.analyze.mockResolvedValue({
        runId: 'run-1',
        dryRun: false,
        timing: { totalMs: 100 },
        stats: { experiencesProcessed: 10, patternsDetected: 2 },
        generatedRecommendations: [
          {
            input: {
              title: 'Pattern 1',
              confidence: 0.9,
              patternCount: 5,
              type: 'strategy',
            },
          },
        ],
      });

      const result = await librarianHandlers.analyze(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.success).toBe(true);
      expect(result.analysis.recommendations).toHaveLength(1);
    });

    it('should support dry run', async () => {
      mockLibrarianService.analyze.mockResolvedValue({
        runId: 'run-1',
        dryRun: true,
        timing: {},
        stats: {},
        generatedRecommendations: [],
      });

      const result = await librarianHandlers.analyze(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.analysis.dryRun).toBe(true);
    });

    it('should return error when service unavailable', async () => {
      vi.mocked(librarianIndex.getLibrarianService).mockReturnValue(null);
      vi.mocked(librarianIndex.initializeLibrarianService).mockReturnValue(null as any);

      const result = await librarianHandlers.analyze(mockContext, {
        scopeType: 'project',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle analysis errors', async () => {
      mockLibrarianService.analyze.mockRejectedValue(new Error('Analysis failed'));

      const result = await librarianHandlers.analyze(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Analysis failed');
    });
  });

  describe('status', () => {
    it('should return librarian status', async () => {
      mockLibrarianService.getStatus.mockResolvedValue({
        enabled: true,
        config: {},
        pendingRecommendations: 5,
        lastAnalysis: new Date().toISOString(),
      });

      const result = await librarianHandlers.status(mockContext, {});

      expect(result.success).toBe(true);
      expect(result.status.service.enabled).toBe(true);
      expect(result.status.scheduler).toBeDefined();
    });

    it('should return error when service unavailable', async () => {
      vi.mocked(librarianIndex.getLibrarianService).mockReturnValue(null);
      vi.mocked(librarianIndex.initializeLibrarianService).mockReturnValue(null as any);

      const result = await librarianHandlers.status(mockContext, {});

      expect(result.success).toBe(false);
    });

    it('should handle status errors', async () => {
      mockLibrarianService.getStatus.mockRejectedValue(new Error('Status failed'));

      const result = await librarianHandlers.status(mockContext, {});

      expect(result.success).toBe(false);
    });
  });

  describe('list_recommendations', () => {
    it('should list pending recommendations', async () => {
      mockRecommendationStore.list.mockResolvedValue([
        {
          id: 'rec-1',
          title: 'Recommendation 1',
          type: 'strategy',
          status: 'pending',
          confidence: 0.85,
          patternCount: 3,
          createdAt: new Date().toISOString(),
        },
      ]);
      mockRecommendationStore.count.mockResolvedValue(1);

      const result = await librarianHandlers.list_recommendations(mockContext, {});

      expect(result.success).toBe(true);
      expect(result.recommendations).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by status', async () => {
      mockRecommendationStore.list.mockResolvedValue([]);
      mockRecommendationStore.count.mockResolvedValue(0);

      await librarianHandlers.list_recommendations(mockContext, {
        status: 'approved',
      });

      expect(mockRecommendationStore.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' }),
        expect.anything()
      );
    });

    it('should support pagination', async () => {
      mockRecommendationStore.list.mockResolvedValue([]);
      mockRecommendationStore.count.mockResolvedValue(0);

      const result = await librarianHandlers.list_recommendations(mockContext, {
        limit: 10,
        offset: 5,
      });

      expect(result.limit).toBe(10);
      expect(result.offset).toBe(5);
    });

    it('should return error when service unavailable', async () => {
      vi.mocked(librarianIndex.getLibrarianService).mockReturnValue(null);
      vi.mocked(librarianIndex.initializeLibrarianService).mockReturnValue(null as any);

      const result = await librarianHandlers.list_recommendations(mockContext, {});

      expect(result.success).toBe(false);
    });
  });

  describe('show_recommendation', () => {
    it('should show recommendation details', async () => {
      mockRecommendationStore.getById.mockResolvedValue({
        id: 'rec-1',
        title: 'Test Recommendation',
        sourceExperienceIds: '["exp-1","exp-2"]',
      });

      const result = await librarianHandlers.show_recommendation(mockContext, {
        recommendationId: 'rec-1',
      });

      expect(result.success).toBe(true);
      expect(result.recommendation.sourceExperienceIds).toEqual(['exp-1', 'exp-2']);
    });

    it('should return error when recommendationId missing', async () => {
      const result = await librarianHandlers.show_recommendation(mockContext, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('recommendationId');
    });

    it('should return error when not found', async () => {
      mockRecommendationStore.getById.mockResolvedValue(null);

      const result = await librarianHandlers.show_recommendation(mockContext, {
        recommendationId: 'rec-nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when service unavailable', async () => {
      vi.mocked(librarianIndex.getLibrarianService).mockReturnValue(null);
      vi.mocked(librarianIndex.initializeLibrarianService).mockReturnValue(null as any);

      const result = await librarianHandlers.show_recommendation(mockContext, {
        recommendationId: 'rec-1',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('approve', () => {
    it('should approve a recommendation', async () => {
      mockRecommendationStore.approve.mockResolvedValue({
        id: 'rec-1',
        status: 'approved',
      });

      const result = await librarianHandlers.approve(mockContext, {
        recommendationId: 'rec-1',
        reviewedBy: 'admin',
      });

      expect(result.success).toBe(true);
    });

    it('should return error when recommendationId missing', async () => {
      const result = await librarianHandlers.approve(mockContext, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('recommendationId');
    });

    it('should return error when not found', async () => {
      mockRecommendationStore.approve.mockResolvedValue(null);

      const result = await librarianHandlers.approve(mockContext, {
        recommendationId: 'rec-nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when service unavailable', async () => {
      vi.mocked(librarianIndex.getLibrarianService).mockReturnValue(null);
      vi.mocked(librarianIndex.initializeLibrarianService).mockReturnValue(null as any);

      const result = await librarianHandlers.approve(mockContext, {
        recommendationId: 'rec-1',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('reject', () => {
    it('should reject a recommendation', async () => {
      mockRecommendationStore.reject.mockResolvedValue({
        id: 'rec-1',
        status: 'rejected',
      });

      const result = await librarianHandlers.reject(mockContext, {
        recommendationId: 'rec-1',
        reviewedBy: 'admin',
        notes: 'Not relevant',
      });

      expect(result.success).toBe(true);
    });

    it('should return error when recommendationId missing', async () => {
      const result = await librarianHandlers.reject(mockContext, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('recommendationId');
    });

    it('should return error when not found', async () => {
      mockRecommendationStore.reject.mockResolvedValue(null);

      const result = await librarianHandlers.reject(mockContext, {
        recommendationId: 'rec-nonexistent',
      });

      expect(result.success).toBe(false);
    });

    it('should return error when service unavailable', async () => {
      vi.mocked(librarianIndex.getLibrarianService).mockReturnValue(null);
      vi.mocked(librarianIndex.initializeLibrarianService).mockReturnValue(null as any);

      const result = await librarianHandlers.reject(mockContext, {
        recommendationId: 'rec-1',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('skip', () => {
    it('should skip a recommendation', async () => {
      mockRecommendationStore.skip.mockResolvedValue({
        id: 'rec-1',
        status: 'skipped',
      });

      const result = await librarianHandlers.skip(mockContext, {
        recommendationId: 'rec-1',
        reviewedBy: 'admin',
      });

      expect(result.success).toBe(true);
    });

    it('should return error when recommendationId missing', async () => {
      const result = await librarianHandlers.skip(mockContext, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('recommendationId');
    });

    it('should return error when not found', async () => {
      mockRecommendationStore.skip.mockResolvedValue(null);

      const result = await librarianHandlers.skip(mockContext, {
        recommendationId: 'rec-nonexistent',
      });

      expect(result.success).toBe(false);
    });

    it('should return error when service unavailable', async () => {
      vi.mocked(librarianIndex.getLibrarianService).mockReturnValue(null);
      vi.mocked(librarianIndex.initializeLibrarianService).mockReturnValue(null as any);

      const result = await librarianHandlers.skip(mockContext, {
        recommendationId: 'rec-1',
      });

      expect(result.success).toBe(false);
    });
  });
});
