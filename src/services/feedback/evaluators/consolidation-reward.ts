/**
 * Consolidation Reward Evaluator
 *
 * Computes reward signals for consolidation policy training
 */

import type { ConsolidationDecision, ConsolidationOutcome } from '../../../db/schema/feedback.js';
import type { FeedbackConfig } from '../types.js';
import { DEFAULT_FEEDBACK_CONFIG } from '../types.js';

// =============================================================================
// CONSOLIDATION REWARD CONFIGURATION
// =============================================================================

export interface ConsolidationRewardConfig {
  /**
   * Weight for retrieval rate change component
   */
  retrievalRateWeight: number;

  /**
   * Weight for success rate change component
   */
  successRateWeight: number;

  /**
   * Weight for storage reduction component
   */
  storageReductionWeight: number;

  /**
   * Penalty for reduced retrieval rate (information loss)
   */
  retrievalLossPenalty: number;

  /**
   * Bonus for improved success rate
   */
  successImprovementBonus: number;
}

export const DEFAULT_CONSOLIDATION_REWARD_CONFIG: ConsolidationRewardConfig = {
  retrievalRateWeight: DEFAULT_FEEDBACK_CONFIG.consolidation.retrievalRateWeight,
  successRateWeight: DEFAULT_FEEDBACK_CONFIG.consolidation.successRateWeight,
  storageReductionWeight: DEFAULT_FEEDBACK_CONFIG.consolidation.storageReductionWeight,
  retrievalLossPenalty: DEFAULT_FEEDBACK_CONFIG.consolidation.retrievalLossPenalty,
  successImprovementBonus: 2.0,
};

// =============================================================================
// METRICS INTERFACE
// =============================================================================

/**
 * Metrics for before/after comparison
 */
export interface ConsolidationMetrics {
  retrievalRate: number;
  successRate: number;
  storageCount: number;
}

// =============================================================================
// REWARD COMPUTATION
// =============================================================================

/**
 * Compute consolidation reward signal
 *
 * Reward formula:
 * - Retrieval rate change: (post - pre) * retrievalRateWeight
 * - Success rate change: (post - pre) * successRateWeight
 * - Storage reduction: (1 - post/pre) * storageReductionWeight
 * - Penalty if retrieval rate decreased significantly
 */
export function computeConsolidationReward(
  decision: ConsolidationDecision,
  preMetrics: ConsolidationMetrics,
  postMetrics: ConsolidationMetrics,
  config: ConsolidationRewardConfig = DEFAULT_CONSOLIDATION_REWARD_CONFIG
): number {
  // Compute changes
  const retrievalRateChange = postMetrics.retrievalRate - preMetrics.retrievalRate;
  const successRateChange = postMetrics.successRate - preMetrics.successRate;

  // Compute storage reduction (normalized)
  let storageReduction = 0;
  if (preMetrics.storageCount > 0) {
    storageReduction = 1 - postMetrics.storageCount / preMetrics.storageCount;
  }

  // Weighted reward components
  let reward = 0;

  // Component 1: Retrieval rate change
  if (retrievalRateChange >= 0) {
    // Improved or maintained retrieval rate - good!
    reward += retrievalRateChange * config.retrievalRateWeight;
  } else {
    // Decreased retrieval rate - information loss penalty
    reward += retrievalRateChange * Math.abs(config.retrievalLossPenalty);
  }

  // Component 2: Success rate change
  if (successRateChange > 0) {
    // Improved success rate - excellent!
    reward += successRateChange * config.successRateWeight * config.successImprovementBonus;
  } else {
    // Decreased or same success rate
    reward += successRateChange * config.successRateWeight;
  }

  // Component 3: Storage reduction
  if (storageReduction > 0) {
    reward += storageReduction * config.storageReductionWeight;
  }

  // Action-specific adjustments
  reward = adjustRewardForAction(decision.action, reward);

  return reward;
}

/**
 * Adjust reward based on consolidation action type
 */
function adjustRewardForAction(
  action: ConsolidationDecision['action'],
  baseReward: number
): number {
  switch (action) {
    case 'merge':
      // Merging is aggressive - amplify rewards/penalties
      return baseReward * 1.2;

    case 'dedupe':
      // Deduplication should always be positive if done correctly
      return Math.max(baseReward, 0.5);

    case 'archive':
      // Archiving is conservative - moderate rewards
      return baseReward * 0.8;

    case 'abstract':
      // Abstraction is complex - keep base reward
      return baseReward;

    case 'keep':
      // Keeping is safe but doesn't improve things
      return Math.min(baseReward, 0.1);

    default:
      return baseReward;
  }
}

/**
 * Compute reward from outcome data
 */
