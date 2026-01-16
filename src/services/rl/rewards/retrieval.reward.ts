/**
 * Retrieval Reward Computation
 *
 * Computes reward signals for retrieval policy training:
 * - Positive reward: Retrieval helped task success
 * - Negative reward: Retrieval was unnecessary or harmful
 * - Cost penalty: Retrieval has computational cost
 */

export interface RetrievalRewardParams {
  // Query characteristics
  queryComplexity: number;

  // Retrieval decision
  didRetrieve: boolean;
  retrievedCount?: number;

  // Outcome
  taskSuccess: boolean;
  taskOutcomeType: 'success' | 'failure' | 'partial' | 'unknown';

  // Contribution
  contributionScore?: number; // From attribution
  relevanceScore?: number; // Average relevance of results
}

export interface RetrievalRewardResult {
  reward: number;
  components: {
    outcomeReward: number;
    contributionReward: number;
    costPenalty: number;
    relevanceBonus: number;
  };
  explanation: string;
}

/**
 * Compute retrieval reward
 *
 * Reward formula:
 * - Base: task outcome (success = positive, failure = negative)
 * - Contribution: how much retrieved entries helped
 * - Cost: penalty for retrieval (computation, latency)
 * - Relevance: bonus for high-quality results
 */
export function computeRetrievalReward(params: RetrievalRewardParams): RetrievalRewardResult {
  const {
    didRetrieve,
    retrievedCount = 0,
    taskSuccess,
    taskOutcomeType,
    contributionScore = 0,
    relevanceScore = 0,
  } = params;

  // Component 1: Outcome reward (did task succeed?)
  let outcomeReward = 0;
  if (taskOutcomeType === 'success') {
    outcomeReward = 1.0;
  } else if (taskOutcomeType === 'partial') {
    outcomeReward = 0.3;
  } else if (taskOutcomeType === 'failure') {
    outcomeReward = -0.5;
  } else {
    outcomeReward = 0.0; // Unknown
  }

  // Component 2: Contribution reward (did retrieval help?)
  let contributionReward = 0;
  if (didRetrieve) {
    if (contributionScore > 0.5) {
      contributionReward = 0.5; // Retrieval was very helpful
    } else if (contributionScore > 0.2) {
      contributionReward = 0.2; // Retrieval was somewhat helpful
    } else if (contributionScore < -0.2) {
      contributionReward = -0.3; // Retrieval was harmful
    } else {
      contributionReward = -0.1; // Retrieval was unnecessary
    }
  } else {
    // Didn't retrieve
    if (taskSuccess) {
      contributionReward = 0.3; // Good call - saved computation
    } else {
      contributionReward = -0.4; // Bad call - might have helped
    }
  }

  // Component 3: Cost penalty (retrieval has overhead)
  let costPenalty = 0;
  if (didRetrieve) {
    // Base cost for any retrieval
    costPenalty = -0.1;

    // Additional cost for large retrievals
    if (retrievedCount > 20) {
      costPenalty -= 0.1;
    }
  }

  // Component 4: Relevance bonus (quality of results)
  let relevanceBonus = 0;
  if (didRetrieve && relevanceScore > 0) {
    if (relevanceScore > 0.8) {
      relevanceBonus = 0.3; // High relevance
    } else if (relevanceScore > 0.5) {
      relevanceBonus = 0.1; // Moderate relevance
    }
  }

  // Combine components
  const totalReward = outcomeReward + contributionReward + costPenalty + relevanceBonus;

  // Normalize to [-1, 1]
  const normalizedReward = Math.max(-1, Math.min(1, totalReward));

  // Generate explanation
  let explanation = '';
  if (didRetrieve) {
    if (taskSuccess && contributionScore > 0.3) {
      explanation = `Retrieval helped task success (contribution: ${(contributionScore * 100).toFixed(0)}%)`;
    } else if (!taskSuccess) {
      explanation = `Retrieved but task failed - results may have been irrelevant`;
    } else {
      explanation = `Retrieved but had minimal impact - may have been unnecessary`;
    }
  } else {
    if (taskSuccess) {
      explanation = `Skipped retrieval and succeeded - good decision`;
    } else {
      explanation = `Skipped retrieval and failed - might have helped`;
    }
  }

  return {
    reward: normalizedReward,
    components: {
      outcomeReward,
      contributionReward,
      costPenalty,
      relevanceBonus,
    },
    explanation,
  };
}

/**
 * Compute retrieval outcome score for database storage
 * Simplified version for batch processing
 */
export function computeRetrievalOutcomeScore(
  didRetrieve: boolean,
  taskSuccess: boolean,
  contributionScore: number
): number {
  const result = computeRetrievalReward({
    queryComplexity: 0.5,
    didRetrieve,
    taskSuccess,
    taskOutcomeType: taskSuccess ? 'success' : 'failure',
    contributionScore,
  });
  return result.reward;
}
