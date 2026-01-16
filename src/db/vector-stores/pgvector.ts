/**
 * pgvector implementation of IVectorStore
 *
 * Uses PostgreSQL with pgvector extension for vector similarity search.
 * Auto-selected when PostgreSQL is the main database backend.
 */

import type { Pool, PoolClient } from 'pg';
import { createComponentLogger } from '../../utils/logger.js';
import {
  createVectorDbError,
  createVectorNotInitializedError,
  createVectorInvalidInputError,
  createValidationError,
} from '../../core/errors.js';
import type { IVectorStore } from '../../core/interfaces/vector-store.js';
import type {
  DistanceMetric,
  SearchResult,
  VectorRecord,
} from '../../core/interfaces/vector.service.js';

const logger = createComponentLogger('pgvector-store');

// =============================================================================
// DATABASE ROW TYPES
// =============================================================================

/**
 * Row type for _vector_meta table queries
 */
interface MetaRow {
  key: string;
  value: string;
}

/**
 * Row type for vector search result queries
 */
interface SearchResultRow {
  entry_type: string;
  entry_id: string;
  version_id: string | null;
  text: string;
  distance: string | number;
}

/**
 * Row type for COUNT(*) queries
 */
interface CountRow {
  count: string | number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// pgvector distance operators by metric type
const DISTANCE_OPERATORS: Record<DistanceMetric, string> = {
  cosine: '<=>',
  l2: '<->',
  dot: '<#>',
};

// HNSW index ops class by metric type
const INDEX_OPS: Record<DistanceMetric, string> = {
  cosine: 'vector_cosine_ops',
  l2: 'vector_l2_ops',
  dot: 'vector_ip_ops',
};

/**
 * Validates embedding dimension to prevent SQL injection.
 * @param dimension - The dimension value to validate
 * @returns The validated dimension as a number
 * @throws Error if the dimension is invalid
 */
function validateDimension(dimension: unknown): number {
  if (
    typeof dimension !== 'number' ||
    !Number.isInteger(dimension) ||
    dimension < 1 ||
    dimension > 10000
  ) {
    throw createValidationError(
      'dimension',
      `invalid embedding dimension: ${String(dimension)}`,
      'Must be an integer between 1 and 10000'
    );
  }
  return dimension;
}

/**
 * pgvector implementation of IVectorStore
 */
export class PgVectorStore implements IVectorStore {
  private pool: Pool;
  private distanceMetric: DistanceMetric;
  private expectedDimension: number | null = null;
  private initialized = false;
  private hnswIndexCreated = false;
  private initPromise: Promise<void> | null = null;

  constructor(pool: Pool, distanceMetric: DistanceMetric = 'cosine') {
    this.pool = pool;
    this.distanceMetric = distanceMetric;
  }

  getDistanceMetric(): DistanceMetric {
    return this.distanceMetric;
  }

  isAvailable(): boolean {
    return this.initialized;
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
    if (this.initialized) {
      return;
    }

    // Prevent concurrent initialization
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Verify pgvector extension exists
      const extCheck = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
      if (extCheck.rowCount === 0) {
        throw createVectorDbError(
          'initialize',
          'pgvector extension not installed. Run: CREATE EXTENSION vector;'
        );
      }

      // Check if vector_embeddings table exists
      const tableCheck = await client.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'vector_embeddings'"
      );
      if (tableCheck.rowCount === 0) {
        throw createVectorDbError(
          'initialize',
          'vector_embeddings table not found. Run the 0012_add_pgvector.sql migration.'
        );
      }

      // Load dimension from meta table if it exists
      const dimResult = await client.query<MetaRow>(
        "SELECT value FROM _vector_meta WHERE key = 'dimension'"
      );
      if (dimResult.rows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.expectedDimension = parseInt(dimResult.rows[0]!.value, 10);
        logger.debug({ dimension: this.expectedDimension }, 'Loaded vector dimension from meta');
      }

