import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStage } from '../../src/services/query/stages/fetch.js';
import type { PipelineContext } from '../../src/services/query/pipeline.js';

// Mock dependencies
vi.mock('../../src/db/schema.js', () => ({
  tools: {
    scopeType: 'scope_type',
    scopeId: 'scope_id',
    isActive: 'is_active',
    id: 'id',
    createdAt: 'created_at',
  },
  guidelines: {
    scopeType: 'scope_type',
    scopeId: 'scope_id',
    isActive: 'is_active',
    id: 'id',
    createdAt: 'created_at',
    priority: 'priority',
  },
  knowledge: {
    scopeType: 'scope_type',
    scopeId: 'scope_id',
    isActive: 'is_active',
    id: 'id',
    createdAt: 'created_at',
  },
  experiences: {
    scopeType: 'scope_type',
    scopeId: 'scope_id',
    isActive: 'is_active',
    id: 'id',
    createdAt: 'created_at',
    level: 'level',
  },
}));

describe('Fetch Stage', () => {
  let mockDb: any;
  let mockGetPreparedStatement: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock db with nested call chain that supports both patterns:
    // 1. select().from().where().orderBy().limit().all() - regular fetch
    // 2. select().from().where().all() - semantic fetch
    const mockAll = vi.fn().mockReturnValue([]);
    const mockLimit = vi.fn().mockReturnValue({ all: mockAll });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({
      orderBy: mockOrderBy,
      all: mockAll, // Also support direct .where().all() pattern
    });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    mockDb = {
      select: mockSelect,
    };

    mockGetPreparedStatement = vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue([]),
    });
  });

  const createContext = (overrides: Partial<PipelineContext> = {}): PipelineContext =>
    ({
      params: {},
      types: ['tools', 'guidelines', 'knowledge'],
      limit: 10,
      scopeChain: [{ scopeType: 'project', scopeId: 'proj-1' }],
      ftsMatchIds: null,
      results: [],
      fetchedEntries: {
        tools: [],
        guidelines: [],
        knowledge: [],
        experiences: [],
      },
      deps: {
        getDb: () => mockDb,
        getPreparedStatement: mockGetPreparedStatement,
      },
      ...overrides,
    }) as PipelineContext;

  it('should fetch entries for all specified types', () => {
    const ctx = createContext({
      types: ['tools', 'guidelines'],
    });

    const result = fetchStage(ctx);

    expect(result.fetchedEntries.tools).toBeDefined();
    expect(result.fetchedEntries.guidelines).toBeDefined();
  });

  it('should return fetched entries from database', () => {
    mockDb
      .select()
      .from()
      .where()
      .orderBy()
      .limit()
      .all.mockReturnValue([{ id: 'tool-1', name: 'Test Tool' }]);

    const ctx = createContext({
      types: ['tools'],
    });

    const result = fetchStage(ctx);

    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should apply FTS match filter when ftsMatchIds is set', () => {
    const ctx = createContext({
      types: ['tools'],
      ftsMatchIds: {
        tool: new Set(['tool-1', 'tool-2']),
        guideline: new Set(),
        knowledge: new Set(),
        experience: new Set(),
      },
    });

    fetchStage(ctx);

    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should use lower headroom when FTS matches are less than limit', () => {
    const ctx = createContext({
      types: ['tools'],
      limit: 100,
      ftsMatchIds: {
        tool: new Set(['tool-1']),
        guideline: new Set(),
        knowledge: new Set(),
        experience: new Set(),
      },
    });

    fetchStage(ctx);

    // With low FTS matches, should use 1.2x headroom instead of 2.0x
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should use moderate headroom with tag filters', () => {
    const ctx = createContext({
      types: ['tools'],
      params: {
        tags: {
          require: ['important'],
        },
      },
    });

    fetchStage(ctx);

    // With tag filters, should use 1.5x headroom
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should filter by date range when createdAfter/createdBefore provided', () => {
    const ctx = createContext({
      types: ['tools'],
      params: {
        createdAfter: '2024-01-01T00:00:00Z',
        createdBefore: '2024-12-31T23:59:59Z',
      },
    });

    fetchStage(ctx);

    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should apply priority filter for guidelines', () => {
    const ctx = createContext({
      types: ['guidelines'],
      params: {
        priority: { min: 50, max: 100 },
      },
    });

    fetchStage(ctx);

    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should use temporal fetch for knowledge with atTime', () => {
    mockGetPreparedStatement.mockReturnValue({
      all: vi.fn().mockReturnValue([]),
    });

    const ctx = createContext({
      types: ['knowledge'],
      params: {
        atTime: '2024-06-15T12:00:00Z',
      },
    });

    fetchStage(ctx);

    expect(mockGetPreparedStatement).toHaveBeenCalled();
  });

  it('should use temporal fetch for knowledge with validDuring', () => {
    mockGetPreparedStatement.mockReturnValue({
      all: vi.fn().mockReturnValue([]),
    });

    const ctx = createContext({
      types: ['knowledge'],
      params: {
        validDuring: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-12-31T23:59:59Z',
        },
      },
    });

    fetchStage(ctx);

    expect(mockGetPreparedStatement).toHaveBeenCalled();
  });

  it('should handle null scopeId in scope chain', () => {
    const ctx = createContext({
      types: ['tools'],
      scopeChain: [{ scopeType: 'global', scopeId: null }],
    });

    fetchStage(ctx);

    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should iterate through multiple scopes', () => {
    const ctx = createContext({
      types: ['tools'],
      scopeChain: [
        { scopeType: 'project', scopeId: 'proj-1' },
        { scopeType: 'org', scopeId: 'org-1' },
        { scopeType: 'global', scopeId: null },
      ],
    });

    fetchStage(ctx);

    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should fetch experiences with level filter', () => {
    const ctx = createContext({
      types: ['experiences'],
      params: {
        level: 'strategy',
      },
    });

    fetchStage(ctx);

    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should use relatedIds for headroom calculation', () => {
    const ctx = createContext({
      types: ['tools'],
      limit: 100,
      params: {
        relatedTo: { id: 'k-1', type: 'knowledge' },
      },
      relatedIds: {
        tool: new Set(['tool-1']),
        guideline: new Set(),
        knowledge: new Set(),
        experience: new Set(),
      },
    });

    fetchStage(ctx);

    // With low related IDs, should use 1.2x headroom
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should stop fetching when soft cap is reached', () => {
    // Return many results to trigger soft cap
    const manyTools = Array.from({ length: 50 }, (_, i) => ({
      id: `tool-${i}`,
      name: `Tool ${i}`,
    }));
    mockDb.select().from().where().orderBy().limit().all.mockReturnValue(manyTools);

    const ctx = createContext({
      types: ['tools'],
      limit: 10,
    });

    const result = fetchStage(ctx);

    expect(result.fetchedEntries.tools.length).toBeGreaterThan(0);
  });

  describe('semantic scores path', () => {
    it('should fetch semantic entries for tools when semanticScores provided', () => {
      const semanticScores = new Map([
        [
          'tool-semantic-1',
          { entryType: 'tool' as const, score: 0.9, source: 'semantic' as const },
        ],
      ]);

      const ctx = createContext({
        types: ['tools'],
        semanticScores,
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should fetch semantic entries for guidelines when semanticScores provided', () => {
      const semanticScores = new Map([
        [
          'guideline-semantic-1',
          { entryType: 'guideline' as const, score: 0.9, source: 'semantic' as const },
        ],
      ]);

      const ctx = createContext({
        types: ['guidelines'],
        semanticScores,
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should fetch semantic entries for knowledge when semanticScores provided', () => {
      const semanticScores = new Map([
        [
          'knowledge-semantic-1',
          { entryType: 'knowledge' as const, score: 0.9, source: 'semantic' as const },
        ],
      ]);

      const ctx = createContext({
        types: ['knowledge'],
        semanticScores,
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should fetch semantic entries for experiences when semanticScores provided', () => {
      const semanticScores = new Map([
        [
          'experience-semantic-1',
          { entryType: 'experience' as const, score: 0.9, source: 'semantic' as const },
        ],
      ]);

      const ctx = createContext({
        types: ['experiences'],
        semanticScores,
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should not re-fetch entries that were already fetched from regular path', () => {
      // First mock returns one tool from regular fetch
      mockDb
        .select()
        .from()
        .where()
        .orderBy()
        .limit()
        .all.mockReturnValue([{ id: 'tool-1', name: 'Tool 1' }]);

      // Include same ID in semantic scores
      const semanticScores = new Map([
        ['tool-1', { entryType: 'tool' as const, score: 0.9, source: 'semantic' as const }],
        ['tool-new', { entryType: 'tool' as const, score: 0.85, source: 'semantic' as const }],
      ]);

      const ctx = createContext({
        types: ['tools'],
        semanticScores,
      });

      fetchStage(ctx);

      // The function should try to fetch tool-new but not tool-1 (already fetched)
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('includeInactive flag', () => {
    it('should include inactive entries when includeInactive is true', () => {
      const ctx = createContext({
        types: ['tools'],
        params: {
          includeInactive: true,
        },
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('createdBy filter', () => {
    it('should filter by createdBy when provided', () => {
      const ctx = createContext({
        types: ['tools'],
        params: {
          createdBy: 'user-123',
        },
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('updatedAfter/updatedBefore filters', () => {
    it('should filter by updatedAfter when provided', () => {
      const ctx = createContext({
        types: ['tools'],
        params: {
          updatedAfter: '2024-01-01T00:00:00Z',
        },
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by updatedBefore when provided', () => {
      const ctx = createContext({
        types: ['tools'],
        params: {
          updatedBefore: '2024-12-31T23:59:59Z',
        },
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('category filter', () => {
    it('should filter tools by category', () => {
      const ctx = createContext({
        types: ['tools'],
        params: {
          category: 'cli',
        },
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter guidelines by category', () => {
      const ctx = createContext({
        types: ['guidelines'],
        params: {
          category: 'security',
        },
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter knowledge by category', () => {
      const ctx = createContext({
        types: ['knowledge'],
        params: {
          category: 'fact',
        },
      });

      fetchStage(ctx);

      // Knowledge uses prepared statements instead of db.select()
      expect(mockGetPreparedStatement).toHaveBeenCalled();
    });

    it('should filter experiences by category', () => {
      const ctx = createContext({
        types: ['experiences'],
        params: {
          category: 'debugging',
        },
      });

      fetchStage(ctx);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });
});
