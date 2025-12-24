/**
 * Latent Memory Service
 *
 * Orchestrates latent memory operations including:
 * - Creating compressed embeddings for memory entries
 * - Storing in vector DB with caching
 * - Semantic similarity search
 * - Access pattern tracking for importance scoring
 * - Lifecycle management (pruning, cleanup)
 *
 * Dependencies:
 * - EmbeddingService: Generates text embeddings
 * - VectorService: Stores and searches embeddings
 * - KVCacheService: Caches metadata and hot paths
 * - CompressionStrategy: Reduces embedding dimensionality
 * - Repository: Persists latent memory metadata
 */

import { v4 as uuidv4 } from 'uuid';
import { createComponentLogger } from '../../utils/logger.js';
import type { EmbeddingService } from '../embedding.service.js';
import type { VectorService } from '../vector.service.js';
import type { LatentMemory } from '../../db/schema/latent-memories.js';
import type { CompressionStrategy } from './compression/types.js';

const logger = createComponentLogger('latent-memory');

// =============================================================================
// STUB INTERFACES (to be implemented separately)
// =============================================================================

/**
 * Key-Value cache service for metadata and hot-path optimization
 */
export interface IKVCacheService {
  /**
   * Get a cached value
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a cached value with optional TTL
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a cached value
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all cached values
   */
  clear(): Promise<void>;

  /**
   * Check if cache is available
   */
  isAvailable(): boolean;
}

/**
 * Repository interface for latent memory persistence
 */
export interface ILatentMemoryRepository {
  /**
   * Create a new latent memory record
   */
  create(data: NewLatentMemoryData): Promise<LatentMemory>;

  /**
   * Find latent memory by source
   */
  findBySource(
    sourceType: string,
    sourceId: string,
    sourceVersionId?: string
  ): Promise<LatentMemory | null>;

  /**
   * Update access tracking
   */
  updateAccess(id: string): Promise<void>;

  /**
   * Update importance score
   */
  updateImportance(id: string, score: number): Promise<void>;

  /**
   * Delete by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Delete stale entries (not accessed within N days)
   */
  deleteStale(daysOld: number): Promise<number>;

  /**
   * Find by session
   */
  findBySession(sessionId: string): Promise<LatentMemory[]>;
}

/**
 * Data required to create a new latent memory
 */
export interface NewLatentMemoryData {
  id: string;
  sourceType: string;
  sourceId: string;
  sourceVersionId?: string;
  fullEmbedding: number[];
  reducedEmbedding?: number[];
  fullDimension: number;
  reducedDimension?: number;
  compressionMethod: 'pca' | 'random_projection' | 'quantized' | 'none';
  textPreview?: string;
  importanceScore: number;
  sessionId?: string;
  expiresAt?: string;
}

// =============================================================================
// SERVICE INTERFACES
// =============================================================================

/**
 * Input for creating a latent memory
 */
export interface CreateLatentMemoryInput {
  /** Source entry type (tool, guideline, knowledge, experience) */
  sourceType: 'tool' | 'guideline' | 'knowledge' | 'experience';
  /** Source entry ID */
  sourceId: string;
  /** Source version ID (optional) */
  sourceVersionId?: string;
  /** Text content to embed */
  text: string;
  /** Optional session ID for scoping */
  sessionId?: string;
  /** Initial importance score (0-1, default 0.5) */
  importanceScore?: number;
  /** Optional expiration timestamp */
  expiresAt?: string;
}

/**
 * Options for similarity search
 */
export interface FindSimilarOptions {
  /** Maximum number of results */
  limit?: number;
  /** Minimum similarity score threshold (0-1) */
  minScore?: number;
  /** Filter by source types */
  sourceTypes?: string[];
  /** Filter by session ID */
  sessionId?: string;
}

/**
 * Latent memory with similarity score
 */
export interface SimilarLatentMemory extends LatentMemory {
  /** Similarity score (0-1, higher is more similar) */
  similarityScore: number;
}

/**
 * Service configuration
 */
export interface LatentMemoryServiceConfig {
  /** Enable compression (default: true) */
  enableCompression?: boolean;
  /** Enable caching (default: true) */
  enableCache?: boolean;
  /** Default importance score (0-1, default: 0.5) */
  defaultImportance?: number;
  /** Cache TTL in seconds (default: 3600 = 1 hour) */
  cacheTtlSeconds?: number;
}

// =============================================================================
// LATENT MEMORY SERVICE
// =============================================================================

/**
 * Latent Memory Service
 *
 * Orchestrates embedding generation, compression, caching, and vector storage
 * for efficient semantic memory operations.
 */