      // Check if HNSW index exists
      const indexCheck = await client.query(
        "SELECT 1 FROM pg_indexes WHERE indexname = 'idx_vector_embeddings_hnsw'"
      );
      this.hnswIndexCreated = (indexCheck.rowCount ?? 0) > 0;

      this.initialized = true;
      logger.debug('pgvector store initialized');
    } catch (error) {
      if (error instanceof Error && error.message.includes('pgvector')) {
        throw error;
      }
      throw createVectorDbError(
        'initialize',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      client.release();
    }
  }

  async store(record: VectorRecord): Promise<void> {
    await this.ensureInitialized();

    const { entryType, entryId, versionId, text, vector, model, createdAt } = record;

    // Validate and set dimension on first store
    if (this.expectedDimension === null) {
      await this.setDimensionAndCreateIndex(vector.length);
    } else if (vector.length !== this.expectedDimension) {
      throw createVectorInvalidInputError(
        'embedding',
        `dimension mismatch: expected ${this.expectedDimension}, got ${vector.length}`
      );
    }

    const id = `${entryType}-${entryId}-${versionId}`;
    const vectorStr = this.vectorToString(vector);

    const client = await this.pool.connect();
    try {
      // Upsert the embedding
      await client.query(
        `INSERT INTO vector_embeddings (id, entry_type, entry_id, version_id, text, embedding, model, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8)
         ON CONFLICT (entry_type, entry_id, version_id)
         DO UPDATE SET text = $5, embedding = $6::vector, model = $7, created_at = $8`,
        [id, entryType, entryId, versionId, text, vectorStr, model, createdAt]
      );
    } catch (error) {
      throw createVectorDbError('store', error instanceof Error ? error.message : String(error));
    } finally {
      client.release();
    }
  }

