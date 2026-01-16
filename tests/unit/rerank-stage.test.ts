/**
 * Tests for the Neural Re-ranking Stage
 *
 * Tests re-ranking using embeddings to improve result quality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createRerankStage,
  rerankStageNoop,
  shouldApplyRerank,
  getRerankStats,
  DEFAULT_RERANK_CONFIG,
  type RerankDependencies,
  type RerankEmbeddingService,
  type RerankPipelineContext,
} from '../../src/services/query/stages/rerank.js';
import type { PipelineContext, QueryResultItem } from '../../src/services/query/pipeline.js';

describe('Neural Re-ranking Stage', () => {
  // Helper to create mock query result items
  function createMockResults(count: number): QueryResultItem[] {
    const results: QueryResultItem[] = [];
    for (let i = 0; i < count; i++) {
      if (i % 3 === 0) {
        results.push({
          type: 'tool',
          id: `tool-${i}`,
          score: 1 - i * 0.05,
          tool: { id: `tool-${i}`, name: `Tool ${i}`, category: 'cli' },
        } as QueryResultItem);
      } else if (i % 3 === 1) {
        results.push({
          type: 'guideline',
          id: `guideline-${i}`,
          score: 1 - i * 0.05,
          guideline: { id: `guideline-${i}`, name: `Guideline ${i}`, category: 'code_style' },
        } as QueryResultItem);
      } else {
        results.push({
          type: 'knowledge',
          id: `knowledge-${i}`,
          score: 1 - i * 0.05,
          knowledge: { id: `knowledge-${i}`, title: `Knowledge ${i}`, category: 'fact' },
        } as QueryResultItem);
      }
    }
    return results;
  }

  // Helper to create minimal pipeline context
  function createMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
    return {
      search: 'test query',
      params: {
        semanticSearch: true,
        limit: 20,
      },
      results: createMockResults(10),
      fetchedEntries: {
        tools: [],
        guidelines: [],
        knowledge: [],
        experiences: [],
      },
      deps: {
        perfLog: false,
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        getPreparedStatement: vi.fn(() => ({
          all: vi.fn().mockReturnValue([]),
        })),
      },
      ...overrides,
    } as unknown as PipelineContext;
  }

  // Helper to create mock embedding service
  function createMockEmbeddingService(
    overrides: Partial<RerankEmbeddingService> = {}
  ): RerankEmbeddingService {
    return {
      embed: vi.fn().mockResolvedValue({
        embedding: new Array(384).fill(0.1),
        model: 'test-model',
      }),
      embedBatch: vi.fn().mockImplementation((texts: string[]) =>
        Promise.resolve({
          embeddings: texts.map((_, i) => {
            // Create slightly different embeddings for each text
            const emb = new Array(384).fill(0.1);
            emb[0] = 0.2 + i * 0.05;
            return emb;
          }),
          model: 'test-model',
        })
      ),
      isAvailable: vi.fn().mockReturnValue(true),
      ...overrides,
    };
  }

  // Helper to create mock dependencies
  function createMockDeps(overrides: Partial<RerankDependencies> = {}): RerankDependencies {
    return {
      embeddingService: createMockEmbeddingService(),
      config: {
        enabled: true,
      },
      ...overrides,
    };
  }

  describe('DEFAULT_RERANK_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RERANK_CONFIG.enabled).toBe(false);
      expect(DEFAULT_RERANK_CONFIG.topK).toBe(20);
      expect(DEFAULT_RERANK_CONFIG.alpha).toBe(0.5);
      expect(DEFAULT_RERANK_CONFIG.minScoreThreshold).toBe(0.1);
      expect(DEFAULT_RERANK_CONFIG.semanticQueriesOnly).toBe(true);
    });
  });

  describe('createRerankStage', () => {
    it('should create a stage function', () => {
      const deps = createMockDeps();
      const stage = createRerankStage(deps);

      expect(typeof stage).toBe('function');
    });

    it('should skip when disabled', async () => {
      const embeddingService = createMockEmbeddingService();
      const deps = createMockDeps({
        embeddingService,
        config: { enabled: false },
      });
      const stage = createRerankStage(deps);
      const ctx = createMockContext();

      const result = await stage(ctx);

      expect(embeddingService.embed).not.toHaveBeenCalled();
      expect(result).toBe(ctx);
    });

    it('should skip when no results', async () => {
      const embeddingService = createMockEmbeddingService();
      const deps = createMockDeps({ embeddingService });
      const stage = createRerankStage(deps);
      const ctx = createMockContext({ results: [] });

      const result = await stage(ctx);

      expect(embeddingService.embed).not.toHaveBeenCalled();
    });

    it('should skip when no search query', async () => {
      const embeddingService = createMockEmbeddingService();
      const deps = createMockDeps({ embeddingService });
      const stage = createRerankStage(deps);
      const ctx = createMockContext({ search: '' });

      const result = await stage(ctx);

      expect(embeddingService.embed).not.toHaveBeenCalled();
    });

    it('should skip non-semantic searches when semanticQueriesOnly is true', async () => {
      const embeddingService = createMockEmbeddingService();
      const deps = createMockDeps({ embeddingService });
      const stage = createRerankStage(deps);
      const ctx = createMockContext({
        params: { semanticSearch: false, limit: 20 },
      });

      const result = await stage(ctx);

      expect(embeddingService.embed).not.toHaveBeenCalled();
    });

    it('should skip when embedding service not available', async () => {
      const embeddingService = createMockEmbeddingService({
        isAvailable: vi.fn().mockReturnValue(false),
      });
      const deps = createMockDeps({ embeddingService });
      const stage = createRerankStage(deps);
      const ctx = createMockContext();

      const result = await stage(ctx);

      expect(embeddingService.isAvailable).toHaveBeenCalled();
      expect(embeddingService.embed).not.toHaveBeenCalled();
    });

    it('should perform re-ranking when conditions are met', async () => {
      const embeddingService = createMockEmbeddingService();
      const deps = createMockDeps({ embeddingService });
      const stage = createRerankStage(deps);
      const ctx = createMockContext();

      const result = (await stage(ctx)) as RerankPipelineContext;

      expect(embeddingService.embed).toHaveBeenCalledWith('test query');
      expect(embeddingService.embedBatch).toHaveBeenCalled();
      expect(result.rerank).toBeDefined();
      expect(result.rerank?.applied).toBe(true);
    });

    it('should limit re-ranking to topK candidates', async () => {
      const embeddingService = createMockEmbeddingService();
      const deps = createMockDeps({
        embeddingService,
        config: { enabled: true, topK: 5 },
      });
      const stage = createRerankStage(deps);
      const ctx = createMockContext({ results: createMockResults(20) });

      const result = (await stage(ctx)) as RerankPipelineContext;

      // Should only process top 5 candidates
      expect(result.rerank?.candidatesProcessed).toBe(5);
      // embedBatch should receive 5 texts
      expect(embeddingService.embedBatch).toHaveBeenCalledWith(expect.arrayContaining([]));
      const callArgs = (embeddingService.embedBatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.length).toBe(5);
    });

    it('should track processing time', async () => {
      const deps = createMockDeps();
      const stage = createRerankStage(deps);
      const ctx = createMockContext();

      const result = (await stage(ctx)) as RerankPipelineContext;

      expect(result.rerank?.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track embedding model', async () => {
      const deps = createMockDeps();
      const stage = createRerankStage(deps);
      const ctx = createMockContext();

      const result = (await stage(ctx)) as RerankPipelineContext;

      expect(result.rerank?.embeddingModel).toBe('test-model');
    });

    it('should blend scores using alpha', async () => {
      // Create specific embeddings that will produce known similarity scores
      const embeddingService = createMockEmbeddingService({
        embed: vi.fn().mockResolvedValue({
          embedding: [1, 0, 0, 0],
          model: 'test-model',
        }),
        embedBatch: vi.fn().mockResolvedValue({
          embeddings: [[1, 0, 0, 0]], // Perfect match with query
          model: 'test-model',
        }),
      });
      const deps = createMockDeps({
        embeddingService,
        config: { enabled: true, topK: 1, alpha: 0.5 },
      });
      const stage = createRerankStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-1',
            score: 0.6, // Original score
            tool: { id: 'tool-1', name: 'Tool', category: 'cli' },
          } as QueryResultItem,
        ],
      });

      const result = (await stage(ctx)) as RerankPipelineContext;

      // Semantic score = 1.0 (perfect match), original = 0.6
      // Blended = 0.5 * 1.0 + 0.5 * 0.6 = 0.8
      expect(result.results[0].score).toBeCloseTo(0.8, 1);
    });

    it('should re-sort results after re-ranking', async () => {
      const embeddingService = createMockEmbeddingService({
        embed: vi.fn().mockResolvedValue({
          embedding: [1, 0, 0, 0],
          model: 'test-model',
        }),
        embedBatch: vi.fn().mockResolvedValue({
          embeddings: [
            [0, 1, 0, 0], // Poor match - will lower score
            [1, 0, 0, 0], // Perfect match - will boost score
          ],
          model: 'test-model',
        }),
      });
      const deps = createMockDeps({
        embeddingService,
        config: { enabled: true, topK: 2, alpha: 0.7 },
      });
      const stage = createRerankStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-1',
            score: 0.9, // High original score
            tool: { id: 'tool-1', name: 'Tool 1', category: 'cli' },
          } as QueryResultItem,
          {
            type: 'tool',
            id: 'tool-2',
            score: 0.8, // Lower original score
            tool: { id: 'tool-2', name: 'Tool 2', category: 'cli' },
          } as QueryResultItem,
        ],
      });

      const result = (await stage(ctx)) as RerankPipelineContext;

      // tool-2 should now be first due to better semantic match
      expect(result.results[0].id).toBe('tool-2');
    });

    it('should skip items below minScoreThreshold', async () => {
      const embeddingService = createMockEmbeddingService();
      const deps = createMockDeps({
        embeddingService,
        config: { enabled: true, minScoreThreshold: 0.5 },
      });
      const stage = createRerankStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-1',
            score: 0.3, // Below threshold
            tool: { id: 'tool-1', name: 'Tool 1', category: 'cli' },
          } as QueryResultItem,
        ],
      });

      const result = (await stage(ctx)) as RerankPipelineContext;

      // Score should remain unchanged
      expect(result.results[0].score).toBe(0.3);
    });

    it('should handle embedding errors gracefully', async () => {
      const embeddingService = createMockEmbeddingService({
        embed: vi.fn().mockRejectedValue(new Error('Embedding service error')),
      });
      const deps = createMockDeps({ embeddingService });
      const stage = createRerankStage(deps);
      const mockLogger = { debug: vi.fn() };
      const ctx = createMockContext({
        deps: { logger: mockLogger } as any,
      });

      const result = await stage(ctx);

      // Should return original context without re-ranking
      expect((result as RerankPipelineContext).rerank).toBeUndefined();
    });

    it('should preserve pass-through results', async () => {
      const deps = createMockDeps({
        config: { enabled: true, topK: 3 },
      });
      const stage = createRerankStage(deps);
      const ctx = createMockContext({ results: createMockResults(10) });

      const result = (await stage(ctx)) as RerankPipelineContext;

      // Should have all 10 results
      expect(result.results.length).toBe(10);
    });

    it('should allow non-semantic searches when semanticQueriesOnly is false', async () => {
      const embeddingService = createMockEmbeddingService();
      const deps = createMockDeps({
        embeddingService,
        config: { enabled: true, semanticQueriesOnly: false },
      });
      const stage = createRerankStage(deps);
      const ctx = createMockContext({
        params: { semanticSearch: false, limit: 20 },
      });

      await stage(ctx);

      expect(embeddingService.embed).toHaveBeenCalled();
    });

    it('should handle missing embeddings in batch response', async () => {
      const embeddingService = createMockEmbeddingService({
        embedBatch: vi.fn().mockResolvedValue({
          embeddings: [undefined, [0.1, 0.2, 0.3, 0.4]],
          model: 'test-model',
        }),
      });
      const deps = createMockDeps({ embeddingService });
      const stage = createRerankStage(deps);
      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-1',
            score: 0.9,
            tool: { id: 'tool-1', name: 'Tool 1', category: 'cli' },
          } as QueryResultItem,
          {
            type: 'tool',
            id: 'tool-2',
            score: 0.8,
            tool: { id: 'tool-2', name: 'Tool 2', category: 'cli' },
          } as QueryResultItem,
        ],
      });

      const result = (await stage(ctx)) as RerankPipelineContext;

      // First item (no embedding) should keep original score
      const item1 = result.results.find((r) => r.id === 'tool-1');
      expect(item1?.score).toBe(0.9);
    });

    it('should extract text from different item types', async () => {
      const embeddingService = createMockEmbeddingService();
      const deps = createMockDeps({ embeddingService });
      const stage = createRerankStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-1',
            score: 0.9,
            tool: { id: 'tool-1', name: 'My Tool', category: 'cli' },
          } as QueryResultItem,
          {
            type: 'guideline',
            id: 'guideline-1',
            score: 0.8,
            guideline: { id: 'guideline-1', name: 'My Guideline', category: 'security' },
          } as QueryResultItem,
          {
            type: 'knowledge',
            id: 'knowledge-1',
            score: 0.7,
            knowledge: { id: 'knowledge-1', title: 'My Knowledge', category: 'decision' },
          } as QueryResultItem,
        ],
      });

      await stage(ctx);

      const batchCall = (embeddingService.embedBatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(batchCall).toContain('My Tool cli');
      expect(batchCall).toContain('My Guideline security');
      expect(batchCall).toContain('My Knowledge decision');
    });

    it('should handle experience item type', async () => {
      const embeddingService = createMockEmbeddingService();
      const deps = createMockDeps({ embeddingService });
      const stage = createRerankStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'experience',
            id: 'exp-1',
            score: 0.9,
            experience: { id: 'exp-1', title: 'My Experience', category: 'debugging' },
          } as QueryResultItem,
        ],
      });

      await stage(ctx);

      const batchCall = (embeddingService.embedBatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(batchCall).toContain('My Experience debugging');
    });
  });

  describe('rerankStageNoop', () => {
    it('should return context unchanged', () => {
      const ctx = createMockContext();
      const result = rerankStageNoop(ctx);

      expect(result).toBe(ctx);
    });
  });

  describe('shouldApplyRerank', () => {
    it('should return false when disabled', () => {
      const ctx = createMockContext();
      const result = shouldApplyRerank(ctx, { enabled: false });

      expect(result).toBe(false);
    });

    it('should return false when no search query', () => {
      const ctx = createMockContext({ search: '' });
      const result = shouldApplyRerank(ctx, { enabled: true });

      expect(result).toBe(false);
    });

    it('should return false when no results', () => {
      const ctx = createMockContext({ results: [] });
      const result = shouldApplyRerank(ctx, { enabled: true });

      expect(result).toBe(false);
    });

    it('should return false for non-semantic search when semanticQueriesOnly', () => {
      const ctx = createMockContext({
        params: { semanticSearch: false, limit: 20 },
      });
      const result = shouldApplyRerank(ctx, { enabled: true, semanticQueriesOnly: true });

      expect(result).toBe(false);
    });

    it('should return true when all conditions are met', () => {
      const ctx = createMockContext();
      const result = shouldApplyRerank(ctx, { enabled: true });

      expect(result).toBe(true);
    });

    it('should return true for non-semantic when semanticQueriesOnly is false', () => {
      const ctx = createMockContext({
        params: { semanticSearch: false, limit: 20 },
      });
      const result = shouldApplyRerank(ctx, { enabled: true, semanticQueriesOnly: false });

      expect(result).toBe(true);
    });

    it('should use default config merged with global config', () => {
      const ctx = createMockContext();

      // shouldApplyRerank merges DEFAULT_RERANK_CONFIG with config.rerank and any override
      // The actual behavior depends on global config state
      const result = shouldApplyRerank(ctx);

      // If global config has rerank enabled, result will be true
      // If not, it will be false - either way this tests the function runs without error
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getRerankStats', () => {
    it('should return null when no rerank data', () => {
      const ctx = createMockContext();
      const result = getRerankStats(ctx);

      expect(result).toBeNull();
    });

    it('should return stats when rerank data exists', () => {
      const ctx = createMockContext() as RerankPipelineContext;
      ctx.rerank = {
        applied: true,
        candidatesProcessed: 15,
        embeddingModel: 'all-MiniLM-L6-v2',
        processingTimeMs: 150,
      };

      const result = getRerankStats(ctx);

      expect(result).toEqual({
        applied: true,
        candidatesProcessed: 15,
        processingTimeMs: 150,
      });
    });
  });

  describe('cosineSimilarity (via stage behavior)', () => {
    it('should compute perfect similarity for identical vectors', async () => {
      const embedding = [1, 0, 0, 0];
      const embeddingService = createMockEmbeddingService({
        embed: vi.fn().mockResolvedValue({
          embedding,
          model: 'test-model',
        }),
        embedBatch: vi.fn().mockResolvedValue({
          embeddings: [embedding],
          model: 'test-model',
        }),
      });
      const deps = createMockDeps({
        embeddingService,
        config: { enabled: true, topK: 1, alpha: 1.0 }, // Pure semantic
      });
      const stage = createRerankStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-1',
            score: 0.5,
            tool: { id: 'tool-1', name: 'Tool', category: 'cli' },
          } as QueryResultItem,
        ],
      });

      const result = (await stage(ctx)) as RerankPipelineContext;

      // With alpha=1.0 and identical vectors, score should be 1.0
      expect(result.results[0].score).toBeCloseTo(1.0, 5);
    });

    it('should compute zero similarity for orthogonal vectors', async () => {
      const embeddingService = createMockEmbeddingService({
        embed: vi.fn().mockResolvedValue({
          embedding: [1, 0, 0, 0],
          model: 'test-model',
        }),
        embedBatch: vi.fn().mockResolvedValue({
          embeddings: [[0, 1, 0, 0]], // Orthogonal
          model: 'test-model',
        }),
      });
      const deps = createMockDeps({
        embeddingService,
        config: { enabled: true, topK: 1, alpha: 1.0 }, // Pure semantic
      });
      const stage = createRerankStage(deps);

      const ctx = createMockContext({
        results: [
          {
            type: 'tool',
            id: 'tool-1',
            score: 0.5,
            tool: { id: 'tool-1', name: 'Tool', category: 'cli' },
          } as QueryResultItem,
        ],
      });

      const result = (await stage(ctx)) as RerankPipelineContext;

      // With alpha=1.0 and orthogonal vectors, score should be 0.0
      expect(result.results[0].score).toBeCloseTo(0.0, 5);
    });
  });
});
