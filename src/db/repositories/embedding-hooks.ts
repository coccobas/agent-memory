/**
 * Embedding generation hooks for repository operations
 *
 * This module provides functions to generate and store embeddings
 * when creating or updating memory entries.
 */

import { getDb } from '../connection.js';
import { entryEmbeddings } from '../schema.js';
import { getEmbeddingService } from '../../services/embedding.service.js';
import { getVectorService } from '../../services/vector.service.js';
import { generateId } from './base.js';
import { createComponentLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

const logger = createComponentLogger('embedding-hook');

export type EntryType = 'tool' | 'guideline' | 'knowledge';

interface EmbeddingInput {
  entryType: EntryType;
  entryId: string;
  versionId: string;
  text: string;
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

function getMaxConcurrency(): number {
  const raw = config.embedding?.maxConcurrency;
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 4;
  return Math.max(1, Math.floor(n));
}

async function runEmbeddingJob(input: QueuedEmbeddingInput): Promise<void> {
  const embeddingService = getEmbeddingService();

  // Skip if embeddings are disabled
  if (!embeddingService.isAvailable()) {
    return;
  }

  // Generate embedding
  const result = await embeddingService.embed(input.text);

  // If a newer job was enqueued for this entry, do not persist stale embeddings.
  const latestSeq = latestSeqByKey.get(input.__key);
  if (latestSeq !== input.__seq) {
    return;
  }

  // Store in vector database
  const vectorService = getVectorService();
  await vectorService.storeEmbedding(
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
}

function drainQueue(): void {
  const max = getMaxConcurrency();
  while (inFlight < max && queue.length > 0) {
    const key = queue.shift();
    if (!key) break;
    enqueued.delete(key);

    const job = pendingByEntry.get(key);
    if (!job) continue;
    pendingByEntry.delete(key);

    inFlight += 1;
    void runEmbeddingJob(job)
      .catch((error) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to generate embedding'
        );
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

export function resetEmbeddingQueueForTests(): void {
  pendingByEntry.clear();
  queue.length = 0;
  enqueued.clear();
  inFlight = 0;
  latestSeqByKey.clear();
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
  }

  return parts.filter((p) => p && p.trim().length > 0).join(' ');
}
