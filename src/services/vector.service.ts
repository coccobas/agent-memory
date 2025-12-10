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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');

const DEFAULT_VECTOR_DB_PATH = process.env.AGENT_MEMORY_VECTOR_DB_PATH || 
  resolve(projectRoot, 'data/vectors.lance');

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
  private connection: any | null = null;
  private table: any | null = null;
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
      this.connection = await connect(this.dbPath);

      // Check if table exists
      const tableNames = await this.connection.tableNames();
      
      if (tableNames.includes(this.tableName)) {
        // Open existing table
        this.table = await this.connection.openTable(this.tableName);
      }
      // Table will be created on first storeEmbedding call
    } catch (error) {
      throw new Error(`Failed to initialize vector database: ${error instanceof Error ? error.message : String(error)}`);
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
        const tableNames = await this.connection!.tableNames();
        
        if (tableNames.includes(this.tableName)) {
          this.table = await this.connection!.openTable(this.tableName);
        } else {
          // Create table with first record
          this.table = await this.connection!.createTable(this.tableName, [record]);
          return; // Record already added during table creation
        }
      }

      // Check if record already exists
      // Create a dummy vector with the same dimensionality as the actual embedding
      const dummyVector = Array(embedding.length).fill(0);
      const existing = await this.table!
        .search(dummyVector) // Dummy vector for filter-only query
        .filter(`"entryId" = '${entryId}' AND "versionId" = '${versionId}'`)
        .limit(1)
        .execute();

      if (existing.length > 0) {
        // Delete existing record
        await this.removeEmbedding(entryId, versionId);
      }

      // Add new record
      await this.table!.add([record]);
    } catch (error) {
      throw new Error(`Failed to store embedding: ${error instanceof Error ? error.message : String(error)}`);
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
      let query = this.table.search(embedding).limit(limit);

      if (entryTypes.length > 0) {
        const typeFilter = entryTypes.map((t) => `"entryType" = '${t}'`).join(' OR ');
        query = query.filter(`(${typeFilter})`);
      }

      const results = await query.execute();

      return results.map((result: any) => ({
        entryType: result.entryType,
        entryId: result.entryId,
        versionId: result.versionId,
        score: result._distance !== undefined ? this.distanceToSimilarity(result._distance) : 0,
        text: result.text,
      }));
    } catch (error) {
      // If table is empty or query fails, return empty results
      // eslint-disable-next-line no-console
      console.warn('[vector] Search failed, returning empty results:', error);
      return [];
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
      console.warn('[vector] Delete operation not fully implemented, embedding will remain until backfill');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[vector] Failed to remove embedding:', error);
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
      return result;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Close the vector database connection
   */
  async close(): Promise<void> {
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
    vectorService = new VectorService();
  }
  return vectorService;
}

/**
 * Reset the vector service (useful for testing)
 */
export function resetVectorService(): void {
  vectorService = null;
}
