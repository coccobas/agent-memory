/**
 * Backfill service for generating embeddings for existing entries
 *
 * This service processes existing tool, guideline, and knowledge entries
 * and generates embeddings for them in batches.
 */

import type { DbClient } from '../db/connection.js';
import {
  tools,
  toolVersions,
  guidelines,
  guidelineVersions,
  knowledge,
  knowledgeVersions,
  entryEmbeddings,
  type NewEntryEmbedding,
  type ToolVersion,
  type GuidelineVersion,
  type KnowledgeVersion,
} from '../db/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type { IEmbeddingService, IVectorService } from '../core/context.js';
import { extractTextForEmbedding, type EntryType } from '../db/repositories/embedding-hooks.js';
import { generateId } from '../db/repositories/base.js';
import { createComponentLogger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { createServiceUnavailableError } from '../core/errors.js';

/**
 * Service dependencies for backfill operations
 */
export interface BackfillServices {
  embedding: IEmbeddingService;
  vector: IVectorService;
}

// Union type for version data used in embedding extraction
type VersionData = ToolVersion | GuidelineVersion | KnowledgeVersion;

const logger = createComponentLogger('backfill');

export interface BackfillError {
  entryType: string;
  entryId: string;
  error: string;
  timestamp: string;
}

export interface BackfillProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  inProgress: boolean;
  errors: BackfillError[]; // Track individual errors for debugging
}

export interface BackfillOptions {
  batchSize?: number; // Number of entries to process at once (default: 50)
  delayMs?: number; // Delay between batches in milliseconds (default: 1000)
  entryTypes?: EntryType[]; // Types to process (default: all)
  onProgress?: (progress: BackfillProgress) => void; // Progress callback
}

/**
 * Generate embeddings for all entries that don't have them yet
 *
 * @param options - Backfill configuration options
 * @param db - Database client
 * @param services - Injected service dependencies
 */
export async function backfillEmbeddings(
  options: BackfillOptions = {},
  db: DbClient,
  services: BackfillServices
): Promise<BackfillProgress> {
  const {
    batchSize = 50,
    delayMs = 1000,
    entryTypes = ['tool', 'guideline', 'knowledge'],
    onProgress,
  } = options;

  const { embedding: embeddingService, vector: vectorService } = services;

  if (!embeddingService.isAvailable()) {
    throw createServiceUnavailableError('Embeddings', 'Please configure an embedding provider');
  }

  await vectorService.initialize();
  const progress: BackfillProgress = {
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    inProgress: true,
    errors: [],
  };

  // Count total entries to process (using COUNT(*) for efficiency)
  if (entryTypes.includes('tool')) {
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tools)
      .where(eq(tools.isActive, true))
      .get();
    progress.total += result?.count ?? 0;
  }
  if (entryTypes.includes('guideline')) {
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(guidelines)
      .where(eq(guidelines.isActive, true))
      .get();
    progress.total += result?.count ?? 0;
  }
  if (entryTypes.includes('knowledge')) {
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(knowledge)
      .where(eq(knowledge.isActive, true))
      .get();
    progress.total += result?.count ?? 0;
  }

  // Process each entry type
  if (entryTypes.includes('tool')) {
    await backfillEntryType('tool', batchSize, delayMs, progress, onProgress, db, services);
  }
  if (entryTypes.includes('guideline')) {
    await backfillEntryType('guideline', batchSize, delayMs, progress, onProgress, db, services);
  }
  if (entryTypes.includes('knowledge')) {
    await backfillEntryType('knowledge', batchSize, delayMs, progress, onProgress, db, services);
  }

  progress.inProgress = false;
  if (onProgress) onProgress(progress);

  return progress;
}

/**
 * Helper to run async tasks with limited concurrency
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  const runNext = async (): Promise<void> => {
    while (index < tasks.length) {
      const currentIndex = index++;
      const task = tasks[currentIndex];
      if (task) {
        results[currentIndex] = await task();
      }
    }
  };

  const workers = Array(Math.min(maxConcurrency, tasks.length))
    .fill(null)
    .map(() => runNext());

  await Promise.all(workers);
  return results;
}

/**
 * Backfill embeddings for a specific entry type
 */
