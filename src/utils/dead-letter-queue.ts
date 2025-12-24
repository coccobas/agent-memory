/**
 * Dead Letter Queue for Failed Async Operations
 *
 * Provides a mechanism to store and retry failed asynchronous operations:
 * - Embedding generation failures
 * - Vector database operations
 * - External API calls
 *
 * Features:
 * - In-memory queue with configurable max size
 * - Automatic retry with exponential backoff
 * - Circuit breaker integration
 * - Error categorization and statistics
 */

import { createComponentLogger } from './logger.js';
import { getCircuitBreaker, type CircuitBreakerConfig } from './circuit-breaker.js';
import { config } from '../config/index.js';

const logger = createComponentLogger('dlq');

// =============================================================================
// TYPES
// =============================================================================

export type DLQOperationType = 'embedding' | 'vector' | 'api' | 'sync' | 'other';

export interface DLQEntry<T = unknown> {
  id: string;
  type: DLQOperationType;
  operation: string;
  payload: T;
  error: string;
  errorCode?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  lastAttemptAt: number;
  nextRetryAt: number;
  metadata?: Record<string, unknown>;
}

export interface DLQStats {
  total: number;
  byType: Record<DLQOperationType, number>;
  byOperation: Record<string, number>;
  oldestEntry: number | null;
  avgAttempts: number;
  exhausted: number; // Entries that hit max retries
}

export interface DLQConfig {
  maxSize: number;
  maxAttempts: number;
  initialRetryDelayMs: number;
  maxRetryDelayMs: number;
  backoffMultiplier: number;
  useCircuitBreaker: boolean;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  removed: boolean; // Was entry removed from queue
}

// =============================================================================
// DEAD LETTER QUEUE CLASS
// =============================================================================

const DEFAULT_CONFIG: DLQConfig = {
  maxSize: 1000,
  maxAttempts: 5,
  initialRetryDelayMs: 1000,
  maxRetryDelayMs: 60000,
  backoffMultiplier: 2,
  useCircuitBreaker: true,
};

/**
 * Dead Letter Queue implementation
 */
export class DeadLetterQueue<T = unknown> {
  private entries: Map<string, DLQEntry<T>> = new Map();
  private config: DLQConfig;
  private retryHandlers: Map<string, (entry: DLQEntry<T>) => Promise<void>> = new Map();
  private retryInterval: NodeJS.Timeout | null = null;
  private idCounter = 0;
  private oldestEntryId: string | null = null;

