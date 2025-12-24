/**
 * Consolidation Reward Computation
 *
 * Computes reward signals for consolidation policy training:
 * - Positive reward: Consolidation improved retrieval quality
 * - Negative reward: Consolidation degraded performance
 * - Storage reward: Reduced storage usage
 */

export interface ConsolidationRewardParams {
  // Decision details
  action: 'merge' | 'dedupe' | 'archive' | 'abstract' | 'keep';
  sourceEntriesCount: number;

  // Before/after metrics
  preRetrievalRate: number;
  postRetrievalRate: number;
  preSuccessRate: number;
  postSuccessRate: number;

  // Storage impact
  preStorageCount: number;
  postStorageCount: number;

  // Time window
  evaluationWindowDays: number;
}

export interface ConsolidationRewardResult {
  reward: number;
  components: {
    retrievalReward: number;
    successReward: number;
    storageReward: number;
    actionPenalty: number;
  };
  explanation: string;
}

/**
 * Compute consolidation reward
 *
 * Reward formula:
 * - Retrieval rate: change in how often entries are retrieved
 * - Success rate: change in task success when retrieved
 * - Storage: benefit from reducing storage
 * - Action penalty: cost of performing consolidation
 */
export function computeConsolidationReward(
  params: ConsolidationRewardParams
): ConsolidationRewardResult {
  const {
    action,
    preRetrievalRate,
    postRetrievalRate,
    preSuccessRate,
    postSuccessRate,
    preStorageCount,
    postStorageCount,
  } = params;

  // Component 1: Retrieval rate change
  const retrievalDelta = postRetrievalRate - preRetrievalRate;
  let retrievalReward = 0;

  if (action === 'archive') {
    // Archive should reduce retrievals of bad entries
    if (retrievalDelta < 0) {
      retrievalReward = 0.3; // Successfully reduced noise
    } else {
      retrievalReward = -0.4; // Archived useful content
    }
  } else if (action === 'merge' || action === 'abstract') {
    // Merge/abstract should maintain or improve retrieval
    if (retrievalDelta > 0.1) {
      retrievalReward = 0.5; // Improved discoverability
    } else if (retrievalDelta > -0.1) {
      retrievalReward = 0.2; // Maintained discoverability
    } else {
      retrievalReward = -0.5; // Lost information
    }
  } else if (action === 'dedupe') {
    // Dedupe should maintain retrieval
    if (Math.abs(retrievalDelta) < 0.05) {
      retrievalReward = 0.3; // Cleaned up without harm
    } else {
      retrievalReward = -0.3; // Changed behavior unexpectedly
    }
  } else {
    // Keep - no change expected
    retrievalReward = 0;
  }

  // Component 2: Success rate change
  const successDelta = postSuccessRate - preSuccessRate;
  let successReward = 0;

  if (successDelta > 0.1) {
    successReward = 0.5; // Improved quality
  } else if (successDelta > 0.0) {
    successReward = 0.2; // Slight improvement
  } else if (successDelta < -0.1) {
    successReward = -0.6; // Degraded quality (bad!)
  } else if (successDelta < 0.0) {
    successReward = -0.2; // Slight degradation
  }

  // Component 3: Storage reward
  const storageDelta = postStorageCount - preStorageCount;
  let storageReward = 0;

  if (action === 'keep') {
    // Keep has no storage benefit
    storageReward = 0;
  } else {
    // Reward storage reduction
    const reductionRatio = storageDelta / preStorageCount;
    if (reductionRatio < -0.5) {
      storageReward = 0.3; // Significant reduction
    } else if (reductionRatio < -0.2) {
      storageReward = 0.2; // Moderate reduction
    } else if (reductionRatio < 0) {
      storageReward = 0.1; // Small reduction
    }
  }

  // Component 4: Action penalty (consolidation has cost)
  let actionPenalty = 0;
  if (action === 'merge' || action === 'abstract') {
    actionPenalty = -0.1; // Computational cost
  } else if (action === 'archive') {
    actionPenalty = -0.05; // Lower cost
  } else if (action === 'dedupe') {
    actionPenalty = -0.05; // Lower cost
  }

  // Combine components
  const totalReward =
    retrievalReward + successReward + storageReward + actionPenalty;

  // Normalize to [-1, 1]
  const normalizedReward = Math.max(-1, Math.min(1, totalReward));

  // Generate explanation
  let explanation = '';
  if (action === 'merge' || action === 'abstract') {
    if (successDelta > 0) {
      explanation = `${action} improved success rate by ${(successDelta * 100).toFixed(1)}% - good consolidation`;
    } else if (successDelta < -0.1) {
      explanation = `${action} degraded success rate by ${(Math.abs(successDelta) * 100).toFixed(1)}% - information loss`;
    } else {
      explanation = `${action} maintained quality while reducing storage - neutral`;
    }
  } else if (action === 'archive') {
    if (retrievalDelta < 0 && successDelta >= 0) {
      explanation = `Archive reduced noise without harming quality - good decision`;
    } else if (retrievalDelta >= 0) {
      explanation = `Archive didn't reduce retrieval - may have been premature`;
    } else {
      explanation = `Archive may have removed useful content`;
    }
  } else if (action === 'dedupe') {
    if (Math.abs(successDelta) < 0.05) {
      explanation = `Dedupe cleaned up duplicates without quality impact - good`;
    } else {
      explanation = `Dedupe had unexpected quality impact`;
    }
  } else {
    explanation = `Kept entries as-is`;
  }

  return {
    reward: normalizedReward,
    components: {
      retrievalReward,
      successReward,
      storageReward,
      actionPenalty,
    },
    explanation,
  };
}

/**
 * Compute consolidation outcome score for database storage
 * Simplified version for batch processing
 */
export function computeConsolidationOutcomeScore(
  preRetrievalRate: number,
  postRetrievalRate: number,
  preSuccessRate: number,
  postSuccessRate: number
): number {
  const result = computeConsolidationReward({
    action: 'merge',
    sourceEntriesCount: 2,
    preRetrievalRate,
    postRetrievalRate,
    preSuccessRate,
    postSuccessRate,
    preStorageCount: 2,
    postStorageCount: 1,
    evaluationWindowDays: 30,
  });
  return result.reward;
}
