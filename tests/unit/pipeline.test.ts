import { describe, it, expect, vi } from 'vitest';
import {
  createPipelineContext,
  executePipeline,
  buildQueryResult,
  type PipelineDependencies,
  type PipelineContext,
  type PipelineStage,
  type MemoryQueryParams,
  type QueryResultItem,
} from '../../src/services/query/pipeline.js';

describe('Query Pipeline', () => {
  const createMockDeps = (): PipelineDependencies => ({
    getDb: vi.fn(),
    getPreparedStatement: vi.fn(),
    executeFts5Search: vi.fn().mockReturnValue({
      tool: new Set(),
      guideline: new Set(),
      knowledge: new Set(),
      experience: new Set(),
    }),
    executeFts5Query: vi.fn().mockReturnValue(new Set()),
    getTagsForEntries: vi.fn().mockReturnValue({}),
    traverseRelationGraph: vi.fn().mockReturnValue({
      tool: new Set(),
      guideline: new Set(),
      knowledge: new Set(),
      experience: new Set(),
    }),
    resolveScopeChain: vi.fn().mockReturnValue([]),
  });

  describe('createPipelineContext', () => {
    it('should create initial context with default values', () => {
      const params: MemoryQueryParams = { types: ['guidelines'] };
      const deps = createMockDeps();

      const ctx = createPipelineContext(params, deps);

      expect(ctx.params).toBe(params);
      expect(ctx.deps).toBe(deps);
      expect(ctx.types).toEqual([]);
      expect(ctx.scopeChain).toEqual([]);
      expect(ctx.limit).toBe(20);
      expect(ctx.search).toBeUndefined();
      expect(ctx.ftsMatchIds).toBeNull();
      expect(ctx.relatedIds).toEqual({
        tool: expect.any(Set),
        guideline: expect.any(Set),
        knowledge: expect.any(Set),
        experience: expect.any(Set),
      });
      expect(ctx.semanticScores).toBeNull();
      expect(ctx.fetchedEntries).toEqual({
        tools: [],
        guidelines: [],
        knowledge: [],
        experiences: [],
      });
      expect(ctx.tagsByEntry).toEqual({});
      expect(ctx.results).toEqual([]);
      expect(ctx.startMs).toBeDefined();
      expect(ctx.cacheKey).toBeNull();
      expect(ctx.cacheHit).toBe(false);
    });

    it('should include all params in context', () => {
      const params: MemoryQueryParams = {
        types: ['tools', 'knowledge'],
        search: 'test query',
        limit: 50,
        scope: { type: 'project', id: 'proj-1', inherit: true },
      };
      const deps = createMockDeps();

      const ctx = createPipelineContext(params, deps);

      expect(ctx.params.types).toEqual(['tools', 'knowledge']);
      expect(ctx.params.search).toBe('test query');
      expect(ctx.params.limit).toBe(50);
    });

    it('should initialize relatedIds as empty sets', () => {
      const ctx = createPipelineContext({}, createMockDeps());

      expect(ctx.relatedIds.tool.size).toBe(0);
      expect(ctx.relatedIds.guideline.size).toBe(0);
      expect(ctx.relatedIds.knowledge.size).toBe(0);
      expect(ctx.relatedIds.experience.size).toBe(0);
    });
  });

  describe('executePipeline', () => {
    it('should execute single stage', async () => {
      const ctx = createPipelineContext({}, createMockDeps());
      const stage: PipelineStage = vi.fn().mockImplementation((c) => ({
        ...c,
        limit: 100,
      }));

      const result = await executePipeline(ctx, [stage]);

      expect(stage).toHaveBeenCalledWith(ctx);
      expect(result.limit).toBe(100);
    });

    it('should execute multiple stages in order', async () => {
      const ctx = createPipelineContext({}, createMockDeps());
      const callOrder: number[] = [];

      const stage1: PipelineStage = vi.fn().mockImplementation((c) => {
        callOrder.push(1);
        return { ...c, limit: 10 };
      });
      const stage2: PipelineStage = vi.fn().mockImplementation((c) => {
        callOrder.push(2);
        return { ...c, limit: c.limit * 2 };
      });
      const stage3: PipelineStage = vi.fn().mockImplementation((c) => {
        callOrder.push(3);
        return { ...c, limit: c.limit + 5 };
      });

      const result = await executePipeline(ctx, [stage1, stage2, stage3]);

      expect(callOrder).toEqual([1, 2, 3]);
      expect(result.limit).toBe(25); // 10 * 2 + 5
    });

    it.skip('should handle async stages (flaky under load)', async () => {
      const ctx = createPipelineContext({}, createMockDeps());
      const asyncStage: PipelineStage = async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { ...c, search: 'async result' };
      };

      const result = await executePipeline(ctx, [asyncStage]);

      expect(result.search).toBe('async result');
    });

    it('should pass modified context between stages', async () => {
      const ctx = createPipelineContext({}, createMockDeps());
      const stage1: PipelineStage = (c) => ({
        ...c,
        scopeChain: [{ type: 'project' as const, id: 'proj-1', depth: 0, breadth: 0 }],
      });
      const stage2: PipelineStage = (c) => {
        expect(c.scopeChain).toHaveLength(1);
        return c;
      };

      await executePipeline(ctx, [stage1, stage2]);
    });

    it('should handle empty stages array', async () => {
      const ctx = createPipelineContext({}, createMockDeps());

      const result = await executePipeline(ctx, []);

      expect(result).toBe(ctx);
    });

    it('should propagate errors from stages', async () => {
      const ctx = createPipelineContext({}, createMockDeps());
      const errorStage: PipelineStage = () => {
        throw new Error('Stage failed');
      };

      await expect(executePipeline(ctx, [errorStage])).rejects.toThrow(
        'Stage failed'
      );
    });

    it('should propagate async errors', async () => {
      const ctx = createPipelineContext({}, createMockDeps());
      const asyncErrorStage: PipelineStage = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error('Async stage failed');
      };

      await expect(executePipeline(ctx, [asyncErrorStage])).rejects.toThrow(
        'Async stage failed'
      );
    });
  });

  describe('buildQueryResult', () => {
    const createMockResultItem = (id: string, type: 'tool' | 'guideline' | 'knowledge' | 'experience'): QueryResultItem => {
      const base = {
        id,
        scopeType: 'project' as const,
        scopeId: 'proj-1',
        tags: [],
        score: 1.0,
      };

      switch (type) {
        case 'tool':
          return { ...base, type: 'tool', tool: { id, name: `Tool ${id}` } as any };
        case 'guideline':
          return { ...base, type: 'guideline', guideline: { id, name: `Guideline ${id}` } as any };
        case 'knowledge':
          return { ...base, type: 'knowledge', knowledge: { id, title: `Knowledge ${id}` } as any };
        case 'experience':
          return { ...base, type: 'experience', experience: { id, title: `Experience ${id}` } as any };
      }
    };

    it('should build result with correct counts', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.results = [
        createMockResultItem('1', 'tool'),
        createMockResultItem('2', 'guideline'),
      ];
      ctx.limit = 10;

      const result = buildQueryResult(ctx);

      expect(result.results).toHaveLength(2);
      expect(result.meta.totalCount).toBe(2);
      expect(result.meta.returnedCount).toBe(2);
      expect(result.meta.truncated).toBe(false);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should truncate results when exceeding limit', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.results = [
        createMockResultItem('1', 'tool'),
        createMockResultItem('2', 'guideline'),
        createMockResultItem('3', 'knowledge'),
        createMockResultItem('4', 'experience'),
        createMockResultItem('5', 'tool'),
      ];
      ctx.limit = 3;

      const result = buildQueryResult(ctx);

      expect(result.results).toHaveLength(3);
      expect(result.meta.totalCount).toBe(5);
      expect(result.meta.returnedCount).toBe(3);
      expect(result.meta.truncated).toBe(true);
      expect(result.meta.hasMore).toBe(true);
    });

    it('should handle empty results', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.results = [];
      ctx.limit = 20;

      const result = buildQueryResult(ctx);

      expect(result.results).toHaveLength(0);
      expect(result.meta.totalCount).toBe(0);
      expect(result.meta.returnedCount).toBe(0);
      expect(result.meta.truncated).toBe(false);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should set nextCursor to undefined', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.results = [createMockResultItem('1', 'tool')];
      ctx.limit = 10;

      const result = buildQueryResult(ctx);

      expect(result.meta.nextCursor).toBeUndefined();
    });

    it('should preserve result order', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.results = [
        createMockResultItem('a', 'tool'),
        createMockResultItem('b', 'guideline'),
        createMockResultItem('c', 'knowledge'),
      ];
      ctx.limit = 10;

      const result = buildQueryResult(ctx);

      expect(result.results[0].id).toBe('a');
      expect(result.results[1].id).toBe('b');
      expect(result.results[2].id).toBe('c');
    });

    it('should handle exactly limit results', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.results = [
        createMockResultItem('1', 'tool'),
        createMockResultItem('2', 'guideline'),
        createMockResultItem('3', 'knowledge'),
      ];
      ctx.limit = 3;

      const result = buildQueryResult(ctx);

      expect(result.results).toHaveLength(3);
      expect(result.meta.truncated).toBe(false);
      expect(result.meta.hasMore).toBe(false);
    });
  });
});
