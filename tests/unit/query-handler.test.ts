import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryHandlers } from '../../src/mcp/handlers/query.handler.js';
import * as queryPipeline from '../../src/services/query/index.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/query/index.js', () => ({
  executeQueryPipeline: vi.fn().mockResolvedValue({
    results: [],
    meta: { queryTimeMs: 10 },
  }),
}));
vi.mock('../../src/services/audit.service.js', () => ({
  logAction: vi.fn(),
}));
vi.mock('../../src/services/conversation.service.js', () => ({
  createConversationService: vi.fn().mockReturnValue({
    autoLinkContextFromQuery: vi.fn(),
  }),
}));

describe('Query Handler', () => {
  let mockContext: AppContext;
  let mockPermissionService: {
    check: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissionService = {
      check: vi.fn().mockReturnValue(true),
    };
    mockContext = {
      db: {} as any,
      repos: {
        conversations: {} as any,
      } as any,
      services: {
        permission: mockPermissionService,
      } as any,
      queryDeps: {} as any,
    };
  });

  describe('query', () => {
    it('should execute a query', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [{ type: 'tool', id: 't-1' }],
        meta: { queryTimeMs: 5 },
      } as any);

      const result = await queryHandlers.query(mockContext, {
        agentId: 'agent-1',
        types: ['tools'],
        scope: { type: 'project', id: 'proj-1' },
      });

      expect(result.results).toHaveLength(1);
      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalled();
    });

    it('should handle text search', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.query(mockContext, {
        agentId: 'agent-1',
        search: 'database',
        types: ['knowledge'],
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'database' }),
        expect.anything()
      );
    });

    it('should support semantic search', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.query(mockContext, {
        agentId: 'agent-1',
        search: 'how to deploy',
        semanticSearch: true,
        semanticThreshold: 0.8,
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          semanticSearch: true,
          semanticThreshold: 0.8,
        }),
        expect.anything()
      );
    });

    it('should support relatedTo queries', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.query(mockContext, {
        agentId: 'agent-1',
        relatedTo: {
          type: 'tool',
          id: 'tool-1',
          relation: 'depends_on',
          depth: 2,
          direction: 'forward',
        },
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          relatedTo: expect.objectContaining({
            type: 'tool',
            id: 'tool-1',
            depth: 2,
            direction: 'forward',
          }),
        }),
        expect.anything()
      );
    });

    it('should throw on invalid types', async () => {
      await expect(
        queryHandlers.query(mockContext, {
          agentId: 'agent-1',
          types: ['invalid_type'],
        })
      ).rejects.toThrow('invalid values');
    });

    it('should throw on permission denied for specific types', async () => {
      mockPermissionService.check.mockReturnValue(false);

      await expect(
        queryHandlers.query(mockContext, {
          agentId: 'agent-1',
          types: ['tools'],
        })
      ).rejects.toThrow();
    });

    it('should filter to allowed types when none specified', async () => {
      mockPermissionService.check.mockImplementation((_a, _r, entryType) => {
        return entryType === 'tool' || entryType === 'knowledge';
      });

      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.query(mockContext, { agentId: 'agent-1' });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          types: expect.arrayContaining(['tools', 'knowledge']),
        }),
        expect.anything()
      );
    });

    it('should support temporal filtering', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.query(mockContext, {
        agentId: 'agent-1',
        types: ['knowledge'],
        atTime: '2024-06-01T00:00:00Z',
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({ atTime: '2024-06-01T00:00:00Z' }),
        expect.anything()
      );
    });

    it('should support validDuring temporal range', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.query(mockContext, {
        agentId: 'agent-1',
        types: ['knowledge'],
        validDuring: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-12-31T23:59:59Z',
        },
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          validDuring: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-12-31T23:59:59Z',
          },
        }),
        expect.anything()
      );
    });

    it('should support pagination with limit', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.query(mockContext, {
        agentId: 'agent-1',
        limit: 50,
        compact: true,
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50, compact: true }),
        expect.anything()
      );
    });
  });

  describe('context', () => {
    it('should return aggregated context', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [
          { type: 'tool', id: 't-1' },
          { type: 'guideline', id: 'g-1' },
          { type: 'knowledge', id: 'k-1' },
        ],
        meta: { queryTimeMs: 10 },
      } as any);

      const result = await queryHandlers.context(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.tools).toHaveLength(1);
      expect(result.guidelines).toHaveLength(1);
      expect(result.knowledge).toHaveLength(1);
      expect(result.scope.type).toBe('project');
    });

    it('should enable inheritance by default', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.context(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({ inherit: true }),
        }),
        expect.anything()
      );
    });

    it('should respect inherit=false', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.context(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
        inherit: false,
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({ inherit: false }),
        }),
        expect.anything()
      );
    });

    it('should support limitPerType', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.context(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
        limitPerType: 10,
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
        expect.anything()
      );
    });

    it('should throw when no types are allowed', async () => {
      mockPermissionService.check.mockReturnValue(false);

      await expect(
        queryHandlers.context(mockContext, {
          scopeType: 'project',
          scopeId: 'proj-1',
        })
      ).rejects.toThrow();
    });

    it('should filter to allowed types', async () => {
      mockPermissionService.check.mockImplementation((_a, _r, entryType) => {
        return entryType === 'tool';
      });

      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.context(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['tools'],
        }),
        expect.anything()
      );
    });

    it('should support search with context', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [],
        meta: {},
      } as any);

      await queryHandlers.context(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
        search: 'authentication',
        semanticSearch: true,
      });

      expect(queryPipeline.executeQueryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'authentication',
          semanticSearch: true,
        }),
        expect.anything()
      );
    });

    it('should include experiences in results', async () => {
      vi.mocked(queryPipeline.executeQueryPipeline).mockResolvedValue({
        results: [{ type: 'experience', id: 'exp-1' }],
        meta: {},
      } as any);

      const result = await queryHandlers.context(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.experiences).toHaveLength(1);
    });
  });
});
