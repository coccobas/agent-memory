/**
 * Usefulness Calculator
 *
 * Scores entries based on their historical retrieval success.
 * Combines three factors:
 * - Success rate: How often this entry led to good outcomes
 * - Retrieval volume: Confidence in the score (more data = more trust)
 * - Recency: Boost for recent successes
 *
 * Formula:
 *   score = (successRate × successWeight) +
 *           (recencyBoost × recencyWeight) +
 *           (volumeConfidence × retrievalWeight)
 */

import type { UsefulnessConfig, UsefulnessMetrics } from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum retrievals needed to trust success rate */
const MIN_RETRIEVALS_FOR_CONFIDENCE = 2;

/** Retrieval count at which we have full confidence */
const FULL_CONFIDENCE_RETRIEVALS = 50;

/** Days after which recency boost is zero */
const RECENCY_DECAY_DAYS = 30;

/** Default neutral score for entries with insufficient data */
const NEUTRAL_SCORE = 0.5;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculates a recency boost based on when the last success occurred.
 * Uses linear decay over RECENCY_DECAY_DAYS.
 *
 * @param lastSuccessAt - ISO timestamp of last success, or null
 * @returns Recency boost between 0 and 1
 */
export function calculateRecencyBoost(lastSuccessAt: string | null): number {
  if (!lastSuccessAt) {
    return 0;
  }

  const successTime = Date.parse(lastSuccessAt);
  if (isNaN(successTime)) {
    return 0;
  }

  const daysSinceSuccess = (Date.now() - successTime) / (1000 * 60 * 60 * 24);

  if (daysSinceSuccess >= RECENCY_DECAY_DAYS) {
    return 0;
  }

  // Linear decay: 1.0 at day 0, 0.0 at day 30
  return Math.max(0, 1 - daysSinceSuccess / RECENCY_DECAY_DAYS);
}

/**
 * Normalizes a score to the [0, 1] range.
 *
 * @param score - Raw score value
 * @returns Normalized score between 0 and 1
 */
export function normalizeScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

/**
 * Calculates volume confidence based on retrieval count.
 * Scales linearly from 0 to 1 as retrievals go from 0 to FULL_CONFIDENCE_RETRIEVALS.
 *
 * @param retrievalCount - Number of times entry was retrieved
 * @returns Confidence level between 0 and 1
 */
function calculateVolumeConfidence(retrievalCount: number): number {
  return Math.min(1, retrievalCount / FULL_CONFIDENCE_RETRIEVALS);
}

// =============================================================================
// DATA FETCHER TYPE
// =============================================================================

/**
 * Function type for fetching usefulness metrics.
 */
export type GetUsefulnessMetricsFn = (
  entryIds: string[]
) => Promise<Map<string, UsefulnessMetrics>>;

// =============================================================================
// USEFULNESS CALCULATOR
// =============================================================================

/**
 * Calculator for scoring entries based on historical usefulness.
 */
export class UsefulnessCalculator {
  constructor(
    private readonly config: UsefulnessConfig,
    private readonly getMetrics: GetUsefulnessMetricsFn
  ) {}

  /**
   * Calculates usefulness scores for a batch of entries.
   *
   * @param entryIds - Entry IDs to score
   * @returns Map of entry ID to usefulness score (0-1)
   */
  async calculateScores(entryIds: string[]): Promise<Map<string, number>> {
    // Return empty map for empty input
    if (entryIds.length === 0) {
      return new Map();
    }

    // Return neutral scores if disabled
    if (!this.config.enabled) {
      return new Map(entryIds.map((id) => [id, NEUTRAL_SCORE]));
    }

    // Fetch metrics in a single batch query
    const metrics = await this.getMetrics(entryIds);

    // Calculate score for each entry
    return new Map(entryIds.map((id) => [id, this.calculateEntryScore(id, metrics.get(id))]));
  }

  /**
   * Calculates the usefulness score for a single entry.
   *
   * @param entryId - Entry ID
   * @param metrics - Metrics for this entry, or undefined
   * @returns Usefulness score (0-1)
   */
  private calculateEntryScore(_entryId: string, metrics: UsefulnessMetrics | undefined): number {
    // No metrics → neutral score
    if (!metrics) {
      return NEUTRAL_SCORE;
    }

    // Too few retrievals to trust the data → neutral score
    if (metrics.retrievalCount < MIN_RETRIEVALS_FOR_CONFIDENCE) {
      return NEUTRAL_SCORE;
    }

    // Calculate component scores
    const successRate = metrics.successCount / metrics.retrievalCount;
    const recencyBoost = calculateRecencyBoost(metrics.lastSuccessAt);
    const volumeConfidence = calculateVolumeConfidence(metrics.retrievalCount);

    // Weighted combination
    const rawScore =
      successRate * this.config.successWeight +
      recencyBoost * this.config.recencyWeight +
      volumeConfidence * this.config.retrievalWeight;

    return normalizeScore(rawScore);
  }
}
