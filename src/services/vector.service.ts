/**
 * Vector database service for storing and searching embeddings
 *
 * Uses LanceDB for vector similarity search
 */

import { createComponentLogger } from '../utils/logger.js';
import { createVectorDbError } from '../core/errors.js';
import type {
  IVectorService,
  SearchResult,
  VectorRecord,
} from '../core/interfaces/vector.service.js';
import type { IVectorStore } from '../core/interfaces/vector-store.js';
import { LanceDbVectorStore } from '../db/vector-stores/lancedb.js'; // Default implementation

const logger = createComponentLogger('vector');
/**
 * Vector database service
 * Abstracts the underlying vector store
 */
export class VectorService implements IVectorService {
  private store: IVectorStore;

  constructor(store?: IVectorStore) {
    this.store = store || new LanceDbVectorStore();
  }

  isAvailable(): boolean {
    return this.store.isAvailable();
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  async storeEmbedding(
    entryType: string,
    entryId: string,
    versionId: string,
    text: string,
    embedding: number[],
    model: string
  ): Promise<void> {
    await this.store.initialize();

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
      // Store the new embedding
      await this.store.store(record);

      // Remove old versions (keep current)
      await this.store.delete({
        entryType,
        entryId,
        excludeVersionId: versionId,
      });
    } catch (error) {
      throw createVectorDbError('store', error instanceof Error ? error.message : String(error));
    }
  }

  async searchSimilar(
    embedding: number[],
    entryTypes: string[],
    limit: number = 20
  ): Promise<SearchResult[]> {
    await this.store.initialize();

    // Validate dimension
    const expectedDim = this.store.getExpectedDimension();
    if (expectedDim !== null && embedding.length !== expectedDim) {
      const error = new Error(
        `Embedding dimension mismatch in searchSimilar: query has ${embedding.length} dimensions, ` +
          `but stored embeddings have ${expectedDim} dimensions.`
      );
      logger.error(
        { queryDimension: embedding.length, storedDimension: expectedDim, error },
        'Search embedding dimension mismatch'
      );
      throw error;
    }

    return this.store.search(embedding, {
      limit,
      entryTypes,
    });
  }

  async removeEmbedding(entryType: string, entryId: string, versionId?: string): Promise<void> {
    await this.store.initialize();
    await this.store.delete({
      entryType,
      entryId,
      versionId,
    });
  }

  async getCount(): Promise<number> {
    await this.store.initialize();
    return this.store.count();
  }

  close(): void {
    this.store.close();
  }

  async compact(): Promise<void> {
    if (this.store.compact) {
      await this.store.compact();
    }
  }

  /**
   * Validate embedding dimension matches expected dimension
   */
  private validateDimension(embedding: number[], context: string): void {
    const expectedDimension = this.store.getExpectedDimension();

    if (expectedDimension === null) {
      this.store.setExpectedDimension(embedding.length);
      logger.info({ dimension: embedding.length }, 'Vector database dimension set');
      return;
    }

    if (embedding.length !== expectedDimension) {
      throw createVectorDbError(
        context,
        `Dimension mismatch: expected ${expectedDimension}, got ${embedding.length}`,
        {
          expected: expectedDimension,
          actual: embedding.length,
          suggestion:
            'This may happen when switching between embedding providers. Consider clearing the vector database.',
        }
      );
    }
  }
}
