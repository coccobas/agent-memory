import { describe, it, expect } from 'vitest';
import {
  computeExtractionReward,
  computeExtractionOutcomeScore,
  type ExtractionRewardParams,
} from '../../src/services/rl/rewards/extraction.reward.js';
import {
  computeRetrievalReward,
  computeRetrievalOutcomeScore,
  type RetrievalRewardParams,
} from '../../src/services/rl/rewards/retrieval.reward.js';
import {
  computeConsolidationReward,
  computeConsolidationOutcomeScore,
  type ConsolidationRewardParams,
} from '../../src/services/rl/rewards/consolidation.reward.js';

describe('RL Rewards', () => {
  describe('ExtractionReward', () => {
    it('should penalize never-used entries', () => {
      const params: ExtractionRewardParams = {
        retrievalCount: 0,
        successCount: 0,
        failureCount: 0,
        daysSinceCreation: 10,
      };

      const result = computeExtractionReward(params);

      expect(result.reward).toBeLessThan(0);
      expect(result.components.usageReward).toBeLessThan(0);
      expect(result.explanation).toContain('never retrieved');
    });

    it('should reward frequently used entries', () => {
      const params: ExtractionRewardParams = {
        retrievalCount: 15,
        successCount: 12,
        failureCount: 3,
        daysSinceCreation: 20,
      };

      const result = computeExtractionReward(params);

      expect(result.reward).toBeGreaterThan(0);
      expect(result.components.usageReward).toBeGreaterThan(0.5);
      expect(result.components.successReward).toBeGreaterThan(0);
    });

    it('should apply storage penalty for old unused entries', () => {
      const params: ExtractionRewardParams = {
        retrievalCount: 0,
        successCount: 0,
        failureCount: 0,
        daysSinceCreation: 40,
      };

      const result = computeExtractionReward(params);

      expect(result.components.storageReward).toBeLessThan(0);
      expect(result.reward).toBeLessThan(-0.5);
    });

    it('should penalize low success rate', () => {
      const params: ExtractionRewardParams = {
        retrievalCount: 10,
        successCount: 2,
        failureCount: 8,
        daysSinceCreation: 15,
      };

      const result = computeExtractionReward(params);

      expect(result.components.successReward).toBeLessThan(0);
      expect(result.explanation).toContain('low success');
    });

    it('should apply time decay for old entries', () => {
      const recentParams: ExtractionRewardParams = {
        retrievalCount: 10,
        successCount: 8,
        failureCount: 2,
        daysSinceCreation: 10,
      };

      const oldParams: ExtractionRewardParams = {
        retrievalCount: 10,
        successCount: 8,
        failureCount: 2,
        daysSinceCreation: 100,
      };

      const recentResult = computeExtractionReward(recentParams);
      const oldResult = computeExtractionReward(oldParams);

      expect(oldResult.components.timeDecay).toBeLessThan(recentResult.components.timeDecay);
      expect(oldResult.reward).toBeLessThan(recentResult.reward);
    });

    it('should normalize reward to [-1, 1]', () => {
      const extremeParams: ExtractionRewardParams = {
        retrievalCount: 100,
        successCount: 100,
        failureCount: 0,
        daysSinceCreation: 1,
      };

      const result = computeExtractionReward(extremeParams);

      expect(result.reward).toBeGreaterThanOrEqual(-1);
      expect(result.reward).toBeLessThanOrEqual(1);
    });

    it('should compute outcome score correctly', () => {
      const score = computeExtractionOutcomeScore(10, 8, 2, 20);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should reward moderately used entries', () => {
      const params: ExtractionRewardParams = {
        retrievalCount: 5,
        successCount: 4,
        failureCount: 1,
        daysSinceCreation: 15,
      };

      const result = computeExtractionReward(params);

      expect(result.reward).toBeGreaterThan(0);
      expect(result.components.usageReward).toBeGreaterThan(0);
    });

    it('should have small penalty for new unused entries', () => {
      const params: ExtractionRewardParams = {
        retrievalCount: 0,
        successCount: 0,
        failureCount: 0,
        daysSinceCreation: 5,
      };

      const result = computeExtractionReward(params);

      expect(result.components.storageReward).toBeLessThan(0);
      expect(result.components.storageReward).toBeGreaterThan(-0.2);
    });
  });

  describe('RetrievalReward', () => {
    it('should reward successful retrieval', () => {
      const params: RetrievalRewardParams = {
        queryComplexity: 0.7,
        didRetrieve: true,
        retrievedCount: 10,
        taskSuccess: true,
        taskOutcomeType: 'success',
        contributionScore: 0.8,
        relevanceScore: 0.9,
      };

      const result = computeRetrievalReward(params);

      expect(result.reward).toBeGreaterThan(0);
      expect(result.components.outcomeReward).toBe(1.0);
      expect(result.components.contributionReward).toBeGreaterThan(0);
      expect(result.components.relevanceBonus).toBeGreaterThan(0);
      expect(result.explanation).toContain('helped task success');
    });

    it('should penalize unnecessary retrieval', () => {
      const params: RetrievalRewardParams = {
        queryComplexity: 0.3,
        didRetrieve: true,
        retrievedCount: 5,
        taskSuccess: true,
        taskOutcomeType: 'success',
        contributionScore: 0.05,
        relevanceScore: 0.3,
      };

      const result = computeRetrievalReward(params);

      expect(result.components.contributionReward).toBeLessThan(0);
      expect(result.components.costPenalty).toBeLessThan(0);
      expect(result.explanation).toContain('minimal impact');
    });

    it('should reward skipping retrieval when successful', () => {
      const params: RetrievalRewardParams = {
        queryComplexity: 0.2,
        didRetrieve: false,
        taskSuccess: true,
        taskOutcomeType: 'success',
        contributionScore: 0,
      };

      const result = computeRetrievalReward(params);

      expect(result.reward).toBeGreaterThan(0);
      expect(result.components.contributionReward).toBeGreaterThan(0);
      expect(result.explanation).toContain('Skipped retrieval and succeeded');
    });

    it('should penalize skipping retrieval when failed', () => {
      const params: RetrievalRewardParams = {
        queryComplexity: 0.8,
        didRetrieve: false,
        taskSuccess: false,
        taskOutcomeType: 'failure',
        contributionScore: 0,
      };

      const result = computeRetrievalReward(params);

      expect(result.reward).toBeLessThan(0);
      expect(result.components.outcomeReward).toBeLessThan(0);
      expect(result.components.contributionReward).toBeLessThan(0);
      expect(result.explanation).toContain('might have helped');
    });

    it('should apply cost penalty for retrieval', () => {
      const params: RetrievalRewardParams = {
        queryComplexity: 0.5,
        didRetrieve: true,
        retrievedCount: 15,
        taskSuccess: true,
        taskOutcomeType: 'success',
        contributionScore: 0.5,
      };

      const result = computeRetrievalReward(params);

      expect(result.components.costPenalty).toBeLessThan(0);
      expect(result.components.costPenalty).toBeGreaterThanOrEqual(-0.2);
    });

    it('should apply higher cost for large retrievals', () => {
      const smallRetrievalParams: RetrievalRewardParams = {
        queryComplexity: 0.5,
        didRetrieve: true,
        retrievedCount: 10,
        taskSuccess: true,
        taskOutcomeType: 'success',
        contributionScore: 0.5,
      };

      const largeRetrievalParams: RetrievalRewardParams = {
        queryComplexity: 0.5,
        didRetrieve: true,
        retrievedCount: 25,
        taskSuccess: true,
        taskOutcomeType: 'success',
        contributionScore: 0.5,
      };

      const smallResult = computeRetrievalReward(smallRetrievalParams);
      const largeResult = computeRetrievalReward(largeRetrievalParams);

      expect(largeResult.components.costPenalty).toBeLessThan(smallResult.components.costPenalty);
    });

    it('should reward high relevance results', () => {
      const params: RetrievalRewardParams = {
        queryComplexity: 0.6,
        didRetrieve: true,
        retrievedCount: 10,
        taskSuccess: true,
        taskOutcomeType: 'success',
        contributionScore: 0.6,
        relevanceScore: 0.9,
      };

      const result = computeRetrievalReward(params);

      expect(result.components.relevanceBonus).toBe(0.3);
    });

    it('should handle partial success', () => {
      const params: RetrievalRewardParams = {
        queryComplexity: 0.5,
        didRetrieve: true,
        retrievedCount: 10,
        taskSuccess: false,
        taskOutcomeType: 'partial',
        contributionScore: 0.3,
      };

      const result = computeRetrievalReward(params);

      expect(result.components.outcomeReward).toBe(0.3);
    });

    it('should handle unknown outcome', () => {
      const params: RetrievalRewardParams = {
        queryComplexity: 0.5,
        didRetrieve: true,
        retrievedCount: 10,
        taskSuccess: false,
        taskOutcomeType: 'unknown',
        contributionScore: 0,
      };

      const result = computeRetrievalReward(params);

      expect(result.components.outcomeReward).toBe(0);
    });

    it('should normalize reward to [-1, 1]', () => {
      const params: RetrievalRewardParams = {
        queryComplexity: 0.9,
        didRetrieve: true,
        retrievedCount: 50,
        taskSuccess: true,
        taskOutcomeType: 'success',
        contributionScore: 1.0,
        relevanceScore: 1.0,
      };

      const result = computeRetrievalReward(params);

      expect(result.reward).toBeGreaterThanOrEqual(-1);
      expect(result.reward).toBeLessThanOrEqual(1);
    });

    it('should compute outcome score correctly', () => {
      const score = computeRetrievalOutcomeScore(true, true, 0.7);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('ConsolidationReward', () => {
    it('should reward successful merge', () => {
      const params: ConsolidationRewardParams = {
        action: 'merge',
        sourceEntriesCount: 3,
        preRetrievalRate: 0.6,
        postRetrievalRate: 0.75,
        preSuccessRate: 0.6,
        postSuccessRate: 0.75,
        preStorageCount: 3,
        postStorageCount: 1,
        evaluationWindowDays: 30,
      };

      const result = computeConsolidationReward(params);

      expect(result.reward).toBeGreaterThan(0);
      expect(result.components.successReward).toBeGreaterThan(0);
      expect(result.components.storageReward).toBeGreaterThan(0);
      expect(result.explanation).toContain('improved success rate');
    });

    it('should penalize harmful merge', () => {
      const params: ConsolidationRewardParams = {
        action: 'merge',
        sourceEntriesCount: 2,
        preRetrievalRate: 0.8,
        postRetrievalRate: 0.5,
        preSuccessRate: 0.8,
        postSuccessRate: 0.4,
        preStorageCount: 2,
        postStorageCount: 1,
        evaluationWindowDays: 30,
      };

      const result = computeConsolidationReward(params);

      expect(result.reward).toBeLessThan(0);
      expect(result.components.successReward).toBeLessThan(0);
      expect(result.explanation).toContain('degraded success rate');
    });

    it('should reward successful deduplication', () => {
      const params: ConsolidationRewardParams = {
        action: 'dedupe',
        sourceEntriesCount: 2,
        preRetrievalRate: 0.7,
        postRetrievalRate: 0.7,
        preSuccessRate: 0.7,
        postSuccessRate: 0.7,
        preStorageCount: 2,
        postStorageCount: 1,
        evaluationWindowDays: 30,
      };

      const result = computeConsolidationReward(params);

      expect(result.reward).toBeGreaterThan(0);
      expect(result.components.storageReward).toBeGreaterThan(0);
      expect(result.explanation).toContain('cleaned up duplicates');
    });

    it('should reward archiving unused entries', () => {
      const params: ConsolidationRewardParams = {
        action: 'archive',
        sourceEntriesCount: 1,
        preRetrievalRate: 0.2,
        postRetrievalRate: 0,
        preSuccessRate: 0.2,
        postSuccessRate: 0.2, // Maintain success rate - archiving doesn't degrade what remains
        preStorageCount: 1,
        postStorageCount: 0,
        evaluationWindowDays: 30,
      };

      const result = computeConsolidationReward(params);

      expect(result.reward).toBeGreaterThanOrEqual(0);
      expect(result.components.storageReward).toBeGreaterThanOrEqual(0);
    });

    it('should penalize archiving active entries', () => {
      const params: ConsolidationRewardParams = {
        action: 'archive',
        sourceEntriesCount: 1,
        preRetrievalRate: 0.9,
        postRetrievalRate: 0.9,
        preSuccessRate: 0.9,
        postSuccessRate: 0.8,
        preStorageCount: 1,
        postStorageCount: 0,
        evaluationWindowDays: 30,
      };

      const result = computeConsolidationReward(params);

      // Archive that didn't reduce retrieval should not give positive reward
      expect(result.reward).toBeLessThanOrEqual(0);
    });

    it('should reward successful abstraction', () => {
      const params: ConsolidationRewardParams = {
        action: 'abstract',
        sourceEntriesCount: 8,
        preRetrievalRate: 0.65,
        postRetrievalRate: 0.75,
        preSuccessRate: 0.65,
        postSuccessRate: 0.8,
        preStorageCount: 8,
        postStorageCount: 1,
        evaluationWindowDays: 30,
      };

      const result = computeConsolidationReward(params);

      expect(result.reward).toBeGreaterThan(0);
      expect(result.components.successReward).toBeGreaterThan(0);
      expect(result.components.storageReward).toBeGreaterThan(0);
    });

    it('should handle keep action with no change', () => {
      const params: ConsolidationRewardParams = {
        action: 'keep',
        sourceEntriesCount: 1,
        preRetrievalRate: 0.85,
        postRetrievalRate: 0.85,
        preSuccessRate: 0.85,
        postSuccessRate: 0.85,
        preStorageCount: 1,
        postStorageCount: 1,
        evaluationWindowDays: 30,
      };

      const result = computeConsolidationReward(params);

      expect(result.reward).toBe(0);
      expect(result.components.storageReward).toBe(0);
    });

    it('should reward larger storage reductions', () => {
      const smallReductionParams: ConsolidationRewardParams = {
        action: 'merge',
        sourceEntriesCount: 2,
        preRetrievalRate: 0.7,
        postRetrievalRate: 0.7,
        preSuccessRate: 0.7,
        postSuccessRate: 0.7,
        preStorageCount: 2,
        postStorageCount: 1,
        evaluationWindowDays: 30,
      };

      const largeReductionParams: ConsolidationRewardParams = {
        action: 'merge',
        sourceEntriesCount: 10,
        preRetrievalRate: 0.7,
        postRetrievalRate: 0.7,
        preSuccessRate: 0.7,
        postSuccessRate: 0.7,
        preStorageCount: 10,
        postStorageCount: 1,
        evaluationWindowDays: 30,
      };

      const smallResult = computeConsolidationReward(smallReductionParams);
      const largeResult = computeConsolidationReward(largeReductionParams);

      expect(largeResult.components.storageReward).toBeGreaterThan(
        smallResult.components.storageReward
      );
    });

    it('should normalize reward to [-1, 1]', () => {
      const params: ConsolidationRewardParams = {
        action: 'merge',
        sourceEntriesCount: 50,
        preRetrievalRate: 0.5,
        postRetrievalRate: 0.9,
        preSuccessRate: 0.5,
        postSuccessRate: 1.0,
        preStorageCount: 50,
        postStorageCount: 1,
        evaluationWindowDays: 30,
      };

      const result = computeConsolidationReward(params);

      expect(result.reward).toBeGreaterThanOrEqual(-1);
      expect(result.reward).toBeLessThanOrEqual(1);
    });

    it('should compute outcome score correctly', () => {
      const score = computeConsolidationOutcomeScore(0.7, 0.8, 0.7, 0.85);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});
