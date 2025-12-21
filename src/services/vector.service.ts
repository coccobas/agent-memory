/**
 * Vector database service for storing and searching embeddings
 *
 * Uses LanceDB for vector similarity search
 */

import { connect, type Connection, type Table } from '@lancedb/lancedb';
import { dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { createComponentLogger } from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  createVectorInvalidInputError,
  createVectorNotInitializedError,
  createVectorDbError,
} from '../mcp/errors.js';

const logger = createComponentLogger('vector');

// Configuration from centralized config
const DEFAULT_VECTOR_DB_PATH = config.vectorDb.path;

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

export interface VectorRecord extends Record<string, unknown> {
  entryType: string;
  entryId: string;
  versionId: string;
  text: string;
  vector: number[];
  model: string;
  createdAt: string;
}

export interface SearchResult {
  entryType: string;
  entryId: string;
  versionId: string;
  score: number; // Similarity score (0-1, higher is more similar)
  text: string;
}

/**
 * Distance metric used by LanceDB
 * - cosine: Cosine similarity (default, best for normalized embeddings)
 * - l2: Euclidean distance
 * - dot: Dot product
 */
export type DistanceMetric = 'l2' | 'cosine' | 'dot';

/**
 * Vector database service using LanceDB
 */
class VectorService {
  private connection: Connection | null = null;
  private table: Table | null = null;
  private tableName = 'embeddings';
  private dbPath: string;
  private expectedDimension: number | null = null;
  private distanceMetric: DistanceMetric;
  private initPromise: Promise<void> | null = null;
  private ensureTablePromise: Promise<{ createdWithRecord: boolean }> | null = null;

  constructor(dbPath?: string, distanceMetric?: DistanceMetric) {
    this.dbPath = dbPath || DEFAULT_VECTOR_DB_PATH;
    this.distanceMetric = distanceMetric || config.vectorDb.distanceMetric;
  }

  /**
   * Get the current distance metric being used
   */
  getDistanceMetric(): DistanceMetric {
    return this.distanceMetric;
  }

  /**
   * Get the expected embedding dimension for this vector database
   * Returns null if no embeddings have been stored yet
   */
  getExpectedDimension(): number | null {
    return this.expectedDimension;
  }

  /**
   * Set the expected embedding dimension (used when first embedding is stored)
   */
  setExpectedDimension(dimension: number): void {
    if (this.expectedDimension !== null && this.expectedDimension !== dimension) {
      logger.warn(
        { existingDimension: this.expectedDimension, newDimension: dimension },
        'Embedding dimension mismatch detected. This may cause search issues.'
      );
    }
    this.expectedDimension = dimension;
  }

  /**
   * Validate embedding dimension matches expected dimension
   * @throws Error if dimensions don't match
   */
  private validateDimension(embedding: number[], context: string): void {
    if (this.expectedDimension === null) {
      // First embedding, set the expected dimension
      this.expectedDimension = embedding.length;
      logger.info({ dimension: embedding.length }, 'Vector database dimension set');
      return;
    }

    if (embedding.length !== this.expectedDimension) {
      throw createVectorDbError(
        context,
        `Dimension mismatch: expected ${this.expectedDimension}, got ${embedding.length}`,
        {
          expected: this.expectedDimension,
          actual: embedding.length,
          suggestion:
            'This may happen when switching between embedding providers. Consider clearing the vector database.',
        }
      );
    }
  }

