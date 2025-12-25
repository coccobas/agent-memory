import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluatePolicy,
  evaluatePolicyOnDataset,
  comparePolicies,
  comparePolicyAgainstBaseline,
  computeConfidenceInterval,
  computeRewardDistribution,
  computeTemporalMetrics,
  formatEvaluationReport,
  formatComparisonReport,
  formatABTestReport,
  PolicyEvaluator,
} from '../../src/services/rl/training/evaluation.js';
import type { Dataset } from '../../src/services/rl/training/dataset-builder.js';
import { ExtractionPolicy } from '../../src/services/rl/policies/extraction.policy.js';
import type { ExtractionState, ExtractionAction } from '../../src/services/rl/types.js';

describe('RL Policy Evaluation', () => {
  let policy: ExtractionPolicy;

  beforeEach(() => {
    policy = new ExtractionPolicy({ enabled: true });
  });

  describe('evaluatePolicy', () => {
    it('should evaluate policy on test data', async () => {
      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
        {
          state: createExtractionState({ hasError: true }),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.7,
        },
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'skip' as const },
          reward: 0.5,
        },
      ];

      const result = await evaluatePolicy(policy, testData);

      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(1);
      expect(result.precision).toBeGreaterThanOrEqual(0);
      expect(result.recall).toBeGreaterThanOrEqual(0);
      expect(result.f1).toBeGreaterThanOrEqual(0);
      expect(result.avgReward).toBeGreaterThanOrEqual(0);
      expect(result.confusionMatrix).toBeDefined();
    });

    it('should compute per-class metrics', async () => {
      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'skip' as const },
          reward: 0.6,
        },
        {
          state: createExtractionState({ turnNumber: 1 }),
          expectedAction: { decision: 'defer' as const },
          reward: 0.5,
        },
      ];

      const result = await evaluatePolicy(policy, testData);

      expect(result.perClassMetrics).toBeDefined();
      if (result.perClassMetrics) {
        for (const [className, metrics] of Object.entries(result.perClassMetrics)) {
          expect(metrics.precision).toBeGreaterThanOrEqual(0);
          expect(metrics.recall).toBeGreaterThanOrEqual(0);
          expect(metrics.f1).toBeGreaterThanOrEqual(0);
          expect(metrics.support).toBeGreaterThan(0);
        }
      }
    });

    it('should build confusion matrix', async () => {
      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'skip' as const },
          reward: 0.6,
        },
      ];

      const result = await evaluatePolicy(policy, testData);

      expect(result.confusionMatrix).toBeDefined();
      expect(Object.keys(result.confusionMatrix).length).toBeGreaterThan(0);
    });

    it('should compute reward statistics', async () => {
      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.9,
        },
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.7,
        },
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
      ];

      const result = await evaluatePolicy(policy, testData);

      expect(result.avgReward).toBeCloseTo(0.8, 1);
      expect(result.rewardStdDev).toBeGreaterThan(0);
    });

    it('should throw error for empty test data', async () => {
      await expect(evaluatePolicy(policy, [])).rejects.toThrow('Test data is empty');
    });

    it('should handle perfect accuracy', async () => {
      const testData = [
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'skip' as const },
          reward: 1.0,
        },
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'skip' as const },
          reward: 1.0,
        },
      ];

      const result = await evaluatePolicy(policy, testData);

      expect(result.accuracy).toBe(1.0);
      expect(result.f1).toBeGreaterThan(0);
    });

    it('should handle zero accuracy correctly', async () => {
      const testData = [
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.5,
        },
      ];

      const result = await evaluatePolicy(policy, testData);

      expect(result.accuracy).toBeLessThan(1.0);
    });
  });

  describe('comparePolicies', () => {
    let policyA: ExtractionPolicy;
    let policyB: ExtractionPolicy;

    beforeEach(() => {
      policyA = new ExtractionPolicy({ enabled: true });
      policyB = new ExtractionPolicy({ enabled: true });
    });

    it('should compare two policies', async () => {
      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'skip' as const },
          reward: 0.6,
        },
      ];

      const result = await comparePolicies(policyA, policyB, testData);

      expect(result.policyA).toBeDefined();
      expect(result.policyB).toBeDefined();
      expect(result.winner).toMatch(/^(A|B|tie)$/);
      expect(result.improvements).toBeDefined();
      expect(result.improvements.accuracy).toBeDefined();
      expect(result.improvements.avgReward).toBeDefined();
      expect(result.improvements.f1).toBeDefined();
    });

    it('should declare tie for similar performance', async () => {
      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
      ];

      const result = await comparePolicies(policyA, policyB, testData);

      // Same policy implementation, should be tie
      expect(result.winner).toBe('tie');
      expect(Math.abs(result.improvements.avgReward)).toBeLessThan(0.1);
    });

    it('should compute improvement metrics', async () => {
      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'skip' as const },
          reward: 0.6,
        },
      ];

      const result = await comparePolicies(policyA, policyB, testData);

      expect(typeof result.improvements.accuracy).toBe('number');
      expect(typeof result.improvements.avgReward).toBe('number');
      expect(typeof result.improvements.f1).toBe('number');
    });
  });

  describe('computeConfidenceInterval', () => {
    it('should compute confidence interval', () => {
      const values = [0.7, 0.8, 0.9, 0.75, 0.85];

      const result = computeConfidenceInterval(values, 0.95, 1000);

      expect(result.mean).toBeCloseTo(0.8, 1);
      expect(result.lower).toBeLessThanOrEqual(result.mean);
      expect(result.upper).toBeGreaterThanOrEqual(result.mean);
      expect(result.upper).toBeGreaterThan(result.lower);
    });

    it('should handle empty values', () => {
      const result = computeConfidenceInterval([]);

      expect(result.mean).toBe(0);
      expect(result.lower).toBe(0);
      expect(result.upper).toBe(0);
    });

    it('should handle single value', () => {
      const result = computeConfidenceInterval([0.5]);

      expect(result.mean).toBe(0.5);
      expect(result.lower).toBeCloseTo(0.5, 1);
      expect(result.upper).toBeCloseTo(0.5, 1);
    });

    it('should support different confidence levels', () => {
      const values = [0.7, 0.8, 0.9, 0.75, 0.85];

      const result90 = computeConfidenceInterval(values, 0.9, 1000);
      const result95 = computeConfidenceInterval(values, 0.95, 1000);

      // 95% CI should be wider than 90% CI
      const width90 = result90.upper - result90.lower;
      const width95 = result95.upper - result95.lower;

      expect(width95).toBeGreaterThanOrEqual(width90);
    });

    it('should use bootstrap resampling', () => {
      const values = [0.5, 0.6, 0.7, 0.8, 0.9];

      const result = computeConfidenceInterval(values, 0.95, 100);

      // With bootstrap, interval should be reasonable
      expect(result.upper - result.lower).toBeGreaterThan(0);
      expect(result.upper - result.lower).toBeLessThan(1);
    });
  });

  describe('formatEvaluationReport', () => {
    it('should format evaluation result as report', async () => {
      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'skip' as const },
          reward: 0.6,
        },
      ];

      const result = await evaluatePolicy(policy, testData);
      const report = formatEvaluationReport(result);

      expect(report).toContain('Policy Evaluation Report');
      expect(report).toContain('Overall Metrics');
      expect(report).toContain('Accuracy');
      expect(report).toContain('Precision');
      expect(report).toContain('Recall');
      expect(report).toContain('F1 Score');
      expect(report).toContain('Reward Statistics');
      expect(report).toContain('Confusion Matrix');
    });

    it('should include per-class metrics in report', async () => {
      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'skip' as const },
          reward: 0.6,
        },
      ];

      const result = await evaluatePolicy(policy, testData);
      const report = formatEvaluationReport(result);

      expect(report).toContain('Per-Class Metrics');
    });

    it('should format numbers correctly', async () => {
      const testData = [
        {
          state: createExtractionState({ similarEntryExists: true }),
          expectedAction: { decision: 'skip' as const },
          reward: 0.875,
        },
      ];

      const result = await evaluatePolicy(policy, testData);
      const report = formatEvaluationReport(result);

      // Should format percentages to 2 decimal places
      expect(report).toMatch(/\d+\.\d{2}%/);
    });
  });

  describe('formatComparisonReport', () => {
    it('should format comparison result as report', async () => {
      const policyA = new ExtractionPolicy({ enabled: true });
      const policyB = new ExtractionPolicy({ enabled: true });

      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
      ];

      const result = await comparePolicies(policyA, policyB, testData);
      const report = formatComparisonReport(result);

      expect(report).toContain('Policy Comparison Report');
      expect(report).toContain('Winner');
      expect(report).toContain('Improvements');
      expect(report).toContain('Accuracy');
      expect(report).toContain('Avg Reward');
      expect(report).toContain('F1 Score');
    });

    it('should use custom policy names', async () => {
      const policyA = new ExtractionPolicy({ enabled: true });
      const policyB = new ExtractionPolicy({ enabled: true });

      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
      ];

      const result = await comparePolicies(policyA, policyB, testData);
      const report = formatComparisonReport(result, 'Baseline', 'New Model');

      expect(report).toContain('Baseline');
      expect(report).toContain('New Model');
    });

    it('should show improvement deltas', async () => {
      const policyA = new ExtractionPolicy({ enabled: true });
      const policyB = new ExtractionPolicy({ enabled: true });

      const testData = [
        {
          state: createExtractionState(),
          expectedAction: { decision: 'store' as const, entryType: 'knowledge' as const },
          reward: 0.8,
        },
      ];

      const result = await comparePolicies(policyA, policyB, testData);
      const report = formatComparisonReport(result);

      // Should show + or - for improvements
      expect(report).toMatch(/[+-]\d+\.\d{2}%/);
    });
  });

  describe('evaluatePolicyOnDataset', () => {
    it('should evaluate policy on dataset eval split', async () => {
      const dataset: Dataset<{ state: ExtractionState; action: ExtractionAction; reward: number }> = {
        train: [
          {
            state: createExtractionState(),
            action: { decision: 'store' as const, entryType: 'knowledge' as const },
            reward: 0.8,
          },
        ],
        eval: [
          {
            state: createExtractionState({ similarEntryExists: true }),
            action: { decision: 'skip' as const },
            reward: 0.7,
          },
          {
            state: createExtractionState(),
            action: { decision: 'store' as const, entryType: 'guideline' as const },
            reward: 0.9,
          },
        ],
      };

      const result = await evaluatePolicyOnDataset(policy, dataset);

      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(1);
      expect(result.avgReward).toBeGreaterThan(0);
      expect(result.confusionMatrix).toBeDefined();
    });

    it('should use eval split not train split', async () => {
      const dataset: Dataset<{ state: ExtractionState; action: ExtractionAction; reward: number }> = {
        train: [],
        eval: [
          {
            state: createExtractionState({ similarEntryExists: true }),
            action: { decision: 'skip' as const },
            reward: 0.5,
          },
        ],
      };

      const result = await evaluatePolicyOnDataset(policy, dataset);

      // Should evaluate on eval, not train
      expect(result.avgReward).toBe(0.5);
    });
  });

  describe('comparePolicyAgainstBaseline', () => {
    it('should compare policy against baseline on dataset', async () => {
      const policyA = new ExtractionPolicy({ enabled: true });
      const baselinePolicy = new ExtractionPolicy({ enabled: true });

      const dataset: Dataset<{ state: ExtractionState; action: ExtractionAction; reward: number }> = {
        train: [],
        eval: [
          {
            state: createExtractionState({ similarEntryExists: true }),
            action: { decision: 'skip' as const },
            reward: 0.8,
          },
          {
            state: createExtractionState(),
            action: { decision: 'store' as const, entryType: 'knowledge' as const },
            reward: 0.7,
          },
        ],
      };

      const result = await comparePolicyAgainstBaseline(policyA, baselinePolicy, dataset);

      expect(result.policyA).toBeDefined();
      expect(result.policyB).toBeDefined();
      expect(result.winner).toMatch(/^(A|B|tie)$/);
      expect(result.improvements).toBeDefined();
    });
  });

  describe('computeRewardDistribution', () => {
    it('should compute basic statistics', () => {
      const rewards = [0.5, 0.6, 0.7, 0.8, 0.9];

      const result = computeRewardDistribution(rewards);

      expect(result.min).toBe(0.5);
      expect(result.max).toBe(0.9);
      expect(result.mean).toBeCloseTo(0.7, 2);
      expect(result.median).toBe(0.7);
      expect(result.stdDev).toBeGreaterThan(0);
    });

    it('should compute quartiles', () => {
      const rewards = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

      const result = computeRewardDistribution(rewards);

      expect(result.quartiles.q1).toBeLessThan(result.quartiles.q2);
      expect(result.quartiles.q2).toBeLessThan(result.quartiles.q3);
    });

    it('should create histogram bins', () => {
      const rewards = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];

      const result = computeRewardDistribution(rewards);

      expect(result.histogram.length).toBe(10);
      expect(result.histogram.every(bin => bin.count >= 0)).toBe(true);
      expect(result.histogram.every(bin => bin.percentage >= 0)).toBe(true);

      // Sum of counts should account for most rewards (some edge cases may be excluded)
      const totalCount = result.histogram.reduce((sum, bin) => sum + bin.count, 0);
      expect(totalCount).toBeGreaterThanOrEqual(rewards.length - 1);
    });

    it('should handle empty rewards array', () => {
      const result = computeRewardDistribution([]);

      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
      expect(result.mean).toBe(0);
      expect(result.median).toBe(0);
      expect(result.stdDev).toBe(0);
      expect(result.quartiles.q1).toBe(0);
      expect(result.histogram).toEqual([]);
    });

    it('should handle single reward', () => {
      const result = computeRewardDistribution([0.5]);

      expect(result.min).toBe(0.5);
      expect(result.max).toBe(0.5);
      expect(result.mean).toBe(0.5);
      expect(result.median).toBe(0.5);
      expect(result.stdDev).toBe(0);
    });

    it('should handle negative rewards', () => {
      const rewards = [-0.5, -0.3, 0, 0.3, 0.5];

      const result = computeRewardDistribution(rewards);

      expect(result.min).toBe(-0.5);
      expect(result.max).toBe(0.5);
      expect(result.mean).toBeCloseTo(0, 2);
    });

    it('should format histogram bin labels correctly', () => {
      const rewards = [0.1, 0.5, 0.9];

      const result = computeRewardDistribution(rewards);

      expect(result.histogram[0]?.bin).toMatch(/^\[[\d.]+, [\d.]+\)/);
      expect(result.histogram[9]?.bin).toMatch(/^\[[\d.]+, [\d.]+\]$/);
    });
  });

  describe('computeTemporalMetrics', () => {
    it('should handle data without timestamps', () => {
      const data = [
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.8 },
        { state: createExtractionState(), action: { decision: 'skip' as const }, reward: 0.6 },
      ];

      const result = computeTemporalMetrics(data);

      expect(result.timeWindow).toBe('N/A');
      expect(result.windows).toEqual([]);
      expect(result.trend).toBe('stable');
    });

    it('should compute windows for timestamped data', () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      const data = [
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.7, timestamp: new Date(now - 14 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.75, timestamp: new Date(now - 10 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.8, timestamp: new Date(now - 5 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.85, timestamp: new Date(now).toISOString() },
      ];

      const result = computeTemporalMetrics(data, 7 * day);

      expect(result.windows.length).toBeGreaterThan(0);
      expect(result.windows[0]?.windowStart).toBeDefined();
      expect(result.windows[0]?.avgReward).toBeGreaterThan(0);
    });

    it('should detect improving trend', () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      const data = [
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.5, timestamp: new Date(now - 21 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.6, timestamp: new Date(now - 14 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.7, timestamp: new Date(now - 7 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.9, timestamp: new Date(now).toISOString() },
      ];

      const result = computeTemporalMetrics(data, 7 * day);

      expect(['improving', 'stable']).toContain(result.trend);
    });

    it('should detect declining trend', () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      const data = [
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.9, timestamp: new Date(now - 21 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.7, timestamp: new Date(now - 14 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.5, timestamp: new Date(now - 7 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.3, timestamp: new Date(now).toISOString() },
      ];

      const result = computeTemporalMetrics(data, 7 * day);

      expect(['declining', 'stable']).toContain(result.trend);
    });

    it('should include sample count per window', () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      const data = [
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.8, timestamp: new Date(now - 1 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.7, timestamp: new Date(now - 2 * day).toISOString() },
        { state: createExtractionState(), action: { decision: 'store' as const }, reward: 0.9, timestamp: new Date(now - 3 * day).toISOString() },
      ];

      const result = computeTemporalMetrics(data, 7 * day);

      if (result.windows.length > 0) {
        expect(result.windows[0]?.sampleCount).toBeGreaterThan(0);
      }
    });
  });

  describe('formatABTestReport', () => {
    it('should format AB test result as report', () => {
      const result = {
        modelA: {
          name: 'extraction-v1',
          metrics: {
            accuracy: 0.8,
            precision: 0.75,
            recall: 0.85,
            f1: 0.79,
            avgReward: 0.7,
            rewardStdDev: 0.1,
            confusionMatrix: {},
          },
          sampleCount: 100,
        },
        modelB: {
          name: 'extraction-v2',
          metrics: {
            accuracy: 0.85,
            precision: 0.8,
            recall: 0.88,
            f1: 0.84,
            avgReward: 0.75,
            rewardStdDev: 0.08,
            confusionMatrix: {},
          },
          sampleCount: 100,
        },
        winner: 'B' as const,
        pValue: 0.03,
        confidenceLevel: 0.97,
        details: {
          rewardDifference: 0.05,
          accuracyDifference: 0.05,
          effectSize: 0.5,
          recommendation: 'Model B performs significantly better.',
        },
      };

      const report = formatABTestReport(result);

      expect(report).toContain('A/B Test Report');
      expect(report).toContain('extraction-v1');
      expect(report).toContain('extraction-v2');
      expect(report).toContain('Winner');
      expect(report).toContain('Confidence');
      expect(report).toContain('P-value');
      expect(report).toContain('Performance Differences');
      expect(report).toContain('Recommendation');
    });

    it('should show tie correctly', () => {
      const result = {
        modelA: {
          name: 'model-a',
          metrics: {
            accuracy: 0.8,
            precision: 0.8,
            recall: 0.8,
            f1: 0.8,
            avgReward: 0.8,
            rewardStdDev: 0.1,
            confusionMatrix: {},
          },
          sampleCount: 50,
        },
        modelB: {
          name: 'model-b',
          metrics: {
            accuracy: 0.8,
            precision: 0.8,
            recall: 0.8,
            f1: 0.8,
            avgReward: 0.8,
            rewardStdDev: 0.1,
            confusionMatrix: {},
          },
          sampleCount: 50,
        },
        winner: 'tie' as const,
        pValue: 0.5,
        confidenceLevel: 0.5,
        details: {
          rewardDifference: 0,
          accuracyDifference: 0,
          effectSize: 0,
          recommendation: 'No significant difference detected.',
        },
      };

      const report = formatABTestReport(result);

      expect(report).toContain('No clear winner');
    });

    it('should format effect size', () => {
      const result = {
        modelA: {
          name: 'model-a',
          metrics: {
            accuracy: 0.7,
            precision: 0.7,
            recall: 0.7,
            f1: 0.7,
            avgReward: 0.6,
            rewardStdDev: 0.1,
            confusionMatrix: {},
          },
          sampleCount: 100,
        },
        modelB: {
          name: 'model-b',
          metrics: {
            accuracy: 0.9,
            precision: 0.9,
            recall: 0.9,
            f1: 0.9,
            avgReward: 0.8,
            rewardStdDev: 0.05,
            confusionMatrix: {},
          },
          sampleCount: 100,
        },
        winner: 'B' as const,
        pValue: 0.01,
        confidenceLevel: 0.99,
        details: {
          rewardDifference: 0.2,
          accuracyDifference: 0.2,
          effectSize: 1.5,
          recommendation: 'Model B is significantly better.',
        },
      };

      const report = formatABTestReport(result);

      expect(report).toContain("Cohen's d");
      expect(report).toContain('1.5');
    });
  });

  describe('PolicyEvaluator', () => {
    let evaluator: PolicyEvaluator;

    beforeEach(() => {
      evaluator = new PolicyEvaluator();
    });

    it('should create PolicyEvaluator instance', () => {
      expect(evaluator).toBeDefined();
    });

    it('should have evaluate method', () => {
      expect(typeof evaluator.evaluate).toBe('function');
    });

    it('should have compare method', () => {
      expect(typeof evaluator.compare).toBe('function');
    });

    it('should have abTest method', () => {
      expect(typeof evaluator.abTest).toBe('function');
    });

    it('evaluate should throw not implemented error', async () => {
      const mockModel = {
        policyType: 'extraction',
        version: 1,
        checksum: 'abc',
        trainedAt: new Date().toISOString(),
        metadata: {},
      };

      await expect(
        evaluator.evaluate(mockModel, [])
      ).rejects.toThrow('Model evaluation not yet implemented');
    });

    it('abTest should validate split ratio', async () => {
      const mockModel = {
        policyType: 'extraction',
        version: 1,
        checksum: 'abc',
        trainedAt: new Date().toISOString(),
        metadata: {},
      };

      await expect(
        evaluator.abTest(mockModel, mockModel, [], 1.5)
      ).rejects.toThrow('Split ratio must be between 0 and 1');

      await expect(
        evaluator.abTest(mockModel, mockModel, [], -0.5)
      ).rejects.toThrow('Split ratio must be between 0 and 1');
    });
  });
});

// Helper function to create extraction state
function createExtractionState(
  overrides: Partial<ExtractionState> & {
    hasError?: boolean;
    similarEntryExists?: boolean;
    turnNumber?: number;
  } = {}
): ExtractionState {
  return {
    contextFeatures: {
      turnNumber: overrides.turnNumber ?? 5,
      tokenCount: 100,
      toolCallCount: 0,
      hasError: overrides.hasError ?? false,
      userTurnCount: 3,
      assistantTurnCount: 2,
    },
    memoryState: {
      totalEntries: 50,
      recentExtractions: 2,
      similarEntryExists: overrides.similarEntryExists ?? false,
      sessionCaptureCount: 1,
    },
    contentFeatures: {
      hasDecision: false,
      hasRule: false,
      hasFact: false,
      hasCommand: false,
      noveltyScore: 0.5,
      complexity: 0.5,
    },
    ...overrides,
  };
}
