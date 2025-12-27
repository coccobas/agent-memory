/**
 * Unit tests for LatentMemoryService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LatentMemoryService,
  type IKVCacheService,
  type ILatentMemoryRepository,
  type CreateLatentMemoryInput,
  type FindSimilarOptions,
  type LatentMemoryServiceConfig,
} from '../../src/services/latent-memory/latent-memory.service.js';
import type { EmbeddingService } from '../../src/services/embedding.service.js';
import type { VectorService } from '../../src/services/vector.service.js';
import type { CompressionStrategy } from '../../src/services/latent-memory/compression/types.js';
import type { LatentMemory } from '../../src/db/schema/latent-memories.js';

describe('LatentMemoryService', () => {
  let service: LatentMemoryService;
  let mockEmbeddingService: EmbeddingService;
  let mockVectorService: VectorService;
  let mockKVCache: IKVCacheService;
  let mockCompression: CompressionStrategy;
  let mockRepository: ILatentMemoryRepository;

  const mockEmbedding = new Array(1536).fill(0).map(() => Math.random());
  const mockReducedEmbedding = new Array(256).fill(0).map(() => Math.random());

  beforeEach(() => {
    // Mock EmbeddingService
    mockEmbeddingService = {
      isAvailable: vi.fn().mockReturnValue(true),
      embed: vi.fn().mockResolvedValue({
        embedding: mockEmbedding,
        model: 'text-embedding-ada-002',
      }),
    } as unknown as EmbeddingService;

    // Mock VectorService
    mockVectorService = {
      isAvailable: vi.fn().mockReturnValue(true),
      storeEmbedding: vi.fn().mockResolvedValue(undefined),
      searchSimilar: vi.fn().mockResolvedValue([
        {
          entryType: 'knowledge',
          entryId: 'entry-1',
          versionId: 'v1',
          score: 0.95,
          text: 'Test knowledge entry',
        },
      ]),
      getCount: vi.fn().mockResolvedValue(100),
    } as unknown as VectorService;

    // Mock KVCacheService
    mockKVCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      isAvailable: vi.fn().mockReturnValue(true),
    };

    // Mock CompressionStrategy
    mockCompression = {
      compress: vi.fn().mockReturnValue(mockReducedEmbedding),
      decompress: vi.fn().mockReturnValue(mockEmbedding),
      getOutputDimension: vi.fn().mockReturnValue(256),
      getName: vi.fn().mockReturnValue('quantized'),
    };

    // Mock Repository
    mockRepository = {
      create: vi.fn().mockResolvedValue(undefined),
      findBySource: vi.fn().mockResolvedValue(null),
      updateAccess: vi.fn().mockResolvedValue(undefined),
      updateImportance: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteStale: vi.fn().mockResolvedValue(0),
      findBySession: vi.fn().mockResolvedValue([]),
    };

    service = new LatentMemoryService(
      mockEmbeddingService,
      mockVectorService,
      mockKVCache,
      mockCompression,
      mockRepository
    );
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const svc = new LatentMemoryService(mockEmbeddingService, mockVectorService);
      expect(svc).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const config: LatentMemoryServiceConfig = {
        enableCompression: false,
        enableCache: false,
        defaultImportance: 0.8,
        cacheTtlSeconds: 7200,
      };
      const svc = new LatentMemoryService(
        mockEmbeddingService,
        mockVectorService,
        mockKVCache,
        mockCompression,
        mockRepository,
        config
      );
      expect(svc).toBeDefined();
    });

    it('should initialize without optional dependencies', () => {
      const svc = new LatentMemoryService(mockEmbeddingService, mockVectorService);
      expect(svc).toBeDefined();
    });
  });

  describe('isAvailable', () => {
    it('should return true when both embedding and vector services are available', () => {
      expect(service.isAvailable()).toBe(true);
      expect(mockEmbeddingService.isAvailable).toHaveBeenCalled();
      expect(mockVectorService.isAvailable).toHaveBeenCalled();
    });

    it('should return false when embedding service is not available', () => {
      vi.mocked(mockEmbeddingService.isAvailable).mockReturnValue(false);
      expect(service.isAvailable()).toBe(false);
    });

    it('should return false when vector service is not available', () => {
      vi.mocked(mockVectorService.isAvailable).mockReturnValue(false);
      expect(service.isAvailable()).toBe(false);
    });

    it('should return false when both services are not available', () => {
      vi.mocked(mockEmbeddingService.isAvailable).mockReturnValue(false);
      vi.mocked(mockVectorService.isAvailable).mockReturnValue(false);
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('createLatentMemory', () => {
    const input: CreateLatentMemoryInput = {
      sourceType: 'knowledge',
      sourceId: 'entry-123',
      text: 'This is a test knowledge entry about TypeScript',
      importanceScore: 0.7,
    };

    it('should throw error when service is not available', async () => {
      vi.mocked(mockEmbeddingService.isAvailable).mockReturnValue(false);
      await expect(service.createLatentMemory(input)).rejects.toThrow(
        'LatentMemoryService is unavailable: embeddings or vectors disabled'
      );
    });

    it('should create latent memory with full embedding', async () => {
      const result = await service.createLatentMemory(input);

      expect(result).toBeDefined();
      expect(result.sourceType).toBe('knowledge');
      expect(result.sourceId).toBe('entry-123');
      expect(result.fullEmbedding).toEqual(mockEmbedding);
      expect(result.fullDimension).toBe(1536);
      expect(result.importanceScore).toBe(0.7);
      expect(mockEmbeddingService.embed).toHaveBeenCalledWith(input.text);
    });

    it('should create latent memory with compression enabled', async () => {
      const result = await service.createLatentMemory(input);

      expect(result.reducedEmbedding).toEqual(mockReducedEmbedding);
      expect(result.reducedDimension).toBe(256);
      expect(result.compressionMethod).toBe('quantized');
      expect(mockCompression.compress).toHaveBeenCalledWith(mockEmbedding);
    });

    it('should store compressed embedding in vector DB when compression is enabled', async () => {
      await service.createLatentMemory(input);

      expect(mockVectorService.storeEmbedding).toHaveBeenCalledWith(
        'knowledge',
        'entry-123',
        expect.any(String),
        expect.any(String),
        mockReducedEmbedding,
        'text-embedding-ada-002'
      );
    });

    it('should store full embedding in vector DB when compression is disabled', async () => {
      const serviceNoCompression = new LatentMemoryService(
        mockEmbeddingService,
        mockVectorService,
        mockKVCache,
        mockCompression,
        mockRepository,
        { enableCompression: false }
      );

      await serviceNoCompression.createLatentMemory(input);

      expect(mockVectorService.storeEmbedding).toHaveBeenCalledWith(
        'knowledge',
        'entry-123',
        expect.any(String),
        expect.any(String),
        mockEmbedding,
        'text-embedding-ada-002'
      );
    });

    it('should handle compression failure gracefully', async () => {
      vi.mocked(mockCompression.compress).mockImplementation(() => {
        throw new Error('Compression failed');
      });

      const result = await service.createLatentMemory(input);

      expect(result.reducedEmbedding).toBeNull();
      expect(result.compressionMethod).toBe('none');
      expect(mockVectorService.storeEmbedding).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        mockEmbedding,
        expect.any(String)
      );
    });

    it('should cache metadata when cache is enabled', async () => {
      await service.createLatentMemory(input);

      expect(mockKVCache.set).toHaveBeenCalledWith(
        expect.stringContaining('latent:knowledge:entry-123'),
        expect.objectContaining({
          sourceType: 'knowledge',
          sourceId: 'entry-123',
        }),
        3600
      );
    });

    it('should persist to repository when available', async () => {
      await service.createLatentMemory(input);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'knowledge',
          sourceId: 'entry-123',
          fullEmbedding: mockEmbedding,
          reducedEmbedding: mockReducedEmbedding,
        })
      );
    });

    it('should handle repository failure gracefully', async () => {
      vi.mocked(mockRepository.create).mockRejectedValue(new Error('DB error'));

      const result = await service.createLatentMemory(input);
      expect(result).toBeDefined();
    });

    it('should use default importance score when not provided', async () => {
      const inputNoScore = { ...input, importanceScore: undefined };
      const result = await service.createLatentMemory(inputNoScore);

      expect(result.importanceScore).toBe(0.5);
    });

    it('should include session ID when provided', async () => {
      const inputWithSession = { ...input, sessionId: 'session-123' };
      const result = await service.createLatentMemory(inputWithSession);

      expect(result.sessionId).toBe('session-123');
    });

    it('should include expiration timestamp when provided', async () => {
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      const inputWithExpiry = { ...input, expiresAt };
      const result = await service.createLatentMemory(inputWithExpiry);

      expect(result.expiresAt).toBe(expiresAt);
    });

    it('should create text preview from long text', async () => {
      const longText = 'A'.repeat(300);
      const inputLongText = { ...input, text: longText };
      const result = await service.createLatentMemory(inputLongText);

      expect(result.textPreview).toHaveLength(200);
      expect(result.textPreview?.endsWith('...')).toBe(true);
    });

    it('should use full text for short text preview', async () => {
      const shortText = 'Short text';
      const inputShortText = { ...input, text: shortText };
      const result = await service.createLatentMemory(inputShortText);

      expect(result.textPreview).toBe(shortText);
    });

    it('should handle cache write failure gracefully', async () => {
      vi.mocked(mockKVCache.set).mockRejectedValue(new Error('Cache error'));

      const result = await service.createLatentMemory(input);
      expect(result).toBeDefined();
    });

    it('should use sourceVersionId when provided', async () => {
      const inputWithVersion = { ...input, sourceVersionId: 'version-456' };
      await service.createLatentMemory(inputWithVersion);

      expect(mockVectorService.storeEmbedding).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'version-456',
        expect.any(String),
        expect.any(Array),
        expect.any(String)
      );
    });
  });

  describe('getLatentMemory', () => {
    const mockMemory: LatentMemory = {
      id: 'mem-123',
      sourceType: 'knowledge',
      sourceId: 'entry-123',
      sourceVersionId: 'v1',
      fullEmbedding: mockEmbedding,
      reducedEmbedding: mockReducedEmbedding,
      fullDimension: 1536,
      reducedDimension: 256,
      compressionMethod: 'quantized',
      textPreview: 'Test preview',
      importanceScore: 0.7,
      sessionId: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 5,
      isActive: true,
    };

    it('should return cached memory when available', async () => {
      vi.mocked(mockKVCache.get).mockResolvedValue(mockMemory);

      const result = await service.getLatentMemory('knowledge', 'entry-123');

      expect(result).toEqual(mockMemory);
      expect(mockKVCache.get).toHaveBeenCalledWith('latent:knowledge:entry-123');
      expect(mockRepository.findBySource).not.toHaveBeenCalled();
    });

    it('should query repository when cache miss occurs', async () => {
      vi.mocked(mockKVCache.get).mockResolvedValue(null);
      vi.mocked(mockRepository.findBySource).mockResolvedValue(mockMemory);

      const result = await service.getLatentMemory('knowledge', 'entry-123');

      expect(result).toEqual(mockMemory);
      expect(mockRepository.findBySource).toHaveBeenCalledWith('knowledge', 'entry-123');
    });

    it('should update cache after repository query', async () => {
      vi.mocked(mockKVCache.get).mockResolvedValue(null);
      vi.mocked(mockRepository.findBySource).mockResolvedValue(mockMemory);

      await service.getLatentMemory('knowledge', 'entry-123');

      expect(mockKVCache.set).toHaveBeenCalledWith(
        'latent:knowledge:entry-123',
        mockMemory,
        3600
      );
    });

    it('should return undefined when memory not found', async () => {
      vi.mocked(mockKVCache.get).mockResolvedValue(null);
      vi.mocked(mockRepository.findBySource).mockResolvedValue(null);

      const result = await service.getLatentMemory('knowledge', 'entry-999');

      expect(result).toBeUndefined();
    });

    it('should handle cache read failure gracefully', async () => {
      vi.mocked(mockKVCache.get).mockRejectedValue(new Error('Cache error'));
      vi.mocked(mockRepository.findBySource).mockResolvedValue(mockMemory);

      const result = await service.getLatentMemory('knowledge', 'entry-123');

      expect(result).toEqual(mockMemory);
    });

    it('should work without cache', async () => {
      const serviceNoCache = new LatentMemoryService(
        mockEmbeddingService,
        mockVectorService,
        undefined,
        mockCompression,
        mockRepository
      );

      vi.mocked(mockRepository.findBySource).mockResolvedValue(mockMemory);

      const result = await serviceNoCache.getLatentMemory('knowledge', 'entry-123');

      expect(result).toEqual(mockMemory);
    });

    it('should work without repository', async () => {
      const serviceNoRepo = new LatentMemoryService(
        mockEmbeddingService,
        mockVectorService,
        mockKVCache,
        mockCompression
      );

      vi.mocked(mockKVCache.get).mockResolvedValue(null);

      const result = await serviceNoRepo.getLatentMemory('knowledge', 'entry-123');

      expect(result).toBeUndefined();
    });
  });

  describe('findSimilar', () => {
    const mockMemory: LatentMemory = {
      id: 'mem-123',
      sourceType: 'knowledge',
      sourceId: 'entry-1',
      sourceVersionId: 'v1',
      fullEmbedding: mockEmbedding,
      reducedEmbedding: mockReducedEmbedding,
      fullDimension: 1536,
      reducedDimension: 256,
      compressionMethod: 'quantized',
      textPreview: 'Test knowledge entry',
      importanceScore: 0.7,
      sessionId: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 5,
      isActive: true,
    };

    it('should throw error when service is not available', async () => {
      vi.mocked(mockEmbeddingService.isAvailable).mockReturnValue(false);
      await expect(service.findSimilar('query text')).rejects.toThrow(
        'LatentMemoryService is unavailable: embeddings or vectors disabled'
      );
    });

    it('should find similar memories', async () => {
      vi.mocked(mockRepository.findBySource).mockResolvedValue(mockMemory);

      const results = await service.findSimilar('test query');

      expect(results).toHaveLength(1);
      expect(results[0]?.similarityScore).toBe(0.95);
      expect(results[0]?.sourceId).toBe('entry-1');
    });

    it('should compress query embedding when compression is enabled', async () => {
      await service.findSimilar('test query');

      expect(mockCompression.compress).toHaveBeenCalledWith(mockEmbedding);
      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        mockReducedEmbedding,
        expect.any(Array),
        expect.any(Number)
      );
    });

    it('should handle query compression failure gracefully', async () => {
      vi.mocked(mockCompression.compress).mockImplementation(() => {
        throw new Error('Compression failed');
      });

      await service.findSimilar('test query');

      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        mockEmbedding,
        expect.any(Array),
        expect.any(Number)
      );
    });

    it('should respect limit option', async () => {
      const options: FindSimilarOptions = { limit: 5 };
      await service.findSimilar('test query', options);

      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        5
      );
    });

    it('should use default limit when not specified', async () => {
      await service.findSimilar('test query');

      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        20
      );
    });

    it('should filter by minScore', async () => {
      vi.mocked(mockVectorService.searchSimilar).mockResolvedValue([
        {
          entryType: 'knowledge',
          entryId: 'entry-1',
          versionId: 'v1',
          score: 0.5,
          text: 'Low score',
        },
      ]);

      const options: FindSimilarOptions = { minScore: 0.7 };
      const results = await service.findSimilar('test query', options);

      expect(results).toHaveLength(0);
    });

    it('should filter by sourceTypes', async () => {
      const options: FindSimilarOptions = { sourceTypes: ['knowledge', 'tool'] };
      await service.findSimilar('test query', options);

      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        expect.any(Array),
        ['knowledge', 'tool'],
        expect.any(Number)
      );
    });

    it('should use default sourceTypes when not specified', async () => {
      await service.findSimilar('test query');

      expect(mockVectorService.searchSimilar).toHaveBeenCalledWith(
        expect.any(Array),
        ['tool', 'guideline', 'knowledge', 'experience'],
        expect.any(Number)
      );
    });

    it('should filter by sessionId', async () => {
      const memoryWithSession = { ...mockMemory, sessionId: 'session-123' };
      vi.mocked(mockRepository.findBySource).mockResolvedValue(memoryWithSession);

      const options: FindSimilarOptions = { sessionId: 'session-123' };
      const results = await service.findSimilar('test query', options);

      expect(results).toHaveLength(1);
    });

    it('should exclude results with non-matching sessionId', async () => {
      const memoryWithSession = { ...mockMemory, sessionId: 'session-456' };
      vi.mocked(mockRepository.findBySource).mockResolvedValue(memoryWithSession);

      const options: FindSimilarOptions = { sessionId: 'session-123' };
      const results = await service.findSimilar('test query', options);

      expect(results).toHaveLength(0);
    });

    it('should filter out inactive memories', async () => {
      const inactiveMemory = { ...mockMemory, isActive: false };
      vi.mocked(mockRepository.findBySource).mockResolvedValue(inactiveMemory);

      const results = await service.findSimilar('test query');

      expect(results).toHaveLength(0);
    });

    it('should create minimal record when metadata not found', async () => {
      vi.mocked(mockRepository.findBySource).mockResolvedValue(null);

      const results = await service.findSimilar('test query');

      expect(results).toHaveLength(1);
      expect(results[0]?.textPreview).toBe('Test knowledge entry');
      expect(results[0]?.importanceScore).toBe(0.5);
    });

    it('should track access for found memories', async () => {
      vi.mocked(mockRepository.findBySource).mockResolvedValue(mockMemory);

      await service.findSimilar('test query');

      // Allow async tracking to complete
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockRepository.updateAccess).toHaveBeenCalledWith('mem-123');
    });
  });

  describe('trackAccess', () => {
    it('should track access when repository is available', async () => {
      await service.trackAccess('mem-123');

      expect(mockRepository.updateAccess).toHaveBeenCalledWith('mem-123');
    });

    it('should handle missing repository gracefully', async () => {
      const serviceNoRepo = new LatentMemoryService(
        mockEmbeddingService,
        mockVectorService,
        mockKVCache,
        mockCompression
      );

      await expect(serviceNoRepo.trackAccess('mem-123')).resolves.toBeUndefined();
    });

    it('should handle repository error gracefully', async () => {
      vi.mocked(mockRepository.updateAccess).mockRejectedValue(new Error('DB error'));

      await expect(service.trackAccess('mem-123')).resolves.toBeUndefined();
    });
  });

  describe('updateImportance', () => {
    it('should update importance score', async () => {
      await service.updateImportance('mem-123', 0.8);

      expect(mockRepository.updateImportance).toHaveBeenCalledWith('mem-123', 0.8);
    });

    it('should validate importance score range (too low)', async () => {
      await expect(service.updateImportance('mem-123', -0.1)).rejects.toThrow(
        'Validation error: importanceScore - must be between 0 and 1'
      );
    });

    it('should validate importance score range (too high)', async () => {
      await expect(service.updateImportance('mem-123', 1.5)).rejects.toThrow(
        'Validation error: importanceScore - must be between 0 and 1'
      );
    });

    it('should accept boundary values', async () => {
      await expect(service.updateImportance('mem-123', 0)).resolves.toBeUndefined();
      await expect(service.updateImportance('mem-123', 1)).resolves.toBeUndefined();
    });

    it('should handle missing repository gracefully', async () => {
      const serviceNoRepo = new LatentMemoryService(
        mockEmbeddingService,
        mockVectorService,
        mockKVCache,
        mockCompression
      );

      await expect(serviceNoRepo.updateImportance('mem-123', 0.8)).resolves.toBeUndefined();
    });

    it('should propagate repository errors', async () => {
      vi.mocked(mockRepository.updateImportance).mockRejectedValue(new Error('DB error'));

      await expect(service.updateImportance('mem-123', 0.8)).rejects.toThrow('DB error');
    });
  });

  describe('pruneStale', () => {
    it('should prune stale memories', async () => {
      vi.mocked(mockRepository.deleteStale).mockResolvedValue(42);

      const count = await service.pruneStale(30);

      expect(count).toBe(42);
      expect(mockRepository.deleteStale).toHaveBeenCalledWith(30);
    });

    it('should validate staleDays parameter (zero)', async () => {
      await expect(service.pruneStale(0)).rejects.toThrow('Validation error: staleDays - must be greater than 0');
    });

    it('should validate staleDays parameter (negative)', async () => {
      await expect(service.pruneStale(-5)).rejects.toThrow('Validation error: staleDays - must be greater than 0');
    });

    it('should handle missing repository gracefully', async () => {
      const serviceNoRepo = new LatentMemoryService(
        mockEmbeddingService,
        mockVectorService,
        mockKVCache,
        mockCompression
      );

      const count = await serviceNoRepo.pruneStale(30);

      expect(count).toBe(0);
    });

    it('should propagate repository errors', async () => {
      vi.mocked(mockRepository.deleteStale).mockRejectedValue(new Error('DB error'));

      await expect(service.pruneStale(30)).rejects.toThrow('DB error');
    });
  });

  describe('clearCache', () => {
    it('should clear cache when available', async () => {
      await service.clearCache();

      expect(mockKVCache.clear).toHaveBeenCalled();
    });

    it('should handle missing cache gracefully', async () => {
      const serviceNoCache = new LatentMemoryService(
        mockEmbeddingService,
        mockVectorService,
        undefined,
        mockCompression,
        mockRepository
      );

      await expect(serviceNoCache.clearCache()).resolves.toBeUndefined();
    });

    it('should handle unavailable cache gracefully', async () => {
      vi.mocked(mockKVCache.isAvailable).mockReturnValue(false);

      await expect(service.clearCache()).resolves.toBeUndefined();
    });

    it('should propagate cache errors', async () => {
      vi.mocked(mockKVCache.clear).mockRejectedValue(new Error('Cache error'));

      await expect(service.clearCache()).rejects.toThrow('Cache error');
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      const stats = await service.getStats();

      expect(stats).toEqual({
        totalVectorCount: 100,
        compressionEnabled: true,
        cacheEnabled: true,
        repositoryAvailable: true,
      });
    });

    it('should report compression disabled when not configured', async () => {
      const serviceNoCompression = new LatentMemoryService(
        mockEmbeddingService,
        mockVectorService,
        mockKVCache,
        undefined,
        mockRepository
      );

      const stats = await serviceNoCompression.getStats();

      expect(stats.compressionEnabled).toBe(false);
    });

    it('should report cache disabled when not available', async () => {
      vi.mocked(mockKVCache.isAvailable).mockReturnValue(false);

      const stats = await service.getStats();

      expect(stats.cacheEnabled).toBe(false);
    });

    it('should report repository unavailable when not configured', async () => {
      const serviceNoRepo = new LatentMemoryService(
        mockEmbeddingService,
        mockVectorService,
        mockKVCache,
        mockCompression
      );

      const stats = await serviceNoRepo.getStats();

      expect(stats.repositoryAvailable).toBe(false);
    });

    it('should get vector count from service', async () => {
      vi.mocked(mockVectorService.getCount).mockResolvedValue(500);

      const stats = await service.getStats();

      expect(stats.totalVectorCount).toBe(500);
    });
  });
});
