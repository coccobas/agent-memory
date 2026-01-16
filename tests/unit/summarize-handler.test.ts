import { describe, it, expect, vi, beforeEach } from 'vitest';
import { summarizeHandlers } from '../../src/mcp/handlers/summarize.handler.js';
import type { AppContext } from '../../src/core/context.js';

// Create mock service instance methods
const mockBuildSummaries = vi.fn();
const mockGetStatus = vi.fn();
const mockGetSummary = vi.fn();
const mockSearchSummaries = vi.fn();
const mockGetChildSummaries = vi.fn();
const mockDeleteSummaries = vi.fn();

// Mock the class with a proper constructor
vi.mock('../../src/services/summarization/hierarchical-summarization.service.js', () => ({
  HierarchicalSummarizationService: class MockHierarchicalSummarizationService {
    buildSummaries = mockBuildSummaries;
    getStatus = mockGetStatus;
    getSummary = mockGetSummary;
    searchSummaries = mockSearchSummaries;
    getChildSummaries = mockGetChildSummaries;
    deleteSummaries = mockDeleteSummaries;
  },
}));

describe('Summarize Handler', () => {
  let mockContext: AppContext;
  let mockEmbeddingService: {
    isAvailable: ReturnType<typeof vi.fn>;
    embed: ReturnType<typeof vi.fn>;
  };
  let mockVectorService: {
    searchSimilar: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  let mockExtractionService: {
    isAvailable: ReturnType<typeof vi.fn>;
    extract: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock return values
    mockBuildSummaries.mockResolvedValue({
      summariesCreated: 10,
      levelsBuilt: 3,
      processingTimeMs: 500,
      summariesByLevel: { 1: 5, 2: 3, 3: 2 },
      stats: { entriesProcessed: 50 },
      topLevelSummary: {
        id: 'sum-top',
        title: 'Top Level Summary',
        hierarchyLevel: 3,
        memberCount: 50,
      },
    });
    mockGetStatus.mockResolvedValue({
      hasSummaries: true,
      totalSummaries: 10,
      summariesByLevel: { 1: 5, 2: 3, 3: 2 },
      lastBuildAt: new Date().toISOString(),
    });
    mockGetSummary.mockResolvedValue({
      id: 'sum-1',
      title: 'Test Summary',
      content: 'Summary content',
      hierarchyLevel: 1,
      memberCount: 5,
      memberIds: ['e1', 'e2', 'e3', 'e4', 'e5'],
      scopeType: 'project',
      scopeId: 'proj-1',
      metadata: {},
    });
    mockSearchSummaries.mockResolvedValue([
      {
        id: 'sum-1',
        title: 'Found Summary',
        hierarchyLevel: 1,
        memberCount: 5,
        scopeType: 'project',
        scopeId: 'proj-1',
        metadata: {},
      },
    ]);
    mockGetChildSummaries.mockResolvedValue([
      {
        id: 'sum-child-1',
        title: 'Child Summary 1',
        hierarchyLevel: 0,
        memberCount: 2,
      },
    ]);
    mockDeleteSummaries.mockResolvedValue(10);

    mockEmbeddingService = {
      isAvailable: vi.fn().mockReturnValue(true),
      embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
    };
    mockVectorService = {
      searchSimilar: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    };
    mockExtractionService = {
      isAvailable: vi.fn().mockReturnValue(true),
      extract: vi.fn().mockResolvedValue({}),
    };
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {
        embedding: mockEmbeddingService,
        vector: mockVectorService,
        extraction: mockExtractionService,
      } as any,
    };
  });

  describe('build', () => {
    it('should build summaries for a scope', async () => {
      const result = await summarizeHandlers.build(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.action).toBe('build');
      expect(result.success).toBe(true);
      expect(result.summariesCreated).toBe(10);
      expect(result.levelsBuilt).toBe(3);
    });

    it('should support global scope without scopeId', async () => {
      const result = await summarizeHandlers.build(mockContext, {
        scopeType: 'global',
      });

      expect(result.success).toBe(true);
    });

    it('should throw when scopeId missing for non-global scope', async () => {
      await expect(
        summarizeHandlers.build(mockContext, {
          scopeType: 'project',
        })
      ).rejects.toThrow('scopeId');
    });

    it('should throw when services not available', async () => {
      mockContext.services = {} as any;

      await expect(
        summarizeHandlers.build(mockContext, {
          scopeType: 'global',
        })
      ).rejects.toThrow('services');
    });

    it('should support forceRebuild option', async () => {
      const result = await summarizeHandlers.build(mockContext, {
        scopeType: 'global',
        forceRebuild: true,
      });

      expect(result.message).toContain('Rebuilt');
    });

    it('should support filtering by entry types', async () => {
      const result = await summarizeHandlers.build(mockContext, {
        scopeType: 'global',
        entryTypes: ['guideline', 'knowledge'],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('status', () => {
    it('should return build status for a scope', async () => {
      const result = await summarizeHandlers.status(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.action).toBe('status');
      expect(result.hasSummaries).toBe(true);
      expect(result.totalSummaries).toBe(10);
    });

    it('should throw when scopeId missing for non-global scope', async () => {
      await expect(
        summarizeHandlers.status(mockContext, {
          scopeType: 'project',
        })
      ).rejects.toThrow('scopeId');
    });

    it('should throw when services not available', async () => {
      mockContext.services = {} as any;

      await expect(
        summarizeHandlers.status(mockContext, {
          scopeType: 'global',
        })
      ).rejects.toThrow('services');
    });
  });

  describe('get', () => {
    it('should get a summary by id', async () => {
      const result = await summarizeHandlers.get(mockContext, {
        id: 'sum-1',
      });

      expect(result.action).toBe('get');
      expect(result.summary).toBeDefined();
      expect(result.summary.id).toBe('sum-1');
      expect(result.summary.title).toBe('Test Summary');
    });

    it('should throw when id is missing', async () => {
      await expect(summarizeHandlers.get(mockContext, {})).rejects.toThrow('id');
    });

    it('should throw when summary not found', async () => {
      mockGetSummary.mockResolvedValue(null);

      await expect(
        summarizeHandlers.get(mockContext, {
          id: 'sum-nonexistent',
        })
      ).rejects.toThrow();
    });

    it('should throw when services not available', async () => {
      mockContext.services = {} as any;

      await expect(
        summarizeHandlers.get(mockContext, {
          id: 'sum-1',
        })
      ).rejects.toThrow('services');
    });
  });

  describe('search', () => {
    it('should search summaries semantically', async () => {
      const result = await summarizeHandlers.search(mockContext, {
        query: 'test query',
      });

      expect(result.action).toBe('search');
      expect(result.query).toBe('test query');
      expect(result.summaries).toHaveLength(1);
    });

    it('should filter by scope', async () => {
      const result = await summarizeHandlers.search(mockContext, {
        query: 'test query',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.summaries).toBeDefined();
    });

    it('should filter by hierarchy level', async () => {
      const result = await summarizeHandlers.search(mockContext, {
        query: 'test query',
        level: 1,
      });

      expect(result.summaries).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const result = await summarizeHandlers.search(mockContext, {
        query: 'test query',
        limit: 5,
      });

      expect(result.summaries).toBeDefined();
    });

    it('should throw when query is missing', async () => {
      await expect(summarizeHandlers.search(mockContext, {})).rejects.toThrow('query');
    });

    it('should throw when scopeId missing for non-global scope', async () => {
      await expect(
        summarizeHandlers.search(mockContext, {
          query: 'test',
          scopeType: 'project',
        })
      ).rejects.toThrow('scopeId');
    });

    it('should throw when services not available', async () => {
      mockContext.services = {} as any;

      await expect(
        summarizeHandlers.search(mockContext, {
          query: 'test query',
        })
      ).rejects.toThrow('services');
    });
  });

  describe('drill_down', () => {
    it('should drill down from summary to children', async () => {
      const result = await summarizeHandlers.drill_down(mockContext, {
        summaryId: 'sum-1',
      });

      expect(result.action).toBe('drill_down');
      expect(result.summary).toBeDefined();
      expect(result.childSummaries).toHaveLength(1);
    });

    it('should throw when summaryId is missing', async () => {
      await expect(summarizeHandlers.drill_down(mockContext, {})).rejects.toThrow('summaryId');
    });

    it('should throw when summary not found', async () => {
      mockGetSummary.mockResolvedValue(null);

      await expect(
        summarizeHandlers.drill_down(mockContext, {
          summaryId: 'sum-nonexistent',
        })
      ).rejects.toThrow();
    });

    it('should throw when services not available', async () => {
      mockContext.services = {} as any;

      await expect(
        summarizeHandlers.drill_down(mockContext, {
          summaryId: 'sum-1',
        })
      ).rejects.toThrow('services');
    });
  });

  describe('delete', () => {
    it('should delete summaries for a scope', async () => {
      const result = await summarizeHandlers.delete(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.action).toBe('delete');
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(10);
    });

    it('should support global scope without scopeId', async () => {
      const result = await summarizeHandlers.delete(mockContext, {
        scopeType: 'global',
      });

      expect(result.success).toBe(true);
    });

    it('should throw when scopeId missing for non-global scope', async () => {
      await expect(
        summarizeHandlers.delete(mockContext, {
          scopeType: 'project',
        })
      ).rejects.toThrow('scopeId');
    });

    it('should throw when services not available', async () => {
      mockContext.services = {} as any;

      await expect(
        summarizeHandlers.delete(mockContext, {
          scopeType: 'global',
        })
      ).rejects.toThrow('services');
    });
  });
});