async function backfillEntryType(
  entryType: EntryType,
  batchSize: number,
  delayMs: number,
  progress: BackfillProgress,
  onProgress: ((progress: BackfillProgress) => void) | undefined,
  dbClient: DbClient,
  services: BackfillServices
): Promise<void> {
  const db = dbClient;
  const { embedding: embeddingService, vector: vectorService } = services;

  // Get max concurrency from config (default 4)
  const maxConcurrency = Math.max(1, config.embedding?.maxConcurrency ?? 4);

  // Get all active entries
  let entries: Array<{ id: string; name: string; currentVersionId: string | null }> = [];

  if (entryType === 'tool') {
    entries = db
      .select({ id: tools.id, name: tools.name, currentVersionId: tools.currentVersionId })
      .from(tools)
      .where(eq(tools.isActive, true))
      .all();
  } else if (entryType === 'guideline') {
    entries = db
      .select({
        id: guidelines.id,
        name: guidelines.name,
        currentVersionId: guidelines.currentVersionId,
      })
      .from(guidelines)
      .where(eq(guidelines.isActive, true))
      .all();
  } else if (entryType === 'knowledge') {
    entries = db
      .select({
        id: knowledge.id,
        name: knowledge.title,
        currentVersionId: knowledge.currentVersionId,
      })
      .from(knowledge)
      .where(eq(knowledge.isActive, true))
      .all() as Array<{ id: string; name: string; currentVersionId: string | null }>;
  }

  // Process in batches
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, Math.min(i + batchSize, entries.length));

    // Phase 1: Batch prefetch existing embeddings for this batch (fixes N+1)
    const batchIds = batch.map((e) => e.id);
    const batchVersionIds = batch.map((e) => e.currentVersionId).filter((v): v is string => !!v);

    const existingEmbeddingsSet = new Set<string>();
    if (batchVersionIds.length > 0) {
      const existingRows = db
        .select({ entryId: entryEmbeddings.entryId, versionId: entryEmbeddings.versionId })
        .from(entryEmbeddings)
        .where(
          and(
            eq(entryEmbeddings.entryType, entryType),
            inArray(entryEmbeddings.entryId, batchIds),
            eq(entryEmbeddings.hasEmbedding, true)
          )
        )
        .all();
      for (const row of existingRows) {
        existingEmbeddingsSet.add(`${row.entryId}:${row.versionId}`);
      }
    }

    // Phase 2: Batch prefetch version data for this batch (fixes N+1)
    const versionsById = new Map<string, VersionData>();
    if (batchVersionIds.length > 0) {
      if (entryType === 'tool') {
        const versions = db
          .select()
          .from(toolVersions)
          .where(inArray(toolVersions.id, batchVersionIds))
          .all();
        for (const v of versions) {
          versionsById.set(v.id, v);
        }
      } else if (entryType === 'guideline') {
        const versions = db
          .select()
          .from(guidelineVersions)
          .where(inArray(guidelineVersions.id, batchVersionIds))
          .all();
        for (const v of versions) {
          versionsById.set(v.id, v);
        }
      } else if (entryType === 'knowledge') {
        const versions = db
          .select()
          .from(knowledgeVersions)
          .where(inArray(knowledgeVersions.id, batchVersionIds))
          .all();
        for (const v of versions) {
          versionsById.set(v.id, v);
        }
      }
    }

    // Phase 3: Create tasks for entries that need embedding generation
    const tasks = batch.map((entry) => async () => {
      try {
        if (!entry.currentVersionId) {
          progress.processed++;
          progress.failed++;
          return;
        }

        // Check if embedding already exists (using prefetched data)
        const embeddingKey = `${entry.id}:${entry.currentVersionId}`;
        if (existingEmbeddingsSet.has(embeddingKey)) {
          progress.processed++;
          progress.succeeded++;
          return; // Already has embedding
        }

        // Get version data (from prefetched map)
        const versionData = versionsById.get(entry.currentVersionId);
        if (!versionData) {
          progress.processed++;
          progress.failed++;
          return;
        }

        // Extract text for embedding - convert null values to undefined for compatibility
        // Type assertion needed because VersionData is a union and `in` check doesn't narrow properly
        const vd = versionData as Record<string, unknown>;
        const text = extractTextForEmbedding(entryType, entry.name, {
          description: typeof vd.description === 'string' ? vd.description : undefined,
          content: typeof vd.content === 'string' ? vd.content : undefined,
          rationale: typeof vd.rationale === 'string' ? vd.rationale : undefined,
          title: typeof vd.title === 'string' ? vd.title : undefined,
          source: typeof vd.source === 'string' ? vd.source : undefined,
          constraints: typeof vd.constraints === 'string' ? vd.constraints : undefined,
        });

        // Generate embedding
        const result = await embeddingService.embed(text);

        // Track in database FIRST (more reliable, can be rolled back)
        // This ensures we don't have orphaned vector embeddings without tracking records
        const embeddingRecord: NewEntryEmbedding = {
          id: generateId(),
          entryType,
          entryId: entry.id,
          versionId: entry.currentVersionId,
          hasEmbedding: true,
          embeddingModel: result.model,
          embeddingProvider: result.provider,
        };

        db.insert(entryEmbeddings).values(embeddingRecord).run();

        // Then store in vector database
        // If this fails, the tracking record exists but hasEmbedding may be misleading
        // However, we can still search by other means, and retry will skip this entry
        try {
          await vectorService.storeEmbedding(
            entryType,
            entry.id,
            entry.currentVersionId,
            text,
            result.embedding,
            result.model
          );
        } catch (vectorError) {
          // Vector storage failed - update tracking to reflect partial state
          // This allows the entry to be retried later
          logger.warn(
            { entryType, entryId: entry.id, error: vectorError },
            'Vector storage failed, marking for retry'
          );
          db.update(entryEmbeddings)
            .set({ hasEmbedding: false })
            .where(eq(entryEmbeddings.id, embeddingRecord.id))
            .run();
          throw vectorError; // Re-throw to trigger failure handling
        }

        progress.processed++;
        progress.succeeded++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          {
            entryType,
            entryId: entry.id,
            errorMessage,
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          'Failed to process entry'
        );
        progress.processed++;
        progress.failed++;
        // Track error details for debugging (limit to 100 to prevent memory issues)
        if (progress.errors.length < 100) {
          progress.errors.push({
            entryType,
            entryId: entry.id,
            error: errorMessage,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (onProgress) {
        // Deep copy to avoid mutations affecting original progress object
        onProgress({ ...progress, errors: [...progress.errors] });
      }
    });

    // Run with limited concurrency instead of unbounded Promise.all
    await runWithConcurrency(tasks, maxConcurrency);

    // Delay between batches to respect rate limits
    if (i + batchSize < entries.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Get backfill statistics (uses COUNT(*) for efficiency)
 */
export function getBackfillStats(db: DbClient): {
  tools: { total: number; withEmbeddings: number };
  guidelines: { total: number; withEmbeddings: number };
  knowledge: { total: number; withEmbeddings: number };
} {
  const toolsTotal =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tools)
      .where(eq(tools.isActive, true))
      .get()?.count ?? 0;

  const toolsWithEmbeddings =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(entryEmbeddings)
      .where(and(eq(entryEmbeddings.entryType, 'tool'), eq(entryEmbeddings.hasEmbedding, true)))
      .get()?.count ?? 0;

  const guidelinesTotal =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(guidelines)
      .where(eq(guidelines.isActive, true))
      .get()?.count ?? 0;

  const guidelinesWithEmbeddings =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(entryEmbeddings)
      .where(
        and(eq(entryEmbeddings.entryType, 'guideline'), eq(entryEmbeddings.hasEmbedding, true))
      )
      .get()?.count ?? 0;

  const knowledgeTotal =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(knowledge)
      .where(eq(knowledge.isActive, true))
      .get()?.count ?? 0;

  const knowledgeWithEmbeddings =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(entryEmbeddings)
      .where(
        and(eq(entryEmbeddings.entryType, 'knowledge'), eq(entryEmbeddings.hasEmbedding, true))
      )
      .get()?.count ?? 0;

  return {
    tools: { total: toolsTotal, withEmbeddings: toolsWithEmbeddings },
    guidelines: { total: guidelinesTotal, withEmbeddings: guidelinesWithEmbeddings },
    knowledge: { total: knowledgeTotal, withEmbeddings: knowledgeWithEmbeddings },
  };
}



