/**
 * Unit tests for query rewrite stage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  rewriteStage,
  rewriteStageAsync,
  type RewriteStageContext,
} from '../../src/services/query/stages/rewrite.js';
import type { PipelineContext } from '../../src/services/query/pipeline.js';

/**
 * Helper to create minimal PipelineContext for testing
 */
function createContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    params: {},
    deps: {} as any, // Not used in rewrite stage
    types: [],
    scopeChain: [],
    limit: 20,
    search: undefined,
    ftsMatchIds: null,
    relatedIds: {
      tool: new Set(),
      guideline: new Set(),
      knowledge: new Set(),
      experience: new Set(),
    },
    semanticScores: null,
    fetchedEntries: { tools: [], guidelines: [], knowledge: [], experiences: [] },
    tagsByEntry: {},
    results: [],
    startMs: Date.now(),
    cacheKey: null,
    cacheHit: false,
    ...overrides,
  };
}

describe('rewriteStage', () => {
  describe('early returns', () => {
    it('should return original query when disableRewrite is true', () => {
      const ctx = createContext({
        params: { disableRewrite: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0]).toEqual({
        text: 'test query',
        weight: 1.0,
        source: 'original',
      });
      expect(result.rewrite).toBeUndefined();
    });

    it('should return empty searchQueries when no search query exists', () => {
      const ctx = createContext({
        params: {},
        search: undefined,
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries).toEqual([]);
      expect(result.rewrite).toBeUndefined();
    });

    it('should return empty searchQueries when search is empty string', () => {
      const ctx = createContext({
        params: {},
        search: '',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries).toEqual([]);
      expect(result.rewrite).toBeUndefined();
    });

    it('should return original query even when disableRewrite is true with no search', () => {
      const ctx = createContext({
        params: { disableRewrite: true },
        search: undefined,
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries).toEqual([]);
      expect(result.rewrite).toBeUndefined();
    });
  });

  describe('no rewrite enabled', () => {
    it('should return original query when no rewrite features are enabled', () => {
      const ctx = createContext({
        params: {},
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0]).toEqual({
        text: 'test query',
        weight: 1.0,
        source: 'original',
      });
      expect(result.rewrite).toBeUndefined();
    });

    it('should return original query when all rewrite features are explicitly false', () => {
      const ctx = createContext({
        params: {
          enableHyDE: false,
          enableExpansion: false,
          enableDecomposition: false,
        },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0]).toEqual({
        text: 'test query',
        weight: 1.0,
        source: 'original',
      });
      expect(result.rewrite).toBeUndefined();
    });
  });

  // Note: The sync rewriteStage is a lightweight fallback that:
  // - Always returns strategy 'direct' (ignores enableExpansion, enableHyDE, etc.)
  // - Uses rewriteIntent/rewriteStrategy properties (not rewrite.intent/strategy)
  // - Does NOT produce a 'rewrite' object - that requires the async version with QueryRewriteService
  // - Only performs intent classification on the original query

  describe('sync stage behavior (fallback mode)', () => {
    it('should always use direct strategy regardless of enabled features', () => {
      const ctx = createContext({
        params: { enableExpansion: true, enableHyDE: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      // Sync stage always uses 'direct' strategy
      expect(result.rewriteStrategy).toBe('direct');
      expect(result.rewrite).toBeUndefined();
    });

    it('should return original query only', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0]).toMatchObject({
        text: 'test query',
        weight: 1.0,
        source: 'original',
      });
    });

    it('should perform intent classification even without service', () => {
      const ctx = createContext({
        params: {},
        search: 'how to configure the system',
      });

      const result = rewriteStage(ctx);

      expect(result.rewriteIntent).toBeDefined();
      expect(result.rewriteStrategy).toBe('direct');
    });

    it('should ignore enableHyDE in sync mode', () => {
      const ctx = createContext({
        params: { enableHyDE: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      // Sync stage ignores HyDE - needs async service
      expect(result.rewriteStrategy).toBe('direct');
      expect(result.searchQueries).toHaveLength(1);
    });

    it('should ignore enableDecomposition in sync mode', () => {
      const ctx = createContext({
        params: { enableDecomposition: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      // Sync stage ignores decomposition - needs async service
      expect(result.rewriteStrategy).toBe('direct');
      expect(result.searchQueries).toHaveLength(1);
    });
  });

  describe('intent classification', () => {
    it('should classify how_to queries correctly', () => {
      const ctx = createContext({
        params: {},
        search: 'how to configure the database',
      });

      const result = rewriteStage(ctx);

      expect(result.rewriteIntent).toBe('how_to');
    });

    it('should classify debug queries correctly', () => {
      const ctx = createContext({
        params: {},
        search: 'error connecting to database',
      });

      const result = rewriteStage(ctx);

      expect(result.rewriteIntent).toBe('debug');
    });

    it('should classify lookup queries correctly', () => {
      const ctx = createContext({
        params: {},
        search: 'what is the database schema',
      });

      const result = rewriteStage(ctx);

      expect(result.rewriteIntent).toBe('lookup');
    });

    it('should classify compare queries correctly', () => {
      const ctx = createContext({
        params: {},
        search: 'postgres vs mysql',
      });

      const result = rewriteStage(ctx);

      expect(result.rewriteIntent).toBe('compare');
    });

    it('should classify configure queries correctly', () => {
      const ctx = createContext({
        params: {},
        search: 'setup environment variables',
      });

      const result = rewriteStage(ctx);

      expect(result.rewriteIntent).toBe('configure');
    });

    it('should default to explore for ambiguous queries', () => {
      const ctx = createContext({
        params: {},
        search: 'random stuff things whatever',
      });

      const result = rewriteStage(ctx);

      expect(result.rewriteIntent).toBe('explore');
    });
  });

  describe('searchQueries output', () => {
    it('should have correct structure for original query', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries[0]).toMatchObject({
        text: expect.any(String),
        weight: expect.any(Number),
        source: expect.stringMatching(/^(original|hyde|expansion|decomposition)$/),
      });
    });

    it('should include text field in all search queries', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      result.searchQueries.forEach((query) => {
        expect(query.text).toBeDefined();
        expect(typeof query.text).toBe('string');
      });
    });

    it('should include weight field in all search queries', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      result.searchQueries.forEach((query) => {
        expect(query.weight).toBeDefined();
        expect(typeof query.weight).toBe('number');
        expect(query.weight).toBeGreaterThan(0);
        expect(query.weight).toBeLessThanOrEqual(1);
      });
    });

    it('should include source field in all search queries', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      result.searchQueries.forEach((query) => {
        expect(query.source).toBeDefined();
        expect(['original', 'hyde', 'expansion', 'decomposition']).toContain(query.source);
      });
    });

    it('should preserve original context fields', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        limit: 50,
        types: ['knowledge'],
      });

      const result = rewriteStage(ctx);

      expect(result.params).toBe(ctx.params);
      expect(result.limit).toBe(50);
      expect(result.types).toBe(ctx.types);
    });

    it('should add searchQueries field to context', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries).toBeDefined();
      expect(Array.isArray(result.searchQueries)).toBe(true);
    });
  });

  describe('rewrite result metadata', () => {
    // Note: The sync rewriteStage is a lightweight fallback that doesn't produce
    // a `rewrite` metadata object. Full rewrite metadata is only available with
    // the async version using QueryRewriteService.

    it('should not include rewrite metadata in sync stage (no QueryRewriteService)', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      // Sync stage doesn't produce rewrite metadata
      expect(result.rewrite).toBeUndefined();
      // But should still produce searchQueries
      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0].text).toBe('test query');
    });

    it('should include intent and strategy without full rewrite metadata', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      // Sync stage provides intent classification
      expect(result.rewriteIntent).toBeDefined();
      expect(result.rewriteStrategy).toBe('direct');
    });

    it('should map searchQueries correctly without rewrite metadata', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      // Sync stage produces single original query
      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0]).toEqual({
        text: 'test query',
        weight: 1.0,
        source: 'original',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle very long queries', () => {
      const longQuery = 'a'.repeat(1000);
      const ctx = createContext({
        params: { enableExpansion: true },
        search: longQuery,
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries.length).toBeGreaterThanOrEqual(1);
      expect(result.searchQueries[0].text).toBe(longQuery);
    });

    it('should handle queries with special characters', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test@#$%^&*()_+-={}[]|\\:";\'<>?,./`~',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle queries with unicode characters', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'テスト查询 тест 🔍',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries.length).toBeGreaterThanOrEqual(1);
      expect(result.searchQueries[0].text).toBe('テスト查询 тест 🔍');
    });

    it('should handle whitespace-only queries as empty', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: '   ',
      });

      const result = rewriteStage(ctx);

      // Whitespace is treated as a valid search (intent classification will handle it)
      expect(result.searchQueries.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle null params gracefully', () => {
      const ctx = createContext({
        params: {} as any,
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0].text).toBe('test query');
    });
  });

  describe('combination scenarios', () => {
    it('should handle expansion with disableRewrite override', () => {
      const ctx = createContext({
        params: {
          enableExpansion: true,
          disableRewrite: true,
        },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      // disableRewrite takes precedence
      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0].source).toBe('original');
      expect(result.rewrite).toBeUndefined();
    });

    it('should handle all features disabled explicitly', () => {
      const ctx = createContext({
        params: {
          enableHyDE: false,
          enableExpansion: false,
          enableDecomposition: false,
        },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries).toHaveLength(1);
      expect(result.rewrite).toBeUndefined();
    });

    it('should preserve other pipeline context during rewrite', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        ftsMatchIds: {
          tool: new Set(['1', '2']),
          guideline: new Set(),
          knowledge: new Set(),
          experience: new Set(),
        },
        relatedIds: {
          tool: new Set(['3']),
          guideline: new Set(),
          knowledge: new Set(),
          experience: new Set(),
        },
      });

      const result = rewriteStage(ctx);

      expect(result.ftsMatchIds).toBe(ctx.ftsMatchIds);
      expect(result.relatedIds).toBe(ctx.relatedIds);
    });
  });
});

