/**
 * Backfill service for generating embeddings for existing entries
 *
 * This service processes existing tool, guideline, and knowledge entries
 * and generates embeddings for them in batches.
 */

import { getDb } from '../db/connection.js';
import {
  tools,
  toolVersions,
  guidelines,
  guidelineVersions,
  knowledge,
  knowledgeVersions,
  entryEmbeddings,
  type NewEntryEmbedding,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getEmbeddingService } from './embedding.service.js';
import { getVectorService } from './vector.service.js';
import { extractTextForEmbedding, type EntryType } from '../db/repositories/embedding-hooks.js';
import { generateId } from '../db/repositories/base.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('backfill');

export interface BackfillProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  inProgress: boolean;
}

export interface BackfillOptions {
  batchSize?: number; // Number of entries to process at once (default: 50)
  delayMs?: number; // Delay between batches in milliseconds (default: 1000)
  entryTypes?: EntryType[]; // Types to process (default: all)
  onProgress?: (progress: BackfillProgress) => void; // Progress callback
}

/**
 * Generate embeddings for all entries that don't have them yet
 */
export async function backfillEmbeddings(options: BackfillOptions = {}): Promise<BackfillProgress> {
  const {
    batchSize = 50,
    delayMs = 1000,
    entryTypes = ['tool', 'guideline', 'knowledge'],
    onProgress,
  } = options;

  const embeddingService = getEmbeddingService();

  if (!embeddingService.isAvailable()) {
    throw new Error('Embeddings are not available. Please configure an embedding provider.');
  }

  const vectorService = getVectorService();
  await vectorService.initialize();

  const db = getDb();
  const progress: BackfillProgress = {
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    inProgress: true,
  };

  // Count total entries to process
  if (entryTypes.includes('tool')) {
    const toolCount = db.select().from(tools).where(eq(tools.isActive, true)).all().length;
    progress.total += toolCount;
  }
  if (entryTypes.includes('guideline')) {
    const guidelineCount = db
      .select()
      .from(guidelines)
      .where(eq(guidelines.isActive, true))
      .all().length;
    progress.total += guidelineCount;
  }
  if (entryTypes.includes('knowledge')) {
    const knowledgeCount = db
      .select()
      .from(knowledge)
      .where(eq(knowledge.isActive, true))
      .all().length;
    progress.total += knowledgeCount;
  }

  // Process each entry type
  if (entryTypes.includes('tool')) {
    await backfillEntryType('tool', batchSize, delayMs, progress, onProgress);
  }
  if (entryTypes.includes('guideline')) {
    await backfillEntryType('guideline', batchSize, delayMs, progress, onProgress);
  }
  if (entryTypes.includes('knowledge')) {
    await backfillEntryType('knowledge', batchSize, delayMs, progress, onProgress);
  }

  progress.inProgress = false;
  if (onProgress) onProgress(progress);

  return progress;
}

/**
 * Backfill embeddings for a specific entry type
 */
async function backfillEntryType(
  entryType: EntryType,
  batchSize: number,
  delayMs: number,
  progress: BackfillProgress,
  onProgress?: (progress: BackfillProgress) => void
): Promise<void> {
  const db = getDb();
  const embeddingService = getEmbeddingService();
  const vectorService = getVectorService();

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

    await Promise.all(
      batch.map(async (entry) => {
        try {
          if (!entry.currentVersionId) {
            progress.processed++;
            progress.failed++;
            return;
          }

          // Check if embedding already exists
          const existingEmbedding = db
            .select()
            .from(entryEmbeddings)
            .where(
              and(
                eq(entryEmbeddings.entryType, entryType),
                eq(entryEmbeddings.entryId, entry.id),
                eq(entryEmbeddings.versionId, entry.currentVersionId),
                eq(entryEmbeddings.hasEmbedding, true)
              )
            )
            .get();

          if (existingEmbedding) {
            progress.processed++;
            progress.succeeded++;
            return; // Already has embedding
          }

          // Get version data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let versionData: any = null;
          if (entryType === 'tool') {
            versionData = db
              .select()
              .from(toolVersions)
              .where(eq(toolVersions.id, entry.currentVersionId))
              .get();
          } else if (entryType === 'guideline') {
            versionData = db
              .select()
              .from(guidelineVersions)
              .where(eq(guidelineVersions.id, entry.currentVersionId))
              .get();
          } else if (entryType === 'knowledge') {
            versionData = db
              .select()
              .from(knowledgeVersions)
              .where(eq(knowledgeVersions.id, entry.currentVersionId))
              .get();
          }

          if (!versionData) {
            progress.processed++;
            progress.failed++;
            return;
          }

          // Extract text for embedding
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          const text = extractTextForEmbedding(entryType, entry.name, versionData);

          // Generate embedding
          const result = await embeddingService.embed(text);

          // Store in vector database
          await vectorService.storeEmbedding(
            entryType,
            entry.id,
            entry.currentVersionId,
            text,
            result.embedding,
            result.model
          );

          // Track in database
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

          progress.processed++;
          progress.succeeded++;
        } catch (error) {
          // eslint-disable-next-line no-console
          logger.error({ entryType, entryId: entry.id, error }, 'Failed to process entry');
          progress.processed++;
          progress.failed++;
        }

        if (onProgress) {
          onProgress({ ...progress });
        }
      })
    );

    // Delay between batches to respect rate limits
    if (i + batchSize < entries.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Get backfill statistics
 */
export function getBackfillStats(): {
  tools: { total: number; withEmbeddings: number };
  guidelines: { total: number; withEmbeddings: number };
  knowledge: { total: number; withEmbeddings: number };
} {
  const db = getDb();

  const toolsTotal = db.select().from(tools).where(eq(tools.isActive, true)).all().length;
  const toolsWithEmbeddings = db
    .select()
    .from(entryEmbeddings)
    .where(and(eq(entryEmbeddings.entryType, 'tool'), eq(entryEmbeddings.hasEmbedding, true)))
    .all().length;

  const guidelinesTotal = db
    .select()
    .from(guidelines)
    .where(eq(guidelines.isActive, true))
    .all().length;
  const guidelinesWithEmbeddings = db
    .select()
    .from(entryEmbeddings)
    .where(and(eq(entryEmbeddings.entryType, 'guideline'), eq(entryEmbeddings.hasEmbedding, true)))
    .all().length;

  const knowledgeTotal = db
    .select()
    .from(knowledge)
    .where(eq(knowledge.isActive, true))
    .all().length;
  const knowledgeWithEmbeddings = db
    .select()
    .from(entryEmbeddings)
    .where(and(eq(entryEmbeddings.entryType, 'knowledge'), eq(entryEmbeddings.hasEmbedding, true)))
    .all().length;

  return {
    tools: { total: toolsTotal, withEmbeddings: toolsWithEmbeddings },
    guidelines: { total: guidelinesTotal, withEmbeddings: guidelinesWithEmbeddings },
    knowledge: { total: knowledgeTotal, withEmbeddings: knowledgeWithEmbeddings },
  };
}

