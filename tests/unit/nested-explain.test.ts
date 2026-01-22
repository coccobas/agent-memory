import { describe, it, expect } from 'vitest';
import type {
  NestedExplainResult,
  NestedExplainRequest,
} from '../../src/services/explain/types.js';
import type {
  PipelineTelemetry,
  PipelineContext,
  QueryResultItem,
} from '../../src/services/query/pipeline.js';

import { explainQueryNested } from '../../src/services/explain/explain.service.js';

function createMockTelemetry(overrides: Partial<PipelineTelemetry> = {}): PipelineTelemetry {
  return {
    totalMs: 150,
    stages: [
      { name: 'resolve', startMs: 0, durationMs: 5 },
      { name: 'strategy', startMs: 5, durationMs: 2 },
      { name: 'fts', startMs: 7, durationMs: 30 },
      { name: 'semantic', startMs: 37, durationMs: 50 },
      { name: 'fetch', startMs: 87, durationMs: 20 },
      { name: 'filter', startMs: 107, durationMs: 10 },
      { name: 'score', startMs: 117, durationMs: 25 },
      { name: 'rerank', startMs: 142, durationMs: 8 },
    ],
    decisions: {
      searchStrategy: 'hybrid',
      usedSemanticSearch: true,
      usedFts5: true,
      cacheHit: false,
    },
    scoring: {
      totalCandidates: 100,
      afterLightScoring: 50,
      afterFullScoring: 20,
      topScores: [0.95, 0.88, 0.82, 0.75, 0.71],
    },
    ...overrides,
  };
}

function createMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    params: { search: 'test query' },
    deps: {} as any,
    types: ['guideline', 'knowledge'],
    scopeChain: [
      { scopeType: 'project', scopeId: 'proj-123' },
      { scopeType: 'global', scopeId: null },
    ],
    limit: 20,
    offset: 0,
    search: 'test query',
    searchStrategy: 'hybrid',
    ftsMatchIds: {
      tool: new Set(),
      guideline: new Set(['g1', 'g2']),
      knowledge: new Set(['k1']),
      experience: new Set(),
    },
    ftsScores: new Map([
      ['g1', 0.9],
      ['g2', 0.7],
      ['k1', 0.8],
    ]),
    semanticScores: new Map([
      ['g1', 0.85],
      ['g2', 0.75],
      ['k1', 0.9],
    ]),
    relatedIds: {
      tool: new Set(),
      guideline: new Set(),
      knowledge: new Set(),
      experience: new Set(),
    },
    fetchedEntries: { tools: [], guidelines: [], knowledge: [], experiences: [] },
    tagsByEntry: {},
    results: [],
    startMs: Date.now() - 150,
    cacheKey: null,
    cacheHit: false,
    ...overrides,
  } as PipelineContext;
}

function createMockResults(): QueryResultItem[] {
  return [
    {
      type: 'guideline',
      id: 'g1',
      scopeType: 'project',
      scopeId: 'proj-123',
      tags: [],
      score: 0.92,
      guideline: { id: 'g1', name: 'Test Guideline', content: 'content' } as any,
    },
    {
      type: 'knowledge',
      id: 'k1',
      scopeType: 'project',
      scopeId: 'proj-123',
      tags: [],
      score: 0.88,
      knowledge: { id: 'k1', title: 'Test Knowledge', content: 'content' } as any,
    },
  ];
}

