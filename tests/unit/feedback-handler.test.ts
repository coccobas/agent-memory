import { describe, it, expect, vi, beforeEach } from 'vitest';
import { feedbackHandlers } from '../../src/mcp/handlers/feedback.handler.js';
import * as feedbackModule from '../../src/services/feedback/index.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/feedback/index.js');

describe('Feedback Handler', () => {
  let mockContext: AppContext;
  let mockFeedbackService: {
    getSessionRetrievals: ReturnType<typeof vi.fn>;
    exportTrainingData: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeedbackService = {
      getSessionRetrievals: vi.fn(),
      exportTrainingData: vi.fn(),
      getConfig: vi.fn(),
    };
    vi.mocked(feedbackModule.getFeedbackService).mockReturnValue(mockFeedbackService as any);
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {
        feedback: mockFeedbackService,
      } as any,
    };
  });

  describe('listRetrievals', () => {
    it('should list retrievals for a session', async () => {
      const mockRetrievals = [
        { id: 'ret-1', entryType: 'knowledge', entryId: 'entry-1' },
        { id: 'ret-2', entryType: 'guideline', entryId: 'entry-2' },
      ];
      mockFeedbackService.getSessionRetrievals.mockResolvedValue(mockRetrievals);

      const result = await feedbackHandlers.listRetrievals(mockContext, {
        sessionId: 'session-123',
      });

      expect(result.retrievals).toEqual(mockRetrievals);
      expect(result.count).toBe(2);
    });

    it('should apply limit', async () => {
      const mockRetrievals = Array.from({ length: 50 }, (_, i) => ({
        id: `ret-${i}`,
      }));
      mockFeedbackService.getSessionRetrievals.mockResolvedValue(mockRetrievals);

      const result = await feedbackHandlers.listRetrievals(mockContext, {
        sessionId: 'session-123',
        limit: 10,
      });

      expect(result.retrievals).toHaveLength(10);
      expect(result.count).toBe(10);
    });

    it('should throw when sessionId is missing', async () => {
      await expect(feedbackHandlers.listRetrievals(mockContext, {})).rejects.toThrow();
    });

    it('should throw when feedback service is not initialized', async () => {
      mockContext.services = {} as any; // Remove feedback service

      await expect(
        feedbackHandlers.listRetrievals(mockContext, { sessionId: 'session-123' })
      ).rejects.toThrow(); // TypeError when accessing undefined service
    });
  });

  describe('listOutcomes', () => {
    it('should list outcomes for a session', async () => {
      const mockData = {
        retrieval: {
          samples: [
            { sessionId: 'session-123', outcome: 'success' },
            { sessionId: 'session-123', outcome: 'partial' },
            { sessionId: 'other-session', outcome: 'failure' },
          ],
        },
      };
      mockFeedbackService.exportTrainingData.mockResolvedValue(mockData);

      const result = await feedbackHandlers.listOutcomes(mockContext, {
        sessionId: 'session-123',
      });

      expect(result.outcomes).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should throw when sessionId is missing', async () => {
      await expect(feedbackHandlers.listOutcomes(mockContext, {})).rejects.toThrow();
    });
  });

  describe('listDecisions', () => {
    it('should list extraction decisions', async () => {
      const mockData = {
        extraction: {
          samples: [
            { id: 'ext-1', decision: 'store' },
            { id: 'ext-2', decision: 'skip' },
          ],
        },
        consolidation: { samples: [] },
      };
      mockFeedbackService.exportTrainingData.mockResolvedValue(mockData);

      const result = await feedbackHandlers.listDecisions(mockContext, {
        policyType: 'extraction',
      });

      expect(result.decisions).toHaveLength(2);
    });

    it('should list consolidation decisions', async () => {
      const mockData = {
        extraction: { samples: [] },
        consolidation: {
          samples: [
            { id: 'con-1', decision: 'merge' },
          ],
        },
      };
      mockFeedbackService.exportTrainingData.mockResolvedValue(mockData);

      const result = await feedbackHandlers.listDecisions(mockContext, {
        policyType: 'consolidation',
      });

      expect(result.decisions).toHaveLength(1);
    });

    it('should filter by sessionId', async () => {
      const mockData = {
        extraction: {
          samples: [
            { id: 'ext-1', sessionId: 'session-123' },
            { id: 'ext-2', sessionId: 'other-session' },
          ],
        },
        consolidation: { samples: [] },
      };
      mockFeedbackService.exportTrainingData.mockResolvedValue(mockData);

      const result = await feedbackHandlers.listDecisions(mockContext, {
        policyType: 'extraction',
        sessionId: 'session-123',
      });

      expect(result.decisions).toHaveLength(1);
    });
  });

  describe('export', () => {
    it('should export full dataset', async () => {
      const mockData = {
        metadata: { exportedAt: '2024-01-01' },
        extraction: { samples: [], count: 0 },
        retrieval: { samples: [], count: 0 },
        consolidation: { samples: [], count: 0 },
        stats: { total: 0 },
      };
      mockFeedbackService.exportTrainingData.mockResolvedValue(mockData);

      const result = await feedbackHandlers.export(mockContext, {});

      expect(result).toEqual(mockData);
    });

    it('should export extraction data only', async () => {
      const mockData = {
        metadata: { exportedAt: '2024-01-01' },
        extraction: { samples: [{ id: 'ext-1' }], count: 1 },
        retrieval: { samples: [], count: 0 },
        consolidation: { samples: [], count: 0 },
        stats: { total: 1 },
      };
      mockFeedbackService.exportTrainingData.mockResolvedValue(mockData);

      const result = await feedbackHandlers.export(mockContext, {
        policyType: 'extraction',
      }) as any;

      expect(result.samples).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('should export retrieval data only', async () => {
      const mockData = {
        metadata: {},
        extraction: { samples: [], count: 0 },
        retrieval: { samples: [{ id: 'ret-1' }], count: 1 },
        consolidation: { samples: [], count: 0 },
        stats: {},
      };
      mockFeedbackService.exportTrainingData.mockResolvedValue(mockData);

      const result = await feedbackHandlers.export(mockContext, {
        policyType: 'retrieval',
      }) as any;

      expect(result.samples).toHaveLength(1);
    });

    it('should export consolidation data only', async () => {
      const mockData = {
        metadata: {},
        extraction: { samples: [], count: 0 },
        retrieval: { samples: [], count: 0 },
        consolidation: { samples: [{ id: 'con-1' }], count: 1 },
        stats: {},
      };
      mockFeedbackService.exportTrainingData.mockResolvedValue(mockData);

      const result = await feedbackHandlers.export(mockContext, {
        policyType: 'consolidation',
      }) as any;

      expect(result.samples).toHaveLength(1);
    });

    it('should pass filter params', async () => {
      mockFeedbackService.exportTrainingData.mockResolvedValue({
        metadata: {},
        extraction: { samples: [], count: 0 },
        retrieval: { samples: [], count: 0 },
        consolidation: { samples: [], count: 0 },
        stats: {},
      });

      await feedbackHandlers.export(mockContext, {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        onlyWithOutcomes: true,
        limit: 100,
        entryTypes: ['knowledge', 'guideline'],
        outcomeTypes: ['success', 'failure'],
      });

      expect(mockFeedbackService.exportTrainingData).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          onlyWithOutcomes: true,
          limit: 100,
          entryTypes: ['knowledge', 'guideline'],
          outcomeTypes: ['success', 'failure'],
        })
      );
    });
  });

  describe('stats', () => {
    it('should return feedback statistics', async () => {
      const mockData = {
        metadata: { version: '1.0' },
        stats: { avgRelevance: 0.85 },
        retrieval: { count: 100 },
        extraction: { count: 50 },
        consolidation: { count: 20 },
      };
      const mockConfig = { enabled: true };
      mockFeedbackService.exportTrainingData.mockResolvedValue(mockData);
      mockFeedbackService.getConfig.mockReturnValue(mockConfig);

      const result = await feedbackHandlers.stats(mockContext, {}) as any;

      expect(result.config).toEqual(mockConfig);
      expect(result.counts.retrievals).toBe(100);
      expect(result.counts.extractions).toBe(50);
      expect(result.counts.consolidations).toBe(20);
    });

    it('should pass date filters', async () => {
      mockFeedbackService.exportTrainingData.mockResolvedValue({
        metadata: {},
        stats: {},
        retrieval: { count: 0 },
        extraction: { count: 0 },
        consolidation: { count: 0 },
      });
      mockFeedbackService.getConfig.mockReturnValue({});

      await feedbackHandlers.stats(mockContext, {
        startDate: '2024-01-01',
        endDate: '2024-06-30',
      });

      expect(mockFeedbackService.exportTrainingData).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: '2024-01-01',
          endDate: '2024-06-30',
        })
      );
    });
  });
});
