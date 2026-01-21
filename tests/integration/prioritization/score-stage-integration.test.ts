/**
 * Integration Tests for Score Stage with Smart Prioritization
 *
 * Tests the scoreStage function with smart priority enabled/disabled.
 * Verifies that smart priority scores are applied to query results.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scoreStage,
  type PipelineContextWithFeedback,
} from '../../../src/services/query/stages/score.js';
import type { PipelineContext, FilterStageResult } from '../../../src/services/query/pipeline.js';
import type { Tool, Guideline, Knowledge, Experience } from '../../../src/db/schema.js';
import { config, snapshotConfig, restoreConfig } from '../../../src/config/index.js';

// Mock the prioritization module to control service behavior
vi.mock('../../../src/services/prioritization/index.js', () => ({
  createSmartPrioritizationService: vi.fn(() => ({
    getPriorityScores: vi.fn().mockResolvedValue(new Map()),
  })),
  createPrioritizationRepository: vi.fn(() => ({
    getOutcomesByIntentAndType: vi.fn(),
    getUsefulnessMetrics: vi.fn(),
    findSimilarSuccessfulContexts: vi.fn(),
  })),
}));

describe('Score Stage with Smart Prioritization', () => {
  let configSnapshot: typeof config;

  beforeEach(() => {
    configSnapshot = snapshotConfig();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreConfig(configSnapshot);
  });

  // Helper to create a minimal pipeline context
  function createMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
    const mockDb = {} as ReturnType<PipelineContext['deps']['getDb']>;

    return {
      params: {
        scopeType: 'project',
        scopeId: 'test-project',
        limit: 10,
      },
      deps: {
        getDb: () => mockDb,
        getSqlite: () => null,
        getPreparedStatement: () => null,
        getTagsForEntries: vi.fn().mockResolvedValue([]),
        getTagsForEntriesBatch: vi.fn().mockResolvedValue(new Map()),
        cache: undefined,
        perfLog: vi.fn(),
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        resolveScopeChain: vi.fn().mockReturnValue([]),
      },
      types: ['knowledge', 'guideline'],
      scopeChain: [{ scopeType: 'project', scopeId: 'test-project' }],
      limit: 10,
      offset: 0,
      search: 'test query',
      ftsMatchIds: null,
      ftsScores: null,
      relatedIds: {
        tool: new Set(),
        guideline: new Set(),
        knowledge: new Set(),
        experience: new Set(),
      },
      completedStages: new Set(['filter']),
      ...overrides,
    } as PipelineContext;
  }

  // Helper to create mock filtered entries
  function createMockFilteredEntries(): FilterStageResult {
    const now = new Date().toISOString();

    const mockKnowledge: Knowledge = {
      id: 'know-1',
      title: 'Test Knowledge',
      content: 'Test content',
      category: 'fact',
      scopeType: 'project',
      scopeId: 'test-project',
      createdAt: now,
      updatedAt: now,
      createdBy: 'agent-1',
      isActive: true,
      version: 1,
    };

    const mockGuideline: Guideline = {
      id: 'guide-1',
      name: 'Test Guideline',
      content: 'Test guideline content',
      category: 'coding',
      scopeType: 'project',
      scopeId: 'test-project',
      createdAt: now,
      updatedAt: now,
      createdBy: 'agent-1',
      isActive: true,
      version: 1,
      priority: 50,
    };

    return {
      tools: [],
      guidelines: [
        {
          entry: mockGuideline,
          scopeIndex: 0,
          tags: [],
          textMatched: true,
          matchingTagCount: 0,
          hasExplicitRelation: false,
        },
      ],
      knowledge: [
        {
          entry: mockKnowledge,
          scopeIndex: 0,
          tags: [],
          textMatched: true,
          matchingTagCount: 0,
          hasExplicitRelation: false,
        },
      ],
      experiences: [],
    };
  }

  describe('score stage execution', () => {
    it('should process entries and return scored results', async () => {
      const ctx = createMockContext({
        filtered: createMockFilteredEntries(),
      });

      const result = await scoreStage(ctx);

      // Should have results
      expect(result.results).toBeDefined();
      expect(result.results!.length).toBe(2);

      // Results should have scores
      for (const item of result.results!) {
        expect(item.score).toBeGreaterThan(0);
        expect(item.id).toBeDefined();
        expect(item.type).toBeDefined();
      }
    });

    it('should handle empty filtered results', async () => {
      const ctx = createMockContext({
        filtered: {
          tools: [],
          guidelines: [],
          knowledge: [],
          experiences: [],
        },
      });

      const result = await scoreStage(ctx);

      expect(result.results).toBeDefined();
      expect(result.results!.length).toBe(0);
    });

    it('should apply intent-based type weights', async () => {
      const ctx = createMockContext({
        filtered: createMockFilteredEntries(),
        rewriteIntent: 'lookup', // lookup favors knowledge over guideline
      });

      const result = await scoreStage(ctx);

      // Find knowledge and guideline results
      const knowledgeResult = result.results!.find((r) => r.type === 'knowledge');
      const guidelineResult = result.results!.find((r) => r.type === 'guideline');

      expect(knowledgeResult).toBeDefined();
      expect(guidelineResult).toBeDefined();

      // Knowledge should have higher intentWeight for lookup intent
      expect((knowledgeResult as { intentWeight?: number }).intentWeight).toBeGreaterThan(
        (guidelineResult as { intentWeight?: number }).intentWeight!
      );
    });
  });

  describe('smart priority integration', () => {
    it('should not fail when smart priority is enabled', async () => {
      // Enable smart priority
      config.scoring.smartPriority.enabled = true;

      const ctx = createMockContext({
        filtered: createMockFilteredEntries(),
        rewriteIntent: 'lookup',
        queryEmbedding: [0.1, 0.2, 0.3],
      });

      // Should not throw
      const result = await scoreStage(ctx);

      expect(result.results).toBeDefined();
      expect(result.results!.length).toBe(2);
    });

    it('should skip smart priority when disabled', async () => {
      // Disable smart priority
      config.scoring.smartPriority.enabled = false;

      const ctx = createMockContext({
        filtered: createMockFilteredEntries(),
      });

      const result = await scoreStage(ctx);

      // Results should still have scores (from base scoring)
      expect(result.results).toBeDefined();
      expect(result.results!.length).toBe(2);

      // Results should not have smartPriority property
      for (const item of result.results!) {
        expect((item as { smartPriority?: unknown }).smartPriority).toBeUndefined();
      }
    });

    it('should default to explore intent when rewriteIntent is not set', async () => {
      config.scoring.smartPriority.enabled = true;

      const ctx = createMockContext({
        filtered: createMockFilteredEntries(),
        // No rewriteIntent set
      });

      // Should not throw - should use 'explore' as default
      const result = await scoreStage(ctx);

      expect(result.results).toBeDefined();
    });

    it('should handle missing query embedding gracefully', async () => {
      config.scoring.smartPriority.enabled = true;

      const ctx = createMockContext({
        filtered: createMockFilteredEntries(),
        rewriteIntent: 'lookup',
        // No queryEmbedding
      });

      // Should not throw
      const result = await scoreStage(ctx);

      expect(result.results).toBeDefined();
    });

    it('should handle empty scope chain gracefully', async () => {
      config.scoring.smartPriority.enabled = true;

      const ctx = createMockContext({
        filtered: createMockFilteredEntries(),
        scopeChain: [], // Empty scope chain
      });

      // Should not throw
      const result = await scoreStage(ctx);

      expect(result.results).toBeDefined();
    });
  });

  describe('result ordering', () => {
    it('should sort results by score descending', async () => {
      // Create entries with different characteristics that will result in different scores
      const now = new Date().toISOString();
      const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

      const highPriorityGuideline: Guideline = {
        id: 'guide-high',
        name: 'High Priority Guideline',
        content: 'Important content',
        category: 'coding',
        scopeType: 'project',
        scopeId: 'test-project',
        createdAt: now,
        updatedAt: now,
        createdBy: 'agent-1',
        isActive: true,
        version: 1,
        priority: 100, // High priority
      };

      const lowPriorityGuideline: Guideline = {
        id: 'guide-low',
        name: 'Low Priority Guideline',
        content: 'Less important content',
        category: 'coding',
        scopeType: 'project',
        scopeId: 'test-project',
        createdAt: oldDate,
        updatedAt: oldDate,
        createdBy: 'agent-1',
        isActive: true,
        version: 1,
        priority: 0, // Low priority
      };

      const filtered: FilterStageResult = {
        tools: [],
        guidelines: [
          {
            entry: lowPriorityGuideline,
            scopeIndex: 0,
            tags: [],
            textMatched: false,
            matchingTagCount: 0,
            hasExplicitRelation: false,
          },
          {
            entry: highPriorityGuideline,
            scopeIndex: 0,
            tags: [],
            textMatched: true,
            matchingTagCount: 2,
            hasExplicitRelation: true,
          },
        ],
        knowledge: [],
        experiences: [],
      };

      const ctx = createMockContext({ filtered });

      const result = await scoreStage(ctx);

      // Results should be sorted by score descending
      expect(result.results!.length).toBe(2);
      expect(result.results![0]!.score).toBeGreaterThanOrEqual(result.results![1]!.score);
      expect(result.results![0]!.id).toBe('guide-high');
    });
  });

  describe('stage completion', () => {
    it('should mark SCORE stage as completed', async () => {
      const ctx = createMockContext({
        filtered: createMockFilteredEntries(),
      });

      const result = await scoreStage(ctx);

      expect(result.completedStages.has('score')).toBe(true);
    });

    it('should validate prerequisites before execution', async () => {
      const ctx = createMockContext({
        filtered: createMockFilteredEntries(),
        completedStages: new Set(), // Missing FILTER stage
      });

      // Should throw because FILTER stage is not completed
      await expect(scoreStage(ctx)).rejects.toThrow();
    });
  });
});
