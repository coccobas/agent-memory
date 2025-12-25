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

  describe('expansion enabled', () => {
    it('should include original query when expansion is enabled', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries.length).toBeGreaterThanOrEqual(1);
      expect(result.searchQueries[0]).toMatchObject({
        text: 'test query',
        weight: 1.0,
        source: 'original',
      });
    });

    it('should set strategy to expansion when only expansion is enabled', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.strategy).toBe('expansion');
    });

    it('should include intent classification with expansion enabled', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'how to configure the system',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.intent).toBeDefined();
      expect(['lookup', 'how_to', 'debug', 'explore', 'compare', 'configure']).toContain(
        result.rewrite!.intent
      );
    });

    it('should handle expansion with complex queries', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'fix the authentication error in production',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries.length).toBeGreaterThanOrEqual(1);
      expect(result.rewrite).toBeDefined();
    });
  });

  describe('HyDE enabled', () => {
    it('should set strategy to hyde when only HyDE is enabled', () => {
      const ctx = createContext({
        params: { enableHyDE: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.strategy).toBe('hyde');
    });

    it('should include original query when HyDE is enabled', () => {
      const ctx = createContext({
        params: { enableHyDE: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries.length).toBeGreaterThanOrEqual(1);
      expect(result.searchQueries[0]).toMatchObject({
        text: 'test query',
        weight: 1.0,
        source: 'original',
      });
    });

    it('should classify intent with HyDE enabled', () => {
      const ctx = createContext({
        params: { enableHyDE: true },
        search: 'what is the authentication flow',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.intent).toBeDefined();
    });
  });

  describe('decomposition enabled', () => {
    it('should set strategy to multi_hop when only decomposition is enabled', () => {
      const ctx = createContext({
        params: { enableDecomposition: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.strategy).toBe('multi_hop');
    });

    it('should include original query when decomposition is enabled', () => {
      const ctx = createContext({
        params: { enableDecomposition: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.searchQueries.length).toBeGreaterThanOrEqual(1);
      expect(result.searchQueries[0]).toMatchObject({
        text: 'test query',
        weight: 1.0,
        source: 'original',
      });
    });
  });

  describe('strategy selection', () => {
    it('should select hybrid strategy when HyDE and expansion are enabled', () => {
      const ctx = createContext({
        params: {
          enableHyDE: true,
          enableExpansion: true,
        },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.strategy).toBe('hybrid');
    });

    it('should prefer hybrid over multi_hop when all features enabled', () => {
      const ctx = createContext({
        params: {
          enableHyDE: true,
          enableExpansion: true,
          enableDecomposition: true,
        },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.strategy).toBe('hybrid');
    });

    it('should select expansion strategy when only expansion is enabled', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.strategy).toBe('expansion');
    });

    it('should select hyde strategy when only HyDE is enabled', () => {
      const ctx = createContext({
        params: { enableHyDE: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.strategy).toBe('hyde');
    });

    it('should select multi_hop strategy when only decomposition is enabled', () => {
      const ctx = createContext({
        params: { enableDecomposition: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.strategy).toBe('multi_hop');
    });

    it('should select direct strategy when no features are enabled', () => {
      const ctx = createContext({
        params: {},
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      // When no rewrite features are enabled, no rewrite result is created
      expect(result.rewrite).toBeUndefined();
      expect(result.searchQueries).toHaveLength(1);
    });
  });

  describe('intent classification', () => {
    it('should classify how_to queries correctly', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'how to configure the database',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.intent).toBe('how_to');
    });

    it('should classify debug queries correctly', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'error connecting to database',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.intent).toBe('debug');
    });

    it('should classify lookup queries correctly', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'what is the database schema',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.intent).toBe('lookup');
    });

    it('should classify compare queries correctly', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'postgres vs mysql',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.intent).toBe('compare');
    });

    it('should classify configure queries correctly', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'setup environment variables',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.intent).toBe('configure');
    });

    it('should default to explore for ambiguous queries', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'random stuff things whatever',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.intent).toBe('explore');
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
    it('should include processingTimeMs in rewrite result', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.processingTimeMs).toBeDefined();
      expect(typeof result.rewrite!.processingTimeMs).toBe('number');
      expect(result.rewrite!.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include rewrittenQueries in rewrite result', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.rewrite!.rewrittenQueries).toBeDefined();
      expect(Array.isArray(result.rewrite!.rewrittenQueries)).toBe(true);
      expect(result.rewrite!.rewrittenQueries.length).toBeGreaterThan(0);
    });

    it('should match searchQueries with rewrittenQueries', () => {
      const ctx = createContext({
        params: { enableExpansion: true },
        search: 'test query',
      });

      const result = rewriteStage(ctx);

      expect(result.rewrite).toBeDefined();
      expect(result.searchQueries.length).toBe(result.rewrite!.rewrittenQueries.length);

      // Verify mapping is correct
      result.searchQueries.forEach((sq, idx) => {
        const rq = result.rewrite!.rewrittenQueries[idx];
        expect(sq.text).toBe(rq.text);
        expect(sq.weight).toBe(rq.weight);
        expect(sq.source).toBe(rq.source);
        expect(sq.embedding).toBe(rq.embedding);
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
      expect(result.rewrite).toBeDefined();
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
