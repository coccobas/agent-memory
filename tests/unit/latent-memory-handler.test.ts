import { describe, it, expect, vi, beforeEach } from 'vitest';
import { latentMemoryHandlers } from '../../src/mcp/handlers/latent-memory.handler.js';
import type { AppContext } from '../../src/core/context.js';

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
  let mockEmbeddingService: {
    isAvailable: ReturnType<typeof vi.fn>;
    embed: ReturnType<typeof vi.fn>;
  };
  let mockVectorService: {
    searchSimilar: ReturnType<typeof vi.fn>;
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
    mockEmbeddingService = {
      isAvailable: vi.fn().mockReturnValue(true),
      embed: vi.fn().mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
      }),
    };
    mockVectorService = {
      searchSimilar: vi.fn().mockResolvedValue([
        { entryType: 'guideline', entryId: 'g-1', text: 'Test', score: 0.9 },
      ]),
    };
    mockContext = {
      db: {} as any,
      repos: {
        tools: mockToolsRepo,
        guidelines: mockGuidelinesRepo,
        knowledge: mockKnowledgeRepo,
        experiences: mockExperiencesRepo,
      } as any,
      services: {
        embedding: mockEmbeddingService,
        vector: mockVectorService,
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
      expect(result.latentMemory.text).toContain('Test Tool');
    });

    it('should create latent memory for guideline', async () => {
      const result = await latentMemoryHandlers.create(mockContext, {
        sourceType: 'guideline',
        sourceId: 'g-1',
      });

      expect(result.success).toBe(true);
      expect(result.latentMemory.sourceType).toBe('guideline');
      expect(result.latentMemory.text).toContain('Test Guideline');
    });

    it('should create latent memory for knowledge', async () => {
      const result = await latentMemoryHandlers.create(mockContext, {
        sourceType: 'knowledge',
        sourceId: 'k-1',
      });

      expect(result.success).toBe(true);
      expect(result.latentMemory.sourceType).toBe('knowledge');
      expect(result.latentMemory.text).toContain('Test Knowledge');
    });

    it('should create latent memory for experience', async () => {
      const result = await latentMemoryHandlers.create(mockContext, {
        sourceType: 'experience',
        sourceId: 'exp-1',
      });

      expect(result.success).toBe(true);
      expect(result.latentMemory.sourceType).toBe('experience');
      expect(result.latentMemory.text).toContain('Test Experience');
    });

    it('should use provided text instead of fetching', async () => {
      const result = await latentMemoryHandlers.create(mockContext, {
        sourceType: 'tool',
        sourceId: 't-1',
        text: 'Custom text content',
      });

      expect(result.latentMemory.text).toBe('Custom text content');
      expect(mockToolsRepo.getById).not.toHaveBeenCalled();
    });

    it('should generate embedding when service available', async () => {
      const result = await latentMemoryHandlers.create(mockContext, {
        sourceType: 'tool',
        sourceId: 't-1',
      });

      expect(result.latentMemory.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(mockEmbeddingService.embed).toHaveBeenCalled();
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
  });

  describe('get', () => {
    it('should get latent memory by source', async () => {
      const result = await latentMemoryHandlers.get(mockContext, {
        sourceType: 'guideline',
        sourceId: 'g-1',
      });

      expect(result.latentMemory).toBeDefined();
      expect(result.latentMemory?.sourceType).toBe('guideline');
      expect(result.latentMemory?.lastAccessed).toBeDefined();
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
      expect(result.results[0].sourceType).toBe('guideline');
      expect(result.meta.query).toBe('test query');
      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('test query');
    });

    it('should respect limit parameter', async () => {
      await latentMemoryHandlers.search(mockContext, {
        query: 'test query',
        limit: 5,
      });

      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        5
      );
    });

    it('should throw when query is missing', async () => {
      await expect(latentMemoryHandlers.search(mockContext, {})).rejects.toThrow(
        'query'
      );
    });

    it('should throw when embedding service unavailable', async () => {
      mockEmbeddingService.isAvailable.mockReturnValue(false);

      await expect(
        latentMemoryHandlers.search(mockContext, {
          query: 'test query',
        })
      ).rejects.toThrow();
    });

    it('should throw when vector service unavailable', async () => {
      mockContext.services = {
        embedding: mockEmbeddingService,
      } as any;

      await expect(
        latentMemoryHandlers.search(mockContext, {
          query: 'test query',
        })
      ).rejects.toThrow();
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

    it('should throw when neither sessionId nor conversationId provided', async () => {
      await expect(
        latentMemoryHandlers.inject(mockContext, {})
      ).rejects.toThrow('sessionId or conversationId');
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
    });

    it('should throw when sessionId is missing', async () => {
      await expect(
        latentMemoryHandlers.warm_session(mockContext, {})
      ).rejects.toThrow('sessionId');
    });
  });

  describe('stats', () => {
    it('should return cache statistics', async () => {
      const result = await latentMemoryHandlers.stats(mockContext, {});

      expect(result.stats).toBeDefined();
      expect(result.stats.totalEntries).toBeDefined();
      expect(result.stats.hitRate).toBeDefined();
    });
  });

  describe('prune', () => {
    it('should prune stale cache entries', async () => {
      const result = await latentMemoryHandlers.prune(mockContext, {});

      expect(result.success).toBe(true);
      expect(result.entriesRemoved).toBeDefined();
      expect(result.bytesFreed).toBeDefined();
    });
  });
});
