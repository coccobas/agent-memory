import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HyDEGenerator } from '../../src/services/query-rewrite/hyde.js';
import type { ExtractionService } from '../../src/services/extraction.service.js';
import type { EmbeddingService } from '../../src/services/embedding.service.js';
import type { HyDEConfig, QueryIntent } from '../../src/services/query-rewrite/types.js';

describe('HyDEGenerator', () => {
  let mockExtractionService: ExtractionService;
  let mockEmbeddingService: EmbeddingService;
  let defaultConfig: HyDEConfig;

  beforeEach(() => {
    mockExtractionService = {
      isAvailable: vi.fn().mockReturnValue(true),
      getProvider: vi.fn().mockReturnValue('openai'),
      generate: vi.fn().mockResolvedValue({
        texts: ['Generated document 1', 'Generated document 2'],
        model: 'gpt-4o-mini',
        provider: 'openai',
        tokensUsed: 150,
        processingTimeMs: 500,
      }),
    } as unknown as ExtractionService;

    mockEmbeddingService = {
      isAvailable: vi.fn().mockReturnValue(true),
      getProvider: vi.fn().mockReturnValue('local'),
      embedBatch: vi.fn().mockResolvedValue({
        embeddings: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ],
        model: 'all-MiniLM-L6-v2',
      }),
    } as unknown as EmbeddingService;

    defaultConfig = {
      provider: 'openai',
      documentCount: 3,
      temperature: 0.7,
      maxTokensPerDoc: 512,
    };
  });

  describe('Constructor', () => {
    it('should create instance with valid dependencies', () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );
      expect(generator).toBeDefined();
    });

    it('should store configuration correctly', () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );
      expect(generator.getConfig()).toEqual(defaultConfig);
    });
  });

  describe('isAvailable', () => {
    it('should return true when all services are available', () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );
      expect(generator.isAvailable()).toBe(true);
    });

    it('should return false when provider is disabled', () => {
      const disabledConfig: HyDEConfig = { ...defaultConfig, provider: 'disabled' };
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        disabledConfig
      );
      expect(generator.isAvailable()).toBe(false);
    });

    it('should return false when extraction service is unavailable', () => {
      vi.mocked(mockExtractionService.isAvailable).mockReturnValue(false);
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );
      expect(generator.isAvailable()).toBe(false);
    });

    it('should return false when embedding service is unavailable', () => {
      vi.mocked(mockEmbeddingService.isAvailable).mockReturnValue(false);
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );
      expect(generator.isAvailable()).toBe(false);
    });

    it('should return false when both services are unavailable', () => {
      vi.mocked(mockExtractionService.isAvailable).mockReturnValue(false);
      vi.mocked(mockEmbeddingService.isAvailable).mockReturnValue(false);
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );
      expect(generator.isAvailable()).toBe(false);
    });
  });

  describe('generate', () => {
    it('should return empty result when disabled', async () => {
      const disabledConfig: HyDEConfig = { ...defaultConfig, provider: 'disabled' };
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        disabledConfig
      );

      const result = await generator.generate('test query', 'lookup');

      expect(result.documents).toEqual([]);
      expect(result.embeddings).toEqual([]);
      expect(result.model).toBe('disabled');
      expect(result.processingTimeMs).toBe(0);
    });

    it('should generate documents for lookup intent', async () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('What is TypeScript?', 'lookup');

      expect(result.documents).toHaveLength(2);
      expect(result.embeddings).toHaveLength(2);
      expect(result.model).toBe('all-MiniLM-L6-v2');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should generate documents for how_to intent', async () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('How to configure ESLint?', 'how_to');

      expect(result.documents).toHaveLength(2);
      expect(mockExtractionService.generate).toHaveBeenCalled();
    });

    it('should generate documents for debug intent', async () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('Fix TypeError: undefined is not a function', 'debug');

      expect(result.documents).toHaveLength(2);
    });

    it('should generate documents for explore intent', async () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('React hooks patterns', 'explore');

      expect(result.documents).toHaveLength(2);
    });

    it('should generate documents for compare intent', async () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('Redux vs Zustand', 'compare');

      expect(result.documents).toHaveLength(2);
    });

    it('should generate documents for configure intent', async () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('Set up TypeScript strict mode', 'configure');

      expect(result.documents).toHaveLength(2);
    });

    it('should handle all query intents', async () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const intents: QueryIntent[] = ['lookup', 'how_to', 'debug', 'explore', 'compare', 'configure'];

      for (const intent of intents) {
        const result = await generator.generate('test query', intent);
        expect(result.documents.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generate with fallback', () => {
    it('should use fallback when no documents generated', async () => {
      vi.mocked(mockExtractionService.generate).mockResolvedValue({
        texts: [],
        model: 'gpt-4o-mini',
        provider: 'openai',
        processingTimeMs: 100,
      });

      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('test query', 'lookup');

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]).toContain('test query');
    });

    it('should generate fallback for lookup intent', async () => {
      vi.mocked(mockExtractionService.generate).mockResolvedValue({
        texts: [],
        model: 'gpt-4o-mini',
        provider: 'openai',
        processingTimeMs: 100,
      });

      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('API endpoints', 'lookup');

      expect(result.documents[0]).toContain('Information about');
    });

    it('should generate fallback for how_to intent', async () => {
      vi.mocked(mockExtractionService.generate).mockResolvedValue({
        texts: [],
        model: 'gpt-4o-mini',
        provider: 'openai',
        processingTimeMs: 100,
      });

      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('setup project', 'how_to');

      expect(result.documents[0]).toContain('Guide for');
    });

    it('should generate fallback for debug intent', async () => {
      vi.mocked(mockExtractionService.generate).mockResolvedValue({
        texts: [],
        model: 'gpt-4o-mini',
        provider: 'openai',
        processingTimeMs: 100,
      });

      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('memory leak', 'debug');

      expect(result.documents[0]).toContain('Troubleshooting');
    });

    it('should generate fallback for explore intent', async () => {
      vi.mocked(mockExtractionService.generate).mockResolvedValue({
        texts: [],
        model: 'gpt-4o-mini',
        provider: 'openai',
        processingTimeMs: 100,
      });

      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('database patterns', 'explore');

      expect(result.documents[0]).toContain('Overview of');
    });

    it('should generate fallback for compare intent', async () => {
      vi.mocked(mockExtractionService.generate).mockResolvedValue({
        texts: [],
        model: 'gpt-4o-mini',
        provider: 'openai',
        processingTimeMs: 100,
      });

      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('SQL vs NoSQL', 'compare');

      expect(result.documents[0]).toContain('Comparison of');
    });

    it('should generate fallback for configure intent', async () => {
      vi.mocked(mockExtractionService.generate).mockResolvedValue({
        texts: [],
        model: 'gpt-4o-mini',
        provider: 'openai',
        processingTimeMs: 100,
      });

      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('webpack', 'configure');

      expect(result.documents[0]).toContain('Configuration for');
    });
  });

  describe('generate with errors', () => {
    it('should return empty result on generation error', async () => {
      vi.mocked(mockExtractionService.generate).mockRejectedValue(new Error('API error'));

      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('test query', 'lookup');

      expect(result.documents).toEqual([]);
      expect(result.embeddings).toEqual([]);
      expect(result.model).toBe('error');
    });

    it('should return empty result on embedding error', async () => {
      vi.mocked(mockEmbeddingService.embedBatch).mockRejectedValue(new Error('Embedding failed'));

      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('test query', 'lookup');

      expect(result.documents).toEqual([]);
      expect(result.embeddings).toEqual([]);
      expect(result.model).toBe('error');
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(mockExtractionService.generate).mockRejectedValue('string error');

      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const result = await generator.generate('test query', 'lookup');

      expect(result.model).toBe('error');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration partially', () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      generator.updateConfig({ documentCount: 5 });

      expect(generator.getConfig().documentCount).toBe(5);
      expect(generator.getConfig().provider).toBe('openai');
    });

    it('should update provider', () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      generator.updateConfig({ provider: 'anthropic' });

      expect(generator.getConfig().provider).toBe('anthropic');
    });

    it('should be able to disable provider', () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      generator.updateConfig({ provider: 'disabled' });

      expect(generator.isAvailable()).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      const config1 = generator.getConfig();
      const config2 = generator.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('documentCount limit', () => {
    it('should request configured document count from generate()', async () => {
      const config: HyDEConfig = { ...defaultConfig, documentCount: 2 };
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        config
      );

      await generator.generate('test query', 'lookup');

      expect(mockExtractionService.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 2,
        })
      );
    });
  });

  describe('generate() parameters', () => {
    it('should pass correct parameters to ExtractionService.generate()', async () => {
      const config: HyDEConfig = {
        provider: 'openai',
        documentCount: 3,
        temperature: 0.8,
        maxTokensPerDoc: 256,
      };
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        config
      );

      await generator.generate('test query', 'lookup');

      expect(mockExtractionService.generate).toHaveBeenCalledWith({
        systemPrompt: expect.stringContaining('technical documentation generator'),
        userPrompt: expect.stringContaining('test query'),
        count: 3,
        temperature: 0.8,
        maxTokens: 256,
      });
    });

    it('should use intent-specific prompts', async () => {
      const generator = new HyDEGenerator(
        mockExtractionService,
        mockEmbeddingService,
        defaultConfig
      );

      await generator.generate('How to setup TypeScript?', 'how_to');

      expect(mockExtractionService.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('step-by-step guideline'),
        })
      );
    });
  });
});
