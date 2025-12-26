/**
 * Similarity Discovery
 *
 * Finds groups of semantically similar entries for consolidation.
 */

import { createComponentLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import type { FindSimilarParams, SimilarityGroup } from './types.js';
import { getEntriesForConsolidation, getEntryDetails } from './helpers.js';

const logger = createComponentLogger('consolidation.discovery');

/**
 * Find groups of semantically similar entries
 */
export async function findSimilarGroups(params: FindSimilarParams): Promise<SimilarityGroup[]> {
  const {
    scopeType,
    scopeId,
    entryTypes = ['guideline', 'knowledge', 'tool'],
    threshold = config.semanticSearch.duplicateThreshold,
    limit = 20,
    db,
    services,
  } = params;

  const { embedding: embeddingService, vector: vectorService } = services;

  if (!embeddingService.isAvailable()) {
    logger.warn('Embeddings not available, cannot find similar groups');
    return [];
  }

  const groups: SimilarityGroup[] = [];
  const processedIds = new Set<string>();

  for (const entryType of entryTypes) {
    if (groups.length >= limit) break;

    // Get all entries of this type in scope
    const entries = getEntriesForConsolidation(entryType, scopeType, scopeId, db);
    if (entries.length === 0) continue;

    // OPTIMIZATION: Batch generate embeddings for all entries at once
    // This reduces N sequential API calls to a single batch call
    const texts = entries.map((e) => `${e.name}: ${e.content}`);
    let embeddings: number[][];

    try {
      const result = await embeddingService.embedBatch(texts);
      embeddings = result.embeddings;
    } catch (error) {
      logger.warn({ entryType, error }, 'Failed to batch generate embeddings');
      continue;
    }

    // Process entries with their pre-computed embeddings
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const embedding = embeddings[i];

      if (processedIds.has(entry.id)) continue;
      if (groups.length >= limit) break;
      if (!embedding) continue;

      // Search for similar entries using pre-computed embedding
      let similar: Awaited<ReturnType<typeof vectorService.searchSimilar>>;
      try {
        similar = await vectorService.searchSimilar(embedding, [entryType], 20);
      } catch (error) {
        // Log error but continue - dimension mismatch or other issues shouldn't block consolidation
        logger.warn({ entryId: entry.id, error }, 'Failed to search similar entries');
        continue;
      }

      // Filter by threshold and exclude self
      const similarEntries = similar
        .filter((s) => s.entryId !== entry.id && s.score >= threshold)
        .filter((s) => !processedIds.has(s.entryId));

      if (similarEntries.length > 0) {
        // Get full entry details for similar entries
        const memberDetails = getEntryDetails(
          entryType,
          similarEntries.map((s) => s.entryId),
          db
        );

        // Build Map for O(1) lookups instead of O(n) find per member
        const detailsById = new Map(memberDetails.map((d) => [d.id, d]));

        const members = similarEntries
          .map((s) => {
            const detail = detailsById.get(s.entryId);
            if (!detail) return null;
            return {
              id: s.entryId,
              name: detail.name,
              similarity: s.score,
              createdAt: detail.createdAt,
              updatedAt: detail.updatedAt,
            };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);

        if (members.length > 0) {
          const group: SimilarityGroup = {
            primaryId: entry.id,
            primaryName: entry.name,
            entryType,
            members,
            averageSimilarity: members.reduce((sum, m) => sum + m.similarity, 0) / members.length,
          };

          groups.push(group);

          // Mark all members as processed to avoid duplicate groups
          processedIds.add(entry.id);
          members.forEach((m) => processedIds.add(m.id));
        }
      }
    }
  }

  // Sort by average similarity (highest first)
  groups.sort((a, b) => b.averageSimilarity - a.averageSimilarity);

  return groups.slice(0, limit);
}
