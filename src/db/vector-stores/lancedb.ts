/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { connect, Index, type Connection, type Table } from '@lancedb/lancedb';
import { dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { createComponentLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import {
  createVectorInvalidInputError,
  createVectorNotInitializedError,
  createVectorDbError,
} from '../../core/errors.js';
import type { IVectorStore } from '../../core/interfaces/vector-store.js';
import type {
  DistanceMetric,
  SearchResult,
  VectorRecord,
} from '../../core/interfaces/vector.service.js';

export type QuantizationType = 'none' | 'sq' | 'pq';

const logger = createComponentLogger('lancedb-store');

/**
 * Validate and sanitize identifier for use in LanceDB filter queries
 * Uses whitelist approach to prevent SQL injection
 * @throws Error if identifier contains invalid characters
 */
function validateIdentifier(input: string, fieldName: string): string {
  // Allow alphanumeric, hyphens, underscores (common in UUIDs and IDs)
  if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
    throw createVectorInvalidInputError(
      fieldName,
      'contains disallowed characters. Only alphanumeric, hyphens, and underscores are allowed.'
    );
  }
  // Additional length check to prevent abuse
  if (input.length > 200) {
    throw createVectorInvalidInputError(fieldName, 'exceeds maximum length of 200 characters');
  }
  return input;
}

/**
 * LanceDB implementation of IVectorStore
 */
export class LanceDbVectorStore implements IVectorStore {
  private connection: Connection | null = null;
  private table: Table | null = null;
  private tableName = 'embeddings';
  private dbPath: string;
  private expectedDimension: number | null = null;
  private distanceMetric: DistanceMetric;
  private quantization: QuantizationType;
  private indexThreshold: number;
  private indexCreated = false;
  private initPromise: Promise<void> | null = null;
  private ensureTablePromise: Promise<{ createdWithRecord: boolean }> | null = null;
  private createIndexPromise: Promise<void> | null = null;

  constructor(
    dbPath?: string,
    distanceMetric?: DistanceMetric,
    quantization?: QuantizationType,
    indexThreshold?: number
  ) {
    // Prefer env var at instantiation time so tests/benchmarks can override paths
    // without requiring config rebuilds.
    this.dbPath = dbPath || process.env.AGENT_MEMORY_VECTOR_DB_PATH || config.vectorDb.path;
    this.distanceMetric = distanceMetric || config.vectorDb.distanceMetric;
    this.quantization =
      quantization ||
      ((config.vectorDb as Record<string, unknown>).quantization as QuantizationType) ||
      'none';
    this.indexThreshold =
      indexThreshold ||
      ((config.vectorDb as Record<string, unknown>).indexThreshold as number) ||
      256;
  }

  getDistanceMetric(): DistanceMetric {
    return this.distanceMetric;
  }

  isAvailable(): boolean {
    return !!this.connection;
  }

  getExpectedDimension(): number | null {
    return this.expectedDimension;
  }

  setExpectedDimension(dimension: number): void {
    if (this.expectedDimension !== null && this.expectedDimension !== dimension) {
      logger.warn(
        { existingDimension: this.expectedDimension, newDimension: dimension },
        'Embedding dimension mismatch detected. This may cause search issues.'
      );
    }
    this.expectedDimension = dimension;
  }

  async initialize(): Promise<void> {
    if (this.connection) {
      return; // Already initialized
    }

    // Ensure directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Connect to LanceDB with timeout
    // Bug #302 fix: Clear timeout to prevent timer leak
    const CONNECTION_TIMEOUT_MS = 30000; // 30 seconds
    const connectionPromise = connect(this.dbPath);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Vector DB connection timeout after ${CONNECTION_TIMEOUT_MS}ms`)),
        CONNECTION_TIMEOUT_MS
      );
    });

    try {
      this.connection = await Promise.race([connectionPromise, timeoutPromise]);
    } catch (error) {
      throw createVectorDbError('connect', error instanceof Error ? error.message : String(error));
    } finally {
      // Bug #302 fix: Always clear the timeout to prevent timer leak
      if (timeoutId) clearTimeout(timeoutId);
    }

    // Check if table exists - errors here are OK, table will be created on first use
    try {
      const tableNames = await this.connection.tableNames();

      if (tableNames.includes(this.tableName)) {
        // Open existing table
        this.table = await this.connection.openTable(this.tableName);
      }
      // Table will be created on first store call
    } catch (error) {
      // If error is about table not found, it's ok - table will be created later
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(
        { error: errorMessage },
        'Could not list/open vector table, will create on first embedding'
      );
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.connection) return;
    if (!this.initPromise) {
      this.initPromise = this.initialize().finally(() => {
        this.initPromise = null;
      });
    }
    await this.initPromise;
  }

  private async ensureTable(
    recordForCreate?: VectorRecord
  ): Promise<{ createdWithRecord: boolean }> {
    if (this.table) return { createdWithRecord: false };
    if (this.ensureTablePromise) return this.ensureTablePromise;

    this.ensureTablePromise = (async () => {
      await this.ensureInitialized();
      if (this.table) return { createdWithRecord: false };
      if (!this.connection) {
        throw createVectorNotInitializedError();
      }

      // Bug #27 fix: Retry with exponential backoff for inter-process races
      // When multiple processes initialize simultaneously, one may fail transiently
      const MAX_RETRIES = 3;
      const INITIAL_DELAY_MS = 100;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const tableNames = await this.connection.tableNames();
          if (tableNames.includes(this.tableName)) {
            this.table = await this.connection.openTable(this.tableName);
            return { createdWithRecord: false };
          }
        } catch (error) {
          logger.debug({ error, attempt }, 'Could not list tables, will try open/create table');
        }

        try {
          this.table = await this.connection.openTable(this.tableName);
          return { createdWithRecord: false };
        } catch (error) {
          logger.debug(
            { error: error instanceof Error ? error.message : String(error), attempt },
            'Failed to open vector table, will try to create it'
          );
        }

        if (!recordForCreate) {
          throw createVectorDbError(
            'ensureTable',
            'Table is missing and no record provided to create it'
          );
        }

        try {
          this.table = await this.connection.createTable(this.tableName, [recordForCreate]);
          return { createdWithRecord: true };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.debug(
            { error: errorMessage, attempt },
            'Failed to create vector table, will retry open'
          );

          // Bug #27 fix: Wait before retry with exponential backoff
          if (attempt < MAX_RETRIES - 1) {
            const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));

            // Try to open again after delay (another process may have created it)
            try {
              this.table = await this.connection.openTable(this.tableName);
              return { createdWithRecord: false };
            } catch {
              // Continue to next retry iteration
              logger.debug({ attempt }, 'Retry open also failed, will retry full cycle');
            }
          }
        }
      }

      // Final attempt after all retries exhausted
      this.table = await this.connection.openTable(this.tableName);
      return { createdWithRecord: false };
    })().finally(() => {
      this.ensureTablePromise = null;
    });

    return this.ensureTablePromise;
  }

  async store(record: VectorRecord): Promise<void> {
    await this.ensureInitialized();

    try {
      const { createdWithRecord } = await this.ensureTable(record);
      if (createdWithRecord) return;
      if (!this.table) return;

      await this.table.add([record]);

      // Check if we should create a quantized index
      if (this.quantization !== 'none' && !this.indexCreated) {
        void this.maybeCreateIndex();
      }
    } catch (error) {
      throw createVectorDbError('store', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Create a quantized index if the table has enough rows.
   * This is called automatically after storing records.
   */
  private async maybeCreateIndex(): Promise<void> {
    if (this.indexCreated || this.quantization === 'none' || !this.table) return;

    // Prevent concurrent index creation
    if (this.createIndexPromise) {
      return this.createIndexPromise;
    }

    this.createIndexPromise = (async () => {
      try {
        const count = await this.table!.countRows();
        if (count < this.indexThreshold) {
          return;
        }

        logger.info(
          { count, threshold: this.indexThreshold, quantization: this.quantization },
          'Creating quantized vector index'
        );

        // Create the appropriate index based on quantization type
        let indexConfig;
        if (this.quantization === 'sq') {
          // Scalar Quantization - ~4x compression
          indexConfig = Index.hnswSq({
            m: 16, // Connections per node
            efConstruction: 150, // Build-time quality
          });
        } else if (this.quantization === 'pq') {
          // Product Quantization - ~8-32x compression
          // num_sub_vectors should divide the embedding dimension
          const dimension = this.expectedDimension || 1536;
          const numSubVectors = Math.min(96, Math.floor(dimension / 8));
          indexConfig = Index.ivfPq({
            numPartitions: Math.max(1, Math.floor(Math.sqrt(count))),
            numSubVectors,
            numBits: 8,
          });
        } else {
          return;
        }

        await this.table!.createIndex('vector', { config: indexConfig });
        this.indexCreated = true;
        logger.info(
          { quantization: this.quantization },
          'Quantized vector index created successfully'
        );
      } catch (error) {
        // Index creation is best-effort - don't fail the operation
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to create quantized index (search will still work, just slower)'
        );
      }
    })().finally(() => {
      this.createIndexPromise = null;
    });

    return this.createIndexPromise;
  }

  /**
   * Force creation of a quantized index regardless of row count.
   * Useful for testing or when you know you have enough data.
   */
  async createIndex(): Promise<void> {
    if (this.quantization === 'none') {
      logger.info('Quantization is disabled, skipping index creation');
      return;
    }

    // Reset flag to force creation
    this.indexCreated = false;
    const originalThreshold = this.indexThreshold;
    this.indexThreshold = 0; // Temporarily set to 0 to force creation

    await this.maybeCreateIndex();

    this.indexThreshold = originalThreshold;
  }

  async delete(filter: {
    entryType: string;
    entryId: string;
    versionId?: string;
    excludeVersionId?: string;
  }): Promise<void> {
    await this.ensureInitialized();
    if (!this.table) return;

    try {
      const validatedEntryType = validateIdentifier(filter.entryType, 'entryType');
      const validatedEntryId = validateIdentifier(filter.entryId, 'entryId');

      // LanceDB filter syntax requires backticks for case-sensitive field names.
      // Double quotes do not behave as identifiers here.
      let filterPredicate = `\`entryType\` = '${validatedEntryType}' AND \`entryId\` = '${validatedEntryId}'`;

      if (filter.versionId) {
        const validatedVersionId = validateIdentifier(filter.versionId, 'versionId');
        filterPredicate += ` AND \`versionId\` = '${validatedVersionId}'`;
      }

      if (filter.excludeVersionId) {
        const validatedExcludeVersionId = validateIdentifier(
          filter.excludeVersionId,
          'excludeVersionId'
        );
        filterPredicate += ` AND \`versionId\` != '${validatedExcludeVersionId}'`;
      }

      await this.table.delete(filterPredicate);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), filter },
        'Failed to delete embeddings'
      );
    }
  }

  async search(
    embedding: number[],
    options: {
      limit: number;
      entryTypes?: string[];
    }
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();
    if (!this.table) return [];

    try {
      let query = this.table.search(embedding);
      query = query.limit(options.limit);

      if (options.entryTypes && options.entryTypes.length > 0) {
        const typeFilter = options.entryTypes
          .map((t) => {
            const validated = validateIdentifier(t, 'entryType');
            return `\`entryType\` = '${validated}'`;
          })
          .join(' OR ');
        query = query.filter(`(${typeFilter})`);
      }

      const results = await query.toArray();

      if (!Array.isArray(results)) {
        logger.warn(
          { resultsType: typeof results },
          'Vector search returned non-array result, treating as empty'
        );
        return [];
      }

      return results
        .map((result): SearchResult | null => {
          if (
            typeof result !== 'object' ||
            result === null ||
            !('entryType' in result) ||
            !('entryId' in result) ||
            !('versionId' in result) ||
            !('text' in result)
          ) {
            return null;
          }

          const record = result as Record<string, unknown>;
          return {
            entryType: String(record.entryType),
            entryId: String(record.entryId),
            versionId: String(record.versionId),
            score:
              typeof record._distance === 'number'
                ? this.distanceToSimilarity(record._distance)
                : 0,
            text: String(record.text),
          };
        })
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isExpectedError =
        errorMessage.includes('not initialized') ||
        errorMessage.includes('empty') ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('no such table');

      if (isExpectedError) {
        logger.debug(
          { error: errorMessage },
          'Search returned empty (table not initialized or empty)'
        );
        return [];
      }

      logger.error({ error: errorMessage }, 'Unexpected error during vector search');
      throw error;
    }
  }

  async count(): Promise<number> {
    await this.ensureInitialized();
    if (!this.table) return 0;

    try {
      const result = await this.table.countRows();
      return typeof result === 'number' ? result : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get all unique entry IDs with their embedding metadata.
   * Used for identifying entries that need re-embedding after model change.
   *
   * @param options Optional filters
   * @returns Array of entry metadata including model and dimension info
   */
  async getEmbeddingMetadata(options?: { entryTypes?: string[]; limit?: number }): Promise<
    Array<{
      entryType: string;
      entryId: string;
      versionId: string;
      model: string;
      dimension: number;
    }>
  > {
    await this.ensureInitialized();
    if (!this.table) return [];

    try {
      let query = this.table.query();

      // Apply entry type filter if provided
      if (options?.entryTypes && options.entryTypes.length > 0) {
        const typeFilter = options.entryTypes
          .map((t) => {
            const validated = validateIdentifier(t, 'entryType');
            return `\`entryType\` = '${validated}'`;
          })
          .join(' OR ');
        query = query.filter(`(${typeFilter})`);
      }

      // Apply limit if provided
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      // Select only the fields we need (avoid loading vectors into memory)
      query = query.select(['entryType', 'entryId', 'versionId', 'model', 'vector']);

      const results = await query.toArray();

      return results
        .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((r) => ({
          entryType: String(r.entryType ?? ''),
          entryId: String(r.entryId ?? ''),
          versionId: String(r.versionId ?? ''),
          model: String(r.model ?? 'unknown'),
          dimension: Array.isArray(r.vector) ? r.vector.length : 0,
        }));
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to get embedding metadata'
      );
      return [];
    }
  }

  /**
   * Get the stored embedding dimension by sampling existing records.
   * Returns null if no embeddings exist.
   */
  async getStoredDimension(): Promise<number | null> {
    await this.ensureInitialized();
    if (!this.table) return null;

    try {
      // Sample one record to get dimension
      const results = await this.table.query().limit(1).select(['vector']).toArray();
      if (results.length === 0) return null;

      const first = results[0] as Record<string, unknown>;
      if (Array.isArray(first?.vector)) {
        return first.vector.length;
      }
      return null;
    } catch {
      return null;
    }
  }

  close(): void {
    this.connection = null;
    this.table = null;
  }

  /**
   * Compact the table to reclaim space and clean up old versions.
   * LanceDB keeps transaction versions for time travel - this removes them.
   */
  async compact(): Promise<void> {
    await this.ensureInitialized();
    if (!this.table) return;

    try {
      // Compact files to merge small fragments
      await this.table.optimize({ cleanupOlderThan: new Date() });
      logger.debug('Vector table compacted and old versions cleaned up');
    } catch (error) {
      logger.warn({ error }, 'Failed to compact vector table');
    }
  }

  /**
   * Convert distance to similarity score (0-1)
   * Task 220: Fixed L2 formula to properly map any distance to [0,1]
   * Task 221: Fixed cosine formula - LanceDB uses distance = 2*(1-similarity)
   */
  private distanceToSimilarity(distance: number): number {
    if (this.distanceMetric === 'cosine') {
      // LanceDB cosine distance = 2 * (1 - cosine_similarity), range [0, 2]
      // So similarity = 1 - distance/2
      return Math.max(0, Math.min(1, 1 - distance / 2));
    } else if (this.distanceMetric === 'l2') {
      // L2 distance: use inverse formula that handles any distance range
      // Maps [0, ∞) to (0, 1], closer vectors have higher similarity
      return Math.max(0, 1 / (1 + distance));
    } else if (this.distanceMetric === 'dot') {
      // Dot product: LanceDB returns negative inner product
      // For normalized vectors, this ranges from -1 (similar) to 1 (opposite)
      return Math.max(0, Math.min(1, (1 - distance) / 2));
    }
    // Default: inverse formula for unknown metrics
    return 1 / (1 + distance);
  }
}