describe('rewriteStageAsync', () => {
  // Mock query rewrite service
  let mockRewriteService: {
    isAvailable: ReturnType<typeof vi.fn>;
    rewrite: ReturnType<typeof vi.fn>;
  };

  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRewriteService = {
      isAvailable: vi.fn().mockReturnValue(true),
      rewrite: vi.fn().mockResolvedValue({
        rewrittenQueries: [
          { text: 'original query', weight: 1.0, source: 'original' },
          { text: 'expanded query', weight: 0.8, source: 'expansion' },
        ],
        intent: 'explore',
        strategy: 'expansion',
        processingTimeMs: 50,
      }),
    };

    mockLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('early returns', () => {
    it('should return original query when disableRewrite is true', async () => {
      const ctx = createContext({
        params: { disableRewrite: true },
        search: 'test query',
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0]).toEqual({
        text: 'test query',
        weight: 1.0,
        source: 'original',
      });
    });

    it('should return empty searchQueries when no search query', async () => {
      const ctx = createContext({
        params: {},
        search: undefined,
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.searchQueries).toEqual([]);
    });

    it('should return empty searchQueries for empty string search', async () => {
      const ctx = createContext({
        params: {},
        search: '',
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.searchQueries).toEqual([]);
    });

    it('should fallback when service is not available', async () => {
      mockRewriteService.isAvailable.mockReturnValue(false);

      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      const result = await rewriteStageAsync(ctx);

      // Falls back to sync stage
      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0].source).toBe('original');
    });

    it('should fallback when no rewrite features enabled', async () => {
      const ctx = createContext({
        params: {
          enableHyDE: false,
          enableExpansion: false,
          enableDecomposition: false,
        },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      const result = await rewriteStageAsync(ctx);

      // Falls back to sync stage since no features enabled
      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0].source).toBe('original');
    });

    it('should fallback when service is undefined', async () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: { queryRewriteService: undefined } as any,
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0].source).toBe('original');
    });
  });

  describe('service integration', () => {
    it('should call rewrite service with correct options', async () => {
      const ctx = createContext({
        params: {
          enableHyDE: true,
          enableExpansion: true,
          enableDecomposition: false,
          maxExpansions: 5,
        },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      await rewriteStageAsync(ctx);

      expect(mockRewriteService.rewrite).toHaveBeenCalledWith({
        originalQuery: 'test query',
        options: {
          enableHyDE: true,
          enableExpansion: true,
          enableDecomposition: false,
          maxExpansions: 5,
        },
      });
    });

    it('should return expanded queries from service', async () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.searchQueries).toHaveLength(2);
      expect(result.searchQueries[0].text).toBe('original query');
      expect(result.searchQueries[1].text).toBe('expanded query');
    });

    it('should include intent and strategy from service', async () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.rewriteIntent).toBe('explore');
      expect(result.rewriteStrategy).toBe('expansion');
    });

    it('should handle HyDE queries with embeddings', async () => {
      mockRewriteService.rewrite.mockResolvedValue({
        rewrittenQueries: [
          { text: 'original', weight: 1.0, source: 'original' },
          { text: 'hyde doc', weight: 0.9, source: 'hyde', embedding: [0.1, 0.2, 0.3] },
        ],
        intent: 'lookup',
        strategy: 'hyde',
        processingTimeMs: 100,
      });

      const ctx = createContext({
        params: { enableHyDE: true },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.searchQueries).toHaveLength(2);
      expect(result.searchQueries[1].embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.searchQueries[1].source).toBe('hyde');
    });

    it('should handle decomposition queries', async () => {
      mockRewriteService.rewrite.mockResolvedValue({
        rewrittenQueries: [
          { text: 'original', weight: 1.0, source: 'original' },
          { text: 'sub-query 1', weight: 0.7, source: 'decomposition' },
          { text: 'sub-query 2', weight: 0.7, source: 'decomposition' },
        ],
        intent: 'multi_hop',
        strategy: 'decomposition',
        processingTimeMs: 80,
      });

      const ctx = createContext({
        params: { enableDecomposition: true },
        search: 'complex multi-part query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.searchQueries).toHaveLength(3);
      expect(result.searchQueries.filter((q) => q.source === 'decomposition')).toHaveLength(2);
    });
  });

  describe('logging', () => {
    it('should log rewrite results when perfLog enabled', async () => {
      mockRewriteService.rewrite.mockResolvedValue({
        rewrittenQueries: [
          { text: 'original', weight: 1.0, source: 'original' },
          { text: 'expanded', weight: 0.8, source: 'expansion' },
        ],
        intent: 'explore',
        strategy: 'expansion',
        processingTimeMs: 50,
      });

      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: {
          queryRewriteService: mockRewriteService,
          perfLog: true,
          logger: mockLogger,
        } as any,
      });

      await rewriteStageAsync(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQuery: 'test query',
          expandedCount: 1,
          intent: 'explore',
          strategy: 'expansion',
        }),
        'query_rewrite completed'
      );
    });

    it('should not log when perfLog is disabled', async () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: {
          queryRewriteService: mockRewriteService,
          perfLog: false,
          logger: mockLogger,
        } as any,
      });

      await rewriteStageAsync(ctx);

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should not log when only original query returned', async () => {
      mockRewriteService.rewrite.mockResolvedValue({
        rewrittenQueries: [{ text: 'original', weight: 1.0, source: 'original' }],
        intent: 'explore',
        strategy: 'direct',
        processingTimeMs: 10,
      });

      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: {
          queryRewriteService: mockRewriteService,
          perfLog: true,
          logger: mockLogger,
        } as any,
      });

      await rewriteStageAsync(ctx);

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should fallback to sync stage on service error', async () => {
      mockRewriteService.rewrite.mockRejectedValue(new Error('Service error'));

      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: {
          queryRewriteService: mockRewriteService,
          logger: mockLogger,
        } as any,
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.searchQueries).toHaveLength(1);
      expect(result.searchQueries[0].source).toBe('original');
      expect(result.rewriteStrategy).toBe('direct');
    });

    it('should log warning on service error', async () => {
      const testError = new Error('Service timeout');
      testError.name = 'TimeoutError';
      mockRewriteService.rewrite.mockRejectedValue(testError);

      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: {
          queryRewriteService: mockRewriteService,
          logger: mockLogger,
        } as any,
      });

      await rewriteStageAsync(ctx);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Service timeout',
          name: 'TimeoutError',
        }),
        'query_rewrite failed, using original query'
      );
    });

    it('should truncate query in error log for privacy', async () => {
      mockRewriteService.rewrite.mockRejectedValue(new Error('Failed'));

      const longQuery = 'a'.repeat(200);
      const ctx = createContext({
        params: { enableExpansion: true },
        search: longQuery,
        deps: {
          queryRewriteService: mockRewriteService,
          logger: mockLogger,
        } as any,
      });

      await rewriteStageAsync(ctx);

      const logCall = mockLogger.warn.mock.calls[0][0];
      expect(logCall.query.length).toBe(100);
    });

    it('should handle non-Error objects', async () => {
      mockRewriteService.rewrite.mockRejectedValue('string error');

      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: {
          queryRewriteService: mockRewriteService,
          logger: mockLogger,
        } as any,
      });

      await rewriteStageAsync(ctx);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'string error',
          type: 'string',
        }),
        'query_rewrite failed, using original query'
      );
    });

    it('should not include stack trace in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Production error');
      error.stack = 'at line 1\nat line 2\nat line 3';
      mockRewriteService.rewrite.mockRejectedValue(error);

      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: {
          queryRewriteService: mockRewriteService,
          logger: mockLogger,
        } as any,
      });

      await rewriteStageAsync(ctx);

      const logCall = mockLogger.warn.mock.calls[0][0];
      expect(logCall.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include truncated stack trace in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Dev error');
      error.stack =
        'Error: Dev error\nat line 1\nat line 2\nat line 3\nat line 4\nat line 5\nat line 6';
      mockRewriteService.rewrite.mockRejectedValue(error);

      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: {
          queryRewriteService: mockRewriteService,
          logger: mockLogger,
        } as any,
      });

      await rewriteStageAsync(ctx);

      const logCall = mockLogger.warn.mock.calls[0][0];
      expect(logCall.stack).toBeDefined();
      expect(logCall.stack.split('\n').length).toBeLessThanOrEqual(5);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('context preservation', () => {
    it('should preserve all context fields through async rewrite', async () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        limit: 50,
        types: ['knowledge', 'tool'],
        ftsMatchIds: {
          tool: new Set(['1']),
          guideline: new Set(),
          knowledge: new Set(),
          experience: new Set(),
        },
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.limit).toBe(50);
      expect(result.types).toBe(ctx.types);
      expect(result.ftsMatchIds).toBe(ctx.ftsMatchIds);
    });

    it('should add searchQueries to context', async () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      const result = await rewriteStageAsync(ctx);

      expect(result.searchQueries).toBeDefined();
      expect(Array.isArray(result.searchQueries)).toBe(true);
    });
  });

  describe('feature combinations', () => {
    it('should enable only HyDE when specified', async () => {
      const ctx = createContext({
        params: { enableHyDE: true },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      await rewriteStageAsync(ctx);

      expect(mockRewriteService.rewrite).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            enableHyDE: true,
            enableExpansion: false,
            enableDecomposition: false,
          }),
        })
      );
    });

    it('should enable only expansion when specified', async () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      await rewriteStageAsync(ctx);

      expect(mockRewriteService.rewrite).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            enableHyDE: false,
            enableExpansion: true,
            enableDecomposition: false,
          }),
        })
      );
    });

    it('should enable only decomposition when specified', async () => {
      const ctx = createContext({
        params: { enableDecomposition: true },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      await rewriteStageAsync(ctx);

      expect(mockRewriteService.rewrite).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            enableHyDE: false,
            enableExpansion: false,
            enableDecomposition: true,
          }),
        })
      );
    });

    it('should enable all features when specified', async () => {
      const ctx = createContext({
        params: {
          enableHyDE: true,
          enableExpansion: true,
          enableDecomposition: true,
        },
        search: 'test query',
        deps: { queryRewriteService: mockRewriteService } as any,
      });

      await rewriteStageAsync(ctx);

      expect(mockRewriteService.rewrite).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            enableHyDE: true,
            enableExpansion: true,
            enableDecomposition: true,
          }),
        })
      );
    });
  });
});