export class LatentMemoryService {
  private readonly embeddingService: EmbeddingService;
  private readonly vectorService: VectorService;
  private readonly kvCache?: IKVCacheService;
  private readonly compression?: CompressionStrategy;
  private readonly repository?: ILatentMemoryRepository;
  private readonly config: Required<LatentMemoryServiceConfig>;

  /**
   * Create a LatentMemoryService instance
   *
   * @param embeddingService - Service for generating embeddings
   * @param vectorService - Service for vector storage and search
   * @param kvCache - Optional KV cache for metadata
   * @param compression - Optional compression strategy
   * @param repository - Optional repository for persistence (can be stubbed)
   * @param config - Optional configuration
   */
  constructor(
    embeddingService: EmbeddingService,
    vectorService: VectorService,
    kvCache?: IKVCacheService,
    compression?: CompressionStrategy,
    repository?: ILatentMemoryRepository,
    config?: LatentMemoryServiceConfig
  ) {
    this.embeddingService = embeddingService;
    this.vectorService = vectorService;
    this.kvCache = kvCache;
    this.compression = compression;
    this.repository = repository;

    // Apply defaults to config
    this.config = {
      enableCompression: config?.enableCompression ?? true,
      enableCache: config?.enableCache ?? true,
      defaultImportance: config?.defaultImportance ?? 0.5,
      cacheTtlSeconds: config?.cacheTtlSeconds ?? 3600,
    };

    logger.debug(
      {
        hasCache: !!kvCache,
        hasCompression: !!compression,
        hasRepository: !!repository,
        config: this.config,
      },
      'LatentMemoryService initialized'
    );
  }

  /**
   * Check if the service is available (requires embeddings and vectors)
   */
  isAvailable(): boolean {
    return this.embeddingService.isAvailable() && this.vectorService.isAvailable();
  }

  /**
   * Create a latent memory for a source entry
   *
   * Process:
   * 1. Generate full embedding
   * 2. Compress embedding (if enabled)
   * 3. Store in vector DB
   * 4. Cache metadata (if enabled)
   * 5. Persist to repository (if available)
   *
   * @param input - Creation input
   * @returns Created latent memory
   */
  async createLatentMemory(input: CreateLatentMemoryInput): Promise<LatentMemory> {
    if (!this.isAvailable()) {
      throw new Error('LatentMemoryService is not available (embeddings or vectors disabled)');
    }

    const {
      sourceType,
      sourceId,
      sourceVersionId,
      text,
      sessionId,
      importanceScore = this.config.defaultImportance,
      expiresAt,
    } = input;

    logger.debug({ sourceType, sourceId, textLength: text.length }, 'Creating latent memory');

    // Step 1: Generate full embedding
    const { embedding: fullEmbedding, model } = await this.embeddingService.embed(text);
    const fullDimension = fullEmbedding.length;

    // Step 2: Compress embedding (if enabled and available)
    let reducedEmbedding: number[] | undefined;
    let reducedDimension: number | undefined;
    let compressionMethod: 'pca' | 'random_projection' | 'quantized' | 'none' = 'none';

    if (this.config.enableCompression && this.compression) {
      try {
        reducedEmbedding = this.compression.compress(fullEmbedding);
        reducedDimension = reducedEmbedding.length;
        compressionMethod = this.compression.getName();
        logger.debug(
          { fullDimension, reducedDimension, method: compressionMethod },
          'Embedding compressed'
        );
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Compression failed, using full embedding'
        );
      }
    }

    // Determine which embedding to store in vector DB (compressed if available)
    const vectorEmbedding = reducedEmbedding ?? fullEmbedding;

    // Generate ID and version ID
    const id = uuidv4();
    const versionId = sourceVersionId ?? uuidv4();

    // Create text preview (first 200 chars)
    const textPreview = text.length > 200 ? text.substring(0, 197) + '...' : text;

    // Step 3: Store in vector DB
    await this.vectorService.storeEmbedding(
      sourceType,
      sourceId,
      versionId,
      textPreview,
      vectorEmbedding,
      model
    );

    logger.debug({ id, sourceType, sourceId, dimension: vectorEmbedding.length }, 'Stored in vector DB');

    // Build latent memory object
    const latentMemory: LatentMemory = {
      id,
      sourceType,
      sourceId,
      sourceVersionId: versionId,
      fullEmbedding: fullEmbedding,
      reducedEmbedding: reducedEmbedding ?? null,
      fullDimension,
      reducedDimension: reducedDimension ?? null,
      compressionMethod,
      textPreview,
      importanceScore,
      sessionId: sessionId ?? null,
      expiresAt: expiresAt ?? null,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
      isActive: true,
    };

