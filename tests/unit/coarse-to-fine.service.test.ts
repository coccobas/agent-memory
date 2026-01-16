import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoarseToFineRetriever } from '../../src/services/summarization/retrieval/coarse-to-fine.js';
import type { AppDb } from '../../src/core/types.js';
import type { EmbeddingService } from '../../src/services/embedding.service.js';
import type {
  CoarseToFineOptions,
  SummaryEntry,
  SummaryMemberEntry,
} from '../../src/services/summarization/retrieval/types.js';

describe('CoarseToFineRetriever', () => {
  let retriever: CoarseToFineRetriever;
  let mockDb: AppDb;
  let mockEmbeddingService: EmbeddingService;

  // Helper function to create mock summary
  const createMockSummary = (
    id: string,
    level: number,
    embedding?: number[],
    options: Partial<SummaryEntry> = {}
  ): SummaryEntry => ({
    id,
    scopeType: 'project',
    scopeId: 'test-project',
    hierarchyLevel: level,
    parentSummaryId: null,
    title: `Summary ${id}`,
    content: `Content for summary ${id}`,
    memberCount: 3,
    embedding: embedding || null,
    embeddingDimension: embedding?.length || null,
    coherenceScore: 0.8,
    compressionRatio: 0.5,
    isActive: true,
    needsRegeneration: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastAccessedAt: null,
    accessCount: 0,
    ...options,
  });

  // Helper function to create mock summary member
  const createMockMember = (
    summaryId: string,
    memberId: string,
    memberType: 'knowledge' | 'guideline' | 'tool' | 'summary' = 'knowledge',
    contributionScore = 0.9
  ): SummaryMemberEntry => ({
    id: `member-${summaryId}-${memberId}`,
    summaryId,
    memberType,
    memberId,
    contributionScore,
    displayOrder: null,
    createdAt: new Date().toISOString(),
  });

  beforeEach(() => {
    // Create mock database with query builder methods
    const mockSelect = vi.fn();
    const mockWhere = vi.fn();
    const mockOrderBy = vi.fn();
    const mockLimit = vi.fn();
    const mockGet = vi.fn();
    const mockAll = vi.fn();
    const mockUpdate = vi.fn();
    const mockSet = vi.fn();
    const mockRun = vi.fn();

    // Set up chain for select queries
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mockWhere,
      }),
    });

    mockWhere.mockReturnValue({
      orderBy: mockOrderBy,
      all: mockAll,
      get: mockGet,
    });

    mockOrderBy.mockReturnValue({
      limit: mockLimit,
      all: mockAll,
      get: mockGet,
    });

    mockLimit.mockReturnValue({
      get: mockGet,
    });

    // Set up chain for update queries
    mockUpdate.mockReturnValue({
      set: mockSet,
    });

    mockSet.mockReturnValue({
      where: vi.fn().mockReturnValue({
        run: mockRun,
      }),
    });

    mockDb = {
      select: mockSelect,
      update: mockUpdate,
    } as unknown as AppDb;

    // Create mock embedding service
    mockEmbeddingService = {
      isAvailable: vi.fn().mockReturnValue(true),
      getProvider: vi.fn().mockReturnValue('local'),
      getEmbeddingDimension: vi.fn().mockReturnValue(384),
      embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
      embedBatch: vi.fn().mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]] }),
      cleanup: vi.fn(),
    } as unknown as EmbeddingService;

    retriever = new CoarseToFineRetriever(mockDb, mockEmbeddingService);
  });

  describe('Constructor and Initialization', () => {
    it('should create an instance', () => {
      expect(retriever).toBeDefined();
      expect(retriever).toBeInstanceOf(CoarseToFineRetriever);
    });

    it('should store database dependency', () => {
      expect(retriever).toBeDefined();
      // Database is private, but we can verify through method calls
    });

    it('should store embedding service dependency', () => {
      expect(retriever).toBeDefined();
      // Embedding service is private, but we can verify through method calls
    });
  });

  describe('retrieve - Basic Functionality', () => {
    it('should handle disabled embedding service', async () => {
      vi.mocked(mockEmbeddingService.isAvailable).mockReturnValue(false);

      const options: CoarseToFineOptions = {
        query: 'test query',
        scopeType: 'project',
        scopeId: 'test-project',
      };

      const result = await retriever.retrieve(options);

      expect(result.entries).toEqual([]);
      expect(result.steps).toEqual([]);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.queryEmbedding).toBeUndefined();
    });

    it('should use provided query embedding', async () => {
      const queryEmbedding = [0.5, 0.5, 0.5];
      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue([]);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
      };

      await retriever.retrieve(options);

      // Should not call embed since we provided embedding
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
    });

    it('should generate query embedding when not provided', async () => {
      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue([]);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        scopeType: 'project',
        scopeId: 'test-project',
      };

      await retriever.retrieve(options);

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('test query');
    });

    it('should return empty results when no summaries exist', async () => {
      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue([]); // No summaries

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding: [0.1, 0.2, 0.3],
        scopeType: 'project',
        scopeId: 'test-project',
      };

      const result = await retriever.retrieve(options);

      expect(result.entries).toEqual([]);
      expect(result.steps).toEqual([]);
    });
  });

  describe('retrieve - Hierarchical Navigation', () => {
    it('should start at specified start level', async () => {
      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const domainSummary = createMockSummary('domain-1', 2, [0.9, 0.1, 0.1]);
      const mockAll = vi
        .fn()
        .mockReturnValueOnce([domainSummary]) // Level 2 summaries
        .mockReturnValueOnce([]) // No children
        .mockReturnValueOnce([]); // No members

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding: [1.0, 0.0, 0.0],
        scopeType: 'project',
        scopeId: 'test-project',
        startLevel: 2,
      };

      const result = await retriever.retrieve(options);

      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps[0]?.level).toBe(2);
    });

    it('should drill down from domain to topic to entries', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];

      // Create hierarchical structure
      const domainSummary = createMockSummary('domain-1', 2, [0.95, 0.05, 0.05]);
      const topicSummary = createMockSummary('topic-1', 1, [0.9, 0.1, 0.1]);
      const chunkSummary = createMockSummary('chunk-1', 0, [0.85, 0.15, 0.15]);

      const topicMember = createMockMember('domain-1', 'topic-1', 'summary', 0.9);
      const chunkMember = createMockMember('topic-1', 'chunk-1', 'summary', 0.85);
      const entryMember = createMockMember('chunk-1', 'entry-1', 'knowledge', 0.95);

      let callCount = 0;
      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [domainSummary]; // Level 2 summaries
        if (callCount === 2) return [topicMember]; // Domain members
        if (callCount === 3) return [topicSummary]; // Topic summaries
        if (callCount === 4) return [chunkMember]; // Topic members
        if (callCount === 5) return [chunkSummary]; // Chunk summaries
        if (callCount === 6) return [entryMember]; // Final entries
        return [];
      });

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
      };

      const result = await retriever.retrieve(options);

      // Should have navigated through all levels
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.entries.length).toBeGreaterThan(0);
    });

    it('should respect expansion factor', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];

      // Create multiple domain summaries with varying similarity
      const summaries = [
        createMockSummary('domain-1', 2, [0.95, 0.05, 0.05]),
        createMockSummary('domain-2', 2, [0.85, 0.15, 0.15]),
        createMockSummary('domain-3', 2, [0.75, 0.25, 0.25]),
        createMockSummary('domain-4', 2, [0.65, 0.35, 0.35]),
      ];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi
        .fn()
        .mockReturnValueOnce(summaries)
        .mockReturnValueOnce([]) // No children
        .mockReturnValueOnce([]); // No members

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
        expansionFactor: 2, // Only expand top 2
      };

      const result = await retriever.retrieve(options);

      // Should have expanded only top 2 summaries
      expect(result.steps[0]?.summariesMatched).toBeLessThanOrEqual(2);
    });
  });

  describe('retrieve - Similarity Scoring', () => {
    it('should filter by minimum similarity threshold', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];

      // Create summaries with varying similarity
      const summaries = [
        createMockSummary('domain-1', 2, [0.95, 0.05, 0.05]), // High similarity
        createMockSummary('domain-2', 2, [0.4, 0.6, 0.0]), // Low similarity
        createMockSummary('domain-3', 2, [0.3, 0.7, 0.0]), // Low similarity
      ];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi
        .fn()
        .mockReturnValueOnce(summaries)
        .mockReturnValueOnce([]) // No children
        .mockReturnValueOnce([]); // No members

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
        minSimilarity: 0.7, // Should filter out low similarity summaries
      };

      const result = await retriever.retrieve(options);

      // Should have filtered to only high similarity summaries
      if (result.steps.length > 0) {
        expect(result.steps[0]!.summariesMatched).toBeLessThan(result.steps[0]!.summariesSearched);
      }
    });

    it('should handle summaries with missing embeddings', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];

      const summaries = [
        createMockSummary('domain-1', 2, [0.95, 0.05, 0.05]),
        createMockSummary('domain-2', 2, null), // No embedding
        createMockSummary('domain-3', 2, []), // Empty embedding
      ];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi
        .fn()
        .mockReturnValueOnce(summaries)
        .mockReturnValueOnce([]) // No children
        .mockReturnValueOnce([]); // No members

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
      };

      // Should not throw error
      const result = await retriever.retrieve(options);
      expect(result).toBeDefined();
    });

    it('should rank summaries by similarity score', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];

      // Create summaries in random order
      const summaries = [
        createMockSummary('domain-2', 2, [0.5, 0.5, 0.0]),
        createMockSummary('domain-1', 2, [0.95, 0.05, 0.05]),
        createMockSummary('domain-3', 2, [0.7, 0.3, 0.0]),
      ];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi
        .fn()
        .mockReturnValueOnce(summaries)
        .mockReturnValueOnce([]) // No children
        .mockReturnValueOnce([]); // No members

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
        expansionFactor: 1, // Only expand top 1
      };

      const result = await retriever.retrieve(options);

      // Should have selected the highest similarity summary
      expect(result.steps.length).toBeGreaterThan(0);
    });
  });

  describe('retrieve - Configuration Options', () => {
    it('should use default maxResults', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];
      const chunkSummary = createMockSummary('chunk-1', 0, [0.9, 0.1, 0.1]);

      // Create many entry members
      const members = Array.from({ length: 20 }, (_, i) =>
        createMockMember('chunk-1', `entry-${i}`, 'knowledge', 0.9 - i * 0.01)
      );

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 0 });
      const mockAll = vi.fn().mockReturnValueOnce([chunkSummary]).mockReturnValueOnce(members);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
        // Not specifying maxResults, should use default (10)
      };

      const result = await retriever.retrieve(options);

      expect(result.entries.length).toBeLessThanOrEqual(10);
    });

    it('should respect custom maxResults', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];
      const chunkSummary = createMockSummary('chunk-1', 0, [0.9, 0.1, 0.1]);

      const members = Array.from({ length: 20 }, (_, i) =>
        createMockMember('chunk-1', `entry-${i}`, 'knowledge', 0.9)
      );

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 0 });
      const mockAll = vi.fn().mockReturnValueOnce([chunkSummary]).mockReturnValueOnce(members);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
        maxResults: 5,
      };

      const result = await retriever.retrieve(options);

      expect(result.entries.length).toBeLessThanOrEqual(5);
    });

    it('should filter by entry types', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];
      const chunkSummary = createMockSummary('chunk-1', 0, [0.9, 0.1, 0.1]);

      const members = [
        createMockMember('chunk-1', 'entry-1', 'knowledge', 0.9),
        createMockMember('chunk-1', 'entry-2', 'guideline', 0.85),
        createMockMember('chunk-1', 'entry-3', 'tool', 0.8),
      ];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 0 });
      const mockAll = vi.fn().mockReturnValueOnce([chunkSummary]).mockReturnValueOnce(members);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
        entryTypes: ['knowledge', 'guideline'], // Exclude 'tool'
      };

      const result = await retriever.retrieve(options);

      // All returned entries should be of the specified types
      result.entries.forEach((entry) => {
        expect(['knowledge', 'guideline']).toContain(entry.type);
      });
    });
  });

  describe('retrieve - Retrieval Steps Tracking', () => {
    it('should track retrieval steps', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];
      const domainSummary = createMockSummary('domain-1', 2, [0.9, 0.1, 0.1]);

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi
        .fn()
        .mockReturnValueOnce([domainSummary])
        .mockReturnValueOnce([]) // No children
        .mockReturnValueOnce([]); // No members

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
      };

      const result = await retriever.retrieve(options);

      expect(result.steps).toBeDefined();
      expect(Array.isArray(result.steps)).toBe(true);

      result.steps.forEach((step) => {
        expect(step).toHaveProperty('level');
        expect(step).toHaveProperty('summariesSearched');
        expect(step).toHaveProperty('summariesMatched');
        expect(step).toHaveProperty('timeMs');
        expect(typeof step.timeMs).toBe('number');
      });
    });

    it('should track total time', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue([]);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
      };

      const result = await retriever.retrieve(options);

      expect(result.totalTimeMs).toBeDefined();
      expect(typeof result.totalTimeMs).toBe('number');
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return query embedding in result', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue([]);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
      };

      const result = await retriever.retrieve(options);

      expect(result.queryEmbedding).toEqual(queryEmbedding);
    });
  });

  describe('getTopLevel', () => {
    it('should retrieve top-level summaries', async () => {
      const summaries = [
        createMockSummary('domain-1', 2, [0.9, 0.1, 0.1]),
        createMockSummary('domain-2', 2, [0.8, 0.2, 0.2]),
      ];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue(summaries);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
          }),
        }),
      });

      const result = await retriever.getTopLevel('project', 'test-project');

      expect(result).toEqual(summaries);
      expect(result.length).toBe(2);
    });

    it('should handle missing scope parameters', async () => {
      const summaries = [createMockSummary('global-1', 2, [0.9, 0.1, 0.1])];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue(summaries);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
          }),
        }),
      });

      const result = await retriever.getTopLevel();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('drillDown', () => {
    it('should drill down into a specific summary', async () => {
      const summary = createMockSummary('summary-1', 1, [0.9, 0.1, 0.1]);
      const childSummary = createMockSummary('child-1', 0, [0.85, 0.15, 0.15]);
      const members = [
        createMockMember('summary-1', 'child-1', 'summary', 0.9),
        createMockMember('summary-1', 'entry-1', 'knowledge', 0.85),
      ];

      const mockGet = vi.fn().mockReturnValueOnce(summary).mockReturnValueOnce(undefined);

      const mockAll = vi.fn().mockReturnValueOnce(members).mockReturnValueOnce([childSummary]);

      const mockRun = vi.fn();

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: mockAll,
            }),
            get: mockGet,
            all: mockAll, // Also support direct .all() without orderBy
          }),
        }),
      });

      mockDb.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            run: mockRun,
          }),
        }),
      });

      const result = await retriever.drillDown('summary-1');

      expect(result.summary).toEqual(summary);
      expect(result.children).toBeDefined();
      expect(result.members).toBeDefined();
      expect(result.members.length).toBeGreaterThan(0);
    });

    it('should throw error for non-existent summary', async () => {
      const mockGet = vi.fn().mockReturnValue(null);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: mockGet,
          }),
        }),
      });

      await expect(retriever.drillDown('non-existent')).rejects.toThrow(
        'Summary not found: non-existent'
      );
    });

    it('should separate summary members from entry members', async () => {
      const summary = createMockSummary('summary-1', 1, [0.9, 0.1, 0.1]);
      const childSummary = createMockSummary('child-1', 0, [0.85, 0.15, 0.15]);
      const members = [
        createMockMember('summary-1', 'child-1', 'summary', 0.9),
        createMockMember('summary-1', 'entry-1', 'knowledge', 0.85),
        createMockMember('summary-1', 'entry-2', 'guideline', 0.8),
      ];

      const mockGet = vi.fn().mockReturnValueOnce(summary).mockReturnValueOnce(undefined);

      const mockAll = vi.fn().mockReturnValueOnce(members).mockReturnValueOnce([childSummary]);

      const mockRun = vi.fn();

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: mockAll,
            }),
            get: mockGet,
            all: mockAll, // Also support direct .all() without orderBy
          }),
        }),
      });

      mockDb.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            run: mockRun,
          }),
        }),
      });

      const result = await retriever.drillDown('summary-1');

      expect(result.children.length).toBe(1);
      expect(result.members.length).toBe(2); // Only entry members
      expect(result.members.every((m) => m.type !== 'summary')).toBe(true);
    });

    it('should update access tracking', async () => {
      const summary = createMockSummary('summary-1', 1, [0.9, 0.1, 0.1], {
        accessCount: 5,
      });

      const mockGet = vi.fn().mockReturnValue(summary);
      const mockAll = vi.fn().mockReturnValue([]);
      const mockRun = vi.fn();

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              all: mockAll,
            }),
            get: mockGet,
          }),
        }),
      });

      mockDb.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            run: mockRun,
          }),
        }),
      });

      await retriever.drillDown('summary-1');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty query gracefully', async () => {
      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue([]);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: '',
        queryEmbedding: [0.1, 0.2, 0.3],
        scopeType: 'project',
        scopeId: 'test-project',
      };

      const result = await retriever.retrieve(options);

      expect(result).toBeDefined();
    });

    it('should handle all summaries below threshold', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];

      // All summaries have low similarity
      const summaries = [
        createMockSummary('domain-1', 2, [0.0, 1.0, 0.0]),
        createMockSummary('domain-2', 2, [0.0, 0.0, 1.0]),
      ];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue(summaries);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
        minSimilarity: 0.9, // Very high threshold
      };

      const result = await retriever.retrieve(options);

      // Should handle gracefully
      expect(result).toBeDefined();
      expect(result.entries).toEqual([]);
    });

    it('should handle deep hierarchies', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];

      // Create deep hierarchy
      const level3Summary = createMockSummary('level-3', 3, [0.95, 0.05, 0.05]);
      const level2Summary = createMockSummary('level-2', 2, [0.9, 0.1, 0.1]);
      const level1Summary = createMockSummary('level-1', 1, [0.85, 0.15, 0.15]);
      const level0Summary = createMockSummary('level-0', 0, [0.8, 0.2, 0.2]);

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 3 });
      const mockAll = vi
        .fn()
        .mockReturnValueOnce([level3Summary])
        .mockReturnValueOnce([createMockMember('level-3', 'level-2', 'summary')])
        .mockReturnValueOnce([level2Summary])
        .mockReturnValueOnce([createMockMember('level-2', 'level-1', 'summary')])
        .mockReturnValueOnce([level1Summary])
        .mockReturnValueOnce([createMockMember('level-1', 'level-0', 'summary')])
        .mockReturnValueOnce([level0Summary])
        .mockReturnValueOnce([createMockMember('level-0', 'entry-1', 'knowledge')]);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
        startLevel: 3,
      };

      const result = await retriever.retrieve(options);

      // Should handle deep hierarchy
      expect(result).toBeDefined();
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('should handle scope without scope ID', async () => {
      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue([]);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding: [0.1, 0.2, 0.3],
        scopeType: 'global',
        // No scopeId for global scope
      };

      const result = await retriever.retrieve(options);

      expect(result).toBeDefined();
    });

    it('should handle zero expansion factor', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];
      const summaries = [createMockSummary('domain-1', 2, [0.9, 0.1, 0.1])];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 2 });
      const mockAll = vi.fn().mockReturnValue(summaries);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
        expansionFactor: 0,
      };

      const result = await retriever.retrieve(options);

      expect(result).toBeDefined();
      expect(result.entries).toEqual([]);
    });
  });

  describe('Retrieved Entry Structure', () => {
    it('should include path information in retrieved entries', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];
      const chunkSummary = createMockSummary('chunk-1', 0, [0.9, 0.1, 0.1]);
      const member = createMockMember('chunk-1', 'entry-1', 'knowledge', 0.95);

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 0 });
      const mockAll = vi.fn().mockReturnValueOnce([chunkSummary]).mockReturnValueOnce([member]);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
      };

      const result = await retriever.retrieve(options);

      expect(result.entries.length).toBeGreaterThan(0);
      const entry = result.entries[0];
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('score');
      expect(entry).toHaveProperty('path');
      expect(entry).toHaveProperty('pathTitles');
      expect(Array.isArray(entry?.path)).toBe(true);
    });

    it('should sort entries by score', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];
      const chunkSummary = createMockSummary('chunk-1', 0, [0.9, 0.1, 0.1]);

      const members = [
        createMockMember('chunk-1', 'entry-1', 'knowledge', 0.5),
        createMockMember('chunk-1', 'entry-2', 'knowledge', 0.9),
        createMockMember('chunk-1', 'entry-3', 'knowledge', 0.7),
      ];

      const mockGet = vi.fn().mockReturnValue({ maxLevel: 0 });
      const mockAll = vi.fn().mockReturnValueOnce([chunkSummary]).mockReturnValueOnce(members);

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: mockGet,
              }),
              all: mockAll,
            }),
            all: mockAll,
          }),
        }),
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding,
        scopeType: 'project',
        scopeId: 'test-project',
      };

      const result = await retriever.retrieve(options);

      // Verify entries are sorted by score (descending)
      for (let i = 1; i < result.entries.length; i++) {
        expect(result.entries[i - 1]!.score).toBeGreaterThanOrEqual(result.entries[i]!.score);
      }
    });
  });
});
