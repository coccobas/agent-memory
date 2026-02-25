/**
 * V2 Embedding Pipeline
 *
 * Reads pending embeddings from SqliteEmbeddingWriter.listPending(),
 * generates embeddings via an injectable IEmbeddingService interface,
 * and writes them back via SqliteEmbeddingWriter.writeEmbedding().
 */

import type Database from 'better-sqlite3';
// eslint-disable-next-line no-restricted-imports
import { SqliteEmbeddingWriter } from '../adapters/sqlite/indexing.js';
// eslint-disable-next-line no-restricted-imports
import { loadEntrySnapshot } from '../adapters/sqlite/shared.js';

// ---------------------------------------------------------------------------
// Service interface (matches existing IEmbeddingService shape)
// ---------------------------------------------------------------------------

export interface EmbeddingService {
  isAvailable(): boolean;
  embed(text: string): Promise<{
    embedding: number[];
    model: string;
  }>;
  getEmbeddingDimension(): number;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface EmbedPendingResult {
  processed: number;
  failed: number;
  skipped: number;
  errors: Array<{ entryId: string; error: string }>;
}

/**
 * Process pending embeddings.
 *
 * 1. Reads up to `limit` pending rows from v2_entry_embeddings
 * 2. For each, loads the entry content from v2_entries
 * 3. Calls embeddingService.embed(title + content)
 * 4. Writes the embedding blob back via SqliteEmbeddingWriter
 */
export async function embedPending(
  sqlite: Database.Database,
  embeddingService: EmbeddingService,
  limit: number = 50
): Promise<EmbedPendingResult> {
  const writer = new SqliteEmbeddingWriter({ sqlite });
  const pending = await writer.listPending(limit);

  const result: EmbedPendingResult = {
    processed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  if (pending.length === 0) {
    return result;
  }

  if (!embeddingService.isAvailable()) {
    return {
      ...result,
      skipped: pending.length,
      errors: [{ entryId: '*', error: 'embedding_service_unavailable' }],
    };
  }

  const dim = embeddingService.getEmbeddingDimension();

  for (const item of pending) {
    try {
      const snapshot = loadEntrySnapshot(sqlite, item.entryId);
      if (!snapshot) {
        result.skipped += 1;
        continue;
      }

      const text = `${snapshot.title}\n${snapshot.content}`;
      const { embedding, model } = await embeddingService.embed(text);

      const float32 = new Float32Array(embedding);
      await writer.writeEmbedding(item.entryId, model, dim, float32);

      result.processed += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        entryId: item.entryId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
