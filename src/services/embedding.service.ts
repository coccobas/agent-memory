/**
 * Embedding service for generating text embeddings using various providers
 *
 * Supports:
 * - OpenAI API (text-embedding-3-small)
 * - Local models via @xenova/transformers
 * - Disabled mode (falls back to text search only)
 */

import { OpenAI } from 'openai';
import { pipeline } from '@xenova/transformers';
import { createComponentLogger } from '../utils/logger.js';
import { withRetry, isRetryableNetworkError } from '../utils/retry.js';
import { config } from '../config/index.js';

const logger = createComponentLogger('embedding');

export type EmbeddingProvider = 'openai' | 'local' | 'disabled';

interface EmbeddingResult {
  embedding: number[];
  model: string;
  provider: EmbeddingProvider;
}

interface EmbeddingBatchResult {
  embeddings: number[][];
  model: string;
  provider: EmbeddingProvider;
}

/**
 * Embedding service with configurable providers
 */
// Track if we've already warned about missing OpenAI key (avoid spam in tests)
let hasWarnedAboutOpenAI = false;

class EmbeddingService {
  private provider: EmbeddingProvider;
  private openaiClient: OpenAI | null = null;
  private openaiModel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private localPipeline: any = null;
  private localPipelinePromise: Promise<unknown> | null = null;
  private localModelName = 'Xenova/all-MiniLM-L6-v2'; // 384-dim embeddings
  private embeddingCache = new Map<string, number[]>();
  private maxCacheSize = 1000;
  public static hasLoggedModelLoad = false; // Public for test reset access

  constructor() {
    // Get provider from centralized config
    this.provider = config.embedding.provider;

    // Warn once if falling back to local (no API key)
    if (this.provider === 'local' && !config.embedding.openaiApiKey && !hasWarnedAboutOpenAI) {
      logger.warn('No OpenAI API key found, using local model');
      hasWarnedAboutOpenAI = true;
    }

    this.openaiModel = config.embedding.openaiModel;

    // Initialize OpenAI client if using OpenAI
    if (this.provider === 'openai' && config.embedding.openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: config.embedding.openaiApiKey });
    }
  }

  /**
   * Get the current embedding provider
   */
  getProvider(): EmbeddingProvider {
    return this.provider;
  }

  /**
   * Check if embeddings are available
   */
  isAvailable(): boolean {
    return this.provider !== 'disabled';
  }

  /**
   * Get embedding dimensionality for the current provider
   */
  getEmbeddingDimension(): number {
    switch (this.provider) {
      case 'openai':
        // text-embedding-3-small is 1536 dimensions
        return 1536;
      case 'local':
        // all-MiniLM-L6-v2 is 384 dimensions
        return 384;
      default:
        return 0;
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    if (this.provider === 'disabled') {
      throw new Error('Embeddings are disabled');
    }

    // Normalize text
    const normalized = text.trim();
    if (!normalized) {
      throw new Error('Cannot embed empty text');
    }

    // Check cache - use LRU pattern by deleting and re-inserting on access
    const cacheKey = `${this.provider}:${normalized}`;
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      // Move to end of Map (most recently used) by deleting and re-inserting
      this.embeddingCache.delete(cacheKey);
      this.embeddingCache.set(cacheKey, cached);
      return {
        embedding: cached,
        model: this.provider === 'openai' ? this.openaiModel : this.localModelName,
        provider: this.provider,
      };
    }

    // Generate embedding
    let embedding: number[];

    if (this.provider === 'openai') {
      embedding = await this.embedOpenAI(normalized);
    } else {
      embedding = await this.embedLocal(normalized);
    }

    // Cache result
    this.embeddingCache.set(cacheKey, embedding);
    if (this.embeddingCache.size > this.maxCacheSize) {
      // Remove least recently used entry (first in Map iteration order)
      // Map maintains insertion order, and we move accessed items to the end,
      // so the first item is the least recently used
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) this.embeddingCache.delete(firstKey);
    }

    return {
      embedding,
      model: this.provider === 'openai' ? this.openaiModel : this.localModelName,
      provider: this.provider,
    };
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<EmbeddingBatchResult> {
    if (this.provider === 'disabled') {
      throw new Error('Embeddings are disabled');
    }

    if (texts.length === 0) {
      return {
        embeddings: [],
        model: this.provider === 'openai' ? this.openaiModel : this.localModelName,
        provider: this.provider,
      };
    }

    // Normalize texts
    const normalized = texts.map((t) => t.trim()).filter((t) => t.length > 0);

    // Generate embeddings
    let embeddings: number[][];

    if (this.provider === 'openai') {
      embeddings = await this.embedBatchOpenAI(normalized);
    } else {
      // For local, process one at a time (local model doesn't have efficient batching)
      const results = await Promise.all(normalized.map((text) => this.embedLocal(text)));
      embeddings = results.filter((e): e is number[] => e !== undefined);
    }

    // Cache results
    normalized.forEach((text, i) => {
      const cacheKey = `${this.provider}:${text}`;
      const embedding = embeddings[i];
      if (embedding) {
        this.embeddingCache.set(cacheKey, embedding);
      }
    });

    return {
      embeddings,
      model: this.provider === 'openai' ? this.openaiModel : this.localModelName,
      provider: this.provider,
    };
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Generate embedding using OpenAI API
   */
  private async embedOpenAI(text: string): Promise<number[]> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    return withRetry(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const response = await this.openaiClient!.embeddings.create({
          model: this.openaiModel,
          input: text,
        });

        const embedding = response.data[0]?.embedding;
        if (!embedding) {
          throw new Error('No embedding returned from OpenAI');
        }
        return embedding;
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying OpenAI embedding');
        },
      }
    );
  }

  /**
   * Generate embeddings in batch using OpenAI API
   */
  private async embedBatchOpenAI(texts: string[]): Promise<number[][]> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    return withRetry(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const response = await this.openaiClient!.embeddings.create({
          model: this.openaiModel,
          input: texts,
        });

        return response.data.map((d) => d.embedding);
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying OpenAI batch embedding');
        },
      }
    );
  }

  /**
   * Generate embedding using local model
   */
  private async embedLocal(text: string): Promise<number[]> {
    // Lazy load the pipeline
    if (!this.localPipeline) {
      if (!this.localPipelinePromise) {
        // Only log once to avoid spam in tests
        if (!EmbeddingService.hasLoggedModelLoad) {
          logger.info('Loading local model (first use may take time)');
          EmbeddingService.hasLoggedModelLoad = true;
        }
        this.localPipelinePromise = pipeline('feature-extraction', this.localModelName)
          .then((p) => {
            this.localPipeline = p;
            return p;
          })
          .finally(() => {
            this.localPipelinePromise = null;
          });
      }
      await this.localPipelinePromise;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-non-null-assertion
      const output = await this.localPipeline!(text, { pooling: 'mean', normalize: true });

      // Convert to regular array
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const embedding = Array.from((output.data || output) as Float32Array);

      return embedding;
    } catch (error) {
      throw new Error(
        `Local embedding failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

/**
 * Get the singleton embedding service instance
 */
export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

/**
 * Reset the embedding service (useful for testing)
 */
export function resetEmbeddingService(): void {
  embeddingService = null;
  // Reset warning flag for tests
  hasWarnedAboutOpenAI = false;
  EmbeddingService.hasLoggedModelLoad = false;
}
