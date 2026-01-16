/**
 * Unit tests for FTS stage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ftsStage } from '../../src/services/query/stages/fts.js';
import type {
  PipelineContext,
  QueryEntryType,
  QueryType,
} from '../../src/services/query/pipeline.js';

describe('FTS Stage', () => {
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  let mockExecuteFts5Search: ReturnType<typeof vi.fn>;
  let mockExecuteFts5SearchWithScores: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockExecuteFts5Search = vi.fn().mockReturnValue({
      tool: new Set<string>(),
      guideline: new Set<string>(),
      knowledge: new Set<string>(),
      experience: new Set<string>(),
    });

    mockExecuteFts5SearchWithScores = vi.fn().mockReturnValue({
      tool: [] as Array<{ id: string; score: number }>,
      guideline: [] as Array<{ id: string; score: number }>,
      knowledge: [] as Array<{ id: string; score: number }>,
      experience: [] as Array<{ id: string; score: number }>,
    });
  });

  const createContext = (overrides: Partial<PipelineContext> = {}): PipelineContext =>
    ({
      params: {},
      types: ['tools', 'guidelines', 'knowledge'] as QueryType[],
      limit: 10,
      scopeChain: [{ scopeType: 'global', scopeId: null }],
      ftsMatchIds: null,
      ftsScores: null,
      search: 'test query',
      searchQueries: undefined,
      searchStrategy: 'fts5',
      results: [],
      fetchedEntries: {
        tools: [],
        guidelines: [],
        knowledge: [],
        experiences: [],
      },
      deps: {
        getDb: vi.fn(),
        getPreparedStatement: vi.fn(),
        executeFts5Search: mockExecuteFts5Search,
        executeFts5SearchWithScores: mockExecuteFts5SearchWithScores,
        logger: mockLogger,
        perfLog: true,
      },
      ...overrides,
    }) as unknown as PipelineContext;

  describe('basic functionality', () => {
    it('should return context unchanged when search strategy is not fts5 or hybrid', () => {
      const ctx = createContext({ searchStrategy: 'semantic' });

      const result = ftsStage(ctx);

      expect(result).toBe(ctx);
      expect(mockExecuteFts5Search).not.toHaveBeenCalled();
    });

    it('should return context unchanged when search is empty', () => {
      const ctx = createContext({ search: '' });

      const result = ftsStage(ctx);

      expect(result).toBe(ctx);
      expect(mockExecuteFts5Search).not.toHaveBeenCalled();
    });

    it('should return context unchanged when search is undefined', () => {
      const ctx = createContext({ search: undefined });

      const result = ftsStage(ctx);

      expect(result).toBe(ctx);
      expect(mockExecuteFts5Search).not.toHaveBeenCalled();
    });

    it('should use FTS5 when strategy is fts5', () => {
      const ctx = createContext({ searchStrategy: 'fts5' });

      ftsStage(ctx);

      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalled();
    });

    it('should use FTS5 when strategy is hybrid', () => {
      const ctx = createContext({ searchStrategy: 'hybrid' });

      ftsStage(ctx);

      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalled();
    });

    it('should return ftsMatchIds in result', () => {
      mockExecuteFts5SearchWithScores.mockReturnValue({
        tool: [{ id: 'tool-1', score: 0.9 }],
        guideline: [{ id: 'g-1', score: 0.8 }],
        knowledge: [],
        experience: [],
      });

      const ctx = createContext();
      const result = ftsStage(ctx);

      expect(result.ftsMatchIds).toBeDefined();
      expect(result.ftsMatchIds?.tool.has('tool-1')).toBe(true);
      expect(result.ftsMatchIds?.guideline.has('g-1')).toBe(true);
    });

    it('should return ftsScores when executeFts5SearchWithScores is available', () => {
      mockExecuteFts5SearchWithScores.mockReturnValue({
        tool: [{ id: 'tool-1', score: 0.9 }],
        guideline: [],
        knowledge: [],
        experience: [],
      });

      const ctx = createContext();
      const result = ftsStage(ctx);

      expect(result.ftsScores).toBeDefined();
      expect(result.ftsScores?.get('tool-1')).toBe(0.9);
    });
  });

  describe('expanded queries', () => {
    it('should use searchQueries when available', () => {
      const ctx = createContext({
        searchQueries: [
          { text: 'query1', weight: 1.0, source: 'original' as const },
          { text: 'query2', weight: 0.8, source: 'synonym' as const },
        ],
      });

      ftsStage(ctx);

      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalledTimes(2);
      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalledWith('query1', expect.any(Array), {
        limit: 50,
      });
      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalledWith('query2', expect.any(Array), {
        limit: 50,
      });
    });

    it('should fall back to original search when searchQueries is empty', () => {
      const ctx = createContext({
        search: 'original search',
        searchQueries: [],
      });

      ftsStage(ctx);

      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalledWith(
        'original search',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should skip queries with empty text', () => {
      const ctx = createContext({
        searchQueries: [
          { text: '', weight: 1.0, source: 'original' as const },
          { text: 'valid query', weight: 0.8, source: 'synonym' as const },
        ],
      });

      ftsStage(ctx);

      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalledTimes(1);
      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalledWith(
        'valid query',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should merge results from multiple queries', () => {
      mockExecuteFts5SearchWithScores
        .mockReturnValueOnce({
          tool: [{ id: 'tool-1', score: 0.9 }],
          guideline: [],
          knowledge: [],
          experience: [],
        })
        .mockReturnValueOnce({
          tool: [{ id: 'tool-2', score: 0.8 }],
          guideline: [],
          knowledge: [],
          experience: [],
        });

      const ctx = createContext({
        searchQueries: [
          { text: 'query1', weight: 1.0, source: 'original' as const },
          { text: 'query2', weight: 0.9, source: 'synonym' as const },
        ],
      });

      const result = ftsStage(ctx);

      expect(result.ftsMatchIds?.tool.has('tool-1')).toBe(true);
      expect(result.ftsMatchIds?.tool.has('tool-2')).toBe(true);
    });

    it('should apply weight to scores', () => {
      mockExecuteFts5SearchWithScores.mockReturnValue({
        tool: [{ id: 'tool-1', score: 1.0 }],
        guideline: [],
        knowledge: [],
        experience: [],
      });

      const ctx = createContext({
        searchQueries: [{ text: 'query', weight: 0.5, source: 'original' as const }],
      });

      const result = ftsStage(ctx);

      // Score should be 1.0 * 0.5 = 0.5
      expect(result.ftsScores?.get('tool-1')).toBe(0.5);
    });

    it('should use MAX when same entry matches multiple queries', () => {
      mockExecuteFts5SearchWithScores
        .mockReturnValueOnce({
          tool: [{ id: 'tool-1', score: 0.8 }],
          guideline: [],
          knowledge: [],
          experience: [],
        })
        .mockReturnValueOnce({
          tool: [{ id: 'tool-1', score: 0.9 }],
          guideline: [],
          knowledge: [],
          experience: [],
        });

      const ctx = createContext({
        searchQueries: [
          { text: 'query1', weight: 1.0, source: 'original' as const },
          { text: 'query2', weight: 1.0, source: 'synonym' as const },
        ],
      });

      const result = ftsStage(ctx);

      // Should use MAX (0.9), not sum
      expect(result.ftsScores?.get('tool-1')).toBe(0.9);
    });
  });

  describe('fallback to executeFts5Search', () => {
    it('should use executeFts5Search when executeFts5SearchWithScores is not available', () => {
      mockExecuteFts5Search.mockReturnValue({
        tool: new Set(['tool-1']),
        guideline: new Set<string>(),
        knowledge: new Set<string>(),
        experience: new Set<string>(),
      });

      const ctx = createContext({
        deps: {
          getDb: vi.fn(),
          getPreparedStatement: vi.fn(),
          executeFts5Search: mockExecuteFts5Search,
          executeFts5SearchWithScores: undefined,
          logger: mockLogger,
          perfLog: true,
        },
      });

      const result = ftsStage(ctx);

      expect(mockExecuteFts5Search).toHaveBeenCalled();
      expect(result.ftsMatchIds?.tool.has('tool-1')).toBe(true);
      expect(result.ftsScores).toBeNull();
    });

    it('should handle null result from FTS search', () => {
      mockExecuteFts5SearchWithScores.mockReturnValue(null);
      mockExecuteFts5Search.mockReturnValue(null);

      const ctx = createContext({
        deps: {
          getDb: vi.fn(),
          getPreparedStatement: vi.fn(),
          executeFts5Search: mockExecuteFts5Search,
          executeFts5SearchWithScores: undefined,
          logger: mockLogger,
          perfLog: true,
        },
      });

      const result = ftsStage(ctx);

      // Should still return valid ftsMatchIds structure
      expect(result.ftsMatchIds).toBeDefined();
      expect(result.ftsMatchIds?.tool.size).toBe(0);
    });
  });

  describe('logging', () => {
    it('should log strategy check when perfLog is enabled', () => {
      const ctx = createContext();

      ftsStage(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ searchStrategy: 'fts5', useFts5: true }),
        'fts_stage_strategy_check'
      );
    });

    it('should log FTS stage check when perfLog is enabled', () => {
      const ctx = createContext();

      ftsStage(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ useFts5: true, hasSearch: true }),
        'fts_stage_check'
      );
    });

    it('should log query results when perfLog is enabled', () => {
      mockExecuteFts5SearchWithScores.mockReturnValue({
        tool: [{ id: 'tool-1', score: 0.9 }],
        guideline: [],
        knowledge: [],
        experience: [],
      });

      const ctx = createContext();

      ftsStage(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(String) }),
        'fts_query_result'
      );
    });

    it('should log expanded queries summary when multiple queries are used', () => {
      mockExecuteFts5SearchWithScores.mockReturnValue({
        tool: [{ id: 'tool-1', score: 0.9 }],
        guideline: [],
        knowledge: [],
        experience: [],
      });

      const ctx = createContext({
        searchQueries: [
          { text: 'query1', weight: 1.0, source: 'original' as const },
          { text: 'query2', weight: 0.8, source: 'synonym' as const },
        ],
      });

      ftsStage(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          queryCount: 2,
          totalMatches: expect.any(Number),
        }),
        'fts_expanded_queries completed'
      );
    });

    it('should not log expanded queries summary for single query', () => {
      mockExecuteFts5SearchWithScores.mockReturnValue({
        tool: [],
        guideline: [],
        knowledge: [],
        experience: [],
      });

      const ctx = createContext({
        searchQueries: [{ text: 'query1', weight: 1.0, source: 'original' as const }],
      });

      ftsStage(ctx);

      const expandedQueriesCall = mockLogger.debug.mock.calls.find(
        (call) => call[1] === 'fts_expanded_queries completed'
      );
      expect(expandedQueriesCall).toBeUndefined();
    });

    it('should not log when logger is not available', () => {
      const ctx = createContext({
        deps: {
          getDb: vi.fn(),
          getPreparedStatement: vi.fn(),
          executeFts5Search: mockExecuteFts5Search,
          executeFts5SearchWithScores: mockExecuteFts5SearchWithScores,
          logger: undefined,
          perfLog: true,
        },
      });

      // Should not throw
      expect(() => ftsStage(ctx)).not.toThrow();
    });

    it('should not log when perfLog is false', () => {
      const ctx = createContext({
        deps: {
          getDb: vi.fn(),
          getPreparedStatement: vi.fn(),
          executeFts5Search: mockExecuteFts5Search,
          executeFts5SearchWithScores: mockExecuteFts5SearchWithScores,
          logger: mockLogger,
          perfLog: false,
        },
      });

      ftsStage(ctx);

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe('entry types', () => {
    it('should process all specified types', () => {
      mockExecuteFts5SearchWithScores.mockReturnValue({
        tool: [{ id: 'tool-1', score: 0.9 }],
        guideline: [{ id: 'g-1', score: 0.8 }],
        knowledge: [{ id: 'k-1', score: 0.7 }],
        experience: [{ id: 'e-1', score: 0.6 }],
      });

      const ctx = createContext({
        types: ['tools', 'guidelines', 'knowledge', 'experiences'] as QueryType[],
      });

      const result = ftsStage(ctx);

      expect(result.ftsMatchIds?.tool.has('tool-1')).toBe(true);
      expect(result.ftsMatchIds?.guideline.has('g-1')).toBe(true);
      expect(result.ftsMatchIds?.knowledge.has('k-1')).toBe(true);
      expect(result.ftsMatchIds?.experience.has('e-1')).toBe(true);
    });

    it('should pass types to FTS search function', () => {
      const ctx = createContext({
        types: ['tools', 'guidelines'] as QueryType[],
      });

      ftsStage(ctx);

      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalledWith(
        expect.any(String),
        ['tools', 'guidelines'],
        expect.any(Object)
      );
    });
  });

  describe('limit handling', () => {
    it('should multiply limit by 5 for FTS search', () => {
      const ctx = createContext({ limit: 10 });

      ftsStage(ctx);

      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        { limit: 50 }
      );
    });

    it('should use different limits for different context limits', () => {
      const ctx = createContext({ limit: 20 });

      ftsStage(ctx);

      expect(mockExecuteFts5SearchWithScores).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        { limit: 100 }
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty FTS results', () => {
      mockExecuteFts5SearchWithScores.mockReturnValue({
        tool: [],
        guideline: [],
        knowledge: [],
        experience: [],
      });

      const ctx = createContext();
      const result = ftsStage(ctx);

      expect(result.ftsMatchIds?.tool.size).toBe(0);
      expect(result.ftsMatchIds?.guideline.size).toBe(0);
      expect(result.ftsMatchIds?.knowledge.size).toBe(0);
      expect(result.ftsMatchIds?.experience.size).toBe(0);
    });

    it('should handle missing entry type in results', () => {
      // FTS function returns partial results - only tool entries
      mockExecuteFts5SearchWithScores.mockReturnValue({
        tool: [{ id: 'tool-1', score: 0.9 }],
        guideline: [],
        knowledge: [],
        experience: [],
      });

      const ctx = createContext({
        types: ['tools'] as QueryType[],
      });

      const result = ftsStage(ctx);

      // Should only have tool results
      expect(result.ftsMatchIds?.tool.has('tool-1')).toBe(true);
      expect(result.ftsMatchIds?.guideline.size).toBe(0);
    });

    it('should handle long search queries by truncating in logs', () => {
      const longQuery = 'a'.repeat(100);
      const ctx = createContext({
        searchQueries: [{ text: longQuery, weight: 1.0, source: 'original' as const }],
      });

      mockExecuteFts5SearchWithScores.mockReturnValue({
        tool: [],
        guideline: [],
        knowledge: [],
        experience: [],
      });

      ftsStage(ctx);

      // Check that the logged query is truncated to 50 chars
      const queryResultCall = mockLogger.debug.mock.calls.find(
        (call) => call[1] === 'fts_query_result'
      );
      expect(queryResultCall?.[0].query.length).toBeLessThanOrEqual(50);
    });
  });
});
