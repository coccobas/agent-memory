import { describe, it, expect, vi, beforeEach } from 'vitest';
import { latentMemoryHandlers } from '../../src/mcp/handlers/latent-memory.handler.js';
import type { AppContext } from '../../src/core/context.js';
import type { LatentMemory } from '../../src/db/schema/latent-memories.js';

describe('Latent Memory Handler', () => {
  let mockContext: AppContext;
  let mockToolsRepo: {
    getById: ReturnType<typeof vi.fn>;
  };
  let mockGuidelinesRepo: {
    getById: ReturnType<typeof vi.fn>;
  };
  let mockKnowledgeRepo: {
    getById: ReturnType<typeof vi.fn>;
  };
  let mockExperiencesRepo: {
    getById: ReturnType<typeof vi.fn>;
  };
  let mockSessionsRepo: {
    getById: ReturnType<typeof vi.fn>;
  };
  let mockEmbeddingService: {
    isAvailable: ReturnType<typeof vi.fn>;
    embed: ReturnType<typeof vi.fn>;
  };
  let mockVectorService: {
    isAvailable: ReturnType<typeof vi.fn>;
    searchSimilar: ReturnType<typeof vi.fn>;
    getCount: ReturnType<typeof vi.fn>;
  };
  let mockLatentMemoryService: {
    isAvailable: ReturnType<typeof vi.fn>;
    createLatentMemory: ReturnType<typeof vi.fn>;
    getLatentMemory: ReturnType<typeof vi.fn>;
    findSimilar: ReturnType<typeof vi.fn>;
    pruneStale: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
  };

  const mockLatentMemory: LatentMemory = {
    id: 'lm-1',
    sourceType: 'tool',
    sourceId: 't-1',
    sourceVersionId: 'v-1',
    fullEmbedding: [0.1, 0.2, 0.3],
    reducedEmbedding: null,
    fullDimension: 3,
    reducedDimension: null,
    compressionMethod: 'none',
    textPreview: 'Test Tool\nA test tool',
    importanceScore: 0.5,
    sessionId: null,
    expiresAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    lastAccessedAt: '2024-01-01T00:00:00.000Z',
    accessCount: 0,
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockToolsRepo = {
      getById: vi.fn().mockResolvedValue({
        id: 't-1',
        name: 'Test Tool',
        currentVersion: { description: 'A test tool' },
      }),
    };
    mockGuidelinesRepo = {
      getById: vi.fn().mockResolvedValue({
        id: 'g-1',
        name: 'Test Guideline',
        currentVersion: { content: 'Always test' },
      }),
    };
    mockKnowledgeRepo = {
      getById: vi.fn().mockResolvedValue({
        id: 'k-1',
        title: 'Test Knowledge',
        currentVersion: { content: 'Important fact' },
      }),
    };
    mockExperiencesRepo = {
      getById: vi.fn().mockResolvedValue({
        id: 'exp-1',
        title: 'Test Experience',
        currentVersion: { content: 'Learned something' },
      }),
    };
    mockSessionsRepo = {
      getById: vi.fn().mockResolvedValue({
        id: 'sess-1',
        name: 'Test Session',
        purpose: 'Testing latent memory',
      }),
    };
    mockEmbeddingService = {
      isAvailable: vi.fn().mockReturnValue(true),
      embed: vi.fn().mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
      }),
    };
    mockVectorService = {
      isAvailable: vi.fn().mockReturnValue(true),
      searchSimilar: vi
        .fn()
        .mockResolvedValue([{ entryType: 'guideline', entryId: 'g-1', text: 'Test', score: 0.9 }]),
      getCount: vi.fn().mockResolvedValue(100),
    };
    mockLatentMemoryService = {
      isAvailable: vi.fn().mockReturnValue(true),
      createLatentMemory: vi.fn().mockResolvedValue(mockLatentMemory),
      getLatentMemory: vi.fn().mockResolvedValue(mockLatentMemory),
      findSimilar: vi.fn().mockResolvedValue([{ ...mockLatentMemory, similarityScore: 0.9 }]),
      pruneStale: vi.fn().mockResolvedValue(5),
      getStats: vi.fn().mockResolvedValue({
        totalVectorCount: 100,
        compressionEnabled: false,
        cacheEnabled: true,
        repositoryAvailable: true,
      }),
    };
    mockContext = {
      db: {} as any,
      repos: {
        tools: mockToolsRepo,
        guidelines: mockGuidelinesRepo,
        knowledge: mockKnowledgeRepo,
        experiences: mockExperiencesRepo,
        sessions: mockSessionsRepo,
      } as any,
      services: {
        embedding: mockEmbeddingService,
        vector: mockVectorService,
        latentMemory: mockLatentMemoryService,
      } as any,
    };
  });

  describe('create', () => {
    it('should create latent memory for tool', async () => {
      const result = await latentMemoryHandlers.create(mockContext, {
        sourceType: 'tool',
        sourceId: 't-1',
      });

      expect(result.success).toBe(true);
      expect(result.latentMemory.sourceType).toBe('tool');
      expect(result.latentMemory.sourceId).toBe('t-1');
      expect(mockLatentMemoryService.createLatentMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'tool',
          sourceId: 't-1',
        })
      );
    });

    it('should create latent memory for guideline', async () => {
      mockLatentMemoryService.createLatentMemory.mockResolvedValue({
        ...mockLatentMemory,
        sourceType: 'guideline',
        sourceId: 'g-1',
        textPreview: 'Test Guideline\nAlways test',
      });

      const result = await latentMemoryHandlers.create(mockContext, {
        sourceType: 'guideline',
        sourceId: 'g-1',
      });

      expect(result.success).toBe(true);
      expect(result.latentMemory.sourceType).toBe('guideline');
    });

    it('should create latent memory for knowledge', async () => {
      mockLatentMemoryService.createLatentMemory.mockResolvedValue({
        ...mockLatentMemory,
        sourceType: 'knowledge',
        sourceId: 'k-1',
        textPreview: 'Test Knowledge\nImportant fact',
      });

      const result = await latentMemoryHandlers.create(mockContext, {
        sourceType: 'knowledge',
        sourceId: 'k-1',
      });

      expect(result.success).toBe(true);
      expect(result.latentMemory.sourceType).toBe('knowledge');
    });

    it('should create latent memory for experience', async () => {
      mockLatentMemoryService.createLatentMemory.mockResolvedValue({
        ...mockLatentMemory,
        sourceType: 'experience',
        sourceId: 'exp-1',
        textPreview: 'Test Experience\nLearned something',
      });

      const result = await latentMemoryHandlers.create(mockContext, {
        sourceType: 'experience',
        sourceId: 'exp-1',
      });

      expect(result.success).toBe(true);
      expect(result.latentMemory.sourceType).toBe('experience');
    });

    it('should use provided text instead of fetching', async () => {
      const result = await latentMemoryHandlers.create(mockContext, {
        sourceType: 'tool',
        sourceId: 't-1',
        text: 'Custom text content',
      });

      expect(result.success).toBe(true);
      expect(mockToolsRepo.getById).not.toHaveBeenCalled();
      expect(mockLatentMemoryService.createLatentMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Custom text content',
        })
      );
    });

    it('should throw when sourceType is missing', async () => {
      await expect(
        latentMemoryHandlers.create(mockContext, {
          sourceId: 't-1',
        })
      ).rejects.toThrow('sourceType');
    });

    it('should throw when sourceId is missing', async () => {
      await expect(
        latentMemoryHandlers.create(mockContext, {
          sourceType: 'tool',
        })
      ).rejects.toThrow('sourceId');
    });

    it('should throw when sourceType is invalid', async () => {
      await expect(
        latentMemoryHandlers.create(mockContext, {
          sourceType: 'invalid',
          sourceId: 't-1',
        })
      ).rejects.toThrow('sourceType');
    });

    it('should throw when source entry not found', async () => {
      mockToolsRepo.getById.mockResolvedValue(null);

      await expect(
        latentMemoryHandlers.create(mockContext, {
          sourceType: 'tool',
          sourceId: 't-999',
        })
      ).rejects.toThrow();
    });

    it('should throw when latent memory service is unavailable', async () => {
      mockLatentMemoryService.isAvailable.mockReturnValue(false);

      await expect(
        latentMemoryHandlers.create(mockContext, {
          sourceType: 'tool',
          sourceId: 't-1',
        })
      ).rejects.toThrow('unavailable');
    });
  });

  describe('get', () => {
    it('should get latent memory by source', async () => {
      const result = await latentMemoryHandlers.get(mockContext, {
        sourceType: 'guideline',
        sourceId: 'g-1',
      });

      expect(result.latentMemory).toBeDefined();
      expect(mockLatentMemoryService.getLatentMemory).toHaveBeenCalledWith('guideline', 'g-1');
    });

    it('should return undefined when not found', async () => {
      mockLatentMemoryService.getLatentMemory.mockResolvedValue(undefined);

      const result = await latentMemoryHandlers.get(mockContext, {
        sourceType: 'guideline',
        sourceId: 'g-999',
      });

      expect(result.latentMemory).toBeUndefined();
    });

    it('should throw when sourceType is missing', async () => {
      await expect(
        latentMemoryHandlers.get(mockContext, {
          sourceId: 'g-1',
        })
      ).rejects.toThrow('sourceType');
    });

    it('should throw when sourceId is missing', async () => {
      await expect(
        latentMemoryHandlers.get(mockContext, {
          sourceType: 'guideline',
        })
      ).rejects.toThrow('sourceId');
    });
  });

  describe('search', () => {
    it('should search for similar latent memories', async () => {
      const result = await latentMemoryHandlers.search(mockContext, {
        query: 'test query',
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].sourceType).toBe('tool');
      expect(result.meta.query).toBe('test query');
      expect(mockLatentMemoryService.findSimilar).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({ limit: 10 })
      );
    });

    it('should respect limit parameter', async () => {
      await latentMemoryHandlers.search(mockContext, {
        query: 'test query',
        limit: 5,
      });

      expect(mockLatentMemoryService.findSimilar).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({ limit: 5 })
      );
    });

    it('should throw when query is missing', async () => {
      await expect(latentMemoryHandlers.search(mockContext, {})).rejects.toThrow('query');
    });

    it('should throw when service unavailable', async () => {
      mockLatentMemoryService.isAvailable.mockReturnValue(false);

      await expect(
        latentMemoryHandlers.search(mockContext, {
          query: 'test query',
        })
      ).rejects.toThrow('unavailable');
    });
  });

  describe('inject', () => {
    it('should inject context in markdown format', async () => {
      const result = await latentMemoryHandlers.inject(mockContext, {
        sessionId: 'sess-1',
      });

      expect(result.format).toBe('markdown');
      expect(typeof result.context).toBe('string');
      expect(result.tokenEstimate).toBeGreaterThan(0);
      expect(result.memoriesIncluded).toBeGreaterThanOrEqual(0);
    });

    it('should inject context in json format', async () => {
      const result = await latentMemoryHandlers.inject(mockContext, {
        sessionId: 'sess-1',
        format: 'json',
      });

      expect(result.format).toBe('json');
      expect(typeof result.context).toBe('object');
    });

    it('should inject context in natural language format', async () => {
      const result = await latentMemoryHandlers.inject(mockContext, {
        sessionId: 'sess-1',
        format: 'natural_language',
      });

      expect(result.format).toBe('natural_language');
      expect(typeof result.context).toBe('string');
    });

    it('should accept conversationId instead of sessionId', async () => {
      const result = await latentMemoryHandlers.inject(mockContext, {
        conversationId: 'conv-1',
      });

      expect(result).toBeDefined();
    });

    it('should accept query instead of sessionId', async () => {
      const result = await latentMemoryHandlers.inject(mockContext, {
        query: 'what do we know about testing',
      });

      expect(result).toBeDefined();
      expect(mockLatentMemoryService.findSimilar).toHaveBeenCalledWith(
        'what do we know about testing',
        expect.any(Object)
      );
    });

    it('should throw when neither sessionId, conversationId, nor query provided', async () => {
      await expect(latentMemoryHandlers.inject(mockContext, {})).rejects.toThrow(
        'sessionId, conversationId, or query'
      );
    });
  });

  describe('warm_session', () => {
    it('should warm session cache', async () => {
      const result = await latentMemoryHandlers.warm_session(mockContext, {
        sessionId: 'sess-1',
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('sess-1');
      expect(result.memoriesLoaded).toBeDefined();
      expect(mockLatentMemoryService.findSimilar).toHaveBeenCalled();
    });

    it('should throw when sessionId is missing', async () => {
      await expect(latentMemoryHandlers.warm_session(mockContext, {})).rejects.toThrow('sessionId');
    });

    it('should throw when session not found', async () => {
      mockSessionsRepo.getById.mockResolvedValue(null);

      await expect(
        latentMemoryHandlers.warm_session(mockContext, {
          sessionId: 'sess-999',
        })
      ).rejects.toThrow();
    });
  });

  describe('stats', () => {
    it('should return cache statistics', async () => {
      const result = await latentMemoryHandlers.stats(mockContext, {});

      expect(result.stats).toBeDefined();
      expect(result.stats.totalVectorCount).toBe(100);
      expect(result.stats.compressionEnabled).toBe(false);
      expect(result.stats.cacheEnabled).toBe(true);
    });

    it('should return availability info when service is not configured', async () => {
      mockContext.services.latentMemory = undefined as any;

      const result = await latentMemoryHandlers.stats(mockContext, {});

      expect(result.stats.totalVectorCount).toBe(0);
      expect(result.stats.embeddingServiceAvailable).toBe(true);
      expect(result.stats.vectorServiceAvailable).toBe(true);
    });
  });

  describe('prune', () => {
    it('should prune stale cache entries', async () => {
      const result = await latentMemoryHandlers.prune(mockContext, {});

      expect(result.success).toBe(true);
      expect(result.entriesRemoved).toBe(5);
      expect(result.staleDays).toBe(30); // default
      expect(mockLatentMemoryService.pruneStale).toHaveBeenCalledWith(30);
    });

    it('should respect staleDays parameter', async () => {
      const result = await latentMemoryHandlers.prune(mockContext, {
        staleDays: 7,
      });

      expect(result.staleDays).toBe(7);
      expect(mockLatentMemoryService.pruneStale).toHaveBeenCalledWith(7);
    });

    it('should throw when staleDays is invalid', async () => {
      await expect(
        latentMemoryHandlers.prune(mockContext, {
          staleDays: 0,
        })
      ).rejects.toThrow('staleDays');

      await expect(
        latentMemoryHandlers.prune(mockContext, {
          staleDays: -1,
        })
      ).rejects.toThrow('staleDays');
    });
  });
});
