/**
 * Embedding service for generating text embeddings using various providers
 *
 * Supports:
 * - OpenAI API (text-embedding-3-small)
 * - Local models via @xenova/transformers
 * - Disabled mode (falls back to text search only)
 *
 * Environment Variables:
 * - AGENT_MEMORY_EMBEDDING_PROVIDER: 'openai' | 'local' | 'disabled' (default: 'openai')
 * - AGENT_MEMORY_OPENAI_API_KEY: OpenAI API key (required for OpenAI provider)
 * - AGENT_MEMORY_OPENAI_MODEL: Embedding model name (default: 'text-embedding-3-small')
 */

import { OpenAI } from 'openai';
import { pipeline } from '@xenova/transformers';

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
class EmbeddingService {
  private provider: EmbeddingProvider;
  private openaiClient: OpenAI | null = null;
  private openaiModel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private localPipeline: any = null;
  private localModelName = 'Xenova/all-MiniLM-L6-v2'; // 384-dim embeddings
  private embeddingCache = new Map<string, number[]>();
  private maxCacheSize = 1000;

  constructor() {
    // Determine provider from environment
    const providerEnv = process.env.AGENT_MEMORY_EMBEDDING_PROVIDER?.toLowerCase();

    if (providerEnv === 'disabled') {
      this.provider = 'disabled';
    } else if (providerEnv === 'local') {
      this.provider = 'local';
    } else {
      // Default to OpenAI, but fall back to local if no API key
      const apiKey = process.env.AGENT_MEMORY_OPENAI_API_KEY;
      if (apiKey) {
        this.provider = 'openai';
      } else {
        // eslint-disable-next-line no-console
        console.warn('[embedding] No OpenAI API key found, falling back to local model');
        this.provider = 'local';
      }
    }

    this.openaiModel = process.env.AGENT_MEMORY_OPENAI_MODEL || 'text-embedding-3-small';

    // Initialize OpenAI client if using OpenAI
    if (this.provider === 'openai') {
      const apiKey = process.env.AGENT_MEMORY_OPENAI_API_KEY;
      if (apiKey) {
        this.openaiClient = new OpenAI({ apiKey });
      }
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

    // Check cache
    const cacheKey = `${this.provider}:${normalized}`;
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
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
      // Remove oldest entry
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

    try {
      const response = await this.openaiClient.embeddings.create({
        model: this.openaiModel,
        input: text,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned from OpenAI');
      }
      return embedding;
    } catch (error) {
      throw new Error(
        `OpenAI embedding failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate embeddings in batch using OpenAI API
   */
  private async embedBatchOpenAI(texts: string[]): Promise<number[][]> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const response = await this.openaiClient.embeddings.create({
        model: this.openaiModel,
        input: texts,
      });

      return response.data.map((d) => d.embedding);
    } catch (error) {
      throw new Error(
        `OpenAI batch embedding failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate embedding using local model
   */
  private async embedLocal(text: string): Promise<number[]> {
    // Lazy load the pipeline
    if (!this.localPipeline) {
      // eslint-disable-next-line no-console
      console.log('[embedding] Loading local model (first use may take time)...');
      this.localPipeline = await pipeline('feature-extraction', this.localModelName);
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
}
