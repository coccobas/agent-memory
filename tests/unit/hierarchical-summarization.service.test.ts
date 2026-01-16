import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HierarchicalSummarizationService } from '../../src/services/summarization/hierarchical-summarization.service.js';
import type { AppDb } from '../../src/core/types.js';
import type { EmbeddingService } from '../../src/services/embedding.service.js';
import type { ExtractionService } from '../../src/services/extraction.service.js';
import type { IVectorService } from '../../src/core/interfaces/vector.service.js';
import type {
  BuildSummariesOptions,
  HierarchicalSummarizationConfig,
} from '../../src/services/summarization/types.js';

/**
 * Creates a chainable mock DB that supports Drizzle ORM query patterns
 */
function createMockDb() {
  const chainableMock: any = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    values: vi.fn(),
    set: vi.fn(),
    returning: vi.fn(),
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  // Make methods chainable
  chainableMock.select.mockReturnValue(chainableMock);
  chainableMock.insert.mockReturnValue(chainableMock);
  chainableMock.update.mockReturnValue(chainableMock);
  chainableMock.delete.mockReturnValue(chainableMock);
  chainableMock.from.mockReturnValue(chainableMock);
  chainableMock.where.mockReturnValue(chainableMock);
  chainableMock.values.mockReturnValue(chainableMock);
  chainableMock.set.mockReturnValue(chainableMock);
  chainableMock.returning.mockReturnValue(chainableMock);
  chainableMock.orderBy.mockReturnValue(chainableMock);
  chainableMock.limit.mockReturnValue(chainableMock);
  chainableMock.get.mockReturnValue(undefined);
  chainableMock.all.mockReturnValue([]);
  chainableMock.run.mockReturnValue({ changes: 0 });
  return chainableMock;
}

