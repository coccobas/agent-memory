import type { DistanceMetric, VectorRecord, SearchResult } from './vector.service.js';

/**
 * Interface for vector storage backends (e.g., LanceDB, Pinecone, PgVector)
 */
export interface IVectorStore {
  /**
   * Initialize the vector store connection
   */
  initialize(): Promise<void>;

  /**
   * Check if the store is initialized and available
   */
  isAvailable(): boolean;

  /**
   * Close the store connection
   */
  close(): void;

  /**
   * Store an embedding record
   */
  store(record: VectorRecord): Promise<void>;

  /**
   * Delete embeddings matching criteria
   */
  delete(filter: {
    entryType: string;
    entryId: string;
    versionId?: string;
    excludeVersionId?: string;
  }): Promise<void>;

  /**
   * Search for similar embeddings
   */
  search(
    embedding: number[],
    options: {
      limit: number;
      entryTypes?: string[];
    }
  ): Promise<SearchResult[]>;

  /**
   * Get total count of stored embeddings
   */
  count(): Promise<number>;

  /**
   * Get expected dimension
   */
  getExpectedDimension(): number | null;

  /**
   * Set expected dimension
   */
  setExpectedDimension(dimension: number): void;

  /**
   * Get distance metric
   */
  getDistanceMetric(): DistanceMetric;

  /**
   * Compact the vector store to reclaim space from deleted records
   * and clean up old version files (optional - not all backends support this)
   */
  compact?(): Promise<void>;

  /**
   * Get metadata about stored embeddings (entry IDs, models, dimensions).
   * Used for identifying entries that need re-embedding after model change.
   */
  getEmbeddingMetadata?(options?: { entryTypes?: string[]; limit?: number }): Promise<
    Array<{
      entryType: string;
      entryId: string;
      versionId: string;
      model: string;
      dimension: number;
    }>
  >;

  /**
   * Get the dimension of stored embeddings by sampling existing records.
   * Returns null if no embeddings exist.
   */
  getStoredDimension?(): Promise<number | null>;

  /**
   * Get embeddings by entry IDs.
   * Used for loading pre-computed embeddings (e.g., for hierarchical summarization).
   *
   * @param entryIds Array of entry IDs (format: "entryType:entryId")
   * @returns Map of entry ID to embedding vector
   */
  getByEntryIds?(
    entryIds: Array<{ entryType: string; entryId: string }>
  ): Promise<Map<string, number[]>>;
}
