/**
 * Unit tests for semantic search stage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  semanticStageAsync,
  type SemanticStageContext,
} from '../../src/services/query/stages/semantic.js';
import type { PipelineContext } from '../../src/services/query/pipeline.js';

/**
 * Helper to create minimal PipelineContext for testing
 */
function createContext(
  overrides: Partial<PipelineContext & { searchStrategy?: string }> = {}
): PipelineContext {
  return {
    params: {},
    deps: {
      getDb: () => ({}) as any,
      logger: undefined,
      perfLog: false,
      embeddingService: undefined,
    } as any,
    types: ['knowledge', 'guidelines', 'tools'],
    scopeChain: [{ scopeType: 'project', scopeId: 'proj-123' }],
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
          getDb: () => ({}) as any,
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
          getDb: () => ({}) as any,
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
          getDb: () => ({}) as any,
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
          getDb: () => ({}) as any,
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
          getDb: () => ({}) as any,
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

      const mockLogger = { debug: vi.fn(), warn: vi.fn() };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      // Should return original context without crashing
      expect(result).toBe(ctx);
      // Unexpected errors (non-embedding failures) use warn level
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Embedding failed' }),
        expect.stringContaining('failed')
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockRejectedValue('String error'),
      };

      const mockLogger = { debug: vi.fn(), warn: vi.fn() };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
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
          getDb: () => ({}) as any,
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
          getDb: () => ({}) as any,
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
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: false,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe('vector service integration', () => {
    it('should search vector store when vectorService is available', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: mockEmbedding }),
      };
      const mockVectorService = {
        searchSimilar: vi.fn().mockResolvedValue([
          { entryId: 'entry-1', score: 0.9 },
          { entryId: 'entry-2', score: 0.8 },
        ]),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        types: ['knowledge'],
        limit: 10,
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          vectorService: mockVectorService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        mockEmbedding,
        ['knowledge'],
        30 // limit * 3
      );
      expect(result.semanticScores?.size).toBe(2);
      expect(result.semanticScores?.get('entry-1')).toBe(0.9);
      expect(result.semanticScores?.get('entry-2')).toBe(0.8);
    });

    it('should convert types correctly for vector search', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: [0.1] }),
      };
      const mockVectorService = {
        searchSimilar: vi.fn().mockResolvedValue([]),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        types: ['tools', 'guidelines', 'knowledge', 'experiences'],
        limit: 10,
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          vectorService: mockVectorService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        expect.any(Array),
        ['tool', 'guideline', 'knowledge', 'experience'],
        expect.any(Number)
      );
    });

    it('should cap candidate limit at 1000', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: [0.1] }),
      };
      const mockVectorService = {
        searchSimilar: vi.fn().mockResolvedValue([]),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        types: ['knowledge'],
        limit: 500, // 500 * 3 = 1500, should cap at 1000
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          vectorService: mockVectorService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        1000 // capped at MAX_CANDIDATES
      );
    });

    it('should handle vector search returning empty results', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
      };
      const mockVectorService = {
        searchSimilar: vi.fn().mockResolvedValue([]),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          vectorService: mockVectorService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      expect(result.semanticScores?.size).toBe(0);
    });
  });

  describe('HyDE embeddings', () => {
    it('should use HyDE embeddings when available in searchQueries', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn(),
      };
      const mockVectorService = {
        searchSimilar: vi.fn().mockResolvedValue([{ entryId: 'entry-1', score: 0.95 }]),
      };
      const hydeEmbedding = [0.5, 0.6, 0.7];

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        searchQueries: [
          { text: 'test query', weight: 1.0, source: 'original' },
          { text: 'hyde doc', embedding: hydeEmbedding, weight: 0.9, source: 'hyde' },
        ],
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          vectorService: mockVectorService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      // Should not call embed since HyDE embeddings are available
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        hydeEmbedding,
        expect.any(Array),
        expect.any(Number)
      );
      expect((result as SemanticStageContext).queryEmbedding).toEqual(hydeEmbedding);
    });

    it('should use weighted scores from HyDE embeddings', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn(),
      };
      const mockVectorService = {
        searchSimilar: vi.fn().mockResolvedValue([{ entryId: 'entry-1', score: 1.0 }]),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        searchQueries: [{ text: 'hyde doc', embedding: [0.1], weight: 0.8, source: 'hyde' }],
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          vectorService: mockVectorService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      // Score should be weighted: 1.0 * 0.8 = 0.8
      expect(result.semanticScores?.get('entry-1')).toBe(0.8);
    });

    it('should take max score when multiple HyDE embeddings return same entry', async () => {
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn(),
      };
      const mockVectorService = {
        searchSimilar: vi
          .fn()
          .mockResolvedValueOnce([{ entryId: 'entry-1', score: 0.7 }])
          .mockResolvedValueOnce([{ entryId: 'entry-1', score: 0.9 }]),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        searchQueries: [
          { text: 'hyde doc 1', embedding: [0.1], weight: 1.0, source: 'hyde' },
          { text: 'hyde doc 2', embedding: [0.2], weight: 1.0, source: 'hyde' },
        ],
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          vectorService: mockVectorService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      // Should take max: max(0.7, 0.9) = 0.9
      expect(result.semanticScores?.get('entry-1')).toBe(0.9);
    });

    it('should log HyDE count when perfLog is enabled', async () => {
      const mockLogger = { debug: vi.fn() };
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn(),
      };
      const mockVectorService = {
        searchSimilar: vi.fn().mockResolvedValue([]),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        searchQueries: [
          { text: 'hyde1', embedding: [0.1], weight: 0.9, source: 'hyde' },
          { text: 'hyde2', embedding: [0.2], weight: 0.9, source: 'hyde' },
        ],
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          vectorService: mockVectorService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ hydeCount: 2 }),
        expect.stringContaining('HyDE')
      );
    });

    it('should fall back to embed when HyDE queries have no embedding', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockResolvedValue({ embedding: mockEmbedding }),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        searchQueries: [
          { text: 'hyde doc', weight: 0.9, source: 'hyde' }, // No embedding
        ],
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const result = await semanticStageAsync(ctx);

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('test query');
      expect((result as SemanticStageContext).queryEmbedding).toEqual(mockEmbedding);
    });
  });

  describe('specific error types', () => {
    it('should log at debug level for EMBEDDING_DISABLED error', async () => {
      const { AgentMemoryError, ErrorCodes } = await import('../../src/core/errors.js');
      const mockLogger = { debug: vi.fn(), warn: vi.fn() };
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi
          .fn()
          .mockRejectedValue(
            new AgentMemoryError('Embeddings disabled', ErrorCodes.EMBEDDING_DISABLED)
          ),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Embeddings disabled' }),
        expect.stringContaining('embeddings disabled')
      );
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log at warn level for NETWORK_ERROR', async () => {
      const { AgentMemoryError, ErrorCodes } = await import('../../src/core/errors.js');
      const mockLogger = { debug: vi.fn(), warn: vi.fn() };
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi
          .fn()
          .mockRejectedValue(new AgentMemoryError('Network error', ErrorCodes.NETWORK_ERROR)),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Network error',
          retriable: true,
        }),
        expect.stringContaining('transient error')
      );
    });

    it('should log at warn level for TIMEOUT error', async () => {
      const { AgentMemoryError, ErrorCodes } = await import('../../src/core/errors.js');
      const mockLogger = { debug: vi.fn(), warn: vi.fn() };
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi
          .fn()
          .mockRejectedValue(new AgentMemoryError('Request timeout', ErrorCodes.TIMEOUT)),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Request timeout',
          retriable: true,
        }),
        expect.stringContaining('transient error')
      );
    });

    it('should log at warn level for SERVICE_UNAVAILABLE error', async () => {
      const { AgentMemoryError, ErrorCodes } = await import('../../src/core/errors.js');
      const mockLogger = { debug: vi.fn(), warn: vi.fn() };
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi
          .fn()
          .mockRejectedValue(new AgentMemoryError('Service down', ErrorCodes.SERVICE_UNAVAILABLE)),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Service down',
          retriable: true,
        }),
        expect.stringContaining('transient error')
      );
    });

    it('should log with stack trace for unexpected errors', async () => {
      const mockLogger = { debug: vi.fn(), warn: vi.fn() };
      const unexpectedError = new Error('Unexpected failure');
      unexpectedError.stack =
        'Error: Unexpected failure\nat line 1\nat line 2\nat line 3\nat line 4\nat line 5\nat line 6';

      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockRejectedValue(unexpectedError),
      };

      const ctx = createContext({
        search: 'test query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      await semanticStageAsync(ctx);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unexpected failure',
          errorType: 'Error',
          stack: expect.stringContaining('Unexpected failure'),
        }),
        expect.stringContaining('failed unexpectedly')
      );

      // Stack should be truncated to 5 lines
      const logCall = mockLogger.warn.mock.calls[0][0];
      expect(logCall.stack.split('\n').length).toBeLessThanOrEqual(5);
    });

    it('should truncate long search queries in error log', async () => {
      const mockLogger = { debug: vi.fn(), warn: vi.fn() };
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockRejectedValue(new Error('Failed')),
      };

      const longQuery = 'a'.repeat(200);
      const ctx = createContext({
        search: longQuery,
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: mockLogger,
          perfLog: true,
        } as any,
      });

      await semanticStageAsync(ctx);

      const logCall = mockLogger.warn.mock.calls[0][0];
      expect(logCall.search.length).toBe(100);
    });
  });

  describe('request coalescing', () => {
    it('should coalesce duplicate embedding requests', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      let callCount = 0;
      const mockEmbeddingService = {
        isAvailable: vi.fn().mockReturnValue(true),
        embed: vi.fn().mockImplementation(async () => {
          callCount++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { embedding: mockEmbedding };
        }),
      };

      const ctx1 = createContext({
        search: 'same query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      const ctx2 = createContext({
        search: 'same query',
        searchStrategy: 'semantic',
        deps: {
          getDb: () => ({}) as any,
          embeddingService: mockEmbeddingService,
          logger: { debug: vi.fn() },
          perfLog: true,
        } as any,
      });

      // Start both requests concurrently
      const [result1, result2] = await Promise.all([
        semanticStageAsync(ctx1),
        semanticStageAsync(ctx2),
      ]);

      // Both should get the same embedding
      expect((result1 as SemanticStageContext).queryEmbedding).toEqual(mockEmbedding);
      expect((result2 as SemanticStageContext).queryEmbedding).toEqual(mockEmbedding);

      // But embed should only be called once due to coalescing
      expect(callCount).toBe(1);
    });
  });
});
