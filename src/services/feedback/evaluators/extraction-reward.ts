/**
 * Extraction Reward Evaluator
 *
 * Computes reward signals for extraction policy training
 */

import type { ExtractionDecision, ExtractionOutcome } from '../../../db/schema/feedback.js';
import { DEFAULT_FEEDBACK_CONFIG } from '../types.js';

// =============================================================================
// EXTRACTION REWARD CONFIGURATION
// =============================================================================

export interface ExtractionRewardConfig {
  /**
   * Reward for a retrieval that contributed to success
   */
  retrievalSuccessReward: number;

  /**
   * Penalty for a retrieval that contributed to failure
   */
  retrievalFailurePenalty: number;

  /**
   * Penalty for an entry that was never retrieved
   */
  neverRetrievedPenalty: number;

  /**
   * Minimum retrievals to consider entry useful
   */
  minRetrievalsForSuccess: number;

  /**
   * Weight for retrieval frequency component
   */
  retrievalFrequencyWeight: number;

  /**
   * Weight for success rate component
   */
  successRateWeight: number;
}

export const DEFAULT_EXTRACTION_REWARD_CONFIG: ExtractionRewardConfig = {
  retrievalSuccessReward: DEFAULT_FEEDBACK_CONFIG.extraction.retrievalSuccessReward,
  retrievalFailurePenalty: DEFAULT_FEEDBACK_CONFIG.extraction.retrievalFailurePenalty,
  neverRetrievedPenalty: DEFAULT_FEEDBACK_CONFIG.extraction.neverRetrievedPenalty,
  minRetrievalsForSuccess: DEFAULT_FEEDBACK_CONFIG.extraction.minRetrievalsForSuccess,
  retrievalFrequencyWeight: 0.4,
  successRateWeight: 0.6,
};

// =============================================================================
// REWARD COMPUTATION
// =============================================================================

/**
 * Compute extraction reward signal
 *
 * Reward formula:
 * - If never retrieved: neverRetrievedPenalty
 * - If retrieved: weighted combination of:
 *   - Retrieval frequency (normalized)
 *   - Success rate (successCount / retrievalCount)
 */
export function computeExtractionReward(
  decision: ExtractionDecision,
  outcome: ExtractionOutcome | null,
  config: ExtractionRewardConfig = DEFAULT_EXTRACTION_REWARD_CONFIG
): number {
  // Only compute rewards for 'store' decisions
  if (decision.decision !== 'store') {
    return 0;
  }

  // If no outcome data yet, return neutral
  if (!outcome) {
    return 0;
  }

  const { retrievalCount, successCount } = outcome;

  // Case 1: Never retrieved
  if (retrievalCount === 0) {
    return config.neverRetrievedPenalty;
  }

  // Case 2: Retrieved but never successful
  if (successCount === 0) {
    // Small penalty for unused retrievals
    return config.retrievalFailurePenalty * 0.5;
  }

  // Case 3: Retrieved and had some successes
  const successRate = successCount / retrievalCount;

  // Normalize retrieval frequency (cap at some reasonable number)
  const maxRetrievals = 20;
  const normalizedFrequency = Math.min(retrievalCount / maxRetrievals, 1.0);

  // Weighted combination
  const reward =
    config.retrievalFrequencyWeight * normalizedFrequency +
    config.successRateWeight * successRate;

  // Scale to reward range
  return reward * config.retrievalSuccessReward;
}

/**
 * Compute reward for a skip decision
 *
 * This is more complex - we'd need to know if the skipped content
 * would have been useful. For now, we return neutral.
 */
export function computeSkipReward(_decision: ExtractionDecision): number {
  // Could be enhanced to detect cases where we should have stored
  // but didn't (e.g., by analyzing later queries that would have matched)
  return 0;
}

/**
 * Compute reward for a defer decision
 */
export function computeDeferReward(_decision: ExtractionDecision): number {
  // Defer is typically a safe choice - neutral reward
  return 0;
}

/**
 * Compute comprehensive extraction reward with decision type handling
 */
export function computeComprehensiveExtractionReward(
  decision: ExtractionDecision,
  outcome: ExtractionOutcome | null,
  config: ExtractionRewardConfig = DEFAULT_EXTRACTION_REWARD_CONFIG
): number {
  switch (decision.decision) {
    case 'store':
      return computeExtractionReward(decision, outcome, config);
    case 'skip':
      return computeSkipReward(decision);
    case 'defer':
      return computeDeferReward(decision);
    default:
      return 0;
  }
}

// =============================================================================
// BATCH REWARD COMPUTATION
// =============================================================================

/**
 * Compute rewards for multiple extraction decisions
 */
export function computeExtractionRewardsBatch(
  decisions: ExtractionDecision[],
  outcomes: Map<string, ExtractionOutcome>,
  config: ExtractionRewardConfig = DEFAULT_EXTRACTION_REWARD_CONFIG
): Map<string, number> {
  const rewards = new Map<string, number>();

  for (const decision of decisions) {
    const outcome = outcomes.get(decision.id) ?? null;
    const reward = computeComprehensiveExtractionReward(decision, outcome, config);
    rewards.set(decision.id, reward);
  }

  return rewards;
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Compute statistics for extraction rewards
 */
export interface ExtractionRewardStats {
  totalDecisions: number;
  storeDecisions: number;
  skipDecisions: number;
  deferDecisions: number;
  averageReward: number;
  positiveRewards: number;
  negativeRewards: number;
  neutralRewards: number;
  rewardDistribution: {
    min: number;
    max: number;
    median: number;
    stdDev: number;
  };
}

export function computeExtractionRewardStats(
  rewards: Map<string, number>
): ExtractionRewardStats {
  const rewardValues = Array.from(rewards.values());

  if (rewardValues.length === 0) {
    return {
      totalDecisions: 0,
      storeDecisions: 0,
      skipDecisions: 0,
      deferDecisions: 0,
      averageReward: 0,
      positiveRewards: 0,
      negativeRewards: 0,
      neutralRewards: 0,
      rewardDistribution: {
        min: 0,
        max: 0,
        median: 0,
        stdDev: 0,
      },
    };
  }

  const sorted = [...rewardValues].sort((a, b) => a - b);
  const sum = rewardValues.reduce((acc, r) => acc + r, 0);
  const mean = sum / rewardValues.length;

  const variance =
    rewardValues.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / rewardValues.length;
  const stdDev = Math.sqrt(variance);

  const median = sorted[Math.floor(sorted.length / 2)];

  return {
    totalDecisions: rewardValues.length,
    storeDecisions: 0, // Would need decision data to compute
    skipDecisions: 0,
    deferDecisions: 0,
    averageReward: mean,
    positiveRewards: rewardValues.filter((r) => r > 0).length,
    negativeRewards: rewardValues.filter((r) => r < 0).length,
    neutralRewards: rewardValues.filter((r) => r === 0).length,
    rewardDistribution: {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      median: median ?? 0,
      stdDev,
    },
  };
}
