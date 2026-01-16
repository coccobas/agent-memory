/**
 * Tests for Feedback Stage
 *
 * Tests the feedback stage in the query pipeline that pre-loads
 * feedback scores for filtered entries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  feedbackStage,
  feedbackStageAsync,
  prewarmFeedbackCache,
  type FeedbackPipelineContext,
} from '../../src/services/query/stages/feedback.js';
import type { PipelineContext } from '../../src/services/query/pipeline.js';
import {
  resetFeedbackScoreCache,
  getFeedbackScoreCache,
  FeedbackScoreCache,
} from '../../src/services/query/feedback-cache.js';
import type { EntryFeedbackScore } from '../../src/services/feedback/repositories/retrieval.repository.js';

// Mock config
vi.mock('../../src/config/index.js', () => ({
  config: {
    scoring: {
      feedbackScoring: {
        enabled: true,
        boostPerPositive: 0.02,
        boostMax: 0.1,
        penaltyPerNegative: 0.1,
        penaltyMax: 0.5,
      },
    },
  },
}));

// Mock feedback-cache module
vi.mock('../../src/services/query/feedback-cache.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/services/query/feedback-cache.js')>();
  return {
    ...actual,
    getFeedbackScoreCache: vi.fn(() => mockFeedbackCache),
  };
});

// Create mock feedback cache
let mockFeedbackCache: {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  loadBatch: ReturnType<typeof vi.fn>;
};

function createMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    query: 'test query',
    queryEmbedding: null,
    options: {},
    filtered: {
      tools: [],
      guidelines: [],
      knowledge: [],
      experiences: [],
    },
    deps: {
      getDb: vi.fn(() => ({})),
      logContext: {},
    },
    ...overrides,
  } as PipelineContext;
}

function createMockEntry(id: string, type: 'tool' | 'guideline' | 'knowledge' | 'experience') {
  return {
    entry: { id, name: `${type}-${id}` },
    score: 0.5,
    source: 'test',
  };
}

describe('Feedback Stage', () => {
  beforeEach(() => {
    mockFeedbackCache = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      loadBatch: vi.fn().mockResolvedValue(new Map()),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('feedbackStage (synchronous)', () => {
    describe('skip conditions', () => {
      it('should skip when feedback scoring is disabled', async () => {
        // Re-mock config with disabled feedback
        vi.doMock('../../src/config/index.js', () => ({
          config: {
            scoring: {
              feedbackScoring: {
                enabled: false,
              },
            },
          },
        }));

        // Re-import the module
        const { feedbackStage: disabledFeedbackStage } =
          await import('../../src/services/query/stages/feedback.js');

        const ctx = createMockContext();
        const result = disabledFeedbackStage(ctx);

        expect(result).toBe(ctx);
        expect(mockFeedbackCache.get).not.toHaveBeenCalled();

        vi.doUnmock('../../src/config/index.js');
      });

      it('should skip when filtered is undefined', () => {
        const ctx = createMockContext({ filtered: undefined });

        const result = feedbackStage(ctx);

        expect(result).toBe(ctx);
        expect(mockFeedbackCache.get).not.toHaveBeenCalled();
      });

      it('should skip when no entries in filtered', () => {
        const ctx = createMockContext();

        const result = feedbackStage(ctx);

        expect(result).toBe(ctx);
        expect(mockFeedbackCache.get).not.toHaveBeenCalled();
      });
    });

    describe('entry collection', () => {
      it('should collect tool entries', () => {
        const ctx = createMockContext({
          filtered: {
            tools: [createMockEntry('t1', 'tool'), createMockEntry('t2', 'tool')],
            guidelines: [],
            knowledge: [],
            experiences: [],
          },
        });

        feedbackStage(ctx);

        expect(mockFeedbackCache.get).toHaveBeenCalledTimes(2);
        expect(mockFeedbackCache.get).toHaveBeenCalledWith('tool', 't1');
        expect(mockFeedbackCache.get).toHaveBeenCalledWith('tool', 't2');
      });

      it('should collect guideline entries', () => {
        const ctx = createMockContext({
          filtered: {
            tools: [],
            guidelines: [createMockEntry('g1', 'guideline')],
            knowledge: [],
            experiences: [],
          },
        });

        feedbackStage(ctx);

        expect(mockFeedbackCache.get).toHaveBeenCalledWith('guideline', 'g1');
      });

      it('should collect knowledge entries', () => {
        const ctx = createMockContext({
          filtered: {
            tools: [],
            guidelines: [],
            knowledge: [createMockEntry('k1', 'knowledge')],
            experiences: [],
          },
        });

        feedbackStage(ctx);

        expect(mockFeedbackCache.get).toHaveBeenCalledWith('knowledge', 'k1');
      });

      it('should collect experience entries', () => {
        const ctx = createMockContext({
          filtered: {
            tools: [],
            guidelines: [],
            knowledge: [],
            experiences: [createMockEntry('e1', 'experience')],
          },
        });

        feedbackStage(ctx);

        expect(mockFeedbackCache.get).toHaveBeenCalledWith('experience', 'e1');
      });

      it('should collect entries of all types', () => {
        const ctx = createMockContext({
          filtered: {
            tools: [createMockEntry('t1', 'tool')],
            guidelines: [createMockEntry('g1', 'guideline')],
            knowledge: [createMockEntry('k1', 'knowledge')],
            experiences: [createMockEntry('e1', 'experience')],
          },
        });

        feedbackStage(ctx);

        expect(mockFeedbackCache.get).toHaveBeenCalledTimes(4);
      });
    });

    describe('feedback score loading', () => {
      it('should return cached feedback scores', () => {
        const cachedScore: EntryFeedbackScore = {
          positiveCount: 5,
          negativeCount: 1,
          netScore: 4,
        };
        mockFeedbackCache.get.mockReturnValue(cachedScore);

        const ctx = createMockContext({
          filtered: {
            tools: [createMockEntry('t1', 'tool')],
            guidelines: [],
            knowledge: [],
            experiences: [],
          },
        });

        const result = feedbackStage(ctx) as FeedbackPipelineContext;

        expect(result.feedbackScores).toBeDefined();
        expect(result.feedbackScores?.get('t1')).toEqual(cachedScore);
      });

      it('should return default scores for uncached entries', () => {
        mockFeedbackCache.get.mockReturnValue(null);

        const ctx = createMockContext({
          filtered: {
            tools: [createMockEntry('t1', 'tool')],
            guidelines: [],
            knowledge: [],
            experiences: [],
          },
        });

        const result = feedbackStage(ctx) as FeedbackPipelineContext;

        expect(result.feedbackScores).toBeDefined();
        expect(result.feedbackScores?.get('t1')).toEqual({
          positiveCount: 0,
          negativeCount: 0,
          netScore: 0,
        });
      });

      it('should mix cached and default scores', () => {
        const cachedScore: EntryFeedbackScore = {
          positiveCount: 3,
          negativeCount: 0,
          netScore: 3,
        };

        mockFeedbackCache.get.mockReturnValueOnce(cachedScore).mockReturnValueOnce(null);

        const ctx = createMockContext({
          filtered: {
            tools: [createMockEntry('t1', 'tool'), createMockEntry('t2', 'tool')],
            guidelines: [],
            knowledge: [],
            experiences: [],
          },
        });

        const result = feedbackStage(ctx) as FeedbackPipelineContext;

        expect(result.feedbackScores?.get('t1')).toEqual(cachedScore);
        expect(result.feedbackScores?.get('t2')).toEqual({
          positiveCount: 0,
          negativeCount: 0,
          netScore: 0,
        });
      });
    });

    describe('context preservation', () => {
      it('should preserve original context properties', () => {
        mockFeedbackCache.get.mockReturnValue(null);

        const ctx = createMockContext({
          query: 'original query',
          filtered: {
            tools: [createMockEntry('t1', 'tool')],
            guidelines: [],
            knowledge: [],
            experiences: [],
          },
        });

        const result = feedbackStage(ctx);

        expect(result.query).toBe('original query');
        expect(result.filtered).toBe(ctx.filtered);
      });

      it('should add feedbackScores to context', () => {
        mockFeedbackCache.get.mockReturnValue(null);

        const ctx = createMockContext({
          filtered: {
            tools: [createMockEntry('t1', 'tool')],
            guidelines: [],
            knowledge: [],
            experiences: [],
          },
        });

        const result = feedbackStage(ctx) as FeedbackPipelineContext;

        expect(result.feedbackScores).toBeInstanceOf(Map);
      });
    });
  });

  describe('feedbackStageAsync', () => {
    describe('skip conditions', () => {
      it('should skip when feedback scoring is disabled', async () => {
        vi.doMock('../../src/config/index.js', () => ({
          config: {
            scoring: {
              feedbackScoring: {
                enabled: false,
              },
            },
          },
        }));

        const { feedbackStageAsync: disabledFeedbackStageAsync } =
          await import('../../src/services/query/stages/feedback.js');

        const ctx = createMockContext();
        const result = await disabledFeedbackStageAsync(ctx);

        expect(result).toBe(ctx);
        expect(mockFeedbackCache.loadBatch).not.toHaveBeenCalled();

        vi.doUnmock('../../src/config/index.js');
      });

      it('should skip when filtered is undefined', async () => {
        const ctx = createMockContext({ filtered: undefined });

        const result = await feedbackStageAsync(ctx);

        expect(result).toBe(ctx);
        expect(mockFeedbackCache.loadBatch).not.toHaveBeenCalled();
      });

      it('should skip when no entries in filtered', async () => {
        const ctx = createMockContext();

        const result = await feedbackStageAsync(ctx);

        expect(result).toBe(ctx);
        expect(mockFeedbackCache.loadBatch).not.toHaveBeenCalled();
      });
    });

    describe('batch loading', () => {
      it('should call loadBatch with collected entries', async () => {
        const ctx = createMockContext({
          filtered: {
            tools: [createMockEntry('t1', 'tool')],
            guidelines: [createMockEntry('g1', 'guideline')],
            knowledge: [],
            experiences: [],
          },
        });

        await feedbackStageAsync(ctx);

        expect(mockFeedbackCache.loadBatch).toHaveBeenCalledWith(
          expect.anything(),
          expect.arrayContaining([
            { entryType: 'tool', entryId: 't1' },
            { entryType: 'guideline', entryId: 'g1' },
          ])
        );
      });

      it('should return feedback scores from loadBatch', async () => {
        const scores = new Map<string, EntryFeedbackScore>();
        scores.set('t1', { positiveCount: 3, negativeCount: 1, netScore: 2 });
        mockFeedbackCache.loadBatch.mockResolvedValue(scores);

        const ctx = createMockContext({
          filtered: {
            tools: [createMockEntry('t1', 'tool')],
            guidelines: [],
            knowledge: [],
            experiences: [],
          },
        });

        const result = (await feedbackStageAsync(ctx)) as FeedbackPipelineContext;

        expect(result.feedbackScores).toBe(scores);
      });
    });

    describe('error handling', () => {
      it('should gracefully handle database errors', async () => {
        mockFeedbackCache.loadBatch.mockRejectedValue(new Error('Database error'));

        const ctx = createMockContext({
          filtered: {
            tools: [createMockEntry('t1', 'tool')],
            guidelines: [],
            knowledge: [],
            experiences: [],
          },
        });

        const result = await feedbackStageAsync(ctx);

        expect(result).toBe(ctx);
        expect((result as FeedbackPipelineContext).feedbackScores).toBeUndefined();
      });

      it('should return original context on error', async () => {
        mockFeedbackCache.loadBatch.mockRejectedValue(new Error('Connection failed'));

        const ctx = createMockContext({
          query: 'test query',
          filtered: {
            tools: [createMockEntry('t1', 'tool')],
            guidelines: [],
            knowledge: [],
            experiences: [],
          },
        });

        const result = await feedbackStageAsync(ctx);

        expect(result.query).toBe('test query');
        expect(result.filtered).toBe(ctx.filtered);
      });
    });

    describe('context preservation', () => {
      it('should preserve original context properties', async () => {
        mockFeedbackCache.loadBatch.mockResolvedValue(new Map());

        const ctx = createMockContext({
          query: 'original query',
          filtered: {
            tools: [createMockEntry('t1', 'tool')],
            guidelines: [],
            knowledge: [],
            experiences: [],
          },
        });

        const result = await feedbackStageAsync(ctx);

        expect(result.query).toBe('original query');
        expect(result.filtered).toBe(ctx.filtered);
      });
    });
  });

  describe('prewarmFeedbackCache', () => {
    it('should call loadBatch on cache', async () => {
      const mockDb = {} as ReturnType<PipelineContext['deps']['getDb']>;
      const entries = [
        { entryType: 'tool' as const, entryId: 't1' },
        { entryType: 'guideline' as const, entryId: 'g1' },
      ];

      await prewarmFeedbackCache(mockDb, entries);

      expect(mockFeedbackCache.loadBatch).toHaveBeenCalledWith(mockDb, entries);
    });

    it('should work with empty entries array', async () => {
      const mockDb = {} as ReturnType<PipelineContext['deps']['getDb']>;

      await prewarmFeedbackCache(mockDb, []);

      expect(mockFeedbackCache.loadBatch).toHaveBeenCalledWith(mockDb, []);
    });
  });

  describe('FeedbackPipelineContext type', () => {
    it('should extend PipelineContext with feedbackScores', () => {
      const ctx = createMockContext({
        filtered: {
          tools: [createMockEntry('t1', 'tool')],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
      });

      mockFeedbackCache.get.mockReturnValue({
        positiveCount: 1,
        negativeCount: 0,
        netScore: 1,
      });

      const result = feedbackStage(ctx) as FeedbackPipelineContext;

      // FeedbackPipelineContext extends PipelineContext
      expect(result.query).toBeDefined();
      expect(result.filtered).toBeDefined();
      expect(result.feedbackScores).toBeDefined();
    });
  });
});
