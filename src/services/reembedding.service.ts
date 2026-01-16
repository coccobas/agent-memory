/**
 * Background Re-embedding Service
 *
 * Automatically detects and fixes embedding dimension mismatches by re-embedding
 * entries in the background when the embedding model changes.
 *
 * ## Problem
 *
 * When switching embedding providers (e.g., from local MiniLM to LM Studio Qwen),
 * stored embeddings have different dimensions than the new model produces.
 * This causes semantic search to fail with dimension mismatch errors.
 *
 * ## Solution
 *
 * Instead of throwing errors or requiring manual intervention:
 * 1. Detect dimension mismatch at search time
 * 2. Queue affected entries for background re-embedding
 * 3. Return gracefully (allow FTS5 fallback)
 * 4. Re-embed entries asynchronously with the current model
 *
 * ## Design
 *
 * - **Non-blocking**: Re-embedding happens in the background without blocking queries
 * - **Batched**: Entries are processed in configurable batch sizes
 * - **Throttled**: Rate limiting prevents overwhelming the embedding service
 * - **Idempotent**: Safe to trigger multiple times for the same entries
 * - **Progress tracking**: Logs progress for observability
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { createComponentLogger } from '../utils/logger.js';
import type { IEmbeddingService } from '../core/context.js';
import type { IVectorStore } from '../core/interfaces/vector-store.js';
import type { AppDb } from '../core/types.js';
import {
  toolVersions,
  guidelineVersions,
  knowledgeVersions,
  experienceVersions,
  tools,
  guidelines,
  knowledge,
  experiences,
} from '../db/schema.js';
import { eq } from 'drizzle-orm';

const logger = createComponentLogger('reembedding');

/**
 * Re-embedding task state
 */
export type ReembeddingState = 'idle' | 'running' | 'completed' | 'failed';

/**
 * Entry reference for re-embedding queue
 */
interface EntryRef {
  entryType: string;
  entryId: string;
  versionId: string;
}

/**
 * Re-embedding service configuration
 */
export interface ReembeddingConfig {
  /** Number of entries to process per batch (default: 10) */
  batchSize?: number;
  /** Delay between batches in ms (default: 100) */
  batchDelayMs?: number;
  /** Maximum entries to re-embed per trigger (default: 1000) */
  maxEntriesPerRun?: number;
  /** Whether re-embedding is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Re-embedding service for fixing dimension mismatches
 */
export class ReembeddingService {
  private state: ReembeddingState = 'idle';
  private queue: EntryRef[] = [];
  private processedCount = 0;
  private failedCount = 0;
  private runPromise: Promise<void> | null = null;

  private readonly batchSize: number;
  private readonly batchDelayMs: number;
  private readonly maxEntriesPerRun: number;
  private readonly enabled: boolean;

  constructor(
    private readonly embeddingService: IEmbeddingService,
    private readonly vectorStore: IVectorStore,
    private readonly db: AppDb,
    config: ReembeddingConfig = {}
  ) {
    this.batchSize = config.batchSize ?? 10;
    this.batchDelayMs = config.batchDelayMs ?? 100;
    this.maxEntriesPerRun = config.maxEntriesPerRun ?? 1000;
    this.enabled = config.enabled ?? true;
  }

  /**
   * Get current service state
   */
  getState(): ReembeddingState {
    return this.state;
  }

  /**
   * Get progress statistics
   */
  getProgress(): { queued: number; processed: number; failed: number } {
    return {
      queued: this.queue.length,
      processed: this.processedCount,
      failed: this.failedCount,
    };
  }

  /**
   * Check if re-embedding is needed by comparing stored vs current model dimensions.
   * Returns true if a mismatch is detected.
   */
  async checkDimensionMismatch(): Promise<{
    mismatch: boolean;
    storedDimension: number | null;
    currentDimension: number;
  }> {
    const currentDimension = this.embeddingService.getEmbeddingDimension();

    // Get stored dimension from vector store
    const storedDimension = this.vectorStore.getStoredDimension
      ? await this.vectorStore.getStoredDimension()
      : null;

    const mismatch = storedDimension !== null && storedDimension !== currentDimension;

    if (mismatch) {
      logger.info({ storedDimension, currentDimension }, 'Embedding dimension mismatch detected');
    }

    return { mismatch, storedDimension, currentDimension };
  }

  /**
   * Trigger background re-embedding if dimension mismatch is detected.
   * Non-blocking - returns immediately while re-embedding continues in background.
   *
   * @returns true if re-embedding was triggered, false if not needed or already running
   */
  async triggerIfNeeded(): Promise<boolean> {
    if (!this.enabled) {
      logger.debug('Re-embedding disabled, skipping');
      return false;
    }

    if (!this.embeddingService.isAvailable()) {
      logger.debug('Embedding service not available, skipping re-embedding');
      return false;
    }

    if (this.state === 'running') {
      logger.debug('Re-embedding already in progress, skipping');
      return false;
    }

    const { mismatch, storedDimension, currentDimension } = await this.checkDimensionMismatch();

    if (!mismatch) {
      return false;
    }

    // Queue entries that need re-embedding
    await this.queueEntriesForReembedding(storedDimension!, currentDimension);

    if (this.queue.length === 0) {
      logger.debug('No entries need re-embedding');
      return false;
    }

    // Start background processing (don't await)
    this.runPromise = this.processQueue().catch((error) => {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Re-embedding failed'
      );
      this.state = 'failed';
    });