  /**
   * Initialize the vector database connection
   */
  async initialize(): Promise<void> {
    if (this.connection) {
      return; // Already initialized
    }

    // Ensure directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Connect to LanceDB with timeout to prevent indefinite hangs
    const CONNECTION_TIMEOUT_MS = 30000; // 30 seconds
    const connectionPromise = connect(this.dbPath);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Vector DB connection timeout after ${CONNECTION_TIMEOUT_MS}ms`)),
        CONNECTION_TIMEOUT_MS
      )
    );

    try {
      this.connection = await Promise.race([connectionPromise, timeoutPromise]);
    } catch (error) {
      throw createVectorDbError(
        'connect',
        error instanceof Error ? error.message : String(error)
      );
    }

    // Check if table exists - errors here are OK, table will be created on first use
    try {
      const tableNames = await this.connection.tableNames();

      if (tableNames.includes(this.tableName)) {
        // Open existing table
        this.table = await this.connection.openTable(this.tableName);
      }
      // Table will be created on first storeEmbedding call
    } catch (error) {
      // If error is about table not found, it's ok - table will be created later
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(
        { error: errorMessage },
        'Could not list/open vector table, will create on first embedding'
      );
      // Connection succeeded, just can't access tables yet - this is fine
      // Table will be created on first storeEmbedding call
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

      // Try to open existing table first.
      try {
        const tableNames = await this.connection.tableNames();
        if (tableNames.includes(this.tableName)) {
          this.table = await this.connection.openTable(this.tableName);
          return { createdWithRecord: false };
        }
      } catch (error) {
        logger.debug({ error }, 'Could not list tables, will try open/create table');
      }

      // Try open (in case tableNames was unavailable or stale).
      try {
        this.table = await this.connection.openTable(this.tableName);
        return { createdWithRecord: false };
      } catch (error) {
        logger.debug(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to open vector table, will try to create it'
        );
      }

      if (!recordForCreate) {
        throw createVectorDbError('ensureTable', 'Table is missing and no record provided to create it');
      }

      // Create table with first record.
      try {
        this.table = await this.connection.createTable(this.tableName, [recordForCreate]);
        return { createdWithRecord: true };
      } catch (error) {
        // Another concurrent creator may have won - fall back to opening.
        logger.debug(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to create vector table, will try to open it'
        );
        this.table = await this.connection.openTable(this.tableName);
        return { createdWithRecord: false };
      }
    })().finally(() => {
      this.ensureTablePromise = null;
    });

    return this.ensureTablePromise;
  }

  /**
   * Store an embedding in the vector database
   *
   * IMPORTANT: We add the new embedding FIRST, then delete old versions.
   * This ensures that if the add fails, we don't lose the existing embedding.
   */
  async storeEmbedding(
    entryType: string,
    entryId: string,
    versionId: string,
    text: string,
    embedding: number[],
    model: string
  ): Promise<void> {
    await this.ensureInitialized();

    // Validate embedding dimension
    this.validateDimension(embedding, 'storeEmbedding');

    const record: VectorRecord = {
      entryType,
      entryId,
      versionId,
      text,
      vector: embedding,
      model,
      createdAt: new Date().toISOString(),
    };

    try {
      const { createdWithRecord } = await this.ensureTable(record);
      if (createdWithRecord) return;
      if (!this.table) return;

      // Add new record FIRST to ensure we don't lose data if this fails
      await this.table.add([record]);

      // Now delete old versions (not the one we just added)
      // This ensures we only keep the latest version and avoids stale semantic matches.
      await this.removeOldVersions(entryType, entryId, versionId);
    } catch (error) {
      throw createVectorDbError(
        'store',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Remove old version embeddings for an entry, keeping the specified version
   */
  private async removeOldVersions(
    entryType: string,
    entryId: string,
    keepVersionId: string
  ): Promise<void> {
    if (!this.table) return;

    try {
      // Validate inputs to prevent SQL injection
      const validatedEntryType = this.validateIdentifierInternal(entryType, 'entryType');
      const validatedEntryId = this.validateIdentifierInternal(entryId, 'entryId');
      const validatedKeepVersionId = this.validateIdentifierInternal(keepVersionId, 'keepVersionId');

      // Delete all versions for this entry EXCEPT the one we want to keep
      const filterPredicate = `"entryType" = '${validatedEntryType}' AND "entryId" = '${validatedEntryId}' AND "versionId" != '${validatedKeepVersionId}'`;
      await this.table.delete(filterPredicate);
    } catch (error) {
      // Log but don't throw - old version cleanup failure shouldn't break the operation
      logger.warn(
        { error, entryType, entryId, keepVersionId },
        'Failed to remove old embedding versions'
      );
    }
  }

  /**
   * Internal identifier validation (reuses the module-level function logic)
   */
  private validateIdentifierInternal(input: string, fieldName: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
      throw createVectorInvalidInputError(
        fieldName,
        'contains disallowed characters. Only alphanumeric, hyphens, and underscores are allowed.'
      );
    }
    if (input.length > 200) {
      throw createVectorInvalidInputError(fieldName, 'exceeds maximum length of 200 characters');
    }
    return input;
  }

  /**
   * Search for similar entries using vector similarity
   */
  async searchSimilar(
    embedding: number[],
    entryTypes: string[],
    limit: number = 20
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();

    // If table doesn't exist yet, return empty results
    if (!this.table) {
      return [];
    }

    // Validate embedding dimension matches stored embeddings
    if (this.expectedDimension !== null && embedding.length !== this.expectedDimension) {
      const error = new Error(
        `Embedding dimension mismatch in searchSimilar: query has ${embedding.length} dimensions, ` +
          `but stored embeddings have ${this.expectedDimension} dimensions. ` +
          `This may happen when switching between embedding providers (OpenAI uses 1536d, local model uses 384d). ` +
          `Consider clearing the vector database or using consistent embedding providers.`
      );
      logger.error(
        { queryDimension: embedding.length, storedDimension: this.expectedDimension, error },
        'Search embedding dimension mismatch'
      );
      throw error;
    }

    try {
      // Build filter for entry types
      let query = this.table.search(embedding);
      query = query.limit(limit);

      if (entryTypes.length > 0) {
        // Validate entry types to prevent SQL injection
        const typeFilter = entryTypes
          .map((t) => {
            const validated = validateIdentifier(t, 'entryType');
            return `"entryType" = '${validated}'`;
          })
          .join(' OR ');
        query = query.filter(`(${typeFilter})`);
      }

      const results = await query.toArray();

      // Check if results is an array - handle gracefully if not
      if (!Array.isArray(results)) {
        logger.warn(
          { resultsType: typeof results },
          'Vector search returned non-array result, treating as empty'
        );
        return [];
      }

      // Map results to SearchResult format
      // LanceDB returns unknown[] - we need to validate and map
      const mappedResults = results
        .map((result): SearchResult | null => {
          // Type guard - ensure result is an object with required fields
          if (
            typeof result !== 'object' ||
            result === null ||
            !('entryType' in result) ||
            !('entryId' in result) ||
            !('versionId' in result) ||
            !('text' in result)
          ) {
            logger.warn(
              {
                resultType: typeof result,
                hasKeys:
                  result && typeof result === 'object'
                    ? Object.keys(result as Record<string, unknown>).length > 0
                    : false,
              },
              'Invalid search result format, skipping'
            );
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

      return mappedResults;
    } catch (error) {
      // Check if this is an expected error (table not initialized or empty)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isExpectedError =
        errorMessage.includes('not initialized') ||
        errorMessage.includes('empty') ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('no such table');

      if (isExpectedError) {
        // Expected error (table not initialized/empty) - return empty results
        logger.debug(
          { error: errorMessage },
          'Search returned empty (table not initialized or empty)'
        );
        return [];
      }

      // Unexpected error - log and propagate
      logger.error({ error }, 'Unexpected error during vector search');
      throw error;
    }
  }

  /**
   * Remove embeddings for an entry (optionally specific version)
   */
  async removeEmbedding(entryType: string, entryId: string, versionId?: string): Promise<void> {
    await this.ensureInitialized();

    if (!this.table) {
      return; // No table means no embeddings to delete
    }

    try {
      // Validate inputs to prevent SQL injection
      const validatedEntryType = validateIdentifier(entryType, 'entryType');
      const validatedEntryId = validateIdentifier(entryId, 'entryId');

      // Build the filter predicate
      let filterPredicate: string;
      if (versionId) {
        const validatedVersionId = validateIdentifier(versionId, 'versionId');
        filterPredicate = `"entryType" = '${validatedEntryType}' AND "entryId" = '${validatedEntryId}' AND "versionId" = '${validatedVersionId}'`;
      } else {
        // Delete all versions for this entry
        filterPredicate = `"entryType" = '${validatedEntryType}' AND "entryId" = '${validatedEntryId}'`;
      }

      // LanceDB supports delete operations via the delete method
      await this.table.delete(filterPredicate);

      logger.debug(
        { entryType, entryId, versionId },
        'Successfully deleted embedding(s) from vector database'
      );
    } catch (error) {
      // Log error but don't throw - deletion failure shouldn't break the app
      logger.error(
        { error, entryType, entryId, versionId },
        'Failed to remove embedding from vector database'
      );
    }
  }

  /**
   * Get count of stored embeddings
   */
  async getCount(): Promise<number> {
    await this.ensureInitialized();

    // If table doesn't exist yet, return 0
    if (!this.table) {
      return 0;
    }

    try {
      const result = await this.table.countRows();
      return typeof result === 'number' ? result : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Close the vector database connection
   */
  close(): void {
    // LanceDB connections are automatically managed
    this.connection = null;
    this.table = null;
  }

  /**
   * Convert distance metric to similarity score (0-1, higher is better)
   * Uses the correct formula based on the distance metric in use
   */
  private distanceToSimilarity(distance: number): number {
    if (this.distanceMetric === 'cosine') {
      // Cosine distance is defined as: 1 - cosine_similarity
      // Therefore: cosine_similarity = 1 - cosine_distance
      // Returns value in [0, 1] where 1 means identical vectors
      return Math.max(0, Math.min(1, 1 - distance));
    } else if (this.distanceMetric === 'l2') {
      // L2 (Euclidean) distance for normalized vectors is in range [0, 2]
      // Convert to similarity score [0, 1] where 1 is identical
      // Formula: similarity = max(0, 1 - distance/2)
      return Math.max(0, 1 - distance / 2);
    } else if (this.distanceMetric === 'dot') {
      // Dot product distance (negative dot product for normalized vectors)
      // For normalized vectors: dot product is in [-1, 1]
      // Distance is typically -dot_product, so convert back
      // similarity = (1 + (-distance)) / 2 to map to [0, 1]
      return Math.max(0, Math.min(1, (1 - distance) / 2));
    }

    // Fallback for unknown metrics - use simple normalization
    return 1 / (1 + distance);
  }

  /**
   * Ensure the database is initialized
   */
  // ensureInitialized implemented above with initPromise guard
}

// Singleton instance
let vectorService: VectorService | null = null;

/**
 * Get the singleton vector service instance
 */
export function getVectorService(): VectorService {
  if (!vectorService) {
    vectorService = new VectorService(config.vectorDb.path);
  }
  return vectorService;
}

/**
 * Reset the vector service (useful for testing)
 */
export function resetVectorService(): void {
  vectorService = null;
}
