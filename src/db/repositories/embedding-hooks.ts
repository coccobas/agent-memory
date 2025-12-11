/**
 * Embedding generation hooks for repository operations
 *
 * This module provides functions to generate and store embeddings
 * when creating or updating memory entries.
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from '../connection.js';
import { entryEmbeddings, type NewEntryEmbedding } from '../schema.js';
import { getEmbeddingService } from '../../services/embedding.service.js';
import { getVectorService } from '../../services/vector.service.js';
import { generateId } from './base.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('embedding-hook');

export type EntryType = 'tool' | 'guideline' | 'knowledge';

interface EmbeddingInput {
  entryType: EntryType;
  entryId: string;
  versionId: string;
  text: string;
}

/**
 * Generate and store embedding for a version asynchronously
 *
 * This function is fire-and-forget to avoid blocking repository operations.
 * Errors are logged but don't fail the operation.
 */
export function generateEmbeddingAsync(input: EmbeddingInput): void {
  // Run asynchronously without blocking
  void (async () => {
    try {
      const embeddingService = getEmbeddingService();

      // Skip if embeddings are disabled
      if (!embeddingService.isAvailable()) {
        return;
      }

      // Generate embedding
      const result = await embeddingService.embed(input.text);

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

      // Track in database
      const db = getDb();
      const embeddingRecord: NewEntryEmbedding = {
        id: generateId(),
        entryType: input.entryType,
        entryId: input.entryId,
        versionId: input.versionId,
        hasEmbedding: true,
        embeddingModel: result.model,
        embeddingProvider: result.provider,
      };

      // Check if record exists
      const existing = db
        .select()
        .from(entryEmbeddings)
        .where(
          and(
            eq(entryEmbeddings.entryType, input.entryType),
            eq(entryEmbeddings.entryId, input.entryId),
            eq(entryEmbeddings.versionId, input.versionId)
          )
        )
        .get();

      if (existing) {
        // Update existing record
        db.update(entryEmbeddings)
          .set({
            hasEmbedding: true,
            embeddingModel: result.model,
            embeddingProvider: result.provider,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(entryEmbeddings.id, existing.id))
          .run();
      } else {
        // Insert new record
        db.insert(entryEmbeddings).values(embeddingRecord).run();
      }
    } catch (error) {
      // Log error but don't throw (fire-and-forget)
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to generate embedding'
      );
    }
  })();
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


