/**
 * Unit tests for Entity Filter Stage
 *
 * Tests the entity-aware retrieval filtering and score boosting:
 * - Entity extraction from search queries
 * - Entry filtering by entity matches
 * - Score boosting for matched entries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createEntityFilterStage,
  getEntityMatchBoost,
  hasEntityMatch,
  filterByEntityMatch,
  getEntityFilterStats,
  DEFAULT_ENTITY_FILTER_CONFIG,
  type EntityFilterConfig,
  type EntityFilterPipelineContext,
} from '../../../src/services/query/stages/entity-filter.js';
import type { PipelineContext } from '../../../src/services/query/pipeline.js';
import { EntityIndex } from '../../../src/services/query/entity-index.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Create a minimal pipeline context for testing
 */
function createTestContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    params: {},
    deps: {
      getDb: vi.fn(),
      getPreparedStatement: vi.fn(),
      executeFts5Search: vi.fn(),
      executeFts5Query: vi.fn(),
      getTagsForEntries: vi.fn(),
      traverseRelationGraph: vi.fn(),
      resolveScopeChain: vi.fn(),
    },
    types: ['tools', 'guidelines', 'knowledge'],
    scopeChain: [],
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

/**
 * Create a mock EntityIndex for testing
 */
function createMockEntityIndex(lookupResults: Map<string, number> = new Map()): EntityIndex {
  const index = new EntityIndex();

  // Mock the lookupMultiple method
  vi.spyOn(index, 'lookupMultiple').mockImplementation(() => lookupResults);

  return index;
}

// =============================================================================
// ENTITY FILTER STAGE TESTS
// =============================================================================