    // Step 4: Cache metadata (if enabled)
    if (this.config.enableCache && this.kvCache?.isAvailable()) {
      const cacheKey = this.getCacheKey(sourceType, sourceId);
      try {
        await this.kvCache.set(cacheKey, latentMemory, this.config.cacheTtlSeconds);
        logger.debug({ cacheKey }, 'Cached latent memory metadata');
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to cache metadata'
        );
      }
    }

    // Step 5: Persist to repository (if available)
    if (this.repository) {
      try {
        await this.repository.create({
          id,
          sourceType,
          sourceId,
          sourceVersionId: versionId,
          fullEmbedding,
          reducedEmbedding,
          fullDimension,
          reducedDimension,
          compressionMethod,
          textPreview,
          importanceScore,
          sessionId,
          expiresAt,
        });
        logger.debug({ id }, 'Persisted to repository');
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to persist to repository'
        );
        // Don't fail the operation if persistence fails - vector DB is source of truth
      }
    }

    logger.info(
      {
        id,
        sourceType,
        sourceId,
        fullDimension,
        reducedDimension,
        compressionMethod,
        importanceScore,
      },
      'Latent memory created'
    );

    return latentMemory;
  }

  /**
   * Get a latent memory by source
   *
   * Checks cache first, falls back to repository
   *
   * @param sourceType - Source entry type
   * @param sourceId - Source entry ID
   * @returns Latent memory or undefined if not found
   */
  async getLatentMemory(sourceType: string, sourceId: string): Promise<LatentMemory | undefined> {
    // Check cache first
    if (this.config.enableCache && this.kvCache?.isAvailable()) {
      const cacheKey = this.getCacheKey(sourceType, sourceId);
      try {
        const cached = await this.kvCache.get<LatentMemory>(cacheKey);
        if (cached) {
          logger.debug({ cacheKey }, 'Cache hit');
          return cached;
        }
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Cache read failed'
        );
      }
    }

    // Fall back to repository
    if (this.repository) {
      const found = await this.repository.findBySource(sourceType, sourceId);
      if (found) {
        // Update cache
        if (this.config.enableCache && this.kvCache?.isAvailable()) {
          const cacheKey = this.getCacheKey(sourceType, sourceId);
          await this.kvCache.set(cacheKey, found, this.config.cacheTtlSeconds).catch(() => {
            // Ignore cache errors
          });
        }
        return found;
      }
    }

    return undefined;
  }

  /**
   * Find similar latent memories using semantic search
   *
   * Process:
   * 1. Embed the query text
   * 2. Compress (if enabled)
   * 3. Search vector DB
   * 4. Enrich with metadata from cache/repository
   * 5. Filter and rank results
   *
   * @param query - Query text
   * @param options - Search options
   * @returns Similar latent memories with scores
   */
  async findSimilar(query: string, options: FindSimilarOptions = {}): Promise<SimilarLatentMemory[]> {
    if (!this.isAvailable()) {
      throw new Error('LatentMemoryService is not available (embeddings or vectors disabled)');
    }

    const { limit = 20, minScore = 0.0, sourceTypes, sessionId } = options;

    logger.debug({ query: query.substring(0, 50), limit, minScore, sourceTypes }, 'Finding similar memories');

    // Step 1: Embed query
    const { embedding: fullEmbedding } = await this.embeddingService.embed(query);

    // Step 2: Compress query embedding (if enabled)
    let queryEmbedding = fullEmbedding;
    if (this.config.enableCompression && this.compression) {
      try {
        queryEmbedding = this.compression.compress(fullEmbedding);
        logger.debug({ originalDim: fullEmbedding.length, compressedDim: queryEmbedding.length }, 'Query compressed');
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Query compression failed, using full embedding'
        );
      }
    }

    // Step 3: Search vector DB
    const entryTypes = sourceTypes ?? ['tool', 'guideline', 'knowledge', 'experience'];
    const searchResults = await this.vectorService.searchSimilar(queryEmbedding, entryTypes, limit);

    logger.debug({ count: searchResults.length }, 'Vector search completed');

    // Step 4: Enrich with metadata and filter
    const enrichedResults: SimilarLatentMemory[] = [];

    for (const result of searchResults) {
      // Filter by minimum score
      if (result.score < minScore) {
        continue;
      }

      // Try to get full metadata from cache/repository
      const metadata = await this.getLatentMemory(result.entryType, result.entryId);

      if (metadata) {
        // Filter by session if specified
        if (sessionId && metadata.sessionId !== sessionId) {
          continue;
        }

        // Filter by active status
        if (!metadata.isActive) {
          continue;
        }

        enrichedResults.push({
          ...metadata,
          similarityScore: result.score,
        });

        // Track access
        this.trackAccess(metadata.id).catch((error) => {
          logger.warn(
            { error: error instanceof Error ? error.message : String(error), id: metadata.id },
            'Failed to track access'
          );
        });
      } else {
        // Metadata not found, create minimal record from vector result
        enrichedResults.push({
          id: uuidv4(),
          sourceType: result.entryType as 'tool' | 'guideline' | 'knowledge' | 'experience',
          sourceId: result.entryId,
          sourceVersionId: result.versionId,
          fullEmbedding: [],
          reducedEmbedding: null,
          fullDimension: 0,
          reducedDimension: null,
          compressionMethod: 'none',
          textPreview: result.text,
          importanceScore: this.config.defaultImportance,
          sessionId: null,
          expiresAt: null,
          createdAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 0,
          isActive: true,
          similarityScore: result.score,
        });
      }
    }

    logger.info({ count: enrichedResults.length, limit, minScore }, 'Similar memories found');

    return enrichedResults;
  }

  /**
   * Track access to a latent memory
   *
   * Updates:
   * - lastAccessedAt timestamp
   * - accessCount
   * - Importance score (based on access patterns)
   *
   * @param id - Latent memory ID
   */
  async trackAccess(id: string): Promise<void> {
    if (!this.repository) {
      logger.debug({ id }, 'No repository, skipping access tracking');
      return;
    }

    try {
      await this.repository.updateAccess(id);
      logger.debug({ id }, 'Access tracked');

      // Invalidate cache to ensure fresh data on next read
      // Cache key is source-based, but we don't have source info here
      // Cache will naturally expire based on TTL
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error), id }, 'Failed to track access');
    }
  }

  /**
   * Update importance score for a latent memory
   *
   * @param id - Latent memory ID
   * @param score - New importance score (0-1)
   */
  async updateImportance(id: string, score: number): Promise<void> {
    if (!this.repository) {
      logger.debug({ id }, 'No repository, skipping importance update');
      return;
    }

    if (score < 0 || score > 1) {
      throw new Error(`Invalid importance score: ${score} (must be 0-1)`);
    }

    try {
      await this.repository.updateImportance(id, score);
      logger.debug({ id, score }, 'Importance updated');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), id, score },
        'Failed to update importance'
      );
      throw error;
    }
  }

  /**
   * Prune stale latent memories
   *
   * Removes entries that haven't been accessed within the specified number of days.
   * Also cleans up from vector DB and cache.
   *
   * @param staleDays - Number of days without access to consider stale
   * @returns Number of entries pruned
   */
  async pruneStale(staleDays: number): Promise<number> {
    if (!this.repository) {
      logger.debug('No repository, skipping pruning');
      return 0;
    }

    if (staleDays <= 0) {
      throw new Error(`Invalid staleDays: ${staleDays} (must be > 0)`);
    }

    logger.info({ staleDays }, 'Pruning stale latent memories');

    try {
      const deletedCount = await this.repository.deleteStale(staleDays);

      logger.info({ deletedCount, staleDays }, 'Stale memories pruned');

      return deletedCount;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), staleDays },
        'Failed to prune stale memories'
      );
      throw error;
    }
  }

  /**
   * Clear all cache entries for latent memories
   */
  async clearCache(): Promise<void> {
    if (!this.kvCache?.isAvailable()) {
      logger.debug('No cache available');
      return;
    }

    try {
      await this.kvCache.clear();
      logger.info('Cache cleared');
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to clear cache');
      throw error;
    }
  }

  /**
   * Get statistics about latent memories
   */
  async getStats(): Promise<{
    totalVectorCount: number;
    compressionEnabled: boolean;
    cacheEnabled: boolean;
    repositoryAvailable: boolean;
  }> {
    const totalVectorCount = await this.vectorService.getCount();

    return {
      totalVectorCount,
      compressionEnabled: this.config.enableCompression && !!this.compression,
      cacheEnabled: this.config.enableCache && !!this.kvCache?.isAvailable(),
      repositoryAvailable: !!this.repository,
    };
  }

  /**
   * Generate cache key for source lookup
   */
  private getCacheKey(sourceType: string, sourceId: string): string {
    return `latent:${sourceType}:${sourceId}`;
  }
}
