/**
 * Embedding service for generating text embeddings using various providers
 *
 * Supports:
 * - OpenAI API (text-embedding-3-small)
 * - LM Studio (local LLM server with embedding models)
 * - Local models via @xenova/transformers
 * - Disabled mode (falls back to text search only)
 */

import { OpenAI } from 'openai';
import { pipeline } from '@xenova/transformers';
import { createComponentLogger } from '../utils/logger.js';
import { withRetry, isRetryableNetworkError } from '../utils/retry.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';
import { config } from '../config/index.js';
import { yieldToEventLoop } from '../utils/yield.js';
import {
  createEmbeddingDisabledError,
  createEmbeddingEmptyTextError,
  createEmbeddingProviderError,
} from '../core/errors.js';

const logger = createComponentLogger('embedding');

// =============================================================================
// EMBEDDING VALIDATION
// =============================================================================

/**
 * Validate embedding array for invalid values (NaN, Infinity).
 * Task 121: Ensures embedding arrays don't contain values that corrupt similarity calculations.
 * @param embedding - The embedding array to validate
 * @param context - Context for error logging (e.g., provider name)
 * @returns true if valid, throws if invalid
 */
function validateEmbedding(embedding: number[], context: string): void {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw createEmbeddingProviderError(context, 'Empty embedding array returned');
  }

  for (let i = 0; i < embedding.length; i++) {
    const value = embedding[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      logger.warn(
        { index: i, value, context, embeddingLength: embedding.length },
        'Invalid value in embedding array, replacing with 0'
      );
      // Replace invalid values with 0 to allow graceful degradation
      embedding[i] = 0;
    }
  }
}

/**
 * Validate batch of embeddings
 */
function validateEmbeddingBatch(embeddings: number[][], context: string): void {
  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];
    if (embedding) {
      validateEmbedding(embedding, `${context}[${i}]`);
    }
  }
}

export type EmbeddingProvider = 'openai' | 'lmstudio' | 'local' | 'disabled';

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
  /** LM Studio base URL (default: http://localhost:1234/v1) */
  lmStudioBaseUrl?: string;
  /** LM Studio embedding model name */
  lmStudioModel?: string;
  /**
   * Instruction prefix for instruction-tuned embedding models like Qwen3-Embedding.
   * If set, text will be wrapped as: `Instruct: {instruction}\nQuery: {text}`
   * Example: "Retrieve semantically similar text."
   * @deprecated Use lmStudioQueryInstruction and lmStudioDocumentInstruction instead
   */
  lmStudioInstruction?: string;
  /**
   * Instruction for query embeddings (asymmetric retrieval).
   * Default: "Retrieve memories that answer this question"
   */
  lmStudioQueryInstruction?: string;
  /**
   * Instruction for document embeddings (asymmetric retrieval).
   * Default: "Represent this memory for retrieval"
   */
  lmStudioDocumentInstruction?: string;
  /**
   * Disable all instruction wrapping for ablation testing.
   * When true, text is embedded without any instruction prefix.
   * Default: false (uses instruction wrapping)
   */
  disableInstructions?: boolean;
  // Task 124: Configurable embedding dimensions
  /** OpenAI embedding dimension (default: 1536 for text-embedding-3-small) */
  openaiDimension?: number;
  /** LM Studio embedding dimension (default: 1024, auto-detected on first call) */
  lmstudioDimension?: number;
  /** Local model embedding dimension (default: 384 for all-MiniLM-L6-v2) */
  localDimension?: number;
  /** Timeout in ms for embedding API requests (default: 60000) */
  timeoutMs?: number;
}

/**
 * Embedding service with configurable providers
 */
// Static warning tracking - allows reset for test isolation
const warningState = {
  hasWarnedAboutOpenAI: false,
  hasWarnedAboutMissingKey: false,
};

