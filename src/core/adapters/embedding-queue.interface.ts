/**
 * Embedding Queue Adapter Interface
 *
 * Abstract interface for embedding queue implementations.
 * Allows swapping implementations (in-memory → Redis) without changing application code.
 *
 * @see ADR-0022 for embedding queue mechanics
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Embedding job to be processed
 */
export interface EmbeddingJob {
  /** Unique job ID */
  id: string;
  /** Entry type (guideline, knowledge, tool, experience) */
  entryType: string;
  /** Entry ID */
  entryId: string;
  /** Version ID */
  versionId: string;
  /** Text content to embed */
  content: string;
  /** Monotonic sequence number for ordering/deduplication */
  seq: number;
  /** Number of processing attempts */
  attempts: number;
  /** Timestamp when job was enqueued */
  enqueuedAt: string;
  /** Last error message if failed */
  lastError?: string;
}

/**
 * Queue statistics for monitoring
 */
export interface EmbeddingQueueStats {
  /** Number of pending jobs in queue */
  pending: number;
  /** Number of jobs currently being processed */
  inFlight: number;
  /** Number of unique entries in queue (after deduplication) */
  uniqueEntries: number;
  /** Number of jobs in dead-letter queue */
  dlqSize: number;
  /** Whether the queue is accepting new jobs */
  isAccepting: boolean;
}

/**
 * Options for enqueuing a job
 */
export interface EnqueueOptions {
  /** Priority (higher = processed sooner) */
  priority?: number;
  /** Maximum attempts before moving to DLQ */
  maxAttempts?: number;
}

/**
 * Result of a dequeue operation
 */
export interface DequeueResult {
  /** The dequeued job, or null if queue is empty */
  job: EmbeddingJob | null;
  /** Token for acknowledging/requeueing the job */
  ackToken?: string;
}

// =============================================================================
// INTERFACE
// =============================================================================

/**
 * Abstract embedding queue adapter interface.
 * Wraps queue implementations (in-memory, Redis, etc.)
 *
 * Design: Supports deduplication, concurrency limiting, and failure handling
 * per ADR-0022.
 */
export interface IEmbeddingQueueAdapter {
  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Initialize the queue adapter.
   * For Redis, this establishes the connection.
   */
  connect(): Promise<void>;

  /**
   * Close the queue adapter.
   * For Redis, this closes the connection.
   */
  close(): Promise<void>;

  /**
   * Check if the adapter is connected and ready.
   */
  isConnected(): boolean;

  // ===========================================================================
  // QUEUE OPERATIONS
  // ===========================================================================

  /**
   * Enqueue a job for processing.
   * Implements deduplication: only the latest version per entry is kept.
   *
   * @param job - The embedding job to enqueue
   * @param options - Enqueue options
   * @returns true if job was enqueued, false if skipped (stale version)
   */
  enqueue(
    job: Omit<EmbeddingJob, 'id' | 'enqueuedAt' | 'attempts'>,
    options?: EnqueueOptions
  ): Promise<boolean>;

  /**
   * Dequeue a job for processing.
   * Returns the next job to process, or null if queue is empty.
   *
   * @returns Dequeue result with job and ack token
   */
  dequeue(): Promise<DequeueResult>;

  /**
   * Acknowledge successful processing of a job.
   * Removes the job from the in-flight set.
   *
   * @param jobId - The job ID to acknowledge
   * @returns true if acknowledged, false if job not found
   */
  acknowledge(jobId: string): Promise<boolean>;

  /**
   * Requeue a job for retry after failure.
   * Increments attempt count and applies exponential backoff.
   *
   * @param jobId - The job ID to requeue
   * @param error - The error that caused the failure
   * @returns true if requeued, false if max attempts exceeded (moved to DLQ)
   */
  requeue(jobId: string, error?: string): Promise<boolean>;

  // ===========================================================================
  // DEAD-LETTER QUEUE
  // ===========================================================================

  /**
   * Get jobs from the dead-letter queue.
   *
   * @param limit - Maximum number of jobs to retrieve
   * @returns Array of failed jobs
   */
  getDLQ(limit?: number): Promise<EmbeddingJob[]>;

  /**
   * Retry a job from the dead-letter queue.
   * Moves it back to the main queue with reset attempts.
   *
   * @param jobId - The job ID to retry
   * @returns true if moved, false if job not found in DLQ
   */
  retryFromDLQ(jobId: string): Promise<boolean>;

  /**
   * Remove a job from the dead-letter queue.
   *
   * @param jobId - The job ID to remove
   * @returns true if removed, false if job not found
   */
  removeFromDLQ(jobId: string): Promise<boolean>;

  /**
   * Clear all jobs from the dead-letter queue.
   *
   * @returns Number of jobs cleared
   */
  clearDLQ(): Promise<number>;

  // ===========================================================================
  // MONITORING
  // ===========================================================================

  /**
   * Get queue statistics.
   *
   * @returns Current queue statistics
   */
  getStats(): Promise<EmbeddingQueueStats>;

  /**
   * Subscribe to queue events (job completed, job failed, etc.)
   * For cross-instance coordination in distributed setups.
   *
   * @param handler - Event handler
   * @returns Unsubscribe function
   */
  subscribe?(handler: (event: EmbeddingQueueEvent) => void): () => void;
}

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Queue event types for pub/sub coordination
 */
export type EmbeddingQueueEventType = 'job_enqueued' | 'job_completed' | 'job_failed' | 'job_dlq';

/**
 * Queue event for pub/sub
 */
export interface EmbeddingQueueEvent {
  type: EmbeddingQueueEventType;
  jobId: string;
  entryType: string;
  entryId: string;
  timestamp: string;
  error?: string;
}