  constructor(config: Partial<DLQConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update the oldest entry tracker
   */
  private updateOldestEntryId(): void {
    if (this.entries.size === 0) {
      this.oldestEntryId = null;
      return;
    }

    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.entries) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestId = id;
      }
    }

    this.oldestEntryId = oldestId;
  }

  /**
   * Add a failed operation to the queue
   */
  add(entry: {
    type: DLQOperationType;
    operation: string;
    payload: T;
    error: Error | string;
    errorCode?: string;
    metadata?: Record<string, unknown>;
  }): string {
    // Check size limit
    if (this.entries.size >= this.config.maxSize) {
      // Remove oldest entry using O(1) lookup
      if (this.oldestEntryId) {
        const oldest = this.entries.get(this.oldestEntryId);
        if (oldest) {
          this.entries.delete(this.oldestEntryId);
          logger.warn({ id: oldest.id, type: oldest.type }, 'DLQ full, removed oldest entry');
          // Update tracker to find the new oldest
          this.updateOldestEntryId();
        }
      }
    }

    const id = `dlq_${Date.now()}_${++this.idCounter}`;
    const now = Date.now();
    const errorMessage = entry.error instanceof Error ? entry.error.message : entry.error;

    const dlqEntry: DLQEntry<T> = {
      id,
      type: entry.type,
      operation: entry.operation,
      payload: entry.payload,
      error: errorMessage,
      errorCode: entry.errorCode,
      attempts: 1,
      maxAttempts: this.config.maxAttempts,
      createdAt: now,
      lastAttemptAt: now,
      nextRetryAt: now + this.config.initialRetryDelayMs,
      metadata: entry.metadata,
    };

    this.entries.set(id, dlqEntry);

    // Update oldest entry tracker if needed
    if (this.oldestEntryId === null || now < (this.entries.get(this.oldestEntryId)?.createdAt ?? Infinity)) {
      this.oldestEntryId = id;
    }

    logger.info(
      { id, type: entry.type, operation: entry.operation, error: errorMessage },
      'Added entry to DLQ'
    );

    return id;
  }

  /**
   * Get an entry by ID
   */
  get(id: string): DLQEntry<T> | undefined {
    return this.entries.get(id);
  }

  /**
   * Remove an entry from the queue
   */
  remove(id: string): boolean {
    const removed = this.entries.delete(id);
    if (removed) {
      logger.debug({ id }, 'Removed entry from DLQ');
      // If we removed the oldest entry, update the tracker
      if (id === this.oldestEntryId) {
        this.updateOldestEntryId();
      }
    }
    return removed;
  }

  /**
   * Get all entries of a specific type
   */
  getByType(type: DLQOperationType): DLQEntry<T>[] {
    return Array.from(this.entries.values()).filter((e) => e.type === type);
  }

  /**
   * Get entries ready for retry
   */
  getReadyForRetry(): DLQEntry<T>[] {
    const now = Date.now();
    return Array.from(this.entries.values())
      .filter((e) => e.nextRetryAt <= now && e.attempts < e.maxAttempts)
      .sort((a, b) => a.nextRetryAt - b.nextRetryAt);
  }

  /**
   * Get exhausted entries (max attempts reached)
   */
  getExhausted(): DLQEntry<T>[] {
    return Array.from(this.entries.values()).filter((e) => e.attempts >= e.maxAttempts);
  }

  /**
   * Register a retry handler for an operation
   */
  registerRetryHandler(operation: string, handler: (entry: DLQEntry<T>) => Promise<void>): void {
    this.retryHandlers.set(operation, handler);
    logger.debug({ operation }, 'Registered DLQ retry handler');
  }

  /**
   * Retry a specific entry
   */
  async retry(id: string): Promise<RetryResult<T>> {
    const entry = this.entries.get(id);
    if (!entry) {
      return { success: false, error: new Error('Entry not found'), removed: false };
    }

    const handler = this.retryHandlers.get(entry.operation);
    if (!handler) {
      return {
        success: false,
        error: new Error(`No handler for operation: ${entry.operation}`),
        removed: false,
      };
    }

    // Update attempt tracking
    entry.attempts++;
    entry.lastAttemptAt = Date.now();

    // Use circuit breaker if enabled
    const executeRetry = async (): Promise<void> => {
      await handler(entry);
    };

    try {
      if (this.config.useCircuitBreaker) {
        const cbConfig: CircuitBreakerConfig = {
          name: `dlq-${entry.operation}`,
          failureThreshold: 3,
          resetTimeoutMs: 30000,
          successThreshold: 1,
        };
        const breaker = getCircuitBreaker(cbConfig);
        await breaker.execute(executeRetry);
      } else {
        await executeRetry();
      }

      // Success - remove from queue
      this.entries.delete(id);
      // If we removed the oldest entry, update the tracker
      if (id === this.oldestEntryId) {
        this.updateOldestEntryId();
      }
      logger.info(
        { id, operation: entry.operation, attempts: entry.attempts },
        'DLQ entry retry succeeded'
      );
      return { success: true, removed: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      entry.error = errorMessage;

      if (entry.attempts >= entry.maxAttempts) {
        logger.error(
          { id, operation: entry.operation, attempts: entry.attempts, error: errorMessage },
          'DLQ entry exhausted, max retries reached'
        );
        // Keep in queue for manual inspection, mark as exhausted
        return {
          success: false,
          error: error instanceof Error ? error : new Error(errorMessage),
          removed: false,
        };
      }

      // Calculate next retry time with exponential backoff
      const delay = Math.min(
        this.config.initialRetryDelayMs *
          Math.pow(this.config.backoffMultiplier, entry.attempts - 1),
        this.config.maxRetryDelayMs
      );
      entry.nextRetryAt = Date.now() + delay;

      logger.warn(
        {
          id,
          operation: entry.operation,
          attempts: entry.attempts,
          nextRetryIn: delay,
          error: errorMessage,
        },
        'DLQ entry retry failed, will retry later'
      );

      return {
        success: false,
        error: error instanceof Error ? error : new Error(errorMessage),
        removed: false,
      };
    }
  }

  /**
   * Process all entries ready for retry
   */
  async processRetries(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const ready = this.getReadyForRetry();
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const entry of ready) {
      const result = await this.retry(entry.id);
      processed++;
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    if (processed > 0) {
      logger.info({ processed, succeeded, failed }, 'DLQ retry batch completed');
    }

    return { processed, succeeded, failed };
  }

  /**
   * Start automatic retry processing
   */
  startAutoRetry(intervalMs: number = 60000): void {
    if (this.retryInterval) {
      return; // Already running
    }

    this.retryInterval = setInterval(() => {
      this.processRetries().catch((error) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'DLQ auto-retry failed'
        );
      });
    }, intervalMs);

    logger.info({ intervalMs }, 'Started DLQ auto-retry');
  }

  /**
   * Stop automatic retry processing
   */
  stopAutoRetry(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
      logger.info('Stopped DLQ auto-retry');
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): DLQStats {
    const entries = Array.from(this.entries.values());
    const byType: Record<DLQOperationType, number> = {
      embedding: 0,
      vector: 0,
      api: 0,
      sync: 0,
      other: 0,
    };
    const byOperation: Record<string, number> = {};
    let totalAttempts = 0;
    let exhausted = 0;
    let oldestEntry: number | null = null;

    for (const entry of entries) {
      byType[entry.type]++;
      byOperation[entry.operation] = (byOperation[entry.operation] ?? 0) + 1;
      totalAttempts += entry.attempts;
      if (entry.attempts >= entry.maxAttempts) {
        exhausted++;
      }
      if (oldestEntry === null || entry.createdAt < oldestEntry) {
        oldestEntry = entry.createdAt;
      }
    }

    return {
      total: entries.length,
      byType,
      byOperation,
      oldestEntry,
      avgAttempts: entries.length > 0 ? totalAttempts / entries.length : 0,
      exhausted,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const count = this.entries.size;
    this.entries.clear();
    this.oldestEntryId = null;
    logger.info({ count }, 'Cleared all DLQ entries');
  }

  /**
   * Clear only exhausted entries
   */
  clearExhausted(): number {
    const exhausted = this.getExhausted();
    let needsUpdate = false;
    for (const entry of exhausted) {
      if (entry.id === this.oldestEntryId) {
        needsUpdate = true;
      }
      this.entries.delete(entry.id);
    }
    if (needsUpdate) {
      this.updateOldestEntryId();
    }
    if (exhausted.length > 0) {
      logger.info({ count: exhausted.length }, 'Cleared exhausted DLQ entries');
    }
    return exhausted.length;
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this.entries.size;
  }
}

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