export function computeConsolidationRewardFromOutcome(
  decision: ConsolidationDecision,
  outcome: ConsolidationOutcome,
  sourceCount: number,
  config: ConsolidationRewardConfig = DEFAULT_CONSOLIDATION_REWARD_CONFIG
): number {
  const preMetrics: ConsolidationMetrics = {
    retrievalRate: outcome.preRetrievalRate ?? 0,
    successRate: outcome.preSuccessRate ?? 0,
    storageCount: sourceCount,
  };

  const postMetrics: ConsolidationMetrics = {
    retrievalRate: outcome.postRetrievalRate ?? 0,
    successRate: outcome.postSuccessRate ?? 0,
    storageCount: decision.targetEntryId ? 1 : 0, // Simplified: assume merged to 1 entry
  };

  return computeConsolidationReward(decision, preMetrics, postMetrics, config);
}

// =============================================================================
// BATCH REWARD COMPUTATION
// =============================================================================

/**
 * Compute rewards for multiple consolidation decisions
 */
export function computeConsolidationRewardsBatch(
  decisions: ConsolidationDecision[],
  outcomes: Map<string, ConsolidationOutcome>,
  config: ConsolidationRewardConfig = DEFAULT_CONSOLIDATION_REWARD_CONFIG
): Map<string, number> {
  const rewards = new Map<string, number>();

  for (const decision of decisions) {
    const outcome = outcomes.get(decision.id);
    if (!outcome) {
      rewards.set(decision.id, 0);
      continue;
    }

    // Parse source entry IDs to get count
    let sourceCount = 1;
    try {
      const sourceIds = JSON.parse(decision.sourceEntryIds);
      sourceCount = Array.isArray(sourceIds) ? sourceIds.length : 1;
    } catch {
      sourceCount = 1;
    }

    const reward = computeConsolidationRewardFromOutcome(decision, outcome, sourceCount, config);
    rewards.set(decision.id, reward);
  }

  return rewards;
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Compute statistics for consolidation rewards
 */
export interface ConsolidationRewardStats {
  totalDecisions: number;
  byAction: {
    merge: number;
    dedupe: number;
    archive: number;
    abstract: number;
    keep: number;
  };
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
  averageRetrievalRateImprovement: number;
  averageSuccessRateImprovement: number;
}

export function computeConsolidationRewardStats(
  rewards: Map<string, number>,
  decisions: ConsolidationDecision[],
  outcomes: Map<string, ConsolidationOutcome>
): ConsolidationRewardStats {
  const rewardValues = Array.from(rewards.values());

  if (rewardValues.length === 0) {
    return {
      totalDecisions: 0,
      byAction: { merge: 0, dedupe: 0, archive: 0, abstract: 0, keep: 0 },
      averageReward: 0,
      positiveRewards: 0,
      negativeRewards: 0,
      neutralRewards: 0,
      rewardDistribution: { min: 0, max: 0, median: 0, stdDev: 0 },
      averageRetrievalRateImprovement: 0,
      averageSuccessRateImprovement: 0,
    };
  }

  const sorted = [...rewardValues].sort((a, b) => a - b);
  const sum = rewardValues.reduce((acc, r) => acc + r, 0);
  const mean = sum / rewardValues.length;

  const variance =
    rewardValues.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / rewardValues.length;
  const stdDev = Math.sqrt(variance);

  const median = sorted[Math.floor(sorted.length / 2)];

  // Count by action
  const byAction = { merge: 0, dedupe: 0, archive: 0, abstract: 0, keep: 0 };
  for (const decision of decisions) {
    byAction[decision.action]++;
  }

  // Compute average improvements
  let totalRetrievalImprovement = 0;
  let totalSuccessImprovement = 0;
  let improvementCount = 0;

  for (const decision of decisions) {
    const outcome = outcomes.get(decision.id);
    if (outcome) {
      totalRetrievalImprovement +=
        (outcome.postRetrievalRate ?? 0) - (outcome.preRetrievalRate ?? 0);
      totalSuccessImprovement += (outcome.postSuccessRate ?? 0) - (outcome.preSuccessRate ?? 0);
      improvementCount++;
    }
  }

  return {
    totalDecisions: rewardValues.length,
    byAction,
    averageReward: mean,
    positiveRewards: rewardValues.filter((r) => r > 0).length,
    negativeRewards: rewardValues.filter((r) => r < 0).length,
    neutralRewards: rewardValues.filter((r) => r === 0).length,
    rewardDistribution: {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median,
      stdDev,
    },
    averageRetrievalRateImprovement:
      improvementCount > 0 ? totalRetrievalImprovement / improvementCount : 0,
    averageSuccessRateImprovement:
      improvementCount > 0 ? totalSuccessImprovement / improvementCount : 0,
  };
}