export class EmbeddingService {
  /**
   * Reset warning state for test isolation.
   * Call this in test setup/teardown to ensure clean state between tests.
   */
  static resetWarningState(): void {
    warningState.hasWarnedAboutOpenAI = false;
    warningState.hasWarnedAboutMissingKey = false;
  }
  private provider: EmbeddingProvider;
  private openaiClient: OpenAI | null = null;
  private openaiModel: string;
  // LM Studio client (uses OpenAI SDK with different base URL)
  private lmStudioClient: OpenAI | null = null;
  private lmStudioModel: string;
  private lmStudioInstruction: string | null = null;
  private lmStudioQueryInstruction: string;
  private lmStudioDocumentInstruction: string;
  private lmStudioEmbeddingDimension: number | null = null;
  private disableInstructions: boolean;
  // Task 124: Configurable embedding dimensions (loaded from config)
  private openaiDimension: number;
  private lmstudioDefaultDimension: number;
  private localDimension: number;
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
  // Task 123: Cache statistics tracking
  private cacheHits = 0;
  private cacheMisses = 0;
  public static hasLoggedModelLoad = false; // Public for test reset access
  private circuitBreaker: CircuitBreaker;

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
      lmStudioBaseUrl: process.env.AGENT_MEMORY_LM_STUDIO_BASE_URL ?? 'http://localhost:1234/v1',
      lmStudioModel: process.env.AGENT_MEMORY_LM_STUDIO_EMBEDDING_MODEL ?? 'text-embedding-qwen3-embedding-8b',
      lmStudioInstruction: process.env.AGENT_MEMORY_LM_STUDIO_EMBEDDING_INSTRUCTION,
    };

    this.provider = effectiveConfig.provider;

    // Warn once if falling back to local (no API key)
    if (this.provider === 'local' && !effectiveConfig.openaiApiKey && !warningState.hasWarnedAboutOpenAI) {
      logger.warn('No OpenAI API key found, using local model');
      warningState.hasWarnedAboutOpenAI = true;
    }

    this.openaiModel = effectiveConfig.openaiModel;
    this.lmStudioModel = effectiveConfig.lmStudioModel ?? 'text-embedding-qwen3-embedding-8b';
    this.lmStudioInstruction = effectiveConfig.lmStudioInstruction ?? null;
    // Asymmetric instructions for query vs document embeddings
    this.lmStudioQueryInstruction = effectiveConfig.lmStudioQueryInstruction
      ?? process.env.AGENT_MEMORY_LM_STUDIO_QUERY_INSTRUCTION
      ?? 'Retrieve memories that answer this question';
    this.lmStudioDocumentInstruction = effectiveConfig.lmStudioDocumentInstruction
      ?? process.env.AGENT_MEMORY_LM_STUDIO_DOCUMENT_INSTRUCTION
      ?? 'Represent this memory for retrieval';

    // Ablation testing: disable instruction wrapping entirely
    this.disableInstructions = effectiveConfig.disableInstructions
      ?? (process.env.AGENT_MEMORY_EMBEDDING_DISABLE_INSTRUCTIONS === 'true');

    // Task 124: Initialize configurable embedding dimensions
    this.openaiDimension = effectiveConfig.openaiDimension ?? config.embedding.openaiDimension;
    this.lmstudioDefaultDimension = effectiveConfig.lmstudioDimension ?? config.embedding.lmstudioDimension;
    this.localDimension = effectiveConfig.localDimension ?? config.embedding.localDimension;

    // Initialize OpenAI client if using OpenAI
    if (this.provider === 'openai') {
      if (effectiveConfig.openaiApiKey) {
        this.openaiClient = new OpenAI({
          apiKey: effectiveConfig.openaiApiKey,
          timeout: effectiveConfig.timeoutMs ?? 60000,
          maxRetries: 0, // Disable SDK retry - we handle retries with withRetry
        });
      } else if (!warningState.hasWarnedAboutMissingKey) {
        // Task 126: Warn when OpenAI provider is configured but key is missing
        logger.warn(
          'OpenAI embedding provider configured but AGENT_MEMORY_OPENAI_API_KEY is not set. Embedding operations will fail.'
        );
        warningState.hasWarnedAboutMissingKey = true;
      }
    }

    // Initialize LM Studio client if using lmstudio
    if (this.provider === 'lmstudio') {
      const baseUrl = effectiveConfig.lmStudioBaseUrl ?? 'http://localhost:1234/v1';

      // Bug #325 fix: Validate LM Studio URL to prevent data exfiltration
      // Only allow localhost and private network addresses
      try {
        const parsedUrl = new URL(baseUrl);
        const hostname = parsedUrl.hostname.toLowerCase();
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
        const isPrivateNetwork =
          hostname.startsWith('10.') ||
          hostname.startsWith('192.168.') ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

        if (!isLocalhost && !isPrivateNetwork) {
          logger.warn(
            { baseUrl, hostname },
            'LM Studio URL points to external network - this may expose embeddings to untrusted servers'
          );
        }
      } catch {
        logger.warn({ baseUrl }, 'Invalid LM Studio URL format');
      }

      logger.info({ baseUrl, model: this.lmStudioModel }, 'Initializing LM Studio embedding client');
      this.lmStudioClient = new OpenAI({
        baseURL: baseUrl,
        apiKey: 'not-needed', // LM Studio doesn't require API key
        timeout: effectiveConfig.timeoutMs ?? 60000,
        maxRetries: 0,
      });
    }

    // Initialize circuit breaker for rate limiting and failure protection
    this.circuitBreaker = new CircuitBreaker({
      name: 'embedding-service',
      failureThreshold: config.circuitBreaker.failureThreshold,
      resetTimeoutMs: config.circuitBreaker.resetTimeoutMs,
      successThreshold: config.circuitBreaker.successThreshold,
      isFailure: (error: Error) => {
        // Only count embedding failures, not validation errors
        return !(error.name === 'ValidationError' || error.name === 'EmbeddingEmptyTextError');
      },
    });
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
    if (this.provider === 'disabled') return false;

    // Avoid running network-backed embeddings in unit tests by default.
    // Tests can opt-in explicitly if needed.
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true' ||
      process.env.VITEST_WORKER_ID !== undefined ||
      process.env.VITEST_POOL_ID !== undefined;
    if (isTestEnv && this.provider === 'openai') {
      return process.env.AGENT_MEMORY_TEST_ALLOW_OPENAI_EMBEDDINGS === 'true' && this.openaiClient !== null;
    }

    if (this.provider === 'openai') {
      // Only available if an API key was configured at construction time
      return this.openaiClient !== null;
    }

    if (this.provider === 'lmstudio') {
      return this.lmStudioClient !== null;
    }

    return true;
  }

  /**
   * Get embedding dimensionality for the current provider.
   * Task 124: Now uses configurable dimensions from config/env vars.
   */
  getEmbeddingDimension(): number {
    switch (this.provider) {
      case 'openai':
        // Default: 1536 for text-embedding-3-small, configurable via AGENT_MEMORY_EMBEDDING_OPENAI_DIMENSION
        return this.openaiDimension;
      case 'lmstudio':
        // Auto-detected on first call, falls back to config (default 1024)
        return this.lmStudioEmbeddingDimension ?? this.lmstudioDefaultDimension;
      case 'local':
        // Default: 384 for all-MiniLM-L6-v2, configurable via AGENT_MEMORY_EMBEDDING_LOCAL_DIMENSION
        return this.localDimension;
      default:
        return 0;
    }
  }

  /**
   * Generate embedding for a single text
   * @param text - The text to embed
   * @param type - 'query' for search queries, 'document' for stored memories (default: 'query')
   */
  async embed(text: string, type: 'query' | 'document' = 'query'): Promise<EmbeddingResult> {
    if (this.provider === 'disabled') {
      throw createEmbeddingDisabledError();
    }

    // Normalize text
    const normalized = text.trim();
    if (!normalized) {
      throw createEmbeddingEmptyTextError();
    }

    // Check cache - use LRU pattern by deleting and re-inserting on access
    // Include type in cache key for asymmetric embeddings
    const cacheKey = `${this.provider}:${type}:${normalized}`;
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      // Task 123: Track cache hit
      this.cacheHits++;
      // Move to end of Map (most recently used) by deleting and re-inserting
      this.embeddingCache.delete(cacheKey);
      this.embeddingCache.set(cacheKey, cached);
      return {
        embedding: [...cached], // Return a copy to prevent cache corruption
        model: this.provider === 'openai' ? this.openaiModel : this.localModelName,
        provider: this.provider,
      };
    }

    // Task 123: Track cache miss
    this.cacheMisses++;

    // Generate embedding with circuit breaker protection
    let embedding: number[] = await this.circuitBreaker.execute(async () => {
      if (this.provider === 'openai') {
        return await this.embedOpenAI(normalized);
      } else if (this.provider === 'lmstudio') {
        return await this.embedLMStudio(normalized, type);
      } else {
        return await this.embedLocal(normalized);
      }
    });

    // Task 121/125: Validate embedding array before caching
    validateEmbedding(embedding, this.provider);

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
      model: this.getModelName(),
      provider: this.provider,
    };
  }

  /**
   * Get the model name for the current provider
   */
  private getModelName(): string {
    switch (this.provider) {
      case 'openai':
        return this.openaiModel;
      case 'lmstudio':
        return this.lmStudioModel;
      case 'local':
        return this.localModelName;
      default:
        return 'unknown';
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param texts - The texts to embed
   * @param type - 'query' for search queries, 'document' for stored memories (default: 'document')
   */
  async embedBatch(texts: string[], type: 'query' | 'document' = 'document'): Promise<EmbeddingBatchResult> {
    if (this.provider === 'disabled') {
      throw createEmbeddingDisabledError();
    }

    if (texts.length === 0) {
      return {
        embeddings: [],
        model: this.getModelName(),
        provider: this.provider,
      };
    }

    // Normalize texts
    const normalized = texts.map((t) => t.trim()).filter((t) => t.length > 0);

    // Generate embeddings with circuit breaker protection
    let embeddings: number[][] = await this.circuitBreaker.execute(async () => {
      if (this.provider === 'openai') {
        return await this.embedBatchOpenAI(normalized);
      } else if (this.provider === 'lmstudio') {
        return await this.embedBatchLMStudio(normalized, type);
      } else {
        // For local, run sequentially and periodically yield to avoid starving the event loop.
        const results: number[][] = [];
        for (let i = 0; i < normalized.length; i++) {
          if (i > 0 && i % 5 === 0) {
            await yieldToEventLoop();
          }
          results.push(await this.embedLocal(normalized[i]!));
        }
        return results;
      }
    });

    // Task 121/125: Validate all embeddings in batch
    validateEmbeddingBatch(embeddings, this.provider);

    // Cache results
    normalized.forEach((text, i) => {
      const cacheKey = `${this.provider}:${type}:${text}`;
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
      // Bug #3 fix: Return copies of embeddings to prevent cache corruption
      // Callers may mutate returned arrays, which would corrupt cached values
      embeddings: embeddings.map((e) => [...e]),
      model: this.getModelName(),
      provider: this.provider,
    };
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
    // Reset statistics when cache is cleared
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Task 123: Get cache statistics for monitoring and debugging
   * Returns hit/miss counts and calculated hit rate
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      size: this.embeddingCache.size,
      maxSize: this.maxCacheSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    };
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

        // Bug #324 fix: Validate response array matches input count
        // OpenAI may return sparse response on partial batch failure
        if (response.data.length !== texts.length) {
          throw createEmbeddingProviderError(
            'OpenAI',
            `batch response mismatch: expected ${texts.length} embeddings, got ${response.data.length}`
          );
        }

        // Bug #324 fix: Validate each embedding is valid (not empty or containing NaN)
        return response.data.map((d, i) => {
          if (!d.embedding || d.embedding.length === 0) {
            throw createEmbeddingProviderError('OpenAI', `empty embedding at index ${i}`);
          }
          // Check for NaN values that could propagate silently
          if (d.embedding.some(v => !Number.isFinite(v))) {
            throw createEmbeddingProviderError('OpenAI', `invalid embedding values at index ${i}`);
          }
          return d.embedding;
        });
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
   * Wrap text with instruction format for instruction-tuned embedding models.
   * Uses asymmetric instructions for query vs document embeddings.
   */
  private wrapWithInstruction(text: string, type: 'query' | 'document' = 'query'): string {
    // Ablation testing: return raw text when instructions disabled
    if (this.disableInstructions) {
      return text;
    }

    // Use asymmetric instructions for query vs document
    const instruction = type === 'query'
      ? this.lmStudioQueryInstruction
      : this.lmStudioDocumentInstruction;

    // Fall back to legacy single instruction if asymmetric not configured
    const effectiveInstruction = instruction || this.lmStudioInstruction;

    if (effectiveInstruction) {
      return `Instruct: ${effectiveInstruction}\nQuery: ${text}`;
    }
    return text;
  }

  /**
   * Generate embedding using LM Studio
   */
  private async embedLMStudio(text: string, type: 'query' | 'document' = 'query'): Promise<number[]> {
    const client = this.lmStudioClient;
    if (!client) {
      throw createEmbeddingProviderError('LMStudio', 'Client not initialized');
    }

    const inputText = this.wrapWithInstruction(text, type);

    return withRetry(
      async () => {
        const response = await client.embeddings.create({
          model: this.lmStudioModel,
          input: inputText,
          encoding_format: 'float', // LM Studio doesn't support base64
        });

        const embedding = response.data[0]?.embedding;
        if (!embedding) {
          throw createEmbeddingProviderError('LMStudio', 'No embedding returned');
        }

        // Auto-detect embedding dimension on first call
        if (this.lmStudioEmbeddingDimension === null) {
          this.lmStudioEmbeddingDimension = embedding.length;
          logger.info({ dimension: embedding.length, model: this.lmStudioModel }, 'LM Studio embedding dimension detected');
        }

        return embedding;
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying LM Studio embedding');
        },
      }
    );
  }

  /**
   * Generate embeddings in batch using LM Studio
   */
  private async embedBatchLMStudio(texts: string[], type: 'query' | 'document' = 'document'): Promise<number[][]> {
    const client = this.lmStudioClient;
    if (!client) {
      throw createEmbeddingProviderError('LMStudio', 'Client not initialized');
    }

    const inputTexts = texts.map((t) => this.wrapWithInstruction(t, type));

    return withRetry(
      async () => {
        const response = await client.embeddings.create({
          model: this.lmStudioModel,
          input: inputTexts,
          encoding_format: 'float', // LM Studio doesn't support base64
        });

        const embeddings = response.data.map((d) => d.embedding);

        // Auto-detect embedding dimension on first call
        if (this.lmStudioEmbeddingDimension === null && embeddings[0]) {
          this.lmStudioEmbeddingDimension = embeddings[0].length;
          logger.info({ dimension: embeddings[0].length, model: this.lmStudioModel }, 'LM Studio embedding dimension detected');
        }

        return embeddings;
      },
      {
        retryableErrors: isRetryableNetworkError,
        onRetry: (error, attempt) => {
          logger.warn({ error: error.message, attempt }, 'Retrying LM Studio batch embedding');
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
 * @deprecated Use EmbeddingService.resetWarningState() instead for better encapsulation.
 */
export function resetEmbeddingServiceState(): void {
  EmbeddingService.resetWarningState();
  EmbeddingService.hasLoggedModelLoad = false;
}
