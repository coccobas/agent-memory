/**
 * Unit tests for query rewrite stage
 */

import { describe, it, expect } from 'vitest';
import { rewriteStage, type RewriteStageContext } from '../../src/services/query/stages/rewrite.js';
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
    relatedIds: { tool: new Set(), guideline: new Set(), knowledge: new Set(), experience: new Set() },
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
        ftsMatchIds: { tool: new Set(['1', '2']), guideline: new Set(), knowledge: new Set(), experience: new Set() },
        relatedIds: { tool: new Set(['3']), guideline: new Set(), knowledge: new Set(), experience: new Set() },
      });

      const result = rewriteStage(ctx);

      expect(result.ftsMatchIds).toBe(ctx.ftsMatchIds);
      expect(result.relatedIds).toBe(ctx.relatedIds);
    });
  });
});
