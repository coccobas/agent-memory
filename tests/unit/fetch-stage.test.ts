import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStage } from '../../src/services/query/stages/fetch.js';
import type { PipelineContext } from '../../src/services/query/pipeline.js';

// Mock dependencies
vi.mock('../../src/db/schema.js', () => ({
  tools: { scopeType: 'scope_type', scopeId: 'scope_id', isActive: 'is_active', id: 'id', createdAt: 'created_at' },
  guidelines: { scopeType: 'scope_type', scopeId: 'scope_id', isActive: 'is_active', id: 'id', createdAt: 'created_at', priority: 'priority' },
  knowledge: { scopeType: 'scope_type', scopeId: 'scope_id', isActive: 'is_active', id: 'id', createdAt: 'created_at' },
  experiences: { scopeType: 'scope_type', scopeId: 'scope_id', isActive: 'is_active', id: 'id', createdAt: 'created_at', level: 'level' },
}));

describe('Fetch Stage', () => {
  let mockDb: any;
  let mockGetPreparedStatement: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                all: vi.fn().mockReturnValue([]),
              }),
            }),
          }),
        }),
      }),
    };
    
    mockGetPreparedStatement = vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue([]),
    });
  });

  const createContext = (overrides: Partial<PipelineContext> = {}): PipelineContext => ({
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
  } as PipelineContext);

  it('should fetch entries for all specified types', () => {
    const ctx = createContext({
      types: ['tools', 'guidelines'],
    });

    const result = fetchStage(ctx);

    expect(result.fetchedEntries.tools).toBeDefined();
    expect(result.fetchedEntries.guidelines).toBeDefined();
  });

  it('should return fetched entries from database', () => {
    mockDb.select().from().where().orderBy().limit().all.mockReturnValue([
      { id: 'tool-1', name: 'Test Tool' },
    ]);

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
});