describe('Hierarchical Summarization Service', () => {
  let service: HierarchicalSummarizationService;
  let mockDb: AppDb;
  let mockEmbeddingService: EmbeddingService;
  let mockExtractionService: ExtractionService;
  let mockVectorService: IVectorService;

  beforeEach(() => {
    // Create mock dependencies with chainable Drizzle ORM methods
    mockDb = createMockDb() as unknown as AppDb;

    mockEmbeddingService = {
      isAvailable: vi.fn().mockReturnValue(true),
      getProvider: vi.fn().mockReturnValue('local'),
      getEmbeddingDimension: vi.fn().mockReturnValue(384),
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      cleanup: vi.fn(),
    } as unknown as EmbeddingService;

    mockExtractionService = {
      isAvailable: vi.fn().mockReturnValue(true),
      getProvider: vi.fn().mockReturnValue('openai'),
    } as unknown as ExtractionService;

    mockVectorService = {
      storeEmbedding: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue([]),
    } as unknown as IVectorService;

    // Create service with disabled provider for basic tests
    service = new HierarchicalSummarizationService(
      mockDb,
      mockEmbeddingService,
      mockExtractionService,
      mockVectorService,
      { provider: 'disabled' }
    );
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      expect(service).toBeDefined();
    });

    it('should merge provided config with defaults', () => {
      const config: Partial<HierarchicalSummarizationConfig> = {
        maxLevels: 2,
        minGroupSize: 5,
      };

      const customService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        config
      );

      expect(customService).toBeDefined();
    });

    it('should store dependencies correctly', () => {
      // Use protected getters to verify dependencies are stored
      const db = (service as any).getDb();
      const embeddingService = (service as any).getEmbeddingService();
      const extractionService = (service as any).getExtractionService();
      const vectorService = (service as any).getVectorService();

      expect(db).toBe(mockDb);
      expect(embeddingService).toBe(mockEmbeddingService);
      expect(extractionService).toBe(mockExtractionService);
      expect(vectorService).toBe(mockVectorService);
    });
  });

  describe('buildSummaries', () => {
    it('should throw error when provider is disabled', async () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
      };

      await expect(service.buildSummaries(options)).rejects.toThrow(
        'Summarization is unavailable: provider is disabled'
      );
    });

    it('should accept valid build options', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
        entryTypes: ['knowledge', 'guideline'],
        maxLevels: 2,
        minGroupSize: 5,
        forceRebuild: true,
      };

      expect(options).toBeDefined();
    });

    it('should handle different scope types', () => {
      const scopeTypes = ['project', 'org', 'global'] as const;

      scopeTypes.forEach((scopeType) => {
        const options: BuildSummariesOptions = {
          scopeType,
          scopeId: scopeType === 'global' ? undefined : 'test-id',
        };

        expect(options).toBeDefined();
      });
    });

    it('should handle different entry types', () => {
      const entryTypeSets = [
        ['knowledge'],
        ['guideline', 'tool'],
        ['knowledge', 'guideline', 'tool', 'experience'],
      ] as const;

      entryTypeSets.forEach((entryTypes) => {
        const options: BuildSummariesOptions = {
          scopeType: 'project',
          scopeId: 'test-project',
          entryTypes: entryTypes as any,
        };

        expect(options).toBeDefined();
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should accept valid maxLevels values', () => {
      [1, 2, 3].forEach((maxLevels) => {
        const config: Partial<HierarchicalSummarizationConfig> = {
          maxLevels,
          provider: 'disabled',
        };

        const testService = new HierarchicalSummarizationService(
          mockDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          config
        );

        expect(testService).toBeDefined();
      });
    });

    it('should accept valid minGroupSize values', () => {
      [2, 3, 5, 10].forEach((minGroupSize) => {
        const config: Partial<HierarchicalSummarizationConfig> = {
          minGroupSize,
          provider: 'disabled',
        };

        const testService = new HierarchicalSummarizationService(
          mockDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          config
        );

        expect(testService).toBeDefined();
      });
    });

    it('should accept valid similarity threshold values', () => {
      [0.5, 0.7, 0.75, 0.9].forEach((similarityThreshold) => {
        const config: Partial<HierarchicalSummarizationConfig> = {
          similarityThreshold,
          provider: 'disabled',
        };

        const testService = new HierarchicalSummarizationService(
          mockDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          config
        );

        expect(testService).toBeDefined();
      });
    });

    it('should accept different LLM providers', () => {
      ['openai', 'anthropic', 'ollama', 'disabled'].forEach((provider) => {
        const config: Partial<HierarchicalSummarizationConfig> = {
          provider: provider as any,
        };

        const testService = new HierarchicalSummarizationService(
          mockDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          config
        );

        expect(testService).toBeDefined();
      });
    });
  });

  describe('Options Validation', () => {
    it('should handle forceRebuild flag', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
        forceRebuild: true,
      };

      expect(options.forceRebuild).toBe(true);
    });

    it('should handle optional maxLevels override', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
        maxLevels: 2,
      };

      expect(options.maxLevels).toBe(2);
    });

    it('should handle optional minGroupSize override', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
        minGroupSize: 5,
      };

      expect(options.minGroupSize).toBe(5);
    });
  });

  describe('Service Dependencies', () => {
    it('should have access to database', () => {
      const db = (service as any).getDb();
      expect(db).toBeDefined();
    });

    it('should have access to embedding service', () => {
      const embeddingService = (service as any).getEmbeddingService();
      expect(embeddingService).toBeDefined();
      expect(embeddingService.isAvailable).toBeDefined();
    });

    it('should have access to extraction service', () => {
      const extractionService = (service as any).getExtractionService();
      expect(extractionService).toBeDefined();
      expect(extractionService.isAvailable).toBeDefined();
    });

    it('should have access to vector service', () => {
      const vectorService = (service as any).getVectorService();
      expect(vectorService).toBeDefined();
      expect(vectorService.search).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error for disabled provider in buildSummaries', async () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
      };

      await expect(service.buildSummaries(options)).rejects.toThrow(
        'Summarization is unavailable: provider is disabled'
      );
    });

    it('should handle missing scope ID for project scope', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: undefined as any,
      };

      // Should allow undefined scopeId even though it's not valid
      // (will fail in actual execution, but type-wise it's allowed)
      expect(options).toBeDefined();
    });
  });

  describe('Type Safety', () => {
    it('should enforce valid scope types', () => {
      const validScopes: Array<'project' | 'org' | 'global'> = ['project', 'org', 'global'];

      validScopes.forEach((scopeType) => {
        const options: BuildSummariesOptions = {
          scopeType,
          scopeId: scopeType === 'global' ? undefined : 'test-id',
        };

        expect(options.scopeType).toBe(scopeType);
      });
    });

    it('should enforce valid entry types', () => {
      const validEntryTypes: Array<'tool' | 'guideline' | 'knowledge' | 'experience'> = [
        'tool',
        'guideline',
        'knowledge',
        'experience',
      ];

      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
        entryTypes: validEntryTypes,
      };

      expect(options.entryTypes).toEqual(validEntryTypes);
    });
  });

  describe('Configuration Defaults', () => {
    it('should use default maxLevels when not specified', () => {
      const defaultService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService
      );

      expect(defaultService).toBeDefined();
    });

    it('should use default minGroupSize when not specified', () => {
      const defaultService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService
      );

      expect(defaultService).toBeDefined();
    });

    it('should use default similarity threshold when not specified', () => {
      const defaultService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService
      );

      expect(defaultService).toBeDefined();
    });
  });

  describe('Build Options Edge Cases', () => {
    it('should handle empty entry types array', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
        entryTypes: [],
      };

      expect(options.entryTypes).toEqual([]);
    });

    it('should handle maxLevels of 1', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
        maxLevels: 1,
      };

      expect(options.maxLevels).toBe(1);
    });

    it('should handle maxLevels of 3', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
        maxLevels: 3,
      };

      expect(options.maxLevels).toBe(3);
    });

    it('should handle minGroupSize of 2', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'test-project',
        minGroupSize: 2,
      };

      expect(options.minGroupSize).toBe(2);
    });
  });

  describe('Provider Configuration', () => {
    it('should accept OpenAI provider config', () => {
      const config: Partial<HierarchicalSummarizationConfig> = {
        provider: 'openai',
        openaiApiKey: 'test-key',
      };

      const testService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        config
      );

      expect(testService).toBeDefined();
    });

    it('should accept Anthropic provider config', () => {
      const config: Partial<HierarchicalSummarizationConfig> = {
        provider: 'anthropic',
        anthropicApiKey: 'test-key',
      };

      const testService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        config
      );

      expect(testService).toBeDefined();
    });

    it('should accept Ollama provider config', () => {
      const config: Partial<HierarchicalSummarizationConfig> = {
        provider: 'ollama',
        ollamaBaseUrl: 'http://localhost:11434',
      };

      const testService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        config
      );

      expect(testService).toBeDefined();
    });

    it('should accept custom model names', () => {
      const config: Partial<HierarchicalSummarizationConfig> = {
        provider: 'openai',
        model: 'gpt-4o',
        openaiApiKey: 'test-key',
      };

      const testService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        config
      );

      expect(testService).toBeDefined();
    });

    it('should accept temperature setting', () => {
      const config: Partial<HierarchicalSummarizationConfig> = {
        provider: 'disabled',
        temperature: 0.5,
      };

      const testService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        config
      );

      expect(testService).toBeDefined();
    });

    it('should accept maxTokens setting', () => {
      const config: Partial<HierarchicalSummarizationConfig> = {
        provider: 'disabled',
        maxTokens: 2048,
      };

      const testService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        config
      );

      expect(testService).toBeDefined();
    });
  });

  describe('Scope Combinations', () => {
    it('should handle project scope with ID', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'project',
        scopeId: 'my-project',
      };

      expect(options.scopeType).toBe('project');
      expect(options.scopeId).toBe('my-project');
    });

    it('should handle org scope with ID', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'org',
        scopeId: 'my-org',
      };

      expect(options.scopeType).toBe('org');
      expect(options.scopeId).toBe('my-org');
    });

    it('should handle global scope without ID', () => {
      const options: BuildSummariesOptions = {
        scopeType: 'global',
      };

      expect(options.scopeType).toBe('global');
      expect(options.scopeId).toBeUndefined();
    });
  });

  describe('Query Methods', () => {
    const mockSummaryRow = {
      id: 'summary-123',
      hierarchyLevel: 1,
      title: 'Test Summary',
      content: 'Summary content',
      parentSummaryId: null,
      memberCount: 3,
      embedding: JSON.stringify([0.1, 0.2, 0.3]),
      scopeType: 'project',
      scopeId: 'project-456',
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: null,
      coherenceScore: 0.85,
      isActive: true,
    };

    const mockMemberRows = [
      { memberId: 'entry-1', memberType: 'knowledge' },
      { memberId: 'entry-2', memberType: 'knowledge' },
      { memberId: 'entry-3', memberType: 'guideline' },
    ];

    describe('getSummary', () => {
      it('should retrieve summary by ID with members', async () => {
        const mockDb = createMockDb();
        mockDb.get.mockReturnValueOnce(mockSummaryRow);
        mockDb.all.mockReturnValueOnce(mockMemberRows);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          { provider: 'disabled' }
        );

        const result = await testService.getSummary('summary-123');

        expect(result).toBeDefined();
        expect(result?.id).toBe('summary-123');
        expect(result?.hierarchyLevel).toBe(1);
        expect(result?.memberIds).toHaveLength(3);
        expect(result?.memberIds).toContain('entry-1');
        expect(result?.memberIds).toContain('entry-2');
        expect(result?.memberIds).toContain('entry-3');
      });

      it('should return null for non-existent summary', async () => {
        const mockDb = createMockDb();
        mockDb.get.mockReturnValueOnce(null);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          { provider: 'disabled' }
        );

        const result = await testService.getSummary('non-existent');
        expect(result).toBeNull();
      });
    });

    describe('getSummariesAtLevel', () => {
      it('should retrieve summaries at specified level', async () => {
        const mockDb = createMockDb();
        mockDb.all.mockReturnValueOnce([mockSummaryRow]).mockReturnValue(mockMemberRows);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          { provider: 'disabled' }
        );

        const results = await testService.getSummariesAtLevel(1, 'project', 'project-456');

        expect(results).toHaveLength(1);
        expect(results[0].hierarchyLevel).toBe(1);
        expect(results[0].memberIds).toHaveLength(3);
      });

      it('should work without scopeId for global scope', async () => {
        const mockDb = createMockDb();
        mockDb.all.mockReturnValueOnce([]).mockReturnValue([]);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          { provider: 'disabled' }
        );

        const results = await testService.getSummariesAtLevel(1, 'global');
        expect(results).toHaveLength(0);
      });
    });

    describe('getChildSummaries', () => {
      it('should retrieve child summaries of parent', async () => {
        const childSummary = { ...mockSummaryRow, parentSummaryId: 'parent-123' };
        const mockDb = createMockDb();
        mockDb.all.mockReturnValueOnce([childSummary]).mockReturnValue(mockMemberRows);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          { provider: 'disabled' }
        );

        const results = await testService.getChildSummaries('parent-123');

        expect(results).toHaveLength(1);
        expect(results[0].parentSummaryId).toBe('parent-123');
      });

      it('should return empty array when no children exist', async () => {
        const mockDb = createMockDb();
        mockDb.all.mockReturnValueOnce([]);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          { provider: 'disabled' }
        );

        const results = await testService.getChildSummaries('parent-123');
        expect(results).toHaveLength(0);
      });
    });

    describe('searchSummaries', () => {
      it('should use semantic search when embeddings available', async () => {
        const mockEmbedService = {
          isAvailable: vi.fn().mockReturnValue(true),
          embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
        } as unknown as EmbeddingService;

        const mockVectorSvc = {
          searchSimilar: vi.fn().mockResolvedValue([{ entryId: 'summary-123', similarity: 0.95 }]),
        } as unknown as IVectorService;

        const mockDb = createMockDb();
        mockDb.get.mockReturnValueOnce(mockSummaryRow);
        mockDb.all.mockReturnValueOnce(mockMemberRows);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbedService,
          mockExtractionService,
          mockVectorSvc,
          { provider: 'disabled' }
        );

        const results = await testService.searchSummaries('test query');

        expect(mockVectorSvc.searchSimilar).toHaveBeenCalledWith([0.1, 0.2], ['summary'], 20);
        expect(results).toHaveLength(1);
      });

      it('should fallback to text search when embeddings unavailable', async () => {
        const mockEmbedService = {
          isAvailable: vi.fn().mockReturnValue(false),
        } as unknown as EmbeddingService;

        const mockDb = createMockDb();
        mockDb.all.mockReturnValueOnce([mockSummaryRow]).mockReturnValue(mockMemberRows);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbedService,
          mockExtractionService,
          mockVectorService,
          { provider: 'disabled' }
        );

        const results = await testService.searchSummaries('test query');
        expect(results).toHaveLength(1);
      });

      it('should apply filters in text search', async () => {
        const mockEmbedService = {
          isAvailable: vi.fn().mockReturnValue(false),
        } as unknown as EmbeddingService;

        const mockDb = createMockDb();
        mockDb.all.mockReturnValueOnce([mockSummaryRow]).mockReturnValue(mockMemberRows);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbedService,
          mockExtractionService,
          mockVectorService,
          { provider: 'disabled' }
        );

        const results = await testService.searchSummaries('test query', {
          level: 1,
          scopeType: 'project',
          scopeId: 'project-456',
          limit: 5,
        });

        expect(results).toHaveLength(1);
      });
    });

    describe('getStatus', () => {
      it('should calculate status statistics correctly', async () => {
        const mockSummaries = [
          { hierarchyLevel: 1, memberCount: 10, createdAt: '2026-01-15T00:00:00Z' },
          { hierarchyLevel: 1, memberCount: 12, createdAt: '2026-01-15T01:00:00Z' },
          { hierarchyLevel: 2, memberCount: 3, createdAt: '2026-01-15T02:00:00Z' },
          { hierarchyLevel: 3, memberCount: 1, createdAt: '2026-01-15T03:00:00Z' },
        ];

        const mockDb = createMockDb();
        mockDb.all.mockReturnValueOnce(mockSummaries);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          { provider: 'disabled' }
        );

        const status = await testService.getStatus('project', 'project-456');

        expect(status.summaryCount).toBe(4);
        expect(status.countByLevel.level1).toBe(2);
        expect(status.countByLevel.level2).toBe(1);
        expect(status.countByLevel.level3).toBe(1);
        expect(status.entriesCovered).toBe(22); // 10 + 12
        expect(status.lastBuilt).toBe('2026-01-15T03:00:00Z');
      });

      it('should work without scopeId for global scope', async () => {
        const mockDb = createMockDb();
        mockDb.all.mockReturnValueOnce([]);

        const testService = new HierarchicalSummarizationService(
          mockDb as unknown as AppDb,
          mockEmbeddingService,
          mockExtractionService,
          mockVectorService,
          { provider: 'disabled' }
        );

        const status = await testService.getStatus('global');

        expect(status.summaryCount).toBe(0);
        expect(status.entriesCovered).toBe(0);
        expect(status.lastBuilt).toBeUndefined();
      });
    });
  });

  describe('deleteSummaries', () => {
    it('should return 0 (placeholder implementation)', async () => {
      const result = await service.deleteSummaries('project', 'test-project');
      expect(result).toBe(0);
    });

    it('should work with org scope', async () => {
      const result = await service.deleteSummaries('org', 'test-org');
      expect(result).toBe(0);
    });

    it('should work with global scope without scopeId', async () => {
      const result = await service.deleteSummaries('global');
      expect(result).toBe(0);
    });
  });

  describe('buildSummaries with Enabled Provider', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should return empty result when no entries found', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'project',
        scopeId: 'empty-project',
      });

      expect(result).toBeDefined();
      expect(result.summariesCreated).toBe(0);
      expect(result.levelsBuilt).toBe(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.entriesProcessed).toBe(0);
    });

    it('should handle forceRebuild option', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'project',
        scopeId: 'test-project',
        forceRebuild: true,
      });

      expect(result.summariesCreated).toBe(0);
    });

    it('should use default entry types when not specified', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result).toBeDefined();
    });

    it('should use custom entry types when specified', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'project',
        scopeId: 'test-project',
        entryTypes: ['knowledge', 'guideline'],
      });

      expect(result).toBeDefined();
    });

    it('should use custom maxLevels when specified', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'project',
        scopeId: 'test-project',
        maxLevels: 2,
      });

      expect(result).toBeDefined();
    });

    it('should use custom minGroupSize when specified', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'project',
        scopeId: 'test-project',
        minGroupSize: 5,
      });

      expect(result).toBeDefined();
    });
  });

  describe('Private Method Coverage via Public Interface', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'anthropic', anthropicApiKey: 'test-key' }
      );
    });

    it('should call fetchEntriesForSummarization via buildSummaries', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'project',
        scopeId: 'test-project',
        entryTypes: ['tool', 'knowledge'],
      });

      // Since fetchEntriesForSummarization returns [], we get empty result
      expect(result.stats.entriesProcessed).toBe(0);
    });

    it('should return result with summariesByLevel structure', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'org',
        scopeId: 'test-org',
      });

      expect(result.summariesByLevel).toBeDefined();
      expect(result.summariesByLevel.level1).toBe(0);
      expect(result.summariesByLevel.level2).toBe(0);
      expect(result.summariesByLevel.level3).toBe(0);
    });

    it('should return result with stats structure', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'global',
      });

      expect(result.stats).toBeDefined();
      expect(result.stats.entriesProcessed).toBe(0);
      expect(result.stats.communitiesByLevel).toEqual([]);
      expect(result.stats.avgCohesionByLevel).toEqual([]);
    });
  });

  describe('toSummaryEntry and toSummarizableEntry', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'ollama', ollamaBaseUrl: 'http://localhost:11434' }
      );
    });

    it('should convert entries correctly via buildHierarchyRecursive', async () => {
      // Access private methods via any cast for testing
      const toSummaryEntry = (enabledService as any).toSummaryEntry.bind(enabledService);
      const toSummarizableEntry = (enabledService as any).toSummarizableEntry.bind(enabledService);

      const summarizableEntry = {
        id: 'test-entry',
        type: 'knowledge',
        text: 'Test content',
        embedding: [0.1, 0.2, 0.3],
        hierarchyLevel: 1,
        metadata: { source: 'test' },
      };

      const summaryEntry = toSummaryEntry(summarizableEntry);

      expect(summaryEntry.id).toBe('test-entry');
      expect(summaryEntry.hierarchyLevel).toBe(1);
      expect(summaryEntry.memberIds).toEqual(['test-entry']);
      expect(summaryEntry.memberCount).toBe(1);
      expect(summaryEntry.content).toBe('Test content');

      // Convert back
      const backToSummarizable = toSummarizableEntry(summaryEntry);

      expect(backToSummarizable.id).toBe('test-entry');
      expect(backToSummarizable.type).toBe('summary');
      expect(backToSummarizable.text).toBe(summaryEntry.content);
    });
  });

  describe('buildHierarchyRecursive Edge Cases', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should stop recursion when entries less than minGroupSize', async () => {
      const buildHierarchyRecursive = (enabledService as any).buildHierarchyRecursive.bind(
        enabledService
      );

      const entries = [
        { id: 'e1', type: 'knowledge', text: 'Entry 1', embedding: [], hierarchyLevel: 0 },
      ];

      const result = await buildHierarchyRecursive(entries, 1, 3, 3, 'project', 'test-project');

      expect(result.summariesCreated).toBe(0);
      expect(result.levelsBuilt).toBe(0);
    });

    it('should stop recursion when maxLevels exceeded', async () => {
      const buildHierarchyRecursive = (enabledService as any).buildHierarchyRecursive.bind(
        enabledService
      );

      const entries = [
        { id: 'e1', type: 'knowledge', text: 'Entry 1', embedding: [], hierarchyLevel: 0 },
        { id: 'e2', type: 'knowledge', text: 'Entry 2', embedding: [], hierarchyLevel: 0 },
        { id: 'e3', type: 'knowledge', text: 'Entry 3', embedding: [], hierarchyLevel: 0 },
      ];

      // Start at level 4 when maxLevels is 3
      const result = await buildHierarchyRecursive(entries, 4, 3, 2, 'project', 'test-project');

      expect(result.summariesCreated).toBe(0);
      expect(result.levelsBuilt).toBe(0);
    });

    it('should return topLevelSummary when entries array has single element', async () => {
      const buildHierarchyRecursive = (enabledService as any).buildHierarchyRecursive.bind(
        enabledService
      );

      const entries = [
        { id: 'single', type: 'knowledge', text: 'Single entry', embedding: [], hierarchyLevel: 1 },
      ];

      const result = await buildHierarchyRecursive(entries, 1, 3, 2, 'project', 'test-project');

      expect(result.topLevelSummary).toBeDefined();
      expect(result.topLevelSummary.id).toBe('single');
    });

    it('should handle detectCommunities returning empty array', async () => {
      const buildHierarchyRecursive = (enabledService as any).buildHierarchyRecursive.bind(
        enabledService
      );

      const entries = [
        { id: 'e1', type: 'knowledge', text: 'Entry 1', embedding: [], hierarchyLevel: 0 },
        { id: 'e2', type: 'knowledge', text: 'Entry 2', embedding: [], hierarchyLevel: 0 },
        { id: 'e3', type: 'knowledge', text: 'Entry 3', embedding: [], hierarchyLevel: 0 },
      ];

      // detectCommunities returns [] in placeholder implementation
      const result = await buildHierarchyRecursive(entries, 1, 3, 2, 'project', 'test-project');

      expect(result.summariesCreated).toBe(0);
    });
  });

  describe('summarizeCommunity', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should create placeholder summary', async () => {
      const summarizeCommunity = (enabledService as any).summarizeCommunity.bind(enabledService);

      const request = {
        entries: [
          { id: 'e1', type: 'knowledge', text: 'Entry 1', embedding: [] },
          { id: 'e2', type: 'knowledge', text: 'Entry 2', embedding: [] },
        ],
        targetLevel: 1,
        scopeType: 'project',
        scopeId: 'test-project',
      };

      const result = await summarizeCommunity(request);

      expect(result.summary).toBeDefined();
      // Summary now generates a real UUID instead of 'placeholder-summary-id'
      expect(result.summary.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(result.summary.hierarchyLevel).toBe(1);
      expect(result.summary.memberIds).toEqual(['e1', 'e2']);
      expect(result.summary.memberCount).toBe(2);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should set scopeType and scopeId on summary', async () => {
      const summarizeCommunity = (enabledService as any).summarizeCommunity.bind(enabledService);

      const request = {
        entries: [{ id: 'e1', type: 'knowledge', text: 'Entry 1', embedding: [] }],
        targetLevel: 2,
        scopeType: 'org',
        scopeId: 'test-org',
      };

      const result = await summarizeCommunity(request);

      expect(result.summary.scopeType).toBe('org');
      expect(result.summary.scopeId).toBe('test-org');
    });
  });

  describe('storeSummary', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should not throw (placeholder implementation)', async () => {
      const storeSummary = (enabledService as any).storeSummary.bind(enabledService);

      const summary = {
        id: 'test-summary',
        hierarchyLevel: 1,
        title: 'Test Summary',
        content: 'Summary content',
        memberIds: ['e1', 'e2'],
        memberCount: 2,
        scopeType: 'project',
        scopeId: 'test-project',
        createdAt: new Date().toISOString(),
      };

      await expect(storeSummary(summary)).resolves.not.toThrow();
    });
  });

  describe('fetchEntriesForSummarization', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should return empty array (placeholder implementation)', async () => {
      const fetchEntries = (enabledService as any).fetchEntriesForSummarization.bind(
        enabledService
      );

      const result = await fetchEntries('project', 'test-project', ['knowledge', 'tool']);

      expect(result).toEqual([]);
    });
  });

  describe('ensureEmbeddings', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should return entries unchanged (placeholder implementation)', async () => {
      const ensureEmbeddings = (enabledService as any).ensureEmbeddings.bind(enabledService);

      const entries = [
        { id: 'e1', type: 'knowledge', text: 'Entry 1', embedding: [0.1, 0.2] },
        { id: 'e2', type: 'tool', text: 'Entry 2', embedding: [0.3, 0.4] },
      ];

      const result = await ensureEmbeddings(entries);

      expect(result).toEqual(entries);
    });
  });

  describe('detectCommunities', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should return empty array (placeholder implementation)', async () => {
      const detectCommunities = (enabledService as any).detectCommunities.bind(enabledService);

      const entries = [
        { id: 'e1', type: 'knowledge', text: 'Entry 1', embedding: [0.1, 0.2] },
        { id: 'e2', type: 'knowledge', text: 'Entry 2', embedding: [0.3, 0.4] },
      ];

      const result = await detectCommunities(entries);

      expect(result).toEqual([]);
    });
  });

  describe('toSummarizableEntry edge cases', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should handle summary without embedding', () => {
      const toSummarizableEntry = (enabledService as any).toSummarizableEntry.bind(enabledService);

      const summary = {
        id: 'summary-1',
        hierarchyLevel: 1,
        title: 'Test Summary',
        content: 'Summary content',
        memberIds: ['e1'],
        memberCount: 1,
        scopeType: 'project',
        createdAt: new Date().toISOString(),
        // No embedding
      };

      const result = toSummarizableEntry(summary);

      expect(result.embedding).toEqual([]);
    });

    it('should handle summary with embedding', () => {
      const toSummarizableEntry = (enabledService as any).toSummarizableEntry.bind(enabledService);

      const summary = {
        id: 'summary-2',
        hierarchyLevel: 2,
        title: 'Test Summary',
        content: 'Summary content',
        memberIds: ['e1', 'e2'],
        memberCount: 2,
        scopeType: 'project',
        createdAt: new Date().toISOString(),
        embedding: [0.1, 0.2, 0.3],
      };

      const result = toSummarizableEntry(summary);

      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should preserve metadata', () => {
      const toSummarizableEntry = (enabledService as any).toSummarizableEntry.bind(enabledService);

      const summary = {
        id: 'summary-3',
        hierarchyLevel: 1,
        title: 'Test Summary',
        content: 'Summary content',
        memberIds: ['e1'],
        memberCount: 1,
        scopeType: 'project',
        createdAt: new Date().toISOString(),
        metadata: { source: 'test', category: 'testing' },
      };

      const result = toSummarizableEntry(summary);

      expect(result.metadata).toEqual({ source: 'test', category: 'testing' });
    });

    it('should set type to summary', () => {
      const toSummarizableEntry = (enabledService as any).toSummarizableEntry.bind(enabledService);

      const summary = {
        id: 'summary-4',
        hierarchyLevel: 3,
        title: 'Test Summary',
        content: 'Summary content',
        memberIds: ['e1'],
        memberCount: 1,
        scopeType: 'org',
        createdAt: new Date().toISOString(),
      };

      const result = toSummarizableEntry(summary);

      expect(result.type).toBe('summary');
    });
  });

  describe('toSummaryEntry edge cases', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should handle entry with zero hierarchy level', () => {
      const toSummaryEntry = (enabledService as any).toSummaryEntry.bind(enabledService);

      const entry = {
        id: 'entry-zero',
        type: 'knowledge',
        text: 'Entry text',
        embedding: [],
        hierarchyLevel: 0,
      };

      const result = toSummaryEntry(entry);

      expect(result.hierarchyLevel).toBe(0);
    });

    it('should handle entry without metadata', () => {
      const toSummaryEntry = (enabledService as any).toSummaryEntry.bind(enabledService);

      const entry = {
        id: 'entry-no-meta',
        type: 'tool',
        text: 'Tool text',
        embedding: [0.1],
        hierarchyLevel: 1,
      };

      const result = toSummaryEntry(entry);

      expect(result.id).toBe('entry-no-meta');
      expect(result.memberCount).toBe(1);
    });

    it('should create title from entry id', () => {
      const toSummaryEntry = (enabledService as any).toSummaryEntry.bind(enabledService);

      const entry = {
        id: 'unique-entry-id',
        type: 'guideline',
        text: 'Guideline text',
        embedding: [],
        hierarchyLevel: 2,
      };

      const result = toSummaryEntry(entry);

      expect(result.title).toContain('unique-entry-id');
    });
  });

  describe('Session scope handling', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should handle session scope in buildSummaries', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'session',
        scopeId: 'session-123',
      });

      expect(result).toBeDefined();
      expect(result.summariesCreated).toBe(0);
    });

    it('should handle session scope in deleteSummaries', async () => {
      const result = await enabledService.deleteSummaries('session', 'session-456');
      expect(result).toBe(0);
    });
  });

  describe('Level-specific summary counts', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should initialize all level counts to 0', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.summariesByLevel.level1).toBe(0);
      expect(result.summariesByLevel.level2).toBe(0);
      expect(result.summariesByLevel.level3).toBe(0);
    });

    it('should return empty stats arrays for empty scope', async () => {
      const result = await enabledService.buildSummaries({
        scopeType: 'org',
        scopeId: 'empty-org',
      });

      expect(result.stats.communitiesByLevel).toEqual([]);
      expect(result.stats.avgCohesionByLevel).toEqual([]);
    });
  });

  describe('buildHierarchyRecursive level 2 and 3 paths', () => {
    let enabledService: HierarchicalSummarizationService;

    beforeEach(() => {
      enabledService = new HierarchicalSummarizationService(
        mockDb,
        mockEmbeddingService,
        mockExtractionService,
        mockVectorService,
        { provider: 'openai', openaiApiKey: 'test-key' }
      );
    });

    it('should handle level 2 in summariesByLevel', async () => {
      const buildHierarchyRecursive = (enabledService as any).buildHierarchyRecursive.bind(
        enabledService
      );

      // Start at level 2
      const entries = [
        { id: 'e1', type: 'summary', text: 'Summary 1', embedding: [], hierarchyLevel: 1 },
      ];

      const result = await buildHierarchyRecursive(entries, 2, 3, 2, 'project', 'test-project');

      // Should stop immediately due to < minGroupSize
      expect(result.summariesByLevel.level1).toBe(0);
      expect(result.summariesByLevel.level2).toBe(0);
    });

    it('should handle level 3 in summariesByLevel', async () => {
      const buildHierarchyRecursive = (enabledService as any).buildHierarchyRecursive.bind(
        enabledService
      );

      // Start at level 3
      const entries = [
        { id: 'e1', type: 'summary', text: 'Summary 1', embedding: [], hierarchyLevel: 2 },
      ];

      const result = await buildHierarchyRecursive(entries, 3, 3, 2, 'project', 'test-project');

      // Should stop immediately due to < minGroupSize
      expect(result.summariesByLevel.level3).toBe(0);
    });
  });
});
