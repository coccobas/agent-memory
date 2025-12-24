/**
 * Attribution Evaluator
 *
 * Computes contribution scores for retrievals based on different attribution methods
 */

import type { MemoryRetrieval, TaskOutcome } from '../../../db/schema/feedback.js';
import type { ContributionScore } from '../types.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('feedback:attribution');

// =============================================================================
// ATTRIBUTION METHODS
// =============================================================================

/**
 * Linear attribution: equal credit to all retrievals
 */
export function computeLinearAttribution(
  retrievals: MemoryRetrieval[],
  outcome: TaskOutcome
): ContributionScore[] {
  if (retrievals.length === 0) {
    return [];
  }

  // Base score from outcome type
  const baseScore = getBaseScoreFromOutcome(outcome);

  // Equal distribution
  const scorePerRetrieval = baseScore / retrievals.length;

  return retrievals.map((r) => ({
    retrievalId: r.id,
    score: scorePerRetrieval,
  }));
}

/**
 * Last-touch attribution: all credit to the most recent retrieval
 */
export function computeLastTouchAttribution(
  retrievals: MemoryRetrieval[],
  outcome: TaskOutcome
): ContributionScore[] {
  if (retrievals.length === 0) {
    return [];
  }

  // Sort by timestamp descending (most recent first)
  const sorted = [...retrievals].sort((a, b) => {
    const timeA = new Date(a.retrievedAt).getTime();
    const timeB = new Date(b.retrievedAt).getTime();
    return timeB - timeA;
  });

  const baseScore = getBaseScoreFromOutcome(outcome);

  // All credit to most recent
  return sorted.map((r, index) => ({
    retrievalId: r.id,
    score: index === 0 ? baseScore : 0,
  }));
}

/**
 * Time-decay attribution: more recent retrievals get more credit
 */
export function computeTimeDecayAttribution(
  retrievals: MemoryRetrieval[],
  outcome: TaskOutcome,
  halfLife: number = 3600000 // 1 hour in milliseconds
): ContributionScore[] {
  if (retrievals.length === 0) {
    return [];
  }

  const outcomeTime = new Date(outcome.outcomeAt).getTime();
  const baseScore = getBaseScoreFromOutcome(outcome);

  // Calculate decay weights
  const weights = retrievals.map((r) => {
    const retrievalTime = new Date(r.retrievedAt).getTime();
    const timeDiff = outcomeTime - retrievalTime;

    // Exponential decay: weight = 2^(-timeDiff/halfLife)
    return Math.pow(2, -timeDiff / halfLife);
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // Distribute score proportionally to weights
  return retrievals.map((r, index) => ({
    retrievalId: r.id,
    score: totalWeight > 0 ? (baseScore * (weights[index] ?? 0)) / totalWeight : 0,
  }));
}

/**
 * Rank-weighted attribution: higher-ranked retrievals get more credit
 */
export function computeRankWeightedAttribution(
  retrievals: MemoryRetrieval[],
  outcome: TaskOutcome
): ContributionScore[] {
  if (retrievals.length === 0) {
    return [];
  }

  const baseScore = getBaseScoreFromOutcome(outcome);

  // Calculate weights based on retrieval rank (lower rank = higher weight)
  const weights = retrievals.map((r) => {
    if (!r.retrievalRank) {
      return 1.0; // Default weight if rank not available
    }
    // Use inverse rank: 1/rank
    return 1.0 / r.retrievalRank;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // Distribute score proportionally to weights
  return retrievals.map((r, index) => ({
    retrievalId: r.id,
    score: totalWeight > 0 ? (baseScore * (weights[index] ?? 0)) / totalWeight : 0,
  }));
}

/**
 * Attention-based attribution (placeholder for future implementation)
 *
 * This would use attention weights from the language model to determine
 * which retrieved entries actually influenced the output.
 *
 * For now, falls back to rank-weighted attribution.
 */
export function computeAttentionAttribution(
  retrievals: MemoryRetrieval[],
  outcome: TaskOutcome,
  attentionWeights?: number[]
): ContributionScore[] {
  if (attentionWeights && attentionWeights.length === retrievals.length) {
    const baseScore = getBaseScoreFromOutcome(outcome);
    const totalWeight = attentionWeights.reduce((sum, w) => sum + w, 0);

    return retrievals.map((r, index) => ({
      retrievalId: r.id,
      score: totalWeight > 0 ? (baseScore * (attentionWeights[index] ?? 0)) / totalWeight : 0,
    }));
  }

  // Fallback to rank-weighted
  logger.debug('Attention weights not available, falling back to rank-weighted attribution');
  return computeRankWeightedAttribution(retrievals, outcome);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get base score from outcome type
 */
function getBaseScoreFromOutcome(outcome: TaskOutcome): number {
  const { outcomeType, confidence } = outcome;

  let baseScore = 0;

  switch (outcomeType) {
    case 'success':
      baseScore = 1.0;
      break;
    case 'partial':
      baseScore = 0.5;
      break;
    case 'failure':
      baseScore = -0.5;
      break;
    case 'unknown':
      baseScore = 0.0;
      break;
  }

  // Weight by confidence
  return baseScore * (confidence ?? 1.0);
}

/**
 * Normalize scores to sum to target value
 */
export function normalizeScores(
  scores: ContributionScore[],
  targetSum: number = 1.0
): ContributionScore[] {
  const currentSum = scores.reduce((sum, s) => sum + Math.abs(s.score), 0);

  if (currentSum === 0) {
    return scores;
  }

  const scaleFactor = targetSum / currentSum;

  return scores.map((s) => ({
    ...s,
    score: s.score * scaleFactor,
  }));
}
