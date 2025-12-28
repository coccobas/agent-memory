/**
 * Unit tests for semantic search stage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { semanticStageAsync, type SemanticStageContext } from '../../src/services/query/stages/semantic.js';
import type { PipelineContext } from '../../src/services/query/pipeline.js';

/**
 * Helper to create minimal PipelineContext for testing
 */
function createContext(overrides: Partial<PipelineContext & { searchStrategy?: string }> = {}): PipelineContext {
  return {
    params: {},
    deps: {
      getDb: () => ({} as any),
      logger: undefined,
      perfLog: false,
      embeddingService: undefined,
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
  } as PipelineContext;
}

describe('semanticStageAsync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('skip conditions', () => {
    it('should pass through when searchStrategy is "fts5"', async () => {
      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'fts5',
      });

      const result = await semanticStageAsync(ctx);

      expect(result).toBe(ctx); // Should return same object
    });

    it('should pass through when searchStrategy is "like"', async () => {
      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'like',
      });

      const result = await semanticStageAsync(ctx);

      expect(result).toBe(ctx);
    });

    it('should pass through when no search query exists', async () => {
      const ctx = createContext({
        search: undefined,
        searchStrategy: 'semantic',
      });

      const result = await semanticStageAsync(ctx);

      expect(result).toBe(ctx);
    });

    it('should pass through when searchStrategy is undefined', async () => {
      const ctx = createContext({
        search: 'test query',
        searchStrategy: undefined,
      });

      const result = await semanticStageAsync(ctx);

      expect(result).toBe(ctx);
    });
  });

  describe('embedding service unavailable', () => {
    it('should pass through when embeddingService is undefined', async () => {
      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({} as any),
          embeddingService: undefined,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      expect(result).toBe(ctx);
    });

    it('should pass through when embeddingService.isAvailable() returns false', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(false),
        embed: vi.fn(),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({} as any),
          embeddingService: mockEmbeddingService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      expect(result).toBe(ctx);
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
    });
  });

  describe('semantic search execution', () => {
    it('should generate embedding when strategy is "semantic"', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: mockEmbedding }),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({} as any),
          embeddingService: mockEmbeddingService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('test query');
      expect((result as SemanticStageContext).queryEmbedding).toEqual(mockEmbedding);
    });

    it('should generate embedding when strategy is "hybrid"', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: mockEmbedding }),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'hybrid',
        deps: {
          getDb: () => ({} as any),
          embeddingService: mockEmbeddingService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('test query');
      expect((result as SemanticStageContext).queryEmbedding).toEqual(mockEmbedding);
    });

    it('should add empty semanticScores map to context', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({} as any),
          embeddingService: mockEmbeddingService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      expect(result.semanticScores).toBeInstanceOf(Map);
      expect(result.semanticScores?.size).toBe(0); // Empty until vector service is wired
    });
  });

  describe('error handling', () => {
    it('should continue without semantic scores when embedding fails', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockRejectedValue(new Error('Embedding failed')),
      };

      const mockLogger = { debug: vi.fn() };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({} as any),
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      // Should return original context without crashing
      expect(result).toBe(ctx);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Embedding failed' }),
        expect.stringContaining('failed')
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockRejectedValue('String error'),
      };

      const mockLogger = { debug: vi.fn() };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({} as any),
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      expect(result).toBe(ctx);
    });
  });

  describe('context preservation', () => {
    it('should preserve original context fields', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        params: { customParam: 'value' },
        limit: 50,
        types: ['knowledge'],
        deps: {
          getDb: () => ({} as any),
          embeddingService: mockEmbeddingService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      expect(result.params).toBe(ctx.params);
      expect(result.limit).toBe(50);
      expect(result.types).toBe(ctx.types);
      expect(result.search).toBe('test query');
    });
  });

  describe('logging', () => {
    it('should log debug info when perfLog is enabled', async () => {
      const mockLogger = { debug: vi.fn() };
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({} as any),
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          queryLength: 10, // 'test query'.length
          embeddingDim: 3,
          timeMs: expect.any(Number),
        }),
        expect.stringContaining('completed')
      );
    });

    it('should not log when perfLog is disabled', async () => {
      const mockLogger = { debug: vi.fn() };
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({} as any),
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: false,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });
});
