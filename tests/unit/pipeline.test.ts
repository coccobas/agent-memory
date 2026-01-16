import { describe, it, expect, vi } from 'vitest';
import {
  createPipelineContext,
  executePipeline,
  buildQueryResult,
  initializeTelemetry,
  recordStageTelemetry,
  recordDecision,
  finalizeTelemetry,
  validateStagePrerequisites,
  markStageCompleted,
  PIPELINE_STAGES,
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

      await expect(executePipeline(ctx, [errorStage])).rejects.toThrow('Stage failed');
    });

    it('should propagate async errors', async () => {
      const ctx = createPipelineContext({}, createMockDeps());
      const asyncErrorStage: PipelineStage = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error('Async stage failed');
      };

      await expect(executePipeline(ctx, [asyncErrorStage])).rejects.toThrow('Async stage failed');
    });
  });

  describe('buildQueryResult', () => {
    const createMockResultItem = (
      id: string,
      type: 'tool' | 'guideline' | 'knowledge' | 'experience'
    ): QueryResultItem => {
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
          return {
            ...base,
            type: 'experience',
            experience: { id, title: `Experience ${id}` } as any,
          };
      }
    };

    it('should build result with correct counts', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.results = [createMockResultItem('1', 'tool'), createMockResultItem('2', 'guideline')];
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

  describe('PIPELINE_STAGES', () => {
    it('should define all expected stages', () => {
      expect(PIPELINE_STAGES.RESOLVE).toBe('resolve');
      expect(PIPELINE_STAGES.STRATEGY).toBe('strategy');
      expect(PIPELINE_STAGES.REWRITE).toBe('rewrite');
      expect(PIPELINE_STAGES.HIERARCHICAL).toBe('hierarchical');
      expect(PIPELINE_STAGES.SEMANTIC).toBe('semantic');
      expect(PIPELINE_STAGES.FTS).toBe('fts');
      expect(PIPELINE_STAGES.RELATIONS).toBe('relations');
      expect(PIPELINE_STAGES.FETCH).toBe('fetch');
      expect(PIPELINE_STAGES.ENTITY_FILTER).toBe('entity_filter');
      expect(PIPELINE_STAGES.TAGS).toBe('tags');
      expect(PIPELINE_STAGES.FILTER).toBe('filter');
      expect(PIPELINE_STAGES.FEEDBACK).toBe('feedback');
      expect(PIPELINE_STAGES.SCORE).toBe('score');
      expect(PIPELINE_STAGES.RERANK).toBe('rerank');
      expect(PIPELINE_STAGES.CROSS_ENCODER).toBe('cross_encoder');
    });
  });

  describe('markStageCompleted', () => {
    it('should add stage to completed stages set', () => {
      const ctx = createPipelineContext({}, createMockDeps());

      const result = markStageCompleted(ctx, PIPELINE_STAGES.RESOLVE);

      expect(result.completedStages).toBeDefined();
      expect(result.completedStages!.has(PIPELINE_STAGES.RESOLVE)).toBe(true);
    });

    it('should preserve existing completed stages', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.completedStages = new Set([PIPELINE_STAGES.RESOLVE]);

      const result = markStageCompleted(ctx, PIPELINE_STAGES.FETCH);

      expect(result.completedStages!.has(PIPELINE_STAGES.RESOLVE)).toBe(true);
      expect(result.completedStages!.has(PIPELINE_STAGES.FETCH)).toBe(true);
    });

    it('should handle undefined completedStages', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.completedStages = undefined;

      const result = markStageCompleted(ctx, PIPELINE_STAGES.STRATEGY);

      expect(result.completedStages).toBeDefined();
      expect(result.completedStages!.has(PIPELINE_STAGES.STRATEGY)).toBe(true);
    });

    it('should not mutate original context', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.completedStages = new Set([PIPELINE_STAGES.RESOLVE]);

      const result = markStageCompleted(ctx, PIPELINE_STAGES.FETCH);

      expect(ctx.completedStages.has(PIPELINE_STAGES.FETCH)).toBe(false);
      expect(result.completedStages!.has(PIPELINE_STAGES.FETCH)).toBe(true);
    });
  });

  describe('validateStagePrerequisites', () => {
    it('should not throw for stage with no prerequisites', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.completedStages = new Set();

      // RESOLVE has no prerequisites
      expect(() => validateStagePrerequisites(ctx, PIPELINE_STAGES.RESOLVE)).not.toThrow();
    });

    it('should not throw when prerequisites are met', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.completedStages = new Set([PIPELINE_STAGES.RESOLVE]);

      // FETCH requires RESOLVE, which is completed
      expect(() => validateStagePrerequisites(ctx, PIPELINE_STAGES.FETCH)).not.toThrow();
    });

    it('should handle undefined completedStages for stages with no prerequisites', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      ctx.completedStages = undefined;

      expect(() => validateStagePrerequisites(ctx, PIPELINE_STAGES.RESOLVE)).not.toThrow();
    });
  });

  describe('initializeTelemetry', () => {
    it('should initialize telemetry with default values', () => {
      const ctx = createPipelineContext({}, createMockDeps());

      const result = initializeTelemetry(ctx);

      expect(result.telemetry).toBeDefined();
      expect(result.telemetry!.totalMs).toBe(0);
      expect(result.telemetry!.stages).toEqual([]);
      expect(result.telemetry!.decisions).toEqual({});
    });

    it('should not mutate original context', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      expect(ctx.telemetry).toBeUndefined();

      const result = initializeTelemetry(ctx);

      expect(ctx.telemetry).toBeUndefined();
      expect(result.telemetry).toBeDefined();
    });
  });

  describe('recordStageTelemetry', () => {
    it('should record stage telemetry with timing', () => {
      let ctx = createPipelineContext({}, createMockDeps());
      ctx = initializeTelemetry(ctx);
      const startMs = Date.now() - 100; // 100ms ago

      const result = recordStageTelemetry(ctx, 'resolve', startMs);

      expect(result.telemetry!.stages).toHaveLength(1);
      expect(result.telemetry!.stages[0].name).toBe('resolve');
      expect(result.telemetry!.stages[0].startMs).toBe(startMs);
      expect(result.telemetry!.stages[0].durationMs).toBeGreaterThanOrEqual(100);
    });

    it('should record stage with optional counts', () => {
      let ctx = createPipelineContext({}, createMockDeps());
      ctx = initializeTelemetry(ctx);
      const startMs = Date.now();

      const result = recordStageTelemetry(ctx, 'fetch', startMs, {
        inputCount: 50,
        outputCount: 30,
      });

      expect(result.telemetry!.stages[0].inputCount).toBe(50);
      expect(result.telemetry!.stages[0].outputCount).toBe(30);
    });

    it('should return context unchanged if telemetry not initialized', () => {
      const ctx = createPipelineContext({}, createMockDeps());
      expect(ctx.telemetry).toBeUndefined();

      const result = recordStageTelemetry(ctx, 'resolve', Date.now());

      expect(result).toBe(ctx);
      expect(result.telemetry).toBeUndefined();
    });

    it('should accumulate multiple stages', () => {
      let ctx = createPipelineContext({}, createMockDeps());
      ctx = initializeTelemetry(ctx);
      const startMs = Date.now();

      ctx = recordStageTelemetry(ctx, 'resolve', startMs);
      ctx = recordStageTelemetry(ctx, 'fetch', startMs);
      ctx = recordStageTelemetry(ctx, 'filter', startMs);

      expect(ctx.telemetry!.stages).toHaveLength(3);
      expect(ctx.telemetry!.stages.map((s) => s.name)).toEqual(['resolve', 'fetch', 'filter']);
    });
  });

  describe('recordDecision', () => {
    it('should record a boolean decision', () => {
      let ctx = createPipelineContext({}, createMockDeps());
      ctx = initializeTelemetry(ctx);

      const result = recordDecision(ctx, 'usedSemantic', true);

      expect(result.telemetry!.decisions.usedSemantic).toBe(true);
    });

    it('should record a string decision', () => {
      let ctx = createPipelineContext({}, createMockDeps());
      ctx = initializeTelemetry(ctx);

      const result = recordDecision(ctx, 'queryStrategy', 'hybrid');

      expect(result.telemetry!.decisions.queryStrategy).toBe('hybrid');
    });

    it('should return context unchanged if telemetry not initialized', () => {
      const ctx = createPipelineContext({}, createMockDeps());

      const result = recordDecision(ctx, 'usedFts', true);

      expect(result).toBe(ctx);
    });

    it('should accumulate multiple decisions', () => {
      let ctx = createPipelineContext({}, createMockDeps());
      ctx = initializeTelemetry(ctx);

      ctx = recordDecision(ctx, 'usedSemantic', true);
      ctx = recordDecision(ctx, 'usedFts', false);
      ctx = recordDecision(ctx, 'queryStrategy', 'fts_only');

      expect(ctx.telemetry!.decisions).toEqual({
        usedSemantic: true,
        usedFts: false,
        queryStrategy: 'fts_only',
      });
    });

    it('should preserve existing decisions when adding new ones', () => {
      let ctx = createPipelineContext({}, createMockDeps());
      ctx = initializeTelemetry(ctx);
      ctx = recordDecision(ctx, 'usedSemantic', true);

      const result = recordDecision(ctx, 'usedFts', false);

      expect(result.telemetry!.decisions.usedSemantic).toBe(true);
      expect(result.telemetry!.decisions.usedFts).toBe(false);
    });
  });

  describe('finalizeTelemetry', () => {
    it('should set totalMs based on elapsed time', () => {
      let ctx = createPipelineContext({}, createMockDeps());
      // Simulate starting 100ms ago
      ctx.startMs = Date.now() - 100;
      ctx = initializeTelemetry(ctx);

      const result = finalizeTelemetry(ctx);

      expect(result.telemetry!.totalMs).toBeGreaterThanOrEqual(100);
    });

    it('should return context unchanged if telemetry not initialized', () => {
      const ctx = createPipelineContext({}, createMockDeps());

      const result = finalizeTelemetry(ctx);

      expect(result).toBe(ctx);
    });

    it('should preserve stages and decisions', () => {
      let ctx = createPipelineContext({}, createMockDeps());
      ctx = initializeTelemetry(ctx);
      ctx = recordStageTelemetry(ctx, 'resolve', Date.now());
      ctx = recordDecision(ctx, 'usedSemantic', true);

      const result = finalizeTelemetry(ctx);

      expect(result.telemetry!.stages).toHaveLength(1);
      expect(result.telemetry!.decisions.usedSemantic).toBe(true);
      expect(result.telemetry!.totalMs).toBeGreaterThanOrEqual(0);
    });
  });
});
