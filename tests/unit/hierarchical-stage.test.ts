/**
 * Tests for the Hierarchical Retrieval Stage
 *
 * Tests coarse-to-fine retrieval through summary hierarchies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createHierarchicalStage,
  hierarchicalStageNoop,
  shouldApplyHierarchical,
  getHierarchicalStats,
  filterByHierarchicalCandidates,
  DEFAULT_HIERARCHICAL_CONFIG,
  type HierarchicalDependencies,
  type HierarchicalPipelineContext,
} from '../../src/services/query/stages/hierarchical.js';
import type { PipelineContext } from '../../src/services/query/pipeline.js';

describe('Hierarchical Retrieval Stage', () => {
  // Helper to create minimal pipeline context
  function createMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
    return {
      search: 'test query',
      params: {
        semanticSearch: true,
        limit: 20,
      },
      scopeChain: [{ scopeType: 'project', scopeId: 'proj-123' }],
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
      },
      ...overrides,
    } as unknown as PipelineContext;
  }

  // Helper to create mock dependencies
  function createMockDeps(
    overrides: Partial<HierarchicalDependencies> = {}
  ): HierarchicalDependencies {
    return {
      retriever: {
        retrieve: vi.fn().mockResolvedValue({
          entries: [
            { id: 'entry-1', type: 'knowledge', score: 0.95 },
            { id: 'entry-2', type: 'guideline', score: 0.85 },
            { id: 'entry-3', type: 'tool', score: 0.75 },
          ],
          steps: [
            { level: 2, summariesSearched: 5, summariesMatched: 2, timeMs: 10 },
            { level: 1, summariesSearched: 10, summariesMatched: 3, timeMs: 15 },
            { level: 0, summariesSearched: 20, summariesMatched: 5, timeMs: 20 },
          ],
          totalTimeMs: 45,
        }),
      },
      config: {
        enabled: true,
      },
      hasSummaries: vi.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  describe('DEFAULT_HIERARCHICAL_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_HIERARCHICAL_CONFIG.enabled).toBe(false);
      expect(DEFAULT_HIERARCHICAL_CONFIG.minEntriesThreshold).toBe(100);
      expect(DEFAULT_HIERARCHICAL_CONFIG.maxCandidates).toBe(100);
      expect(DEFAULT_HIERARCHICAL_CONFIG.expansionFactor).toBe(3);
      expect(DEFAULT_HIERARCHICAL_CONFIG.minSimilarity).toBe(0.5);
      expect(DEFAULT_HIERARCHICAL_CONFIG.semanticQueriesOnly).toBe(true);
    });
  });

  describe('createHierarchicalStage', () => {
    it('should create a stage function', () => {
      const deps = createMockDeps();
      const stage = createHierarchicalStage(deps);

      expect(typeof stage).toBe('function');
    });

    it('should skip when disabled', async () => {
      const deps = createMockDeps({ config: { enabled: false } });
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext();

      const result = await stage(ctx);

      expect(deps.retriever.retrieve).not.toHaveBeenCalled();
      expect(result).toBe(ctx);
    });

    it('should skip when no search query', async () => {
      const deps = createMockDeps();
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext({ search: '' });

      const result = await stage(ctx);

      expect(deps.retriever.retrieve).not.toHaveBeenCalled();
    });

    it('should skip non-semantic searches when semanticQueriesOnly is true', async () => {
      const deps = createMockDeps();
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext({
        params: { semanticSearch: false, limit: 20 },
      });

      const result = await stage(ctx);

      expect(deps.retriever.retrieve).not.toHaveBeenCalled();
    });

    it('should skip when no target scope in chain', async () => {
      const deps = createMockDeps();
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext({ scopeChain: [] });

      const result = await stage(ctx);

      expect(deps.retriever.retrieve).not.toHaveBeenCalled();
    });

    it('should skip when no summaries available', async () => {
      const deps = createMockDeps({ hasSummaries: vi.fn().mockResolvedValue(false) });
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext();

      const result = await stage(ctx);

      expect(deps.hasSummaries).toHaveBeenCalledWith('project', 'proj-123');
      expect(deps.retriever.retrieve).not.toHaveBeenCalled();
    });

    it('should perform hierarchical retrieval when conditions are met', async () => {
      const deps = createMockDeps();
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext();

      const result = (await stage(ctx)) as HierarchicalPipelineContext;

      expect(deps.retriever.retrieve).toHaveBeenCalledWith({
        query: 'test query',
        scopeType: 'project',
        scopeId: 'proj-123',
        maxResults: 100,
        expansionFactor: 3,
        minSimilarity: 0.5,
      });

      expect(result.hierarchical).toBeDefined();
      expect(result.hierarchical?.applied).toBe(true);
      expect(result.hierarchical?.candidateIds.size).toBe(3);
    });

    it('should preserve candidate scores', async () => {
      const deps = createMockDeps();
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext();

      const result = (await stage(ctx)) as HierarchicalPipelineContext;

      expect(result.hierarchical?.candidateScores.get('entry-1')).toBe(0.95);
      expect(result.hierarchical?.candidateScores.get('entry-2')).toBe(0.85);
      expect(result.hierarchical?.candidateScores.get('entry-3')).toBe(0.75);
    });

    it('should track levels traversed', async () => {
      const deps = createMockDeps();
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext();

      const result = (await stage(ctx)) as HierarchicalPipelineContext;

      expect(result.hierarchical?.levelsTraversed).toBe(3);
    });

    it('should use custom config overrides', async () => {
      const deps = createMockDeps({
        config: {
          enabled: true,
          maxCandidates: 50,
          expansionFactor: 5,
          minSimilarity: 0.7,
        },
      });
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext();

      await stage(ctx);

      expect(deps.retriever.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          maxResults: 50,
          expansionFactor: 5,
          minSimilarity: 0.7,
        })
      );
    });

    it('should handle retriever errors gracefully', async () => {
      const deps = createMockDeps({
        retriever: {
          retrieve: vi.fn().mockRejectedValue(new Error('Retrieval failed')),
        },
      });
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext();

      const result = await stage(ctx);

      // Should return original context without hierarchical metadata
      expect((result as HierarchicalPipelineContext).hierarchical).toBeUndefined();
    });

    it('should log debug info when summaries unavailable with perfLog', async () => {
      const mockLogger = { debug: vi.fn() };
      const deps = createMockDeps({ hasSummaries: vi.fn().mockResolvedValue(false) });
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext({
        deps: { perfLog: true, logger: mockLogger },
      });

      await stage(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'project',
          scopeId: 'proj-123',
        }),
        expect.stringContaining('no summaries')
      );
    });

    it('should log performance metrics on success', async () => {
      const mockLogger = { debug: vi.fn() };
      const deps = createMockDeps();
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext({
        deps: { perfLog: true, logger: mockLogger },
      });

      await stage(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateCount: 3,
          levelsTraversed: 3,
        }),
        expect.stringContaining('hierarchical retrieval completed')
      );
    });

    it('should allow non-semantic searches when semanticQueriesOnly is false', async () => {
      const deps = createMockDeps({
        config: {
          enabled: true,
          semanticQueriesOnly: false,
        },
      });
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext({
        params: { semanticSearch: false, limit: 20 },
      });

      await stage(ctx);

      expect(deps.retriever.retrieve).toHaveBeenCalled();
    });

    it('should handle scopeId being null', async () => {
      const deps = createMockDeps();
      const stage = createHierarchicalStage(deps);
      const ctx = createMockContext({
        scopeChain: [{ scopeType: 'global', scopeId: null }],
      });

      await stage(ctx);

      expect(deps.retriever.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'global',
          scopeId: undefined,
        })
      );
    });
  });

  describe('hierarchicalStageNoop', () => {
    it('should return context unchanged', () => {
      const ctx = createMockContext();
      const result = hierarchicalStageNoop(ctx);

      expect(result).toBe(ctx);
    });
  });

  describe('shouldApplyHierarchical', () => {
    it('should return false when disabled', () => {
      const ctx = createMockContext();
      const result = shouldApplyHierarchical(ctx, { enabled: false });

      expect(result).toBe(false);
    });

    it('should return false when no search query', () => {
      const ctx = createMockContext({ search: '' });
      const result = shouldApplyHierarchical(ctx, { enabled: true });

      expect(result).toBe(false);
    });

    it('should return false for non-semantic search when semanticQueriesOnly', () => {
      const ctx = createMockContext({
        params: { semanticSearch: false, limit: 20 },
      });
      const result = shouldApplyHierarchical(ctx, { enabled: true, semanticQueriesOnly: true });

      expect(result).toBe(false);
    });

    it('should return true when all conditions are met', () => {
      const ctx = createMockContext();
      const result = shouldApplyHierarchical(ctx, { enabled: true });

      expect(result).toBe(true);
    });

    it('should return true for non-semantic when semanticQueriesOnly is false', () => {
      const ctx = createMockContext({
        params: { semanticSearch: false, limit: 20 },
      });
      const result = shouldApplyHierarchical(ctx, { enabled: true, semanticQueriesOnly: false });

      expect(result).toBe(true);
    });

    it('should use default config when no override provided', () => {
      const ctx = createMockContext();

      // Default config has enabled: false
      const result = shouldApplyHierarchical(ctx);

      expect(result).toBe(false);
    });
  });

  describe('getHierarchicalStats', () => {
    it('should return null when no hierarchical data', () => {
      const ctx = createMockContext();
      const result = getHierarchicalStats(ctx);

      expect(result).toBeNull();
    });

    it('should return stats when hierarchical data exists', () => {
      const ctx = createMockContext() as HierarchicalPipelineContext;
      ctx.hierarchical = {
        applied: true,
        candidateIds: new Set(['id1', 'id2', 'id3']),
        candidateScores: new Map([
          ['id1', 0.9],
          ['id2', 0.8],
          ['id3', 0.7],
        ]),
        levelsTraversed: 3,
        totalTimeMs: 50,
      };

      const result = getHierarchicalStats(ctx);

      expect(result).toEqual({
        applied: true,
        candidateCount: 3,
        levelsTraversed: 3,
        totalTimeMs: 50,
      });
    });

    it('should return correct count for empty candidate set', () => {
      const ctx = createMockContext() as HierarchicalPipelineContext;
      ctx.hierarchical = {
        applied: true,
        candidateIds: new Set(),
        candidateScores: new Map(),
        levelsTraversed: 0,
        totalTimeMs: 5,
      };

      const result = getHierarchicalStats(ctx);

      expect(result?.candidateCount).toBe(0);
    });
  });

  describe('filterByHierarchicalCandidates', () => {
    function createContextWithEntries(): HierarchicalPipelineContext {
      return {
        ...createMockContext(),
        fetchedEntries: {
          tools: [
            { entry: { id: 'tool-1' } },
            { entry: { id: 'tool-2' } },
            { entry: { id: 'tool-3' } },
          ],
          guidelines: [{ entry: { id: 'guideline-1' } }, { entry: { id: 'guideline-2' } }],
          knowledge: [{ entry: { id: 'knowledge-1' } }, { entry: { id: 'knowledge-2' } }],
          experiences: [{ entry: { id: 'exp-1' } }],
        },
      } as unknown as HierarchicalPipelineContext;
    }

    it('should return context unchanged when hierarchical not applied', () => {
      const ctx = createContextWithEntries();
      ctx.hierarchical = undefined;

      const result = filterByHierarchicalCandidates(ctx);

      expect(result.fetchedEntries.tools).toHaveLength(3);
      expect(result.fetchedEntries.guidelines).toHaveLength(2);
    });

    it('should return context unchanged when candidateIds is empty', () => {
      const ctx = createContextWithEntries();
      ctx.hierarchical = {
        applied: true,
        candidateIds: new Set(),
        candidateScores: new Map(),
        levelsTraversed: 0,
        totalTimeMs: 0,
      };

      const result = filterByHierarchicalCandidates(ctx);

      expect(result.fetchedEntries.tools).toHaveLength(3);
    });

    it('should filter entries to only hierarchical candidates', () => {
      const ctx = createContextWithEntries();
      ctx.hierarchical = {
        applied: true,
        candidateIds: new Set(['tool-1', 'guideline-2', 'knowledge-1']),
        candidateScores: new Map([
          ['tool-1', 0.9],
          ['guideline-2', 0.8],
          ['knowledge-1', 0.7],
        ]),
        levelsTraversed: 2,
        totalTimeMs: 30,
      };

      const result = filterByHierarchicalCandidates(ctx);

      expect(result.fetchedEntries.tools).toHaveLength(1);
      expect(result.fetchedEntries.guidelines).toHaveLength(1);
      expect(result.fetchedEntries.knowledge).toHaveLength(1);
      expect(result.fetchedEntries.experiences).toHaveLength(0);
    });

    it('should merge hierarchical scores into semantic scores', () => {
      const ctx = createContextWithEntries();
      ctx.semanticScores = new Map([
        ['tool-1', 0.7],
        ['guideline-1', 0.6],
      ]);
      ctx.hierarchical = {
        applied: true,
        candidateIds: new Set(['tool-1', 'guideline-2']),
        candidateScores: new Map([
          ['tool-1', 0.9],
          ['guideline-2', 0.8],
        ]),
        levelsTraversed: 2,
        totalTimeMs: 30,
      };

      const result = filterByHierarchicalCandidates(ctx);

      // tool-1: max(0.7, 0.9) = 0.9
      expect(result.semanticScores?.get('tool-1')).toBe(0.9);
      // guideline-2: only hierarchical score
      expect(result.semanticScores?.get('guideline-2')).toBe(0.8);
      // guideline-1: original semantic score preserved
      expect(result.semanticScores?.get('guideline-1')).toBe(0.6);
    });

    it('should use max of semantic and hierarchical scores', () => {
      const ctx = createContextWithEntries();
      ctx.semanticScores = new Map([['tool-1', 0.95]]); // Higher than hierarchical
      ctx.hierarchical = {
        applied: true,
        candidateIds: new Set(['tool-1']),
        candidateScores: new Map([['tool-1', 0.8]]),
        levelsTraversed: 1,
        totalTimeMs: 10,
      };

      const result = filterByHierarchicalCandidates(ctx);

      // Should use the higher semantic score (0.95) not hierarchical (0.8)
      expect(result.semanticScores?.get('tool-1')).toBe(0.95);
    });

    it('should handle missing semanticScores', () => {
      const ctx = createContextWithEntries();
      ctx.semanticScores = undefined;
      ctx.hierarchical = {
        applied: true,
        candidateIds: new Set(['tool-1']),
        candidateScores: new Map([['tool-1', 0.85]]),
        levelsTraversed: 1,
        totalTimeMs: 10,
      };

      const result = filterByHierarchicalCandidates(ctx);

      expect(result.semanticScores?.get('tool-1')).toBe(0.85);
    });

    it('should filter all entry types correctly', () => {
      const ctx = createContextWithEntries();
      ctx.hierarchical = {
        applied: true,
        candidateIds: new Set(['tool-2', 'guideline-1', 'knowledge-2', 'exp-1']),
        candidateScores: new Map([
          ['tool-2', 0.9],
          ['guideline-1', 0.8],
          ['knowledge-2', 0.7],
          ['exp-1', 0.6],
        ]),
        levelsTraversed: 3,
        totalTimeMs: 40,
      };

      const result = filterByHierarchicalCandidates(ctx);

      expect(result.fetchedEntries.tools).toHaveLength(1);
      expect(result.fetchedEntries.tools[0].entry.id).toBe('tool-2');

      expect(result.fetchedEntries.guidelines).toHaveLength(1);
      expect(result.fetchedEntries.guidelines[0].entry.id).toBe('guideline-1');

      expect(result.fetchedEntries.knowledge).toHaveLength(1);
      expect(result.fetchedEntries.knowledge[0].entry.id).toBe('knowledge-2');

      expect(result.fetchedEntries.experiences).toHaveLength(1);
      expect(result.fetchedEntries.experiences[0].entry.id).toBe('exp-1');
    });
  });
});
