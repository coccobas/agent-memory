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
  score: number;
  text: string;
}

export type DistanceMetric = 'l2' | 'cosine' | 'dot';

export interface IVectorService {
  isAvailable(): boolean;
  initialize(): Promise<void>;

  storeEmbedding(
    entryType: string,
    entryId: string,
    versionId: string,
    text: string,
    embedding: number[],
    model: string
  ): Promise<void>;

  searchSimilar(embedding: number[], entryTypes: string[], limit?: number): Promise<SearchResult[]>;

  getCount(): Promise<number>;

  close(): void;

  /**
   * Compact the vector store to reclaim space (optional)
   */
  compact?(): Promise<void>;
}
