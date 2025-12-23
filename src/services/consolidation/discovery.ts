/**
 * Similarity Discovery
 *
 * Finds groups of semantically similar entries for consolidation.
 */

import { getEmbeddingService } from '../embedding.service.js';
import { getVectorService } from '../vector.service.js';
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
  } = params;

  const embeddingService = getEmbeddingService();
  const vectorService = getVectorService();

  if (!embeddingService.isAvailable()) {
    logger.warn('Embeddings not available, cannot find similar groups');
    return [];
  }

  const groups: SimilarityGroup[] = [];
  const processedIds = new Set<string>();

  for (const entryType of entryTypes) {
    // Get all entries of this type in scope
    const entries = getEntriesForConsolidation(entryType, scopeType, scopeId, db);

    for (const entry of entries) {
      if (processedIds.has(entry.id)) continue;
      if (groups.length >= limit) break;

      // Generate embedding for this entry
      const text = `${entry.name}: ${entry.content}`;
      let embedding: number[];

      try {
        const result = await embeddingService.embed(text);
        embedding = result.embedding;
      } catch (error) {
        logger.debug({ entryId: entry.id, error }, 'Failed to generate embedding');
        continue;
      }

      // Search for similar entries
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
