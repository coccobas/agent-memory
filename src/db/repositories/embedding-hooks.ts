/**
 * Embedding generation hooks for repository operations
 *
 * This module provides functions to generate and store embeddings
 * when creating or updating memory entries.
 */

import { getDb } from '../connection.js';
import { entryEmbeddings } from '../schema.js';
import { generateId } from './base.js';
import { createComponentLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { getEmbeddingDLQ } from '../../utils/dead-letter-queue.js';
import { embeddingCounter, embeddingDuration } from '../../utils/metrics.js';

const logger = createComponentLogger('embedding-hook');

export type EntryType = 'tool' | 'guideline' | 'knowledge' | 'experience';

interface EmbeddingInput {
  entryType: EntryType;
  entryId: string;
  versionId: string;
  text: string;
}

export type EmbeddingResult = {
  embedding: number[];
  model: string;
  provider: 'openai' | 'local' | 'disabled';
};

export type EmbeddingPipeline = {
  isAvailable: () => boolean;
  embed: (text: string) => Promise<EmbeddingResult>;
  /** Batch embed multiple texts in a single API call (10-100x faster) */
  embedBatch?: (texts: string[]) => Promise<{
    embeddings: number[][];
    model: string;
    provider: 'openai' | 'local' | 'disabled';
  }>;
  storeEmbedding: (
    entryType: EntryType,
    entryId: string,
    versionId: string,
    text: string,
    embedding: number[],
    model: string
  ) => Promise<void>;
};

let embeddingPipeline: EmbeddingPipeline | null = null;

/**
 * Register the embedding pipeline (LLM embed + vector store).
 *
 * Repository code should not import service implementations directly; this hook
 * lets the service layer wire itself in at startup.
 */
export function registerEmbeddingPipeline(pipeline: EmbeddingPipeline | null): void {
  embeddingPipeline = pipeline;
}

// =============================================================================
// EMBEDDING JOB QUEUE (CONCURRENCY-LIMITED)
// =============================================================================

type EmbeddingQueueKey = `${EntryType}:${string}`;

type QueuedEmbeddingInput = EmbeddingInput & { __seq: number; __key: EmbeddingQueueKey };

const pendingByEntry = new Map<EmbeddingQueueKey, QueuedEmbeddingInput>();
const queue: EmbeddingQueueKey[] = [];
const enqueued = new Set<EmbeddingQueueKey>();
let inFlight = 0;
const latestSeqByKey = new Map<EmbeddingQueueKey, number>();

// Stats counters
let processedCount = 0;
let failedCount = 0;
let skippedStaleCount = 0;
let retriedCount = 0;

// =============================================================================
// FAILED JOB TRACKING & RETRY
// =============================================================================

interface FailedJob {
  input: EmbeddingInput;
  attempts: number;
  lastError: string;
  lastAttemptAt: number;
}

const failedJobs = new Map<EmbeddingQueueKey, FailedJob>();

function getMaxRetries(): number {
  const raw = config.embedding?.maxRetries;
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 3;
  return Math.max(0, Math.floor(n));
}

function getRetryDelayMs(): number {
  const raw = config.embedding?.retryDelayMs;
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1000;
  return Math.max(100, Math.floor(n));
}

/**
 * Get the batch size for embedding API calls.
 * Batching multiple texts into a single API call is 10-100x faster.
 * Default: 20 (OpenAI recommends up to 2048 inputs per batch)
 */
function getBatchSize(): number {
  const raw = (config.embedding as Record<string, unknown>)?.batchSize;
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 20;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

// Stats for batch processing
let batchesProcessed = 0;
let totalBatchedItems = 0;

/**
 * Stats for the embedding queue
 */
export interface EmbeddingQueueStats {
  /** Number of jobs waiting in queue */
  pending: number;
  /** Number of jobs currently being processed */
  inFlight: number;
  /** Total jobs successfully processed since startup */
  processed: number;
  /** Total jobs that failed (exhausted retries) since startup */
  failed: number;
  /** Jobs skipped because a newer version was queued */
  skippedStale: number;
  /** Jobs successfully retried after initial failure */
  retried: number;
  /** Jobs currently waiting for retry */
  failedPendingRetry: number;
  /** Maximum concurrent jobs allowed */
  maxConcurrency: number;
  /** Number of batch API calls made (each can contain multiple items) */
  batchesProcessed: number;
  /** Total items processed via batching */
  totalBatchedItems: number;
  /** Current batch size configuration */
  batchSize: number;
}

/**
 * Get current embedding queue statistics
 */
export function getEmbeddingQueueStats(): EmbeddingQueueStats {
  return {
    pending: queue.length,
    inFlight,
    processed: processedCount,
    failed: failedCount,
    skippedStale: skippedStaleCount,
    retried: retriedCount,
    failedPendingRetry: failedJobs.size,
    maxConcurrency: getMaxConcurrency(),
    batchesProcessed,
    totalBatchedItems,
    batchSize: getBatchSize(),
  };
}

function getMaxConcurrency(): number {
  const raw = config.embedding?.maxConcurrency;
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 4;
  return Math.max(1, Math.floor(n));
}

/**
 * Process a single embedding job (fallback when batch not available)
 */
async function runEmbeddingJob(input: QueuedEmbeddingInput): Promise<void> {
  const pipeline = embeddingPipeline;
  if (!pipeline) return;

  // Skip if embeddings are disabled
  if (!pipeline.isAvailable()) {
    return;
  }

  // Start metrics timer
  const timer = embeddingDuration.startTimer({ provider: 'pipeline' });

  // Generate embedding
  const result = await pipeline.embed(input.text);

  // If a newer job was enqueued for this entry, do not persist stale embeddings.
  const latestSeq = latestSeqByKey.get(input.__key);
  if (latestSeq !== input.__seq) {
    skippedStaleCount++;
    timer.end();
    return;
  }

  // Store in vector database
  await pipeline.storeEmbedding(
    input.entryType,
    input.entryId,
    input.versionId,
    input.text,
    result.embedding,
    result.model
  );

  // Track in database using upsert (single statement instead of SELECT + UPDATE/INSERT)
  // Uses the unique index idx_entry_embeddings_version(entryType, entryId, versionId)
  const db = getDb();
  const now = new Date().toISOString();

  db.insert(entryEmbeddings)
    .values({
      id: generateId(),
      entryType: input.entryType,
      entryId: input.entryId,
      versionId: input.versionId,
      hasEmbedding: true,
      embeddingModel: result.model,
      embeddingProvider: result.provider,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [entryEmbeddings.entryType, entryEmbeddings.entryId, entryEmbeddings.versionId],
      set: {
        hasEmbedding: true,
        embeddingModel: result.model,
        embeddingProvider: result.provider,
        updatedAt: now,
      },
    })
    .run();

  // Track successful completion
  processedCount++;
  embeddingCounter.inc({ provider: result.provider, status: 'success' });
  timer.end();
}

/**
 * Process multiple embedding jobs in a single batch API call.
 * This is 10-100x faster than individual calls when using OpenAI.
 */
async function runBatchEmbeddingJobs(jobs: QueuedEmbeddingInput[]): Promise<void> {
  const pipeline = embeddingPipeline;
  if (!pipeline || !pipeline.embedBatch || jobs.length === 0) return;

  // Skip if embeddings are disabled
  if (!pipeline.isAvailable()) {
    return;
  }

  // Start metrics timer for entire batch
  const timer = embeddingDuration.startTimer({ provider: 'pipeline' });

  // Filter out stale jobs before making the API call
  const freshJobs = jobs.filter((job) => {
    const latestSeq = latestSeqByKey.get(job.__key);
    if (latestSeq !== job.__seq) {
      skippedStaleCount++;
      return false;
    }
    return true;
  });

  if (freshJobs.length === 0) {
    timer.end();
    return;
  }

  // Extract texts for batch embedding
  const texts = freshJobs.map((job) => job.text);

  // Generate embeddings in batch
  const result = await pipeline.embedBatch(texts);

  // Track batch stats
  batchesProcessed++;
  totalBatchedItems += freshJobs.length;

  const db = getDb();
  const now = new Date().toISOString();

  // Store each embedding and track in database
  for (let i = 0; i < freshJobs.length; i++) {
    const job = freshJobs[i]!;
    const embedding = result.embeddings[i];

    if (!embedding) {
      logger.warn({ job: job.__key, index: i }, 'Batch embedding missing for job');
      continue;
    }

    // Check again for stale (could have changed during API call)
    const latestSeq = latestSeqByKey.get(job.__key);
    if (latestSeq !== job.__seq) {
      skippedStaleCount++;
      continue;
    }

    // Store in vector database
    await pipeline.storeEmbedding(
      job.entryType,
      job.entryId,
      job.versionId,
      job.text,
      embedding,
      result.model
    );

    // Track in database
    db.insert(entryEmbeddings)
      .values({
        id: generateId(),
        entryType: job.entryType,
        entryId: job.entryId,
        versionId: job.versionId,
        hasEmbedding: true,
        embeddingModel: result.model,
        embeddingProvider: result.provider,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [entryEmbeddings.entryType, entryEmbeddings.entryId, entryEmbeddings.versionId],
        set: {
          hasEmbedding: true,
          embeddingModel: result.model,
          embeddingProvider: result.provider,
          updatedAt: now,
        },
      })
      .run();

    processedCount++;
    embeddingCounter.inc({ provider: result.provider, status: 'success' });
  }

  timer.end();
  logger.debug({ batchSize: freshJobs.length }, 'Batch embedding completed');
}

function drainQueue(): void {
  const max = getMaxConcurrency();
  const pipeline = embeddingPipeline;
  const canBatch = pipeline?.embedBatch != null;
  const batchSize = getBatchSize();

  // If batching is available and we have multiple items, process as batch
  if (canBatch && queue.length >= 2 && inFlight < max) {
    // Collect up to batchSize jobs
    const jobsToProcess: QueuedEmbeddingInput[] = [];
    const keysToProcess: EmbeddingQueueKey[] = [];
    const jobAttempts: Map<EmbeddingQueueKey, number> = new Map();

    while (jobsToProcess.length < batchSize && queue.length > 0) {
      const key = queue.shift();
      if (!key) break;
      enqueued.delete(key);

      const job = pendingByEntry.get(key);
      if (!job) continue;
      pendingByEntry.delete(key);

      // Track retry attempt numbers
      const existingFailed = failedJobs.get(key);
      const attemptNumber = existingFailed ? existingFailed.attempts + 1 : 1;
      jobAttempts.set(key, attemptNumber);

      jobsToProcess.push(job);
      keysToProcess.push(key);
    }

    if (jobsToProcess.length > 0) {
      inFlight += 1; // Count entire batch as 1 in-flight operation
      void runBatchEmbeddingJobs(jobsToProcess)
        .then(() => {
          // Track successful retries
          for (const key of keysToProcess) {
            if (failedJobs.has(key)) {
              retriedCount++;
              failedJobs.delete(key);
            }
          }
        })
        .catch((error) => {
          // Batch failed - track all jobs for retry
          const errorMsg = error instanceof Error ? error.message : String(error);
          const maxRetries = getMaxRetries();
          embeddingCounter.inc({ provider: 'pipeline', status: 'error' });

          for (let i = 0; i < jobsToProcess.length; i++) {
            const job = jobsToProcess[i]!;
            const key = keysToProcess[i]!;
            const attemptNumber = jobAttempts.get(key) ?? 1;

            if (attemptNumber < maxRetries) {
              failedJobs.set(key, {
                input: job,
                attempts: attemptNumber,
                lastError: errorMsg,
                lastAttemptAt: Date.now(),
              });
            } else {
              failedCount++;
              failedJobs.delete(key);
              getEmbeddingDLQ().add({
                type: 'embedding',
                operation: 'generateAndStore',
                payload: {
                  entryType: job.entryType,
                  entryId: job.entryId,
                  text: job.text.substring(0, 100),
                },
                error: errorMsg,
                metadata: { versionId: job.versionId, attempts: attemptNumber },
              });
            }
          }
          logger.error(
            { error: errorMsg, batchSize: jobsToProcess.length },
            'Batch embedding failed'
          );
        })
        .finally(() => {
          inFlight -= 1;
          drainQueue();
        });
    }
    return;
  }

  // Fallback: process jobs individually (when batch not available or single item)
  while (inFlight < max && queue.length > 0) {
    const key = queue.shift();
    if (!key) break;
    enqueued.delete(key);

    const job = pendingByEntry.get(key);
    if (!job) continue;
    pendingByEntry.delete(key);

    // Check if this is a retry
    const existingFailed = failedJobs.get(key);
    const attemptNumber = existingFailed ? existingFailed.attempts + 1 : 1;

    inFlight += 1;
    void runEmbeddingJob(job)
      .then(() => {
        // If this was a retry that succeeded, track it
        if (existingFailed) {
          retriedCount++;
          failedJobs.delete(key);
        }
      })
      .catch((error) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const maxRetries = getMaxRetries();
        embeddingCounter.inc({ provider: 'pipeline', status: 'error' });

        if (attemptNumber < maxRetries) {
          // Track for retry
          failedJobs.set(key, {
            input: job,
            attempts: attemptNumber,
            lastError: errorMsg,
            lastAttemptAt: Date.now(),
          });
          logger.warn(
            { error: errorMsg, attempt: attemptNumber, maxRetries, key },
            'Embedding job failed, will retry'
          );
        } else {
          // Exhausted retries - add to DLQ for analysis/manual retry
          failedCount++;
          failedJobs.delete(key);

          // Add to Dead Letter Queue for potential future recovery
          getEmbeddingDLQ().add({
            type: 'embedding',
            operation: 'generateAndStore',
            payload: {
              entryType: job.entryType,
              entryId: job.entryId,
              text: job.text.substring(0, 100), // Truncate for storage
            },
            error: errorMsg,
            metadata: {
              versionId: job.versionId,
              attempts: attemptNumber,
            },
          });

          logger.error(
            { error: errorMsg, attempts: attemptNumber, key },
            'Embedding job failed after max retries, added to DLQ'
          );
        }
      })
      .finally(() => {
        inFlight -= 1;
        drainQueue();
      });
  }
}

function enqueueEmbeddingJob(input: EmbeddingInput): void {
  const key: EmbeddingQueueKey = `${input.entryType}:${input.entryId}`;
  const nextSeq = (latestSeqByKey.get(key) ?? 0) + 1;
  latestSeqByKey.set(key, nextSeq);
  // Latest-wins: overwrite pending job for this entry
  pendingByEntry.set(key, { ...input, __seq: nextSeq, __key: key });
  if (!enqueued.has(key)) {
    enqueued.add(key);
    queue.push(key);
  }
  drainQueue();
}

/**
 * Generate and store embedding for a version asynchronously
 *
 * This function is fire-and-forget to avoid blocking repository operations.
 * Errors are logged but don't fail the operation.
 */
export function generateEmbeddingAsync(input: EmbeddingInput): void {
  enqueueEmbeddingJob(input);
}

/**
 * Retry all failed embedding jobs that haven't exhausted retries.
 * Jobs are re-queued with exponential backoff based on attempt count.
 *
 * @returns Number of jobs re-queued for retry
 */
export function retryFailedEmbeddings(): { requeued: number; remaining: number } {
  const baseDelay = getRetryDelayMs();
  const now = Date.now();
  let requeued = 0;

  for (const [key, failedJob] of failedJobs) {
    // Calculate delay with exponential backoff: baseDelay * 2^(attempts-1)
    const delay = baseDelay * Math.pow(2, failedJob.attempts - 1);
    const timeSinceLastAttempt = now - failedJob.lastAttemptAt;

    // Only retry if enough time has passed
    if (timeSinceLastAttempt >= delay) {
      // Re-enqueue the job
      enqueueEmbeddingJob(failedJob.input);
      requeued++;
      logger.info(
        { key, attempt: failedJob.attempts + 1, lastError: failedJob.lastError },
        'Re-queued failed embedding job for retry'
      );
    }
  }

  return { requeued, remaining: failedJobs.size };
}

/**
 * Get details of failed jobs pending retry
 */
export function getFailedEmbeddingJobs(): Array<{
  key: string;
  entryType: EntryType;
  entryId: string;
  attempts: number;
  lastError: string;
  lastAttemptAt: string;
}> {
  return Array.from(failedJobs.entries()).map(([key, job]) => ({
    key,
    entryType: job.input.entryType,
    entryId: job.input.entryId,
    attempts: job.attempts,
    lastError: job.lastError,
    lastAttemptAt: new Date(job.lastAttemptAt).toISOString(),
  }));
}

export function resetEmbeddingQueueForTests(): void {
  pendingByEntry.clear();
  queue.length = 0;
  enqueued.clear();
  inFlight = 0;
  latestSeqByKey.clear();
  failedJobs.clear();
  // Reset stats
  processedCount = 0;
  failedCount = 0;
  skippedStaleCount = 0;
  retriedCount = 0;
  batchesProcessed = 0;
  totalBatchedItems = 0;
}

/**
 * Helper to extract text content for embedding from version data
 */
export function extractTextForEmbedding(
  entryType: EntryType,
  name: string,
  versionData: {
    description?: string;
    content?: string;
    rationale?: string;
    title?: string;
    source?: string;
    constraints?: string;
    scenario?: string;
    pattern?: string;
  }
): string {
  const parts: string[] = [name];

  if (entryType === 'tool') {
    if (versionData.description) parts.push(versionData.description);
    if (versionData.constraints) parts.push(versionData.constraints);
  } else if (entryType === 'guideline') {
    if (versionData.content) parts.push(versionData.content);
    if (versionData.rationale) parts.push(versionData.rationale);
  } else if (entryType === 'knowledge') {
    if (versionData.content) parts.push(versionData.content);
    if (versionData.source) parts.push(versionData.source);
  } else if (entryType === 'experience') {
    if (versionData.content) parts.push(versionData.content);
    if (versionData.scenario) parts.push(versionData.scenario);
    if (versionData.pattern) parts.push(versionData.pattern);
  }

  return parts.filter((p) => p && p.trim().length > 0).join(' ');
}
