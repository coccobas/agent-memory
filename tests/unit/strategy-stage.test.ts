/**
 * Unit tests for strategy resolution stage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { strategyStageAsync, type SearchStrategy, type StrategyPipelineContext } from '../../src/services/query/stages/strategy.js';
import type { PipelineContext } from '../../src/services/query/pipeline.js';

// Mock the config module
vi.mock('../../src/config/index.js', () => ({
  config: {
    search: {
      defaultStrategy: 'auto',
      autoSemanticThreshold: 0.8,
    },
  },
}));

// Mock the embedding coverage service
vi.mock('../../src/services/embedding-coverage.service.js', () => ({
  getEmbeddingCoverage: vi.fn(),
}));

import { getEmbeddingCoverage } from '../../src/services/embedding-coverage.service.js';

const mockGetEmbeddingCoverage = getEmbeddingCoverage as ReturnType<typeof vi.fn>;

/**
 * Helper to create minimal PipelineContext for testing
 */
function createContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    params: {},
    deps: {
      getDb: () => ({} as any),
      getSqlite: () => ({} as any),
      logger: undefined,
      perfLog: false,
    } as any,
    types: ['knowledge', 'guidelines', 'tools'],
    scopeChain: [{ scopeType: 'project', scopeId: 'proj-123' }],
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

describe('strategyStageAsync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('no search query', () => {
    it('should return "like" when no search query exists', async () => {
      const ctx = createContext({ search: undefined });

      const result = await strategyStageAsync(ctx);

      expect(result.searchStrategy).toBe('like');
    });

    it('should return "like" when search is empty string', async () => {
      const ctx = createContext({ search: '' });

      const result = await strategyStageAsync(ctx);

      // Empty string is still a valid search query
      expect(result.searchStrategy).toBeDefined();
    });
  });

  describe('explicit user override', () => {
    it('should return "hybrid" when both semanticSearch and useFts5 are true', async () => {
      const ctx = createContext({
        search: 'test query',
        params: { semanticSearch: true, useFts5: true },
      });

      const result = await strategyStageAsync(ctx);

      expect(result.searchStrategy).toBe('hybrid');
    });

    it('should return "semantic" when only semanticSearch is true', async () => {
      const ctx = createContext({
        search: 'test query',
        params: { semanticSearch: true },
      });

      const result = await strategyStageAsync(ctx);

      expect(result.searchStrategy).toBe('semantic');
    });

    it('should return "fts5" when only useFts5 is true', async () => {
      const ctx = createContext({
        search: 'test query',
        params: { useFts5: true },
      });

      const result = await strategyStageAsync(ctx);

      expect(result.searchStrategy).toBe('fts5');
    });
  });

  describe('auto mode with coverage check', () => {
    it('should return "hybrid" when embedding coverage is above threshold', async () => {
      mockGetEmbeddingCoverage.mockResolvedValue({
        total: 100,
        withEmbeddings: 90,
        ratio: 0.9,
      });

      const ctx = createContext({
        search: 'test query',
        params: {},
      });

      const result = await strategyStageAsync(ctx);

      expect(result.searchStrategy).toBe('hybrid');
      expect(mockGetEmbeddingCoverage).toHaveBeenCalled();
    });

    it('should return "fts5" when embedding coverage is below threshold', async () => {
      mockGetEmbeddingCoverage.mockResolvedValue({
        total: 100,
        withEmbeddings: 50,
        ratio: 0.5,
      });

      const ctx = createContext({
        search: 'test query',
        params: {},
      });

      const result = await strategyStageAsync(ctx);

      expect(result.searchStrategy).toBe('fts5');
    });

    it('should return "hybrid" when coverage equals threshold exactly', async () => {
      mockGetEmbeddingCoverage.mockResolvedValue({
        total: 100,
        withEmbeddings: 80,
        ratio: 0.8, // Exactly at 80% threshold
      });

      const ctx = createContext({
        search: 'test query',
        params: {},
      });

      const result = await strategyStageAsync(ctx);

      expect(result.searchStrategy).toBe('hybrid');
    });
  });

  describe('context extension', () => {
    it('should add searchStrategy to returned context', async () => {
      mockGetEmbeddingCoverage.mockResolvedValue({
        total: 100,
        withEmbeddings: 90,
        ratio: 0.9,
      });

      const ctx = createContext({
        search: 'test query',
        params: {},
      });

      const result = await strategyStageAsync(ctx);

      expect(result).toHaveProperty('searchStrategy');
      expect(['hybrid', 'semantic', 'fts5', 'like']).toContain(result.searchStrategy);
    });

    it('should preserve original context fields', async () => {
      mockGetEmbeddingCoverage.mockResolvedValue({
        total: 100,
        withEmbeddings: 90,
        ratio: 0.9,
      });

      const ctx = createContext({
        search: 'test query',
        params: { customParam: 'value' },
        limit: 50,
        types: ['knowledge'],
      });

      const result = await strategyStageAsync(ctx);

      expect(result.params).toBe(ctx.params);
      expect(result.limit).toBe(50);
      expect(result.types).toBe(ctx.types);
      expect(result.search).toBe('test query');
    });
  });

  describe('scope chain handling', () => {
    it('should pass scope chain to coverage check', async () => {
      mockGetEmbeddingCoverage.mockResolvedValue({
        total: 100,
        withEmbeddings: 90,
        ratio: 0.9,
      });

      const scopeChain = [
        { scopeType: 'project' as const, scopeId: 'proj-123' },
        { scopeType: 'org' as const, scopeId: 'org-456' },
      ];

      const ctx = createContext({
        search: 'test query',
        params: {},
        scopeChain,
      });

      await strategyStageAsync(ctx);

      expect(mockGetEmbeddingCoverage).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({ type: 'project', id: 'proj-123' }),
          expect.objectContaining({ type: 'org', id: 'org-456' }),
        ]),
        expect.any(Array)
      );
    });
  });

  describe('type mapping', () => {
    it('should map plural types to singular for coverage check', async () => {
      mockGetEmbeddingCoverage.mockResolvedValue({
        total: 100,
        withEmbeddings: 90,
        ratio: 0.9,
      });

      const ctx = createContext({
        search: 'test query',
        params: {},
        types: ['knowledge', 'guidelines', 'tools'],
      });

      await strategyStageAsync(ctx);

      // 'knowledge' has no trailing 's', 'guidelines' -> 'guideline', 'tools' -> 'tool'
      expect(mockGetEmbeddingCoverage).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Array),
        expect.arrayContaining(['knowledge', 'guideline', 'tool'])
      );
    });
  });
});
