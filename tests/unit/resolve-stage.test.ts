import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveStage } from '../../src/services/query/stages/resolve.js';
import type { PipelineContext, ScopeInfo } from '../../src/services/query/pipeline.js';
import { PaginationCursor } from '../../src/utils/pagination.js';

// Mock config
vi.mock('../../src/config/index.js', () => ({
  config: {
    pagination: {
      defaultLimit: 50,
      maxLimit: 100,
    },
  },
}));

describe('Resolve Stage', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockScopeChain: ScopeInfo[] = [
    { type: 'project', id: 'proj-123' },
    { type: 'global', id: null },
  ];

  const createContext = (overrides: Partial<PipelineContext> = {}): PipelineContext =>
    ({
      params: {
        scope: { type: 'project', id: 'proj-123' },
      },
      deps: {
        resolveScopeChain: vi.fn(() => mockScopeChain),
        logger: mockLogger,
      },
      completedStages: new Set(),
      ...overrides,
    }) as unknown as PipelineContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('types resolution', () => {
    it('should use default types when no types specified', () => {
      const ctx = createContext();
      const result = resolveStage(ctx);

      expect(result.types).toEqual(['tools', 'guidelines', 'knowledge', 'experiences']);
    });

    it('should use default types when empty types array specified', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          types: [],
        },
      });
      const result = resolveStage(ctx);

      expect(result.types).toEqual(['tools', 'guidelines', 'knowledge', 'experiences']);
    });

    it('should use specified types when provided', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          types: ['tools', 'knowledge'],
        },
      });
      const result = resolveStage(ctx);

      expect(result.types).toEqual(['tools', 'knowledge']);
    });

    it('should preserve single type', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          types: ['guidelines'],
        },
      });
      const result = resolveStage(ctx);

      expect(result.types).toEqual(['guidelines']);
    });
  });

  describe('scope chain resolution', () => {
    it('should call resolveScopeChain with params.scope', () => {
      const resolveScopeChain = vi.fn(() => mockScopeChain);
      const ctx = createContext({
        deps: {
          resolveScopeChain,
          logger: mockLogger,
        },
      });

      resolveStage(ctx);

      expect(resolveScopeChain).toHaveBeenCalledWith({ type: 'project', id: 'proj-123' });
    });

    it('should set scopeChain from dependency', () => {
      const ctx = createContext();
      const result = resolveStage(ctx);

      expect(result.scopeChain).toEqual(mockScopeChain);
    });
  });

  describe('limit resolution', () => {
    it('should use default limit when not specified', () => {
      const ctx = createContext();
      const result = resolveStage(ctx);

      expect(result.limit).toBe(50);
    });

    it('should use specified limit when valid', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          limit: 25,
        },
      });
      const result = resolveStage(ctx);

      expect(result.limit).toBe(25);
    });

    it('should cap limit at maxLimit', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          limit: 200,
        },
      });
      const result = resolveStage(ctx);

      expect(result.limit).toBe(100);
    });

    it('should floor floating point limit', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          limit: 25.9,
        },
      });
      const result = resolveStage(ctx);

      expect(result.limit).toBe(25);
    });

    it('should use default limit for zero', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          limit: 0,
        },
      });
      const result = resolveStage(ctx);

      expect(result.limit).toBe(50);
    });

    it('should use default limit for negative value', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          limit: -10,
        },
      });
      const result = resolveStage(ctx);

      expect(result.limit).toBe(50);
    });
  });

  describe('offset resolution', () => {
    it('should default offset to 0', () => {
      const ctx = createContext();
      const result = resolveStage(ctx);

      expect(result.offset).toBe(0);
    });

    it('should use offset from cursor when provided', () => {
      const cursor = PaginationCursor.encode({ offset: 20 });
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          cursor,
        },
      });
      const result = resolveStage(ctx);

      expect(result.offset).toBe(20);
    });

    it('should use offset param when cursor not provided', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          offset: 30,
        },
      });
      const result = resolveStage(ctx);

      expect(result.offset).toBe(30);
    });

    it('should floor floating point offset', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          offset: 15.7,
        },
      });
      const result = resolveStage(ctx);

      expect(result.offset).toBe(15);
    });

    it('should use 0 for negative offset param', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          offset: -5,
        },
      });
      const result = resolveStage(ctx);

      expect(result.offset).toBe(0);
    });

    it('should use 0 for zero offset param', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          offset: 0,
        },
      });
      const result = resolveStage(ctx);

      expect(result.offset).toBe(0);
    });

    it('should log debug when cursor is invalid and use offset 0', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          cursor: 'invalid-cursor-string',
        },
      });
      const result = resolveStage(ctx);

      expect(result.offset).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: expect.any(String),
          cursorLength: expect.any(Number),
          error: expect.any(String),
        }),
        'Invalid pagination cursor, using offset 0'
      );
    });

    it('should handle invalid cursor without logger', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          cursor: 'invalid-cursor',
        },
        deps: {
          resolveScopeChain: vi.fn(() => mockScopeChain),
          // No logger
        },
      });
      const result = resolveStage(ctx);

      expect(result.offset).toBe(0);
    });

    it('should handle cursor with NaN offset', () => {
      // Create cursor with non-numeric offset
      const cursor = Buffer.from(JSON.stringify({ offset: 'not-a-number' })).toString('base64');
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          cursor,
        },
      });
      const result = resolveStage(ctx);

      // Should fall back to 0 because Number('not-a-number') is NaN
      expect(result.offset).toBe(0);
    });

    it('should prefer cursor over offset param', () => {
      const cursor = PaginationCursor.encode({ offset: 100 });
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          cursor,
          offset: 50,
        },
      });
      const result = resolveStage(ctx);

      expect(result.offset).toBe(100);
    });

    it('should floor negative cursor offset to 0', () => {
      const cursor = PaginationCursor.encode({ offset: -10 });
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          cursor,
        },
      });
      const result = resolveStage(ctx);

      expect(result.offset).toBe(0);
    });
  });

  describe('search resolution', () => {
    it('should return undefined for no search param', () => {
      const ctx = createContext();
      const result = resolveStage(ctx);

      expect(result.search).toBeUndefined();
    });

    it('should return search term as-is when valid', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          search: 'find this',
        },
      });
      const result = resolveStage(ctx);

      expect(result.search).toBe('find this');
    });

    it('should trim whitespace from search', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          search: '  search term  ',
        },
      });
      const result = resolveStage(ctx);

      expect(result.search).toBe('search term');
    });

    it('should return undefined for whitespace-only search', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          search: '   ',
        },
      });
      const result = resolveStage(ctx);

      expect(result.search).toBeUndefined();
    });

    it('should return undefined for empty search', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          search: '',
        },
      });
      const result = resolveStage(ctx);

      expect(result.search).toBeUndefined();
    });

    it('should log debug when search is normalized to undefined', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          search: '   ',
        },
      });
      resolveStage(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          originalSearch: expect.any(String),
          normalized: 'undefined',
        }),
        'empty/whitespace search normalized to undefined - no text filtering will be applied'
      );
    });

    it('should not log when search was not provided', () => {
      const ctx = createContext();
      resolveStage(ctx);

      // Should not log about search normalization when search wasn't provided
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        expect.anything(),
        'empty/whitespace search normalized to undefined - no text filtering will be applied'
      );
    });

    it('should handle search normalization without logger', () => {
      const ctx = createContext({
        params: {
          scope: { type: 'project', id: 'proj-123' },
          search: '   ',
        },
        deps: {
          resolveScopeChain: vi.fn(() => mockScopeChain),
          // No logger
        },
      });
      const result = resolveStage(ctx);

      expect(result.search).toBeUndefined();
    });
  });

  describe('stage completion', () => {
    it('should mark RESOLVE stage as completed', () => {
      const ctx = createContext();
      const result = resolveStage(ctx);

      expect(result.completedStages.has('resolve')).toBe(true);
    });

    it('should preserve existing completed stages', () => {
      const ctx = createContext({
        completedStages: new Set(['other-stage']),
      });
      const result = resolveStage(ctx);

      expect(result.completedStages.has('resolve')).toBe(true);
      expect(result.completedStages.has('other-stage')).toBe(true);
    });
  });
});
