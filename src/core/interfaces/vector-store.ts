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
}
