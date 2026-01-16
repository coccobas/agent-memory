/**
 * Extraction Reward Computation
 *
 * Computes reward signals for extraction policy training:
 * - Positive reward: Entry was retrieved and led to success
 * - Negative reward: Entry was never used (wasted storage)
 * - Penalty: Entry was retrieved but led to failure
 */

export interface ExtractionRewardParams {
  // Entry usage metrics
  retrievalCount: number;
  successCount: number;
  failureCount: number;

  // Time factors
  daysSinceCreation: number;
  lastRetrievedDaysAgo?: number;

  // Entry characteristics
  priority?: number;
  confidenceScore?: number;
}

export interface ExtractionRewardResult {
  reward: number;
  components: {
    usageReward: number;
    successReward: number;
    storageReward: number;
    timeDecay: number;
  };
  explanation: string;
}

/**
 * Compute extraction reward
 *
 * Reward formula:
 * - Base: usageReward (retrieved = good, never used = bad)
 * - Success bonus: entries that help task completion
 * - Storage penalty: cost of storing unused entries
 * - Time decay: older entries get discounted
 */
export function computeExtractionReward(params: ExtractionRewardParams): ExtractionRewardResult {
  const { retrievalCount, successCount, failureCount, daysSinceCreation } = params;

  // Component 1: Usage reward (was it retrieved?)
  let usageReward = 0;
  if (retrievalCount === 0) {
    // Never used: negative reward (wasted storage)
    usageReward = -0.3;
  } else if (retrievalCount < 3) {
    // Rarely used: slightly positive
    usageReward = 0.2;
  } else if (retrievalCount < 10) {
    // Moderately used: good
    usageReward = 0.5;
  } else {
    // Frequently used: excellent
    usageReward = 0.8;
  }

  // Component 2: Success reward (did it help?)
  let successReward = 0;
  const totalOutcomes = successCount + failureCount;
  if (totalOutcomes > 0) {
    const successRate = successCount / totalOutcomes;
    if (successRate > 0.7) {
      successReward = 0.5; // High success: strong positive
    } else if (successRate > 0.4) {
      successReward = 0.2; // Moderate success
    } else {
      successReward = -0.3; // Low success: harmful entry
    }
  }

  // Component 3: Storage penalty (cost of storing)
  let storageReward = 0;
  if (retrievalCount === 0 && daysSinceCreation > 30) {
    // Old and unused: significant penalty
    storageReward = -0.4;
  } else if (retrievalCount === 0) {
    // New and unused: small penalty (might be used later)
    storageReward = -0.1;
  }

  // Component 4: Time decay (older rewards matter less)
  let timeDecay = 1.0;
  if (daysSinceCreation > 90) {
    timeDecay = 0.5;
  } else if (daysSinceCreation > 30) {
    timeDecay = 0.8;
  }

  // Combine components
  const baseReward = usageReward + successReward + storageReward;
  const finalReward = baseReward * timeDecay;

  // Normalize to [-1, 1]
  const normalizedReward = Math.max(-1, Math.min(1, finalReward));

  // Generate explanation
  let explanation = '';
  if (retrievalCount === 0) {
    explanation = 'Entry never retrieved - wasted storage';
  } else if (successCount > failureCount) {
    explanation = `Entry retrieved ${retrievalCount} times with ${((successCount / totalOutcomes) * 100).toFixed(0)}% success - valuable`;
  } else if (failureCount > 0) {
    explanation = `Entry retrieved but low success rate - possibly harmful`;
  } else {
    explanation = `Entry retrieved ${retrievalCount} times - useful`;
  }

  return {
    reward: normalizedReward,
    components: {
      usageReward,
      successReward,
      storageReward,
      timeDecay,
    },
    explanation,
  };
}

/**
 * Compute extraction outcome score for database storage
 * Simplified version for batch processing
 */
export function computeExtractionOutcomeScore(
  retrievalCount: number,
  successCount: number,
  failureCount: number,
  daysSinceCreation: number
): number {
  const result = computeExtractionReward({
    retrievalCount,
    successCount,
    failureCount,
    daysSinceCreation,
  });
  return result.reward;
}