// Type-specific DLQ instances
let embeddingDLQ: DeadLetterQueue<{ entryType: string; entryId: string; text: string }> | null =
  null;
let vectorDLQ: DeadLetterQueue<{ entryType: string; entryId: string; embedding: number[] }> | null =
  null;
let generalDLQ: DeadLetterQueue | null = null;

/**
 * Get the embedding-specific DLQ
 */
export function getEmbeddingDLQ(): DeadLetterQueue<{
  entryType: string;
  entryId: string;
  text: string;
}> {
  if (!embeddingDLQ) {
    embeddingDLQ = new DeadLetterQueue({
      maxSize: config.validation?.bulkOperationMax ?? 500,
      maxAttempts: config.retry?.maxAttempts ?? 5,
      initialRetryDelayMs: config.retry?.initialDelayMs ?? 1000,
      maxRetryDelayMs: config.retry?.maxDelayMs ?? 60000,
      backoffMultiplier: config.retry?.backoffMultiplier ?? 2,
    });
  }
  return embeddingDLQ;
}

/**
 * Get the vector-specific DLQ
 */
export function getVectorDLQ(): DeadLetterQueue<{
  entryType: string;
  entryId: string;
  embedding: number[];
}> {
  if (!vectorDLQ) {
    vectorDLQ = new DeadLetterQueue({
      maxSize: config.validation?.bulkOperationMax ?? 500,
      maxAttempts: config.retry?.maxAttempts ?? 5,
      initialRetryDelayMs: config.retry?.initialDelayMs ?? 1000,
      maxRetryDelayMs: config.retry?.maxDelayMs ?? 60000,
      backoffMultiplier: config.retry?.backoffMultiplier ?? 2,
    });
  }
  return vectorDLQ;
}

/**
 * Get the general-purpose DLQ
 */
export function getGeneralDLQ(): DeadLetterQueue {
  if (!generalDLQ) {
    generalDLQ = new DeadLetterQueue();
  }
  return generalDLQ;
}

/**
 * Reset all DLQ singletons (for testing)
 */
export function resetAllDLQs(): void {
  if (embeddingDLQ) {
    embeddingDLQ.stopAutoRetry();
    embeddingDLQ.clear();
  }
  if (vectorDLQ) {
    vectorDLQ.stopAutoRetry();
    vectorDLQ.clear();
  }
  if (generalDLQ) {
    generalDLQ.stopAutoRetry();
    generalDLQ.clear();
  }
  embeddingDLQ = null;
  vectorDLQ = null;
  generalDLQ = null;
}
