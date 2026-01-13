/**
 * Feedback Queue Processor
 *
 * Provides bounded queue processing for feedback recording operations.
 * Uses backpressure to prevent system overload during high query volumes.
 *
 * Features:
 * - Bounded queue with configurable max size (default 500)
 * - Configurable worker concurrency (default 2)
 * - Batch timeout for flushing partial batches (default 100ms)
 * - Dead letter queue integration for failures
 * - Lifecycle management (start, stop, drain)
 * - Monitoring via getStats()
 */

import { BoundedQueue } from '../../utils/backpressure.js';
import { DeadLetterQueue, getGeneralDLQ } from '../../utils/dead-letter-queue.js';
import { createComponentLogger } from '../../utils/logger.js';
import type { FeedbackService } from './index.js';
import type { RecordRetrievalParams } from './types.js';

const logger = createComponentLogger('feedback-queue');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for the feedback queue processor
 */
export interface FeedbackQueueConfig {
  /** Maximum number of batches in the queue (default 500) */
  maxQueueSize: number;
  /** Number of concurrent workers processing batches (default 2) */
  workerConcurrency: number;
  /** Time to wait before flushing a partial batch in ms (default 100) */
  batchTimeoutMs: number;
}

/**
 * Statistics for monitoring the feedback queue
 */
export interface FeedbackQueueStats {
  /** Current number of batches in queue */
  queueDepth: number;
  /** Maximum queue capacity */
  maxQueueSize: number;
  /** Whether the queue is currently full */
  isFull: boolean;
  /** Total batches processed since start */
  batchesProcessed: number;
  /** Total individual items processed since start */
  itemsProcessed: number;
  /** Total failures sent to DLQ since start */
  failures: number;
  /** Number of active workers */
  activeWorkers: number;
  /** Whether the processor is running */
  isRunning: boolean;
  /** Timestamp when processor was started */
  startedAt: number | null;
}

/**
 * Internal batch item with metadata
 */
interface QueuedBatch {
  items: RecordRetrievalParams[];
  queuedAt: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: FeedbackQueueConfig = {
  maxQueueSize: 500,
  workerConcurrency: 2,
  batchTimeoutMs: 100,
};

// =============================================================================
// FEEDBACK QUEUE PROCESSOR
// =============================================================================

/**
 * Bounded queue processor for feedback recording operations
 */
export class FeedbackQueueProcessor {
  private readonly config: FeedbackQueueConfig;
  private readonly queue: BoundedQueue<QueuedBatch>;
  private readonly dlq: DeadLetterQueue;
  private feedbackService: FeedbackService;

  // Worker management
  private workers: Promise<void>[] = [];
  private activeWorkerCount = 0;
  private isRunning = false;
  private shouldStop = false;

  // Statistics
  private batchesProcessed = 0;
  private itemsProcessed = 0;
  private failures = 0;
  private startedAt: number | null = null;

  // Batch timeout handling
  private pendingBatch: RecordRetrievalParams[] = [];
  private batchTimeoutHandle: NodeJS.Timeout | null = null;

  constructor(
    feedbackService: FeedbackService,
    config: Partial<FeedbackQueueConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.feedbackService = feedbackService;
    this.queue = new BoundedQueue<QueuedBatch>({
      maxSize: this.config.maxQueueSize,
      name: 'feedback-queue',
    });
    this.dlq = getGeneralDLQ();

    logger.debug(
      {
        maxQueueSize: this.config.maxQueueSize,
        workerConcurrency: this.config.workerConcurrency,
        batchTimeoutMs: this.config.batchTimeoutMs,
      },
      'FeedbackQueueProcessor created'
    );
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Start the queue processor workers
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('FeedbackQueueProcessor already running');
      return;
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.startedAt = Date.now();

    // Start worker loops
    for (let i = 0; i < this.config.workerConcurrency; i++) {
      const worker = this.runWorker(i);
      this.workers.push(worker);
    }

    logger.info(
      { workerCount: this.config.workerConcurrency },
      'FeedbackQueueProcessor started'
    );
  }

  /**
   * Stop the queue processor gracefully
   * Waits for current workers to finish but does not process remaining queue items
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping FeedbackQueueProcessor');
    this.shouldStop = true;

    // Flush any pending batch
    this.flushPendingBatch();

    // Clear batch timeout
    if (this.batchTimeoutHandle) {
      clearTimeout(this.batchTimeoutHandle);
      this.batchTimeoutHandle = null;
    }

    // Wait for workers to finish current work
    await Promise.all(this.workers);

    this.isRunning = false;
    this.workers = [];

    logger.info(
      {
        batchesProcessed: this.batchesProcessed,
        itemsProcessed: this.itemsProcessed,
        failures: this.failures,
        remainingInQueue: this.queue.size(),
      },
      'FeedbackQueueProcessor stopped'
    );
  }

  /**
   * Drain the queue completely before stopping
   * Processes all remaining items before returning
   */
  async drain(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Cannot drain: FeedbackQueueProcessor not running');
      return;
    }

    logger.info(
      { queueDepth: this.queue.size() },
      'Draining FeedbackQueueProcessor'
    );

    // Flush any pending batch first
    this.flushPendingBatch();

    // Wait until queue is empty
    while (!this.queue.isEmpty()) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Now stop normally
    await this.stop();

    logger.info('FeedbackQueueProcessor drained');
  }

