/**
 * Vector database service for storing and searching embeddings
 *
 * Uses LanceDB for vector similarity search
 *
 * Environment Variables:
 * - AGENT_MEMORY_VECTOR_DB_PATH: Path to vector database (default: data/vectors.lance)
 */

import { connect } from '@lancedb/lancedb';
import { dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('vector');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');

const DEFAULT_VECTOR_DB_PATH =
  process.env.AGENT_MEMORY_VECTOR_DB_PATH || resolve(projectRoot, 'data/vectors.lance');

export interface VectorRecord {
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
 * Vector database service using LanceDB
 */
class VectorService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private table: any = null;
  private tableName = 'embeddings';
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || DEFAULT_VECTOR_DB_PATH;
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

    try {
      // Connect to LanceDB
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.connection = await connect(this.dbPath);

      // Check if table exists
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const tableNames = await this.connection.tableNames();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      if (tableNames.includes(this.tableName)) {
        // Open existing table
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion
        this.table = await this.connection.openTable(this.tableName);
      }
      // Table will be created on first storeEmbedding call
    } catch (error) {
      throw new Error(
        `Failed to initialize vector database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Store an embedding in the vector database
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
      // Create table on first record if it doesn't exist
      if (!this.table) {
        if (!this.connection) {
          throw new Error('Vector database connection not initialized');
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const tableNames = await this.connection.tableNames();

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        if (tableNames.includes(this.tableName)) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          this.table = await this.connection.openTable(this.tableName);
        } else {
          // Create table with first record
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          this.table = await this.connection.createTable(this.tableName, [record]);
          return; // Record already added during table creation
        }
      }

      // Check if record already exists
      // Create a dummy vector with the same dimensionality as the actual embedding
      const dummyVector = Array(embedding.length).fill(0);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion
      const existing = await this.table! // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        .search(dummyVector) // Dummy vector for filter-only query
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        .filter(`"entryId" = '${entryId}' AND "versionId" = '${versionId}'`)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        .limit(1)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        .execute();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (existing.length > 0) {
        // Delete existing record
        await this.removeEmbedding(entryId, versionId);
      }

      // Add new record
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion
      await this.table!.add([record]);
    } catch (error) {
      throw new Error(
        `Failed to store embedding: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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

    try {
      // Build filter for entry types
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion
      let query = this.table!.search(embedding);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      query = query.limit(limit);

      if (entryTypes.length > 0) {
        const typeFilter = entryTypes.map((t) => `"entryType" = '${t}'`).join(' OR ');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        query = query.filter(`(${typeFilter})`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const results = await query.execute();

      // Check if results is an array - handle gracefully if not
      if (!Array.isArray(results)) {
        logger.warn(
          { resultsType: typeof results },
          'Vector search returned non-array result, treating as empty'
        );
        return [];
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const mappedResults = results.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
        (result: any) => ({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          entryType: result.entryType,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          entryId: result.entryId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          versionId: result.versionId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
          score:
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            result._distance !== undefined
              ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
                this.distanceToSimilarity(result._distance)
              : 0,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          text: result.text,
        })
      ) as SearchResult[];
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
  async removeEmbedding(_entryId: string, _versionId?: string): Promise<void> {
    await this.ensureInitialized();

    try {
      // LanceDB doesn't have direct delete, so we need to filter and recreate
      // For now, we'll accept this limitation and handle cleanup during backfill
      // In production, you might want to implement a more sophisticated cleanup strategy

      // Note: This is a simplified implementation
      // For a production system, you'd want to implement proper deletion or versioning

      // eslint-disable-next-line no-console
      logger.warn('Delete operation not fully implemented, embedding will remain until backfill');
    } catch (error) {
      // eslint-disable-next-line no-console
      logger.error({ error }, 'Failed to remove embedding');
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const result = await this.table.countRows();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result as number;
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
   */
  private distanceToSimilarity(distance: number): number {
    // LanceDB typically uses L2 (Euclidean) distance
    // Convert to similarity: similarity = 1 / (1 + distance)
    // This gives a score between 0 and 1, where 1 is identical
    return 1 / (1 + distance);
  }

  /**
   * Ensure the database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.connection || !this.table) {
      await this.initialize();
    }
  }
}

// Singleton instance
let vectorService: VectorService | null = null;

/**
 * Get the singleton vector service instance
 */
export function getVectorService(): VectorService {
  if (!vectorService) {
    // Read environment variable at runtime (not module load time) to support test isolation
    // If env var is set, use it; otherwise use the default resolved path
    const dbPath =
      process.env.AGENT_MEMORY_VECTOR_DB_PATH || resolve(projectRoot, 'data/vectors.lance');
    vectorService = new VectorService(dbPath);
  }
  return vectorService;
}

/**
 * Reset the vector service (useful for testing)
 */
export function resetVectorService(): void {
  vectorService = null;
}
