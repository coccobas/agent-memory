/**
 * Vector database service for storing and searching embeddings
 *
 * Uses LanceDB for vector similarity search (or pgvector for PostgreSQL deployments).
 *
 * ## Initialization Pattern
 *
 * This service implements a **lazy initialization** pattern with **double-init prevention**:
 *
 * 1. **Lazy**: The vector store isn't initialized until the first operation that needs it.
 *    This avoids startup delays when vector features aren't immediately needed.
 *
 * 2. **Thread-safe**: Multiple concurrent calls to operations like `storeEmbedding` or
 *    `search` will all await the same initialization promise. This prevents race conditions
 *    where multiple init calls could corrupt state.
 *
 * 3. **Idempotent**: Once initialized, subsequent calls return immediately via the
 *    `initialized` flag fast path, avoiding any async overhead.
 *
 * ```
 * Request 1 ─────┬──────> ensureInitialized() ──> creates initPromise
 *                │                                        │
 * Request 2 ─────┤                                        │──> all await same promise
 *                │                                        │
 * Request 3 ─────┘                                        ▼
 *                                               initialization completes
 *                                               initialized = true
 *                                               initPromise = null
 *
 * Request 4 ──────────────> ensureInitialized() ──> returns immediately (initialized=true)
 * ```
 *
 * ## Backend Selection
 *
 * The service supports multiple vector store backends via dependency injection:
 * - **LanceDB** (default): File-based vector DB, good for SQLite deployments
 * - **pgvector**: PostgreSQL extension, for PostgreSQL deployments
 *
 * @see IVectorStore for the backend interface
 */

import { createComponentLogger } from '../utils/logger.js';
import { createVectorDbError, createServiceUnavailableError } from '../core/errors.js';
import type {
  IVectorService,
  SearchResult,
  VectorRecord,
} from '../core/interfaces/vector.service.js';
import type { IVectorStore } from '../core/interfaces/vector-store.js';
import { LanceDbVectorStore } from '../db/vector-stores/lancedb.js'; // Default implementation

const logger = createComponentLogger('vector');

/**
 * Vector service state machine states.
 *
 * State transitions:
 * ```
 * uninitialized ──> initializing ──> ready
 *                        │              │
 *                        │              ▼
 *                        └───────> error ◄───── (any state on fatal error)
 *                                   │
 *                                   ▼
 *                                closed (terminal)
 * ```
 */
export type VectorServiceState = 'uninitialized' | 'initializing' | 'ready' | 'error' | 'closed';

/**
 * Vector database service
 *
 * Abstracts the underlying vector store and provides a unified interface
 * for embedding storage and similarity search.
 *
 * @see Module documentation above for initialization pattern details.
 */
export class VectorService implements IVectorService {
  private store: IVectorStore;

  /**
   * Current state of the vector service lifecycle.
   * Exposed via getState() for monitoring and debugging.
   */
  private state: VectorServiceState = 'uninitialized';

  /**
   * Flag indicating whether initialization has completed successfully.
   * Used for fast-path checking to skip async overhead after init.
   * @deprecated Use getState() === 'ready' instead for state checks
   */
  private initialized = false;

  /**
   * Cached initialization promise for concurrent request handling.
   * When multiple requests arrive before init completes, they all await
   * the same promise rather than triggering multiple inits.
   * Set to null after initialization completes.
   */
  private initPromise: Promise<void> | null = null;

  /**
   * Last error encountered during initialization or operation.
   * Only set when state is 'error'.
   */
  private lastError?: Error;

  constructor(store?: IVectorStore) {
    this.store = store || new LanceDbVectorStore();
  }

  /**
   * Get the current state of the vector service.
   * Useful for health checks, monitoring, and debugging.
   */
  getState(): VectorServiceState {
    return this.state;
  }

  /**
   * Get the last error if state is 'error'.
   */
  getLastError(): Error | undefined {
    return this.lastError;
  }