  async delete(filter: {
    entryType: string;
    entryId: string;
    versionId?: string;
    excludeVersionId?: string;
  }): Promise<void> {
    await this.ensureInitialized();

    const { entryType, entryId, versionId, excludeVersionId } = filter;

    let query = 'DELETE FROM vector_embeddings WHERE entry_type = $1 AND entry_id = $2';
    const params: string[] = [entryType, entryId];

    if (versionId) {
      query += ' AND version_id = $3';
      params.push(versionId);
    }

    if (excludeVersionId) {
      query += ` AND version_id != $${params.length + 1}`;
      params.push(excludeVersionId);
    }

    const client = await this.pool.connect();
    try {
      await client.query(query, params);
    } catch (error) {
      logger.warn({ error, filter }, 'Failed to delete embeddings');
    } finally {
      client.release();
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

    if (this.expectedDimension !== null && embedding.length !== this.expectedDimension) {
      const error = new Error(
        `Embedding dimension mismatch in search: query has ${embedding.length} dimensions, ` +
          `but stored embeddings have ${this.expectedDimension} dimensions.`
      );
      logger.error(
        { queryDimension: embedding.length, storedDimension: this.expectedDimension, error },
        'Search embedding dimension mismatch'
      );
      throw error;
    }

    const operator = DISTANCE_OPERATORS[this.distanceMetric];
    const vectorStr = this.vectorToString(embedding);

    let query = `
      SELECT entry_type, entry_id, version_id, text, embedding ${operator} $1::vector AS distance
      FROM vector_embeddings
    `;
    // Bug #268 fix: Use broader type to allow arrays for ANY() queries
    // pg driver correctly converts string[] to PostgreSQL array literals
    const params: (string | number | string[])[] = [vectorStr];

    if (options.entryTypes && options.entryTypes.length > 0) {
      query += ' WHERE entry_type = ANY($2)';
      params.push(options.entryTypes);
    }

    query += ` ORDER BY embedding ${operator} $1::vector LIMIT $${params.length + 1}`;
    params.push(options.limit);

    const client = await this.pool.connect();
    try {
      const result = await client.query<SearchResultRow>(query, params);

      return result.rows.map((row) => ({
        entryType: row.entry_type,
        entryId: row.entry_id,
        versionId: row.version_id ?? '',
        text: row.text,
        score: this.distanceToSimilarity(
          parseFloat(typeof row.distance === 'string' ? row.distance : String(row.distance))
        ),
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle expected cases gracefully
      if (
        errorMessage.includes('does not exist') ||
        errorMessage.includes('relation') ||
        errorMessage.includes('no rows')
      ) {
        logger.debug({ error: errorMessage }, 'Search returned empty (table not ready)');
        return [];
      }

      logger.error({ error }, 'Unexpected error during vector search');
      throw error;
    } finally {
      client.release();
    }
  }

  async count(): Promise<number> {
    await this.ensureInitialized();

    const client = await this.pool.connect();
    try {
      const result = await client.query<CountRow>('SELECT COUNT(*) FROM vector_embeddings');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const countValue = result.rows[0]!.count;
      return parseInt(typeof countValue === 'string' ? countValue : String(countValue), 10);
    } catch {
      return 0;
    } finally {
      client.release();
    }
  }

  close(): void {
    // Pool is managed externally, we just mark as not initialized
    this.initialized = false;
  }

  async compact(): Promise<void> {
    await this.ensureInitialized();

    const client = await this.pool.connect();
    try {
      // VACUUM ANALYZE to reclaim space and update statistics
      await client.query('VACUUM ANALYZE vector_embeddings');
      logger.debug('Vector table compacted with VACUUM ANALYZE');
    } catch (error) {
      logger.warn({ error }, 'Failed to compact vector table');
    } finally {
      client.release();
    }
  }

  /**
   * Set dimension in meta table and create HNSW index
   */
  private async setDimensionAndCreateIndex(dimension: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Store dimension in meta table
      await client.query(
        `INSERT INTO _vector_meta (key, value, updated_at)
         VALUES ('dimension', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [String(dimension)]
      );

      this.expectedDimension = dimension;
      logger.info({ dimension }, 'Vector dimension set');

      // Create HNSW index if not exists
      if (!this.hnswIndexCreated) {
        await this.createHnswIndex(client, dimension);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Create HNSW index with appropriate ops class
   */
  private async createHnswIndex(client: PoolClient, dimension: number): Promise<void> {
    // Validate dimension to prevent SQL injection
    const validatedDimension = validateDimension(dimension);
    const opsClass = INDEX_OPS[this.distanceMetric];

    try {
      // pgvector requires fixed dimensions for HNSW index
      // Alter column type to specify dimension if not already set
      await client.query(
        `ALTER TABLE vector_embeddings ALTER COLUMN embedding TYPE vector(${validatedDimension})`
      );

      // Create HNSW index
      // m=16: connections per layer, ef_construction=64: build-time search width
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_vector_embeddings_hnsw
        ON vector_embeddings
        USING hnsw (embedding ${opsClass})
        WITH (m = 16, ef_construction = 64)
      `);

      this.hnswIndexCreated = true;
      logger.info(
        { dimension, opsClass, m: 16, efConstruction: 64 },
        'HNSW index created for vector embeddings'
      );
    } catch (error) {
      // Index creation may fail if dimension varies - log but don't fail
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to create HNSW index (may already exist or dimension issue)'
      );
    }
  }

  /**
   * Convert embedding array to pgvector string format
   */
  private vectorToString(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  /**
   * Convert distance to similarity score (0-1)
   */
  private distanceToSimilarity(distance: number): number {
    switch (this.distanceMetric) {
      case 'cosine':
        // Cosine distance is 1 - cosine_similarity, so similarity = 1 - distance
        return Math.max(0, Math.min(1, 1 - distance));
      case 'l2':
        // L2 distance: convert to 0-1 range using inverse
        return Math.max(0, 1 / (1 + distance));
      case 'dot':
        // Dot product: pgvector returns negative inner product
        // So we negate and normalize
        return Math.max(0, Math.min(1, (1 - distance) / 2));
      default:
        return 1 / (1 + distance);
    }
  }

  /**
   * Ensure the store is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.initialized) {
      throw createVectorNotInitializedError();
    }
  }
}