    return true;
  }

  /**
   * Queue entries that have embeddings with wrong dimensions
   */
  private async queueEntriesForReembedding(
    storedDimension: number,
    _currentDimension: number
  ): Promise<void> {
    if (!this.vectorStore.getEmbeddingMetadata) {
      logger.warn('Vector store does not support getEmbeddingMetadata');
      return;
    }

    const metadata = await this.vectorStore.getEmbeddingMetadata({
      limit: this.maxEntriesPerRun,
    });

    // Filter to entries with wrong dimension
    const needsReembedding = metadata.filter((m) => m.dimension === storedDimension);

    this.queue = needsReembedding.map((m) => ({
      entryType: m.entryType,
      entryId: m.entryId,
      versionId: m.versionId,
    }));

    logger.info(
      { total: metadata.length, needsReembedding: this.queue.length },
      'Queued entries for re-embedding'
    );
  }

  /**
   * Process the re-embedding queue in batches
   */
  private async processQueue(): Promise<void> {
    this.state = 'running';
    this.processedCount = 0;
    this.failedCount = 0;

    logger.info({ queueSize: this.queue.length }, 'Starting background re-embedding');

    while (this.queue.length > 0) {
      // Take a batch
      const batch = this.queue.splice(0, this.batchSize);

      // Process batch
      await this.processBatch(batch);

      // Throttle between batches
      if (this.queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.batchDelayMs));
      }
    }

    this.state = 'completed';
    logger.info(
      { processed: this.processedCount, failed: this.failedCount },
      'Background re-embedding completed'
    );
  }

  /**
   * Process a single batch of entries
   */
  private async processBatch(batch: EntryRef[]): Promise<void> {
    for (const entry of batch) {
      try {
        await this.reembedEntry(entry);
        this.processedCount++;
      } catch (error) {
        this.failedCount++;
        logger.warn(
          {
            entryType: entry.entryType,
            entryId: entry.entryId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to re-embed entry'
        );
      }
    }
  }

  /**
   * Re-embed a single entry
   */
  private async reembedEntry(entry: EntryRef): Promise<void> {
    // Fetch the entry content from the database
    const text = this.getEntryText(entry);
    if (!text) {
      logger.debug({ ...entry }, 'Entry not found, skipping re-embedding');
      return;
    }

    // Generate new embedding
    const { embedding, model } = await this.embeddingService.embed(text);

    // Store the new embedding (replaces old one via upsert logic)
    await this.vectorStore.store({
      entryType: entry.entryType,
      entryId: entry.entryId,
      versionId: entry.versionId,
      text,
      vector: embedding,
      model,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Get entry text from the database based on entry type.
   * Fetches content from version tables since that's where actual content is stored.
   */
  private getEntryText(entry: EntryRef): string | null {
    try {
      switch (entry.entryType) {
        case 'tool': {
          // Get tool metadata for name
          const toolResult = this.db.select().from(tools).where(eq(tools.id, entry.entryId)).get();
          if (!toolResult) return null;

          // Get version for description
          const versionResult = this.db
            .select()
            .from(toolVersions)
            .where(eq(toolVersions.id, entry.versionId))
            .get();

          const description = versionResult?.description ?? '';
          return `${toolResult.name}: ${description}`;
        }
        case 'guideline': {
          // Get guideline metadata for name
          const guidelineResult = this.db
            .select()
            .from(guidelines)
            .where(eq(guidelines.id, entry.entryId))
            .get();
          if (!guidelineResult) return null;

          // Get version for content
          const versionResult = this.db
            .select()
            .from(guidelineVersions)
            .where(eq(guidelineVersions.id, entry.versionId))
            .get();

          const content = versionResult?.content ?? '';
          return `${guidelineResult.name}: ${content}`;
        }
        case 'knowledge': {
          // Get knowledge metadata for title
          const knowledgeResult = this.db
            .select()
            .from(knowledge)
            .where(eq(knowledge.id, entry.entryId))
            .get();
          if (!knowledgeResult) return null;

          // Get version for content
          const versionResult = this.db
            .select()
            .from(knowledgeVersions)
            .where(eq(knowledgeVersions.id, entry.versionId))
            .get();

          const content = versionResult?.content ?? '';
          return `${knowledgeResult.title}: ${content}`;
        }
        case 'experience': {
          // Get experience metadata for title
          const experienceResult = this.db
            .select()
            .from(experiences)
            .where(eq(experiences.id, entry.entryId))
            .get();
          if (!experienceResult) return null;

          // Get version for content
          const versionResult = this.db
            .select()
            .from(experienceVersions)
            .where(eq(experienceVersions.id, entry.versionId))
            .get();

          const content = versionResult?.content ?? '';
          return `${experienceResult.title}: ${content}`;
        }
        default:
          return null;
      }
    } catch (error) {
      logger.debug(
        { ...entry, error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch entry text'
      );
      return null;
    }
  }

  /**
   * Wait for re-embedding to complete (for testing)
   */
  async waitForCompletion(): Promise<void> {
    if (this.runPromise) {
      await this.runPromise;
    }
  }
}