  /**
   * Ensure the vector store is initialized exactly once.
   *
   * This method implements the double-init prevention pattern:
   * - Fast path: If `initialized` is true, return immediately (no async overhead)
   * - Concurrent safety: If `initPromise` exists, await it (don't start another init)
   * - First call: Create `initPromise`, await it, set `initialized` on completion
   *
   * The `initPromise` is set to null after completion to allow garbage collection
   * and because subsequent calls will use the `initialized` fast path.
   *
   * State transitions:
   * - uninitialized → initializing (first call)
   * - initializing → ready (success)
   * - initializing → error (failure)
   *
   * @internal
   */
  private async ensureInitialized(): Promise<void> {
    // Fast path - no async overhead when already ready
    if (this.initialized && this.state === 'ready') return;

    // Error state - throw the stored error
    if (this.state === 'error') {
      throw (
        this.lastError ??
        createServiceUnavailableError('VectorService', 'service is in error state')
      );
    }

    // Closed state - cannot reinitialize
    if (this.state === 'closed') {
      throw createServiceUnavailableError(
        'VectorService',
        'service is closed and cannot be reinitialized'
      );
    }

    if (!this.initPromise) {
      this.state = 'initializing';
      this.initPromise = this.store
        .initialize()
        .then(() => {
          this.initialized = true;
          this.state = 'ready';
          this.initPromise = null;
          logger.info('Vector service initialized successfully');
        })
        .catch((err) => {
          this.state = 'error';
          this.lastError = err instanceof Error ? err : new Error(String(err));
          this.initPromise = null;
          logger.error({ error: this.lastError }, 'Vector service initialization failed');
          throw this.lastError;
        });
    }
    await this.initPromise;
  }

  isAvailable(): boolean {
    return this.store.isAvailable();
  }

  /**
   * Wait for the vector service to be ready.
   * This is useful for callers that need to ensure initialization before checking isAvailable().
   */
  async waitForReady(): Promise<void> {
    await this.ensureInitialized();
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
      // Store the new embedding
      await this.store.store(record);

      // Remove old versions (keep current)
      // Can be disabled for benchmarks or debugging with AGENT_MEMORY_VECTOR_SKIP_DELETE_ON_STORE=true.
      // Bug #282 fix: Case-insensitive boolean check
      const skipDelete = ['true', '1', 'yes'].includes(
        (process.env.AGENT_MEMORY_VECTOR_SKIP_DELETE_ON_STORE ?? '').toLowerCase()
      );
      if (!skipDelete) {
        await this.store.delete({
          entryType,
          entryId,
          excludeVersionId: versionId,
        });
      }
    } catch (error) {
      throw createVectorDbError('store', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Callback triggered when dimension mismatch is detected.
   * Set by the application to trigger background re-embedding.
   */
  private onDimensionMismatch?: (queryDimension: number, storedDimension: number) => void;

  /**
   * Set a callback to be triggered when dimension mismatch is detected.
   * This allows the application to trigger background re-embedding.
   */
  setDimensionMismatchCallback(
    callback: (queryDimension: number, storedDimension: number) => void
  ): void {
    this.onDimensionMismatch = callback;
  }

  async searchSimilar(
    embedding: number[],
    entryTypes: string[],
    limit: number = 20
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();

    // Check dimension mismatch - handle gracefully instead of throwing
    const expectedDim = this.store.getExpectedDimension();
    if (expectedDim !== null && embedding.length !== expectedDim) {
      logger.warn(
        {
          queryDimension: embedding.length,
          storedDimension: expectedDim,
          action: 'returning_empty_triggering_reembedding',
        },
        'Embedding dimension mismatch detected - returning empty results and triggering re-embedding'
      );

      // Trigger re-embedding callback if set (non-blocking)
      if (this.onDimensionMismatch) {
        try {
          this.onDimensionMismatch(embedding.length, expectedDim);
        } catch (callbackError) {
          logger.debug(
            {
              error: callbackError instanceof Error ? callbackError.message : String(callbackError),
            },
            'Dimension mismatch callback failed'
          );
        }
      }

      // Return empty results - allows FTS5 fallback
      return [];
    }

    return this.store.search(embedding, {
      limit,
      entryTypes,
    });
  }

  async removeEmbedding(entryType: string, entryId: string, versionId?: string): Promise<void> {
    await this.ensureInitialized();
    await this.store.delete({
      entryType,
      entryId,
      versionId,
    });
  }

  async getCount(): Promise<number> {
    await this.ensureInitialized();
    return this.store.count();
  }

  /**
   * Close the vector service and release resources.
   * After closing, the service cannot be reinitialized.
   */
  close(): void {
    if (this.state === 'closed') return;

    this.state = 'closed';
    this.initialized = false;
    this.initPromise = null;

    // Close the underlying store
    this.store.close();
    logger.info('Vector service closed');
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