describe('EntityFilterStage', () => {
  describe('createEntityFilterStage', () => {
    it('should return a function', () => {
      const index = createMockEntityIndex();
      const stage = createEntityFilterStage(index);
      expect(typeof stage).toBe('function');
    });

    it('should skip filtering when disabled', () => {
      const index = createMockEntityIndex();
      const stage = createEntityFilterStage(index, {
        ...DEFAULT_ENTITY_FILTER_CONFIG,
        enabled: false,
      });

      const ctx = createTestContext({ search: 'query with /src/file.ts' });
      const result = stage(ctx);

      // Should return context unchanged
      expect(result).toEqual(ctx);
      expect((result as EntityFilterPipelineContext).entityFilter).toBeUndefined();
    });

    it('should skip filtering when no search query', () => {
      const index = createMockEntityIndex();
      const stage = createEntityFilterStage(index);

      const ctx = createTestContext({ search: undefined });
      const result = stage(ctx);

      expect((result as EntityFilterPipelineContext).entityFilter).toBeUndefined();
    });

    it('should skip filtering when no entities extracted', () => {
      const index = createMockEntityIndex();
      const stage = createEntityFilterStage(index);

      // Query with no extractable entities
      const ctx = createTestContext({ search: 'simple text query' });
      const result = stage(ctx);

      // No entities = no filter applied
      expect((result as EntityFilterPipelineContext).entityFilter).toBeUndefined();
    });

    it('should extract entities and create filter result', () => {
      const lookupResults = new Map([
        ['entry-1', 2],
        ['entry-2', 1],
      ]);
      const index = createMockEntityIndex(lookupResults);
      const stage = createEntityFilterStage(index);

      // Query with extractable entities (file path + function name)
      const ctx = createTestContext({ search: 'Check /src/services/query.ts executeQuery' });
      const result = stage(ctx) as EntityFilterPipelineContext;

      expect(result.entityFilter).toBeDefined();
      expect(result.entityFilter?.filterApplied).toBe(true);
      expect(result.entityFilter?.matchedEntryIds.size).toBe(2);
      expect(result.entityFilter?.matchedEntryIds.has('entry-1')).toBe(true);
      expect(result.entityFilter?.matchedEntryIds.has('entry-2')).toBe(true);
    });

    it('should respect minEntitiesForFilter config', () => {
      const lookupResults = new Map([['entry-1', 1]]);
      const index = createMockEntityIndex(lookupResults);

      // Require at least 2 entities
      const config: EntityFilterConfig = {
        ...DEFAULT_ENTITY_FILTER_CONFIG,
        minEntitiesForFilter: 2,
      };
      const stage = createEntityFilterStage(index, config);

      // Query with only one extractable entity (lowercase words won't match FUNCTION_NAME pattern)
      const ctx = createTestContext({ search: 'where is /src/file.ts' });
      const result = stage(ctx);

      // Should skip filtering due to minEntitiesForFilter
      expect((result as EntityFilterPipelineContext).entityFilter).toBeUndefined();
    });

    it('should set filterApplied false when no matches found', () => {
      // Empty lookup results
      const index = createMockEntityIndex(new Map());
      const stage = createEntityFilterStage(index);

      const ctx = createTestContext({ search: 'Check /src/services/query.ts' });
      const result = stage(ctx) as EntityFilterPipelineContext;

      // Entities extracted but no matches
      if (result.entityFilter) {
        expect(result.entityFilter.filterApplied).toBe(false);
        expect(result.entityFilter.matchedEntryIds.size).toBe(0);
      }
    });
  });

  describe('getEntityMatchBoost', () => {
    it('should return 0 when no entity filter applied', () => {
      const ctx = createTestContext() as EntityFilterPipelineContext;
      const boost = getEntityMatchBoost('entry-1', ctx);
      expect(boost).toBe(0);
    });

    it('should return 0 when entry has no matches', () => {
      const ctx: EntityFilterPipelineContext = {
        ...createTestContext(),
        entityFilter: {
          extractedEntities: [
            { type: 'FILE_PATH', value: '/src/file.ts', normalizedValue: '/src/file.ts' },
          ],
          matchedEntryIds: new Set(['entry-2']),
          matchCountByEntry: new Map([['entry-2', 1]]),
          entityCount: 1,
          filterApplied: true,
        },
      };

      const boost = getEntityMatchBoost('entry-1', ctx);
      expect(boost).toBe(0);
    });

    it('should return exactMatchBoost for full entity match', () => {
      const ctx: EntityFilterPipelineContext = {
        ...createTestContext(),
        entityFilter: {
          extractedEntities: [
            { type: 'FILE_PATH', value: '/src/file.ts', normalizedValue: '/src/file.ts' },
            { type: 'FUNCTION_NAME', value: 'executeQuery', normalizedValue: 'executequery' },
          ],
          matchedEntryIds: new Set(['entry-1']),
          matchCountByEntry: new Map([['entry-1', 2]]), // Matches both entities
          entityCount: 2,
          filterApplied: true,
        },
      };

      const boost = getEntityMatchBoost('entry-1', ctx);
      expect(boost).toBe(DEFAULT_ENTITY_FILTER_CONFIG.exactMatchBoost);
    });

    it('should return scaled partialMatchBoost for partial match', () => {
      const ctx: EntityFilterPipelineContext = {
        ...createTestContext(),
        entityFilter: {
          extractedEntities: [
            { type: 'FILE_PATH', value: '/src/file.ts', normalizedValue: '/src/file.ts' },
            { type: 'FUNCTION_NAME', value: 'executeQuery', normalizedValue: 'executequery' },
          ],
          matchedEntryIds: new Set(['entry-1']),
          matchCountByEntry: new Map([['entry-1', 1]]), // Matches only 1 of 2 entities
          entityCount: 2,
          filterApplied: true,
        },
      };

      const boost = getEntityMatchBoost('entry-1', ctx);
      // Should be partialMatchBoost * (1/2) = 10 * 0.5 = 5
      expect(boost).toBe(Math.round(DEFAULT_ENTITY_FILTER_CONFIG.partialMatchBoost * 0.5));
    });

    it('should respect custom config values', () => {
      const customConfig: EntityFilterConfig = {
        enabled: true,
        exactMatchBoost: 50,
        partialMatchBoost: 20,
        minEntitiesForFilter: 0,
      };

      const ctx: EntityFilterPipelineContext = {
        ...createTestContext(),
        entityFilter: {
          extractedEntities: [
            { type: 'FILE_PATH', value: '/src/file.ts', normalizedValue: '/src/file.ts' },
          ],
          matchedEntryIds: new Set(['entry-1']),
          matchCountByEntry: new Map([['entry-1', 1]]),
          entityCount: 1,
          filterApplied: true,
        },
      };

      const boost = getEntityMatchBoost('entry-1', ctx, customConfig);
      expect(boost).toBe(50); // Full match = exactMatchBoost
    });
  });

  describe('hasEntityMatch', () => {
    it('should return false when no entity filter', () => {
      const ctx = createTestContext() as EntityFilterPipelineContext;
      expect(hasEntityMatch('entry-1', ctx)).toBe(false);
    });

    it('should return true when entry is in matched set', () => {
      const ctx: EntityFilterPipelineContext = {
        ...createTestContext(),
        entityFilter: {
          extractedEntities: [],
          matchedEntryIds: new Set(['entry-1', 'entry-2']),
          matchCountByEntry: new Map(),
          entityCount: 1,
          filterApplied: true,
        },
      };

      expect(hasEntityMatch('entry-1', ctx)).toBe(true);
      expect(hasEntityMatch('entry-2', ctx)).toBe(true);
    });

    it('should return false when entry is not in matched set', () => {
      const ctx: EntityFilterPipelineContext = {
        ...createTestContext(),
        entityFilter: {
          extractedEntities: [],
          matchedEntryIds: new Set(['entry-1']),
          matchCountByEntry: new Map(),
          entityCount: 1,
          filterApplied: true,
        },
      };

      expect(hasEntityMatch('entry-2', ctx)).toBe(false);
    });
  });

  describe('filterByEntityMatch', () => {
    it('should return all entries when no entity filter', () => {
      const ctx = createTestContext() as EntityFilterPipelineContext;
      const entryIds = ['entry-1', 'entry-2', 'entry-3'];

      const filtered = filterByEntityMatch(entryIds, ctx);
      expect(filtered).toEqual(entryIds);
    });

    it('should return all entries when filter not applied', () => {
      const ctx: EntityFilterPipelineContext = {
        ...createTestContext(),
        entityFilter: {
          extractedEntities: [],
          matchedEntryIds: new Set(),
          matchCountByEntry: new Map(),
          entityCount: 0,
          filterApplied: false,
        },
      };

      const entryIds = ['entry-1', 'entry-2', 'entry-3'];
      const filtered = filterByEntityMatch(entryIds, ctx);
      expect(filtered).toEqual(entryIds);
    });

    it('should filter to only matching entries', () => {
      const ctx: EntityFilterPipelineContext = {
        ...createTestContext(),
        entityFilter: {
          extractedEntities: [],
          matchedEntryIds: new Set(['entry-1', 'entry-3']),
          matchCountByEntry: new Map(),
          entityCount: 1,
          filterApplied: true,
        },
      };

      const entryIds = ['entry-1', 'entry-2', 'entry-3', 'entry-4'];
      const filtered = filterByEntityMatch(entryIds, ctx);

      expect(filtered).toHaveLength(2);
      expect(filtered).toContain('entry-1');
      expect(filtered).toContain('entry-3');
      expect(filtered).not.toContain('entry-2');
      expect(filtered).not.toContain('entry-4');
    });
  });

  describe('getEntityFilterStats', () => {
    it('should return null when no entity filter', () => {
      const ctx = createTestContext() as EntityFilterPipelineContext;
      expect(getEntityFilterStats(ctx)).toBeNull();
    });

    it('should return statistics when entity filter exists', () => {
      const ctx: EntityFilterPipelineContext = {
        ...createTestContext(),
        entityFilter: {
          extractedEntities: [
            { type: 'FILE_PATH', value: '/src/file.ts', normalizedValue: '/src/file.ts' },
            { type: 'FUNCTION_NAME', value: 'executeQuery', normalizedValue: 'executequery' },
            { type: 'FILE_PATH', value: '/src/other.ts', normalizedValue: '/src/other.ts' },
          ],
          matchedEntryIds: new Set(['entry-1', 'entry-2']),
          matchCountByEntry: new Map(),
          entityCount: 3,
          filterApplied: true,
        },
      };

      const stats = getEntityFilterStats(ctx);

      expect(stats).not.toBeNull();
      expect(stats?.entityCount).toBe(3);
      expect(stats?.matchedEntryCount).toBe(2);
      expect(stats?.filterApplied).toBe(true);
      expect(stats?.entityTypes).toContain('FILE_PATH');
      expect(stats?.entityTypes).toContain('FUNCTION_NAME');
      // Deduplicated entity types
      expect(stats?.entityTypes).toHaveLength(2);
    });

    it('should handle empty filter result', () => {
      const ctx: EntityFilterPipelineContext = {
        ...createTestContext(),
        entityFilter: {
          extractedEntities: [],
          matchedEntryIds: new Set(),
          matchCountByEntry: new Map(),
          entityCount: 0,
          filterApplied: false,
        },
      };

      const stats = getEntityFilterStats(ctx);

      expect(stats).not.toBeNull();
      expect(stats?.entityCount).toBe(0);
      expect(stats?.matchedEntryCount).toBe(0);
      expect(stats?.filterApplied).toBe(false);
      expect(stats?.entityTypes).toHaveLength(0);
    });
  });
});

// =============================================================================
// DEFAULT CONFIG TESTS
// =============================================================================

describe('DEFAULT_ENTITY_FILTER_CONFIG', () => {
  it('should have reasonable default values', () => {
    expect(DEFAULT_ENTITY_FILTER_CONFIG.enabled).toBe(true);
    expect(DEFAULT_ENTITY_FILTER_CONFIG.exactMatchBoost).toBe(25);
    expect(DEFAULT_ENTITY_FILTER_CONFIG.partialMatchBoost).toBe(10);
    expect(DEFAULT_ENTITY_FILTER_CONFIG.minEntitiesForFilter).toBe(0);
  });
});