describe('explainQueryNested', () => {
  describe('output structure', () => {
    it('should return nested explain result with all required top-level keys', () => {
      const request: NestedExplainRequest = {
        telemetry: createMockTelemetry(),
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('stages');
      expect(result).toHaveProperty('timing');
      expect(result).toHaveProperty('cacheHit');
    });

    it('should include stage-by-stage breakdowns', () => {
      const request: NestedExplainRequest = {
        telemetry: createMockTelemetry(),
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.stages).toBeDefined();
      expect(result.stages.resolve).toBeDefined();
      expect(result.stages.strategy).toBeDefined();
      expect(result.stages.fts).toBeDefined();
      expect(result.stages.semantic).toBeDefined();
      expect(result.stages.fetch).toBeDefined();
      expect(result.stages.filter).toBeDefined();
      expect(result.stages.score).toBeDefined();
    });

    it('should include timing breakdown with percentages', () => {
      const request: NestedExplainRequest = {
        telemetry: createMockTelemetry(),
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.timing.totalMs).toBeGreaterThan(0);
      expect(result.timing.breakdown).toBeInstanceOf(Array);
      expect(result.timing.breakdown.length).toBeGreaterThan(0);

      const firstBreakdown = result.timing.breakdown[0];
      expect(firstBreakdown).toHaveProperty('stage');
      expect(firstBreakdown).toHaveProperty('durationMs');
      expect(firstBreakdown).toHaveProperty('percent');
    });
  });

  describe('resolve stage explain', () => {
    it('should include resolved scope chain', () => {
      const request: NestedExplainRequest = {
        telemetry: createMockTelemetry(),
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.stages.resolve?.scopeChain).toEqual([
        { scopeType: 'project', scopeId: 'proj-123' },
        { scopeType: 'global', scopeId: null },
      ]);
      expect(result.stages.resolve?.types).toContain('guideline');
      expect(result.stages.resolve?.types).toContain('knowledge');
    });
  });

  describe('strategy stage explain', () => {
    it('should include selected strategy and reason', () => {
      const request: NestedExplainRequest = {
        telemetry: createMockTelemetry(),
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.stages.strategy?.strategy).toBe('hybrid');
      expect(result.stages.strategy?.reason).toBeDefined();
      expect(typeof result.stages.strategy?.reason).toBe('string');
    });
  });

  describe('FTS stage explain', () => {
    it('should include FTS usage and match count', () => {
      const request: NestedExplainRequest = {
        telemetry: createMockTelemetry(),
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.stages.fts?.used).toBe(true);
      expect(result.stages.fts?.matchCount).toBeGreaterThan(0);
      expect(result.stages.fts?.topScores).toBeInstanceOf(Array);
    });
  });

  describe('semantic stage explain', () => {
    it('should include semantic usage and scores', () => {
      const request: NestedExplainRequest = {
        telemetry: createMockTelemetry(),
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.stages.semantic?.used).toBe(true);
      expect(result.stages.semantic?.matchCount).toBeGreaterThan(0);
      expect(result.stages.semantic?.topScores).toBeInstanceOf(Array);
    });
  });

  describe('score stage explain', () => {
    it('should include score factors and top entries with component breakdowns', () => {
      const request: NestedExplainRequest = {
        telemetry: createMockTelemetry(),
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.stages.score?.factors).toBeInstanceOf(Array);
      expect(result.stages.score?.factors.length).toBeGreaterThan(0);
      expect(result.stages.score?.scoreRange).toHaveProperty('min');
      expect(result.stages.score?.scoreRange).toHaveProperty('max');
      expect(result.stages.score?.topEntries).toBeInstanceOf(Array);

      if (result.stages.score?.topEntries?.length) {
        const topEntry = result.stages.score.topEntries[0];
        expect(topEntry).toHaveProperty('id');
        expect(topEntry).toHaveProperty('type');
        expect(topEntry).toHaveProperty('components');
        expect(topEntry.components).toHaveProperty('final');
      }
    });
  });

  describe('cache hit handling', () => {
    it('should reflect cache hit status', () => {
      const telemetry = createMockTelemetry({ decisions: { cacheHit: true } });
      const context = createMockContext({ cacheHit: true });
      const request: NestedExplainRequest = {
        telemetry,
        context,
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.cacheHit).toBe(true);
    });

    it('should reflect cache miss status', () => {
      const request: NestedExplainRequest = {
        telemetry: createMockTelemetry(),
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.cacheHit).toBe(false);
    });
  });

  describe('bottleneck detection', () => {
    it('should identify bottleneck stage when one stage takes >30% of time', () => {
      const telemetry = createMockTelemetry({
        totalMs: 100,
        stages: [
          { name: 'resolve', startMs: 0, durationMs: 5 },
          { name: 'semantic', startMs: 5, durationMs: 60 },
          { name: 'score', startMs: 65, durationMs: 35 },
        ],
      });
      const request: NestedExplainRequest = {
        telemetry,
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.timing.bottleneck).toBe('semantic');
    });

    it('should return null bottleneck when no stage dominates', () => {
      const telemetry = createMockTelemetry({
        totalMs: 100,
        stages: [
          { name: 'resolve', startMs: 0, durationMs: 20 },
          { name: 'semantic', startMs: 20, durationMs: 25 },
          { name: 'fts', startMs: 45, durationMs: 25 },
          { name: 'score', startMs: 70, durationMs: 30 },
        ],
      });
      const request: NestedExplainRequest = {
        telemetry,
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(result.timing.bottleneck).toBeNull();
    });
  });

  describe('summary generation', () => {
    it('should generate human-readable summary', () => {
      const request: NestedExplainRequest = {
        telemetry: createMockTelemetry(),
        context: createMockContext(),
        results: createMockResults(),
        query: 'test query',
      };

      const result = explainQueryNested(request);

      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary).toMatch(/found|result|search/i);
    });
  });
});
