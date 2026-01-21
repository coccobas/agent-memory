/**
 * Context Similarity Calculator
 *
 * Finds past successful queries similar to the current query and boosts
 * entries that succeeded in those similar contexts.
 *
 * Key Concepts:
 * - Uses vector similarity to find past queries with similar meaning
 * - Aggregates which entries succeeded in those contexts
 * - Applies a boost based on the success rate across similar contexts
 *
 * Graceful Degradation:
 * - Returns 1.0 (no boost) when embeddings unavailable
 * - Returns 1.0 (no boost) when no similar contexts found
 * - Returns 1.0 (no boost) on any errors
 */

import type { ContextSimilarityConfig, SuccessfulContext } from '../types.js';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Aggregates entry success counts across multiple similar contexts.
 * Weights each success by the context's similarity score.
 *
 * @param contexts - Similar contexts with their successful entries
 * @param entryIds - Entry IDs to aggregate for
 * @returns Map of entry ID to weighted success count
 */
export function aggregateEntrySuccess(
  contexts: SuccessfulContext[],
  entryIds: string[]
): Map<string, number> {
  if (contexts.length === 0) {
    return new Map();
  }

  // Create a set for fast lookup
  const entrySet = new Set(entryIds);
  const successCounts = new Map<string, number>();

  for (const context of contexts) {
    for (const entryId of context.successfulEntryIds) {
      // Only count entries we're interested in
      if (!entrySet.has(entryId)) {
        continue;
      }

      // Weight by similarity score
      const currentCount = successCounts.get(entryId) ?? 0;
      successCounts.set(entryId, currentCount + context.similarityScore);
    }
  }

  return successCounts;
}

/**
 * Calculates the boost multiplier based on weighted success count.
 *
 * @param weightedSuccessCount - Sum of similarity-weighted success counts
 * @param totalContexts - Total number of similar contexts found
 * @param boostMultiplier - Maximum boost multiplier
 * @returns Boost value between 1.0 and boostMultiplier
 */
export function calculateBoost(
  weightedSuccessCount: number,
  totalContexts: number,
  boostMultiplier: number
): number {
  if (totalContexts === 0 || weightedSuccessCount === 0) {
    return 1.0;
  }

  // Calculate success rate (0 to 1, possibly > 1 if high similarity weights)
  const successRate = Math.min(1, weightedSuccessCount / totalContexts);

  // Linear interpolation between 1.0 and boostMultiplier
  return 1.0 + successRate * (boostMultiplier - 1.0);
}

// =============================================================================
// DATA FETCHER TYPE
// =============================================================================

/**
 * Function type for finding similar successful query contexts.
 */
export type FindSimilarContextsFn = (
  queryEmbedding: number[],
  similarityThreshold: number,
  maxResults: number
) => Promise<SuccessfulContext[]>;

// =============================================================================
// CONTEXT SIMILARITY CALCULATOR
// =============================================================================

/**
 * Calculator for boosting entries based on success in similar contexts.
 */
export class ContextSimilarityCalculator {
  constructor(
    private readonly config: ContextSimilarityConfig,
    private readonly findSimilarContexts: FindSimilarContextsFn
  ) {}

  /**
   * Calculates context similarity boosts for a batch of entries.
   *
   * @param queryEmbedding - Current query embedding
   * @param entryIds - Entry IDs to calculate boosts for
   * @returns Map of entry ID to boost multiplier (>= 1.0)
   */
  async calculateBoosts(
    queryEmbedding: number[] | null | undefined,
    entryIds: string[]
  ): Promise<Map<string, number>> {
    // Return empty map for empty entry list
    if (entryIds.length === 0) {
      return new Map();
    }

    // Return neutral boosts if disabled or no embedding
    if (!this.config.enabled || !queryEmbedding || queryEmbedding.length === 0) {
      return new Map(entryIds.map((id) => [id, 1.0]));
    }

    try {
      // Find similar successful query contexts
      const similarContexts = await this.findSimilarContexts(
        queryEmbedding,
        this.config.similarityThreshold,
        this.config.maxContextsToConsider
      );

      // Return neutral boosts if no similar contexts found
      if (similarContexts.length === 0) {
        return new Map(entryIds.map((id) => [id, 1.0]));
      }

      // Aggregate which entries succeeded in similar contexts
      const entrySuccessCounts = aggregateEntrySuccess(similarContexts, entryIds);

      // Calculate boosts for each entry
      return new Map(
        entryIds.map((id) => {
          const successCount = entrySuccessCounts.get(id) ?? 0;
          const boost = calculateBoost(
            successCount,
            similarContexts.length,
            this.config.boostMultiplier
          );
          return [id, boost];
        })
      );
    } catch (error) {
      // Graceful degradation on errors
      console.warn('Context similarity calculation failed, returning neutral boosts:', error);
      return new Map(entryIds.map((id) => [id, 1.0]));
    }
  }
}