  /**
   * Enqueue a batch of retrieval params for processing
   * Returns false if queue is full (backpressure signal)
   */
  enqueue(batch: RecordRetrievalParams[]): boolean {
    if (!this.isRunning) {
      logger.warn(
        { batchSize: batch.length },
        'Cannot enqueue: FeedbackQueueProcessor not running'
      );
      return false;
    }

    if (batch.length === 0) {
      return true;
    }

    // Add to pending batch
    this.pendingBatch.push(...batch);

    // Start batch timeout if not already running
    if (!this.batchTimeoutHandle) {
      this.batchTimeoutHandle = setTimeout(() => {
        this.flushPendingBatch();
      }, this.config.batchTimeoutMs);
    }

    // If we have enough items, flush immediately
    if (this.pendingBatch.length >= 50) {
      this.flushPendingBatch();
    }

    return true;
  }

  /**
   * Enqueue a single retrieval param for processing
   * Returns false if queue is full (backpressure signal)
   */
  enqueueSingle(param: RecordRetrievalParams): boolean {
    return this.enqueue([param]);
  }

  /**
   * Get current queue statistics
   */
  getStats(): FeedbackQueueStats {
    return {
      queueDepth: this.queue.size(),
      maxQueueSize: this.config.maxQueueSize,
      isFull: this.queue.isFull(),
      batchesProcessed: this.batchesProcessed,
      itemsProcessed: this.itemsProcessed,
      failures: this.failures,
      activeWorkers: this.activeWorkerCount,
      isRunning: this.isRunning,
      startedAt: this.startedAt,
    };
  }

  /**
   * Check if the queue is accepting new items
   */
  isAccepting(): boolean {
    return this.isRunning && !this.queue.isFull();
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Flush pending batch items to the queue
   */
  private flushPendingBatch(): void {
    if (this.batchTimeoutHandle) {
      clearTimeout(this.batchTimeoutHandle);
      this.batchTimeoutHandle = null;
    }

    if (this.pendingBatch.length === 0) {
      return;
    }

    const batch = this.pendingBatch;
    this.pendingBatch = [];

    const queuedBatch: QueuedBatch = {
      items: batch,
      queuedAt: Date.now(),
    };

    const success = this.queue.offer(queuedBatch);
    if (!success) {
      // Queue is full - add to DLQ
      logger.warn(
        { batchSize: batch.length },
        'Feedback queue full, sending batch to DLQ'
      );
      this.addToDLQ(batch, new Error('Queue full - backpressure'));
      this.failures++;
    }
  }

  /**
   * Worker loop that processes batches from the queue
   */
  private async runWorker(workerId: number): Promise<void> {
    logger.debug({ workerId }, 'Worker started');

    while (!this.shouldStop) {
      const batch = this.queue.poll();

      if (!batch) {
        // No work available, wait briefly before checking again
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }

      this.activeWorkerCount++;

      try {
        await this.processBatch(batch, workerId);
        this.batchesProcessed++;
        this.itemsProcessed += batch.items.length;
      } catch (error) {
        logger.error(
          {
            workerId,
            batchSize: batch.items.length,
            error: error instanceof Error ? error.message : String(error),
          },
          'Worker failed to process batch'
        );
        // Bug #250 fix: Wrap DLQ call to prevent exception in catch from breaking worker count
        try {
          this.addToDLQ(batch.items, error);
        } catch (dlqError) {
          logger.error(
            { error: dlqError instanceof Error ? dlqError.message : String(dlqError) },
            'Failed to add items to DLQ'
          );
        }
        this.failures++;
      } finally {
        this.activeWorkerCount--;
      }
    }

    logger.debug({ workerId }, 'Worker stopped');
  }

  /**
   * Process a single batch by calling the feedback service
   */
  private async processBatch(batch: QueuedBatch, workerId: number): Promise<void> {
    const startTime = Date.now();
    const queueLatency = startTime - batch.queuedAt;

    try {
      await this.feedbackService.recordRetrievalBatch(batch.items);

      const processingTime = Date.now() - startTime;
      logger.debug(
        {
          workerId,
          batchSize: batch.items.length,
          queueLatencyMs: queueLatency,
          processingTimeMs: processingTime,
        },
        'Batch processed successfully'
      );
    } catch (error) {
      // Re-throw to be handled by the worker loop
      throw error;
    }
  }

  /**
   * Add failed batch to dead letter queue
   */
  private addToDLQ(items: RecordRetrievalParams[], error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    this.dlq.add({
      type: 'sync',
      operation: 'feedback-recording',
      payload: { items, count: items.length },
      error: errorMessage,
      metadata: {
        source: 'feedback-queue',
        batchSize: items.length,
        sessionIds: [...new Set(items.map((i) => i.sessionId))],
      },
    });

    logger.debug(
      { itemCount: items.length, error: errorMessage },
      'Added failed batch to DLQ'
    );
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new FeedbackQueueProcessor instance.
 * Use this via dependency injection rather than the singleton.
 *
 * @param feedbackService - The feedback service for persisting samples
 * @param config - Optional configuration overrides
 * @returns A new FeedbackQueueProcessor instance
 */
export function createFeedbackQueueProcessor(
  feedbackService: FeedbackService,
  config?: Partial<FeedbackQueueConfig>
): FeedbackQueueProcessor {
  return new FeedbackQueueProcessor(feedbackService, config);
}
