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
import { yieldToEventLoop } from '../utils/yield.js';
import {
  createEmbeddingDisabledError,
  createEmbeddingEmptyTextError,
  createEmbeddingProviderError,
} from '../core/errors.js';

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
 * Configuration for EmbeddingService
 * Allows explicit dependency injection instead of relying on global config
 */
export interface EmbeddingServiceConfig {
  provider: EmbeddingProvider;
  openaiApiKey?: string;
  openaiModel: string;
}

/**
 * Embedding service with configurable providers
 */
// Track if we've already warned about missing OpenAI key (avoid spam in tests)
let hasWarnedAboutOpenAI = false;

export class EmbeddingService {
  private provider: EmbeddingProvider;
  private openaiClient: OpenAI | null = null;
  private openaiModel: string;
  // Pipeline type from @xenova/transformers - library doesn't export proper types
  private localPipeline:
    | ((
        text: string,
        options?: { pooling?: string; normalize?: boolean }
      ) => Promise<{ data: Float32Array }>)
    | null = null;
  private localPipelinePromise: Promise<unknown> | null = null;
  private localModelName = 'Xenova/all-MiniLM-L6-v2'; // 384-dim embeddings
  private embeddingCache = new Map<string, number[]>();
  private maxCacheSize = 1000;
  public static hasLoggedModelLoad = false; // Public for test reset access

  /**
   * Create an EmbeddingService instance
   * @param serviceConfig - Optional explicit configuration. If not provided, uses global config.
   */
  constructor(serviceConfig?: EmbeddingServiceConfig) {
    // Use explicit config if provided, otherwise fall back to global config
    const effectiveConfig = serviceConfig ?? {
      provider: config.embedding.provider,
      openaiApiKey: config.embedding.openaiApiKey,
      openaiModel: config.embedding.openaiModel,
    };

    this.provider = effectiveConfig.provider;

    // Warn once if falling back to local (no API key)
    if (this.provider === 'local' && !effectiveConfig.openaiApiKey && !hasWarnedAboutOpenAI) {
      logger.warn('No OpenAI API key found, using local model');
      hasWarnedAboutOpenAI = true;
    }

    this.openaiModel = effectiveConfig.openaiModel;

    // Initialize OpenAI client if using OpenAI
    if (this.provider === 'openai' && effectiveConfig.openaiApiKey) {
      this.openaiClient = new OpenAI({
        apiKey: effectiveConfig.openaiApiKey,
        timeout: 60000, // 60 second timeout to prevent indefinite hangs
        maxRetries: 0, // Disable SDK retry - we handle retries with withRetry
      });
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
      throw createEmbeddingDisabledError();
    }

    // Normalize text
    const normalized = text.trim();
    if (!normalized) {
      throw createEmbeddingEmptyTextError();
    }

    // Check cache - use LRU pattern by deleting and re-inserting on access
    const cacheKey = `${this.provider}:${normalized}`;
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      // Move to end of Map (most recently used) by deleting and re-inserting
      this.embeddingCache.delete(cacheKey);
      this.embeddingCache.set(cacheKey, cached);
      return {
        embedding: [...cached], // Return a copy to prevent cache corruption
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
      throw createEmbeddingDisabledError();
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
      // For local, run sequentially and periodically yield to avoid starving the event loop.
      const results: number[][] = [];
      for (let i = 0; i < normalized.length; i++) {
        if (i > 0 && i % 5 === 0) {
          await yieldToEventLoop();
        }
        results.push(await this.embedLocal(normalized[i]!));
      }
      embeddings = results;
    }

    // Cache results
    normalized.forEach((text, i) => {
      const cacheKey = `${this.provider}:${text}`;
      const embedding = embeddings[i];
      if (embedding) {
        this.embeddingCache.set(cacheKey, embedding);
      }
    });

    // Evict excess entries after batch insert (critical fix for memory leak)
    while (this.embeddingCache.size > this.maxCacheSize) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) this.embeddingCache.delete(firstKey);
      else break;
    }

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
    const client = this.openaiClient;
    if (!client) {
      throw createEmbeddingProviderError('OpenAI', 'Client not initialized');
    }

    return withRetry(
      async () => {
        const response = await client.embeddings.create({
          model: this.openaiModel,
          input: text,
        });

        const embedding = response.data[0]?.embedding;
        if (!embedding) {
          throw createEmbeddingProviderError('OpenAI', 'No embedding returned');
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
    const client = this.openaiClient;
    if (!client) {
      throw createEmbeddingProviderError('OpenAI', 'Client not initialized');
    }

    return withRetry(
      async () => {
        const response = await client.embeddings.create({
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
            // Type assertion: @xenova/transformers pipeline returns a callable
            // Cast through unknown to satisfy TypeScript's strict type checking
            this.localPipeline = p as unknown as typeof this.localPipeline;
            return p;
          })
          .finally(() => {
            this.localPipelinePromise = null;
          });
      }
      await this.localPipelinePromise;
    }

    const localPipeline = this.localPipeline;
    if (!localPipeline) {
      throw createEmbeddingProviderError('Local', 'Pipeline not initialized');
    }

    try {
      const output = await localPipeline(text, { pooling: 'mean', normalize: true });
      // Convert Float32Array to regular array
      const embedding = Array.from(output.data);
      return embedding;
    } catch (error) {
      throw createEmbeddingProviderError(
        'Local',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Cleanup resources (unload local pipeline, clear cache)
   * Call this when shutting down to prevent memory leaks
   */
  cleanup(): void {
    // Clear embedding cache
    this.embeddingCache.clear();

    // Unload local pipeline if loaded
    if (this.localPipeline) {
      // The pipeline doesn't have an explicit unload, but setting to null
      // allows garbage collection. For @xenova/transformers, the model
      // will be garbage collected when no references remain.
      this.localPipeline = null;
      this.localPipelinePromise = null;
      logger.debug('Local embedding pipeline unloaded');
    }
  }
}

/**
 * Reset module-level state for testing purposes.
 * Note: In production code, services should be instantiated via DI and cleaned up directly.
 */
export function resetEmbeddingServiceState(): void {
  // Reset warning flag for tests
  hasWarnedAboutOpenAI = false;
  EmbeddingService.hasLoggedModelLoad = false;
}
