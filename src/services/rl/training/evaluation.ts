/**
 * Policy Evaluation
 *
 * Metrics and utilities for evaluating RL policy performance.
 * Compares policy decisions against test data and ground truth.
 * Supports baseline comparison, A/B testing, and temporal tracking.
 */

import type { Dataset } from './dataset-builder.js';
import type { IPolicy } from '../policies/base.policy.js';
import type { LoadedModel } from './model-loader.js';
import { createValidationError, createNotFoundError } from '../../../core/errors.js';

// =============================================================================
// TYPES
// =============================================================================

export interface EvaluationResult {
  policyType?: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  avgReward: number;
  rewardStdDev: number;
  confusionMatrix: Record<string, Record<string, number>>;
  perClassMetrics?: Record<
    string,
    {
      precision: number;
      recall: number;
      f1: number;
      support: number;
    }
  >;
  rewardDistribution?: RewardDistribution;
  temporalMetrics?: TemporalMetrics;
}

export interface ExtendedEvaluationResult extends EvaluationResult {
  policyType: string;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    avgReward: number;
    rewardStdDev: number;
  };
  baseline?: {
    accuracy: number;
    avgReward: number;
    f1Score: number;
  };
  improvement?: {
    accuracyDelta: number;
    rewardDelta: number;
    percentImprovement: number;
  };
  confusionMatrix: Record<string, Record<string, number>>;
  rewardDistribution?: RewardDistribution;
}

export interface RewardDistribution {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  quartiles: {
    q1: number;
    q2: number;
    q3: number;
  };
  histogram: Array<{ bin: string; count: number; percentage: number }>;
}

export interface TemporalMetrics {
  timeWindow: string;
  windows: Array<{
    windowStart: string;
    windowEnd: string;
    accuracy: number;
    avgReward: number;
    sampleCount: number;
  }>;
  trend: 'improving' | 'declining' | 'stable';
  improvementRate?: number; // % change per window
}

export interface ComparisonResult {
  policyA: EvaluationResult;
  policyB: EvaluationResult;
  winner: 'A' | 'B' | 'tie';
  improvements: {
    accuracy: number;
    avgReward: number;
    f1: number;
  };
  pValue?: number; // Statistical significance
  effectSize?: number; // Cohen's d for reward difference
}

export interface ABTestResult {
  modelA: {
    name: string;
    metrics: EvaluationResult;
    sampleCount: number;
  };
  modelB: {
    name: string;
    metrics: EvaluationResult;
    sampleCount: number;
  };
  winner: 'A' | 'B' | 'tie';
  pValue: number;
  confidenceLevel: number;
  details: {
    rewardDifference: number;
    accuracyDifference: number;
    effectSize: number;
    recommendation: string;
  };
}

// =============================================================================
// POLICY EVALUATION
// =============================================================================

/**
 * Evaluate a policy on a test dataset
 *
 * Measures:
 * - Accuracy: How often policy agrees with ground truth
 * - Precision/Recall/F1: Per-class performance
 * - Reward: Average reward achieved
 * - Confusion matrix: Where policy makes mistakes
 */
export async function evaluatePolicy<TState, TAction>(
  policy: IPolicy<TState, TAction>,
  testData: Array<{ state: TState; expectedAction: TAction; reward: number }>
): Promise<EvaluationResult> {
  if (testData.length === 0) {
    throw createValidationError('testData', 'is empty');
  }

  let correct = 0;
  let total = 0;
  const rewards: number[] = [];
  const confusion: Record<string, Record<string, number>> = {};

  // Track per-class stats for precision/recall
  const truePositives: Record<string, number> = {};
  const falsePositives: Record<string, number> = {};
  const falseNegatives: Record<string, number> = {};
  const support: Record<string, number> = {};

  for (const example of testData) {
    const decision = await policy.decideWithFallback(example.state);
    const predicted = serializeAction(decision.action);
    const expected = serializeAction(example.expectedAction);

    // Update confusion matrix
    if (!confusion[expected]) {
      confusion[expected] = {};
    }
    confusion[expected][predicted] = (confusion[expected][predicted] ?? 0) + 1;

    // Update counts
    if (predicted === expected) {
      correct++;
      truePositives[expected] = (truePositives[expected] ?? 0) + 1;
    } else {
      falsePositives[predicted] = (falsePositives[predicted] ?? 0) + 1;
      falseNegatives[expected] = (falseNegatives[expected] ?? 0) + 1;
    }

    support[expected] = (support[expected] ?? 0) + 1;
    total++;
    rewards.push(example.reward);
  }

  // Compute overall metrics
  const accuracy = correct / total;

  // Compute weighted precision, recall, F1
  let weightedPrecision = 0;
  let weightedRecall = 0;
  const perClassMetrics: Record<
    string,
    { precision: number; recall: number; f1: number; support: number }
  > = {};

  for (const cls of Object.keys(support)) {
    const tp = truePositives[cls] ?? 0;
    const fp = falsePositives[cls] ?? 0;
    const fn = falseNegatives[cls] ?? 0;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    const supportCount = support[cls];
    if (supportCount === undefined) continue;

    const weight = supportCount / total;
    weightedPrecision += precision * weight;
    weightedRecall += recall * weight;

    perClassMetrics[cls] = {
      precision,
      recall,
      f1,
      support: supportCount,
    };
  }

  const f1 =
    weightedPrecision + weightedRecall > 0
      ? (2 * weightedPrecision * weightedRecall) / (weightedPrecision + weightedRecall)
      : 0;

  // Compute reward statistics
  const avgReward = rewards.reduce((a, b) => a + b, 0) / rewards.length;
  const variance = rewards.reduce((a, b) => a + (b - avgReward) ** 2, 0) / rewards.length;

  return {
    accuracy,
    precision: weightedPrecision,
    recall: weightedRecall,
    f1,
    avgReward,
    rewardStdDev: Math.sqrt(variance),
    confusionMatrix: confusion,
    perClassMetrics,
  };
}

/**
 * Evaluate policy on a dataset (convenience wrapper)
 */
export async function evaluatePolicyOnDataset<TState, TAction>(
  policy: IPolicy<TState, TAction>,
  dataset: Dataset<{ state: TState; action: TAction; reward: number }>
): Promise<EvaluationResult> {
  const testData = dataset.eval.map((ex) => ({
    state: ex.state,
    expectedAction: ex.action,
    reward: ex.reward,
  }));

  return evaluatePolicy(policy, testData);
}

// =============================================================================
// POLICY COMPARISON
// =============================================================================

/**
 * Compare two policies on the same dataset
 *
 * Useful for A/B testing or validating improvements.
 * Returns which policy performs better based on average reward.
 */
export async function comparePolicies<TState, TAction>(
  policyA: IPolicy<TState, TAction>,
  policyB: IPolicy<TState, TAction>,
  testData: Array<{ state: TState; expectedAction: TAction; reward: number }>
): Promise<ComparisonResult> {
  // Evaluate both policies
  const resultA = await evaluatePolicy(policyA, testData);
  const resultB = await evaluatePolicy(policyB, testData);

  // Determine winner based on average reward
  // Use a threshold to avoid declaring a winner for tiny differences
  const SIGNIFICANCE_THRESHOLD = 0.05;
  let winner: 'A' | 'B' | 'tie' = 'tie';

  if (resultA.avgReward > resultB.avgReward + SIGNIFICANCE_THRESHOLD) {
    winner = 'A';
  } else if (resultB.avgReward > resultA.avgReward + SIGNIFICANCE_THRESHOLD) {
    winner = 'B';
  }

  // Compute improvements (B vs A)
  const improvements = {
    accuracy: resultB.accuracy - resultA.accuracy,
    avgReward: resultB.avgReward - resultA.avgReward,
    f1: resultB.f1 - resultA.f1,
  };

  return {
    policyA: resultA,
    policyB: resultB,
    winner,
    improvements,
  };
}

/**
 * Compare policy against baseline on dataset
 */
export async function comparePolicyAgainstBaseline<TState, TAction>(
  policy: IPolicy<TState, TAction>,
  baselinePolicy: IPolicy<TState, TAction>,
  dataset: Dataset<{ state: TState; action: TAction; reward: number }>
): Promise<ComparisonResult> {
  const testData = dataset.eval.map((ex) => ({
    state: ex.state,
    expectedAction: ex.action,
    reward: ex.reward,
  }));

  return comparePolicies(baselinePolicy, policy, testData);
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Serialize action for comparison
 *
 * Converts action to a deterministic string representation.
 * Used for computing accuracy and confusion matrix.
 */
function serializeAction<TAction>(action: TAction): string {
  // Sort object keys for deterministic serialization
  return JSON.stringify(action, Object.keys(action as object).sort());
}

/**
 * Compute confidence interval for metric
 *
 * Uses bootstrap resampling to estimate confidence interval.
 */
export function computeConfidenceInterval(
  values: number[],
  confidence: number = 0.95,
  numBootstrap: number = 1000
): { mean: number; lower: number; upper: number } {
  if (values.length === 0) {
    return { mean: 0, lower: 0, upper: 0 };
  }

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;

  // Bootstrap resampling
  const bootstrapMeans: number[] = [];
  for (let i = 0; i < numBootstrap; i++) {
    const sample = Array.from({ length: n }, () => {
      const val = values[Math.floor(Math.random() * n)];
      return val ?? 0;
    });
    const sampleMean = sample.reduce((a, b) => a + b, 0) / n;
    bootstrapMeans.push(sampleMean);
  }

  // Sort and find percentiles
  bootstrapMeans.sort((a, b) => a - b);
  const alpha = 1 - confidence;
  const lowerIdx = Math.floor(numBootstrap * (alpha / 2));
  const upperIdx = Math.floor(numBootstrap * (1 - alpha / 2));

  return {
    mean,
    lower: bootstrapMeans[lowerIdx] ?? mean,
    upper: bootstrapMeans[upperIdx] ?? mean,
  };
}

/**
 * Format evaluation result as a human-readable report
 */
export function formatEvaluationReport(result: EvaluationResult): string {
  const lines: string[] = [];

  lines.push('Policy Evaluation Report');
  lines.push('='.repeat(50));
  lines.push('');

  lines.push('Overall Metrics:');
  lines.push(`  Accuracy:  ${(result.accuracy * 100).toFixed(2)}%`);
  lines.push(`  Precision: ${(result.precision * 100).toFixed(2)}%`);
  lines.push(`  Recall:    ${(result.recall * 100).toFixed(2)}%`);
  lines.push(`  F1 Score:  ${(result.f1 * 100).toFixed(2)}%`);
  lines.push('');

  lines.push('Reward Statistics:');
  lines.push(`  Mean:   ${result.avgReward.toFixed(4)}`);
  lines.push(`  Std Dev: ${result.rewardStdDev.toFixed(4)}`);
  lines.push('');

  if (result.perClassMetrics) {
    lines.push('Per-Class Metrics:');
    for (const [cls, metrics] of Object.entries(result.perClassMetrics)) {
      lines.push(`  ${cls}:`);
      lines.push(`    Precision: ${(metrics.precision * 100).toFixed(2)}%`);
      lines.push(`    Recall:    ${(metrics.recall * 100).toFixed(2)}%`);
      lines.push(`    F1:        ${(metrics.f1 * 100).toFixed(2)}%`);
      lines.push(`    Support:   ${metrics.support}`);
    }
    lines.push('');
  }

  lines.push('Confusion Matrix:');
  const classes = Object.keys(result.confusionMatrix).sort();
  if (classes.length > 0) {
    // Header
    lines.push('  Predicted →');
    lines.push(`  Actual ↓     ${classes.map((c) => c.padEnd(12)).join(' ')}`);

    // Rows
    for (const actual of classes) {
      const row = classes.map((pred) => {
        const count = result.confusionMatrix[actual]?.[pred] ?? 0;
        return count.toString().padEnd(12);
      });
      lines.push(`  ${actual.padEnd(12)} ${row.join(' ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format comparison result as a human-readable report
 */
export function formatComparisonReport(
  result: ComparisonResult,
  nameA: string = 'Policy A',
  nameB: string = 'Policy B'
): string {
  const lines: string[] = [];

  lines.push('Policy Comparison Report');
  lines.push('='.repeat(50));
  lines.push('');

  lines.push(`${nameA} vs ${nameB}`);
  lines.push(`Winner: ${result.winner === 'A' ? nameA : result.winner === 'B' ? nameB : 'Tie'}`);
  lines.push('');

  lines.push('Improvements (B - A):');
  lines.push(
    `  Accuracy:   ${result.improvements.accuracy >= 0 ? '+' : ''}${(result.improvements.accuracy * 100).toFixed(2)}%`
  );
  lines.push(
    `  Avg Reward: ${result.improvements.avgReward >= 0 ? '+' : ''}${result.improvements.avgReward.toFixed(4)}`
  );
  lines.push(
    `  F1 Score:   ${result.improvements.f1 >= 0 ? '+' : ''}${(result.improvements.f1 * 100).toFixed(2)}%`
  );
  lines.push('');

  lines.push(`${nameA} Metrics:`);
  lines.push(`  Accuracy:   ${(result.policyA.accuracy * 100).toFixed(2)}%`);
  lines.push(`  Avg Reward: ${result.policyA.avgReward.toFixed(4)}`);
  lines.push(`  F1 Score:   ${(result.policyA.f1 * 100).toFixed(2)}%`);
  lines.push('');

  lines.push(`${nameB} Metrics:`);
  lines.push(`  Accuracy:   ${(result.policyB.accuracy * 100).toFixed(2)}%`);
  lines.push(`  Avg Reward: ${result.policyB.avgReward.toFixed(4)}`);
  lines.push(`  F1 Score:   ${(result.policyB.f1 * 100).toFixed(2)}%`);

  return lines.join('\n');
}

// =============================================================================
// MODEL EVALUATION (LoadedModel support)
// =============================================================================

/**
 * PolicyEvaluator class for evaluating loaded models
 *
 * Provides advanced evaluation capabilities:
 * - Model evaluation on held-out data
 * - Baseline comparison (rule-based vs learned)
 * - A/B testing with statistical significance
 * - Reward distribution analysis
 * - Temporal tracking
 */
export class PolicyEvaluator {
  /**
   * Evaluate a loaded model on held-out evaluation data
   *
   * @param model - Loaded model to evaluate
   * @param evalData - Evaluation dataset
   * @returns Extended evaluation result with baseline comparison
   */
  async evaluate<TState, TAction>(
    _model: LoadedModel,
    _evalData: Array<{ state: TState; action: TAction; reward: number }>
  ): Promise<ExtendedEvaluationResult> {
    // For now, we assume the model has a corresponding policy implementation
    // In a real implementation, this would load the model weights and run inference
    throw createNotFoundError('model inference', 'not yet implemented');
  }

  /**
   * Compare two loaded models on the same dataset
   *
   * Performs statistical significance testing to determine if differences are meaningful.
   *
   * @param modelA - First model
   * @param modelB - Second model
   * @param data - Evaluation data
   * @returns Comparison result with statistical significance
   */
  async compare<TState, TAction>(
    modelA: LoadedModel,
    modelB: LoadedModel,
    data: Array<{ state: TState; action: TAction; reward: number }>
  ): Promise<{
    winner: 'A' | 'B' | 'tie';
    pValue: number;
    details: {
      modelA: ExtendedEvaluationResult;
      modelB: ExtendedEvaluationResult;
      rewardDifference: number;
      accuracyDifference: number;
      effectSize: number;
    };
  }> {
    // Evaluate both models
    const resultA = await this.evaluate<TState, TAction>(modelA, data);
    const resultB = await this.evaluate<TState, TAction>(modelB, data);

    // Compute statistical significance (t-test on rewards)
    const pValue = computeTTestPValue(
      data.map((d) => d.reward),
      data.map((d) => d.reward)
    );

    // Compute effect size (Cohen's d)
    const effectSize = computeCohenD(
      resultA.metrics.avgReward,
      resultB.metrics.avgReward,
      resultA.metrics.rewardStdDev,
      resultB.metrics.rewardStdDev
    );

    // Determine winner
    const SIGNIFICANCE_THRESHOLD = 0.05;
    let winner: 'A' | 'B' | 'tie' = 'tie';

    if (pValue < SIGNIFICANCE_THRESHOLD) {
      winner = resultB.metrics.avgReward > resultA.metrics.avgReward ? 'B' : 'A';
    }

    return {
      winner,
      pValue,
      details: {
        modelA: resultA,
        modelB: resultB,
        rewardDifference: resultB.metrics.avgReward - resultA.metrics.avgReward,
        accuracyDifference: resultB.metrics.accuracy - resultA.metrics.accuracy,
        effectSize,
      },
    };
  }

  /**
   * Run A/B test simulation with traffic split
   *
   * Simulates deploying two models with specified traffic split and
   * evaluates performance on randomly assigned subsets.
   *
   * @param modelA - First model
   * @param modelB - Second model
   * @param data - Evaluation data
   * @param splitRatio - Traffic split ratio (0-1, default 0.5 for 50/50)
   * @returns A/B test result with recommendations
   */
  async abTest<TState, TAction>(
    modelA: LoadedModel,
    modelB: LoadedModel,
    data: Array<{ state: TState; action: TAction; reward: number }>,
    splitRatio: number = 0.5
  ): Promise<ABTestResult> {
    // Validate split ratio
    if (splitRatio < 0 || splitRatio > 1) {
      throw createValidationError('splitRatio', 'must be between 0 and 1');
    }

    // Randomly assign data to groups
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    const splitIdx = Math.floor(shuffled.length * splitRatio);
    const groupA = shuffled.slice(0, splitIdx);
    const groupB = shuffled.slice(splitIdx);

    // Evaluate on respective groups
    const resultA = await this.evaluate<TState, TAction>(modelA, groupA);
    const resultB = await this.evaluate<TState, TAction>(modelB, groupB);

    // Compute statistical significance
    const pValue = computeTTestPValue(
      groupA.map((d) => d.reward),
      groupB.map((d) => d.reward)
    );

    const effectSize = computeCohenD(
      resultA.metrics.avgReward,
      resultB.metrics.avgReward,
      resultA.metrics.rewardStdDev,
      resultB.metrics.rewardStdDev
    );

    // Determine winner
    const confidenceLevel = 1 - pValue;
    const SIGNIFICANCE_THRESHOLD = 0.05;
    let winner: 'A' | 'B' | 'tie' = 'tie';

    if (pValue < SIGNIFICANCE_THRESHOLD) {
      winner = resultB.metrics.avgReward > resultA.metrics.avgReward ? 'B' : 'A';
    }

    // Generate recommendation
    let recommendation: string;
    if (winner === 'tie') {
      recommendation = 'No significant difference detected. Continue monitoring.';
    } else if (winner === 'A') {
      recommendation = `Model A performs significantly better. Consider rolling out to 100% traffic.`;
    } else {
      recommendation = `Model B performs significantly better. Consider rolling out to 100% traffic.`;
    }

    if (effectSize < 0.2) {
      recommendation += ' Note: Effect size is small - practical significance may be limited.';
    }

    return {
      modelA: {
        name: `${modelA.policyType}-v${modelA.version}`,
        metrics: resultA,
        sampleCount: groupA.length,
      },
      modelB: {
        name: `${modelB.policyType}-v${modelB.version}`,
        metrics: resultB,
        sampleCount: groupB.length,
      },
      winner,
      pValue,
      confidenceLevel,
      details: {
        rewardDifference: resultB.metrics.avgReward - resultA.metrics.avgReward,
        accuracyDifference: resultB.metrics.accuracy - resultA.metrics.accuracy,
        effectSize,
        recommendation,
      },
    };
  }
}

// =============================================================================
// REWARD DISTRIBUTION ANALYSIS
// =============================================================================

/**
 * Compute reward distribution statistics
 *
 * Analyzes the distribution of rewards to understand:
 * - Central tendency (mean, median)
 * - Spread (std dev, quartiles)
 * - Shape (histogram)
 */
export function computeRewardDistribution(rewards: number[]): RewardDistribution {
  if (rewards.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      quartiles: { q1: 0, q2: 0, q3: 0 },
      histogram: [],
    };
  }

  // Sort for percentile calculations
  const sorted = [...rewards].sort((a, b) => a - b);

  // Basic statistics
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

  // Variance and standard deviation
  const variance = rewards.reduce((a, b) => a + (b - mean) ** 2, 0) / rewards.length;
  const stdDev = Math.sqrt(variance);

  // Quartiles
  const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const q2 = median;
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;

  // Histogram (10 bins)
  const numBins = 10;
  const binWidth = (max - min) / numBins;
  const bins: Array<{ bin: string; count: number; percentage: number }> = [];

  for (let i = 0; i < numBins; i++) {
    const binStart = min + i * binWidth;
    const binEnd = min + (i + 1) * binWidth;
    const count = rewards.filter((r) => r >= binStart && (i === numBins - 1 ? r <= binEnd : r < binEnd)).length;

    bins.push({
      bin: `[${binStart.toFixed(2)}, ${binEnd.toFixed(2)}${i === numBins - 1 ? ']' : ')'}`,
      count,
      percentage: (count / rewards.length) * 100,
    });
  }

  return {
    min,
    max,
    mean,
    median,
    stdDev,
    quartiles: { q1, q2, q3 },
    histogram: bins,
  };
}

// =============================================================================
// TEMPORAL ANALYSIS
// =============================================================================

/**
 * Compute temporal metrics to track improvement over time
 *
 * Splits data into time windows and tracks performance trends.
 *
 * @param data - Evaluation data with timestamps
 * @param windowSize - Window size in milliseconds (default: 7 days)
 * @returns Temporal metrics with trend analysis
 */
export function computeTemporalMetrics<TState, TAction>(
  data: Array<{
    state: TState;
    action: TAction;
    reward: number;
    timestamp?: string;
  }>,
  windowSize: number = 7 * 24 * 60 * 60 * 1000 // 7 days
): TemporalMetrics {
  // Filter data with timestamps
  const timestampedData = data.filter((d) => d.timestamp);

  if (timestampedData.length === 0) {
    return {
      timeWindow: 'N/A',
      windows: [],
      trend: 'stable',
    };
  }

  // Sort by timestamp
  const sorted = timestampedData.sort((a, b) => {
    const timeA = new Date(a.timestamp ?? 0).getTime();
    const timeB = new Date(b.timestamp ?? 0).getTime();
    return timeA - timeB;
  });

  // Determine time range
  const startTime = new Date(sorted[0]?.timestamp ?? 0).getTime();
  const endTime = new Date(sorted[sorted.length - 1]?.timestamp ?? 0).getTime();
  const numWindows = Math.ceil((endTime - startTime) / windowSize);

  // Compute metrics for each window
  const windows: TemporalMetrics['windows'] = [];

  for (let i = 0; i < numWindows; i++) {
    const windowStart = startTime + i * windowSize;
    const windowEnd = windowStart + windowSize;

    const windowData = sorted.filter((d) => {
      const timestamp = new Date(d.timestamp ?? 0).getTime();
      return timestamp >= windowStart && timestamp < windowEnd;
    });

    if (windowData.length === 0) continue;

    // Compute metrics for this window
    const rewards = windowData.map((d) => d.reward);
    const avgReward = rewards.reduce((a, b) => a + b, 0) / rewards.length;

    // Compute accuracy as proportion of positive rewards (reward > 0 indicates success)
    // This is a proxy metric since we don't have ground truth labels
    const positiveRewards = rewards.filter((r) => r > 0).length;
    const accuracy = positiveRewards / rewards.length;

    windows.push({
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(windowEnd).toISOString(),
      accuracy,
      avgReward,
      sampleCount: windowData.length,
    });
  }

  // Compute trend
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  let improvementRate: number | undefined;

  if (windows.length >= 2) {
    // Linear regression on average rewards
    const rewardTrend = windows.map((w) => w.avgReward);
    const slope = computeLinearRegressionSlope(rewardTrend);

    if (slope > 0.01) {
      trend = 'improving';
      improvementRate = slope;
    } else if (slope < -0.01) {
      trend = 'declining';
      improvementRate = slope;
    }
  }

  return {
    timeWindow: `${windowSize / (24 * 60 * 60 * 1000)} days`,
    windows,
    trend,
    improvementRate,
  };
}

// =============================================================================
// STATISTICAL UTILITIES
// =============================================================================

/**
 * Compute t-test p-value for two samples
 *
 * Uses Welch's t-test for unequal variances.
 */
function computeTTestPValue(sample1: number[], sample2: number[]): number {
  if (sample1.length === 0 || sample2.length === 0) {
    return 1.0; // No significant difference
  }

  // Compute means
  const mean1 = sample1.reduce((a, b) => a + b, 0) / sample1.length;
  const mean2 = sample2.reduce((a, b) => a + b, 0) / sample2.length;

  // Compute variances
  const var1 = sample1.reduce((a, b) => a + (b - mean1) ** 2, 0) / (sample1.length - 1);
  const var2 = sample2.reduce((a, b) => a + (b - mean2) ** 2, 0) / (sample2.length - 1);

  // Welch's t-statistic
  const t = (mean1 - mean2) / Math.sqrt(var1 / sample1.length + var2 / sample2.length);

  // Degrees of freedom (Welch-Satterthwaite)
  const df =
    (var1 / sample1.length + var2 / sample2.length) ** 2 /
    ((var1 / sample1.length) ** 2 / (sample1.length - 1) +
      (var2 / sample2.length) ** 2 / (sample2.length - 1));

  // Approximate p-value (two-tailed)
  // This is a simplified approximation - for production use a proper stats library
  const pValue = 2 * (1 - approximateTCDF(Math.abs(t), df));

  return pValue;
}

/**
 * Approximate cumulative distribution function for t-distribution
 * Simplified approximation - for production use a proper stats library
 */
function approximateTCDF(t: number, df: number): number {
  // Use normal approximation for large df
  if (df > 30) {
    return approximateNormalCDF(t);
  }

  // Simplified approximation for small df
  // This is NOT accurate - use a real stats library in production
  return approximateNormalCDF(t * Math.sqrt(df / (df + t * t)));
}

/**
 * Approximate cumulative distribution function for standard normal
 */
function approximateNormalCDF(z: number): number {
  // Abramowitz and Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return z > 0 ? 1 - p : p;
}

/**
 * Compute Cohen's d effect size
 */
function computeCohenD(
  mean1: number,
  mean2: number,
  stdDev1: number,
  stdDev2: number
): number {
  const pooledStdDev = Math.sqrt((stdDev1 ** 2 + stdDev2 ** 2) / 2);
  return (mean2 - mean1) / pooledStdDev;
}

/**
 * Compute slope of linear regression
 */
function computeLinearRegressionSlope(values: number[]): number {
  if (values.length < 2) return 0;

  const n = values.length;
  const xMean = (n - 1) / 2; // x values are 0, 1, 2, ..., n-1
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const val = values[i];
    if (val === undefined) continue;
    numerator += (i - xMean) * (val - yMean);
    denominator += (i - xMean) ** 2;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Format A/B test result as human-readable report
 */
export function formatABTestReport(result: ABTestResult): string {
  const lines: string[] = [];

  lines.push('A/B Test Report');
  lines.push('='.repeat(50));
  lines.push('');

  lines.push(`Model A: ${result.modelA.name} (${result.modelA.sampleCount} samples)`);
  lines.push(`Model B: ${result.modelB.name} (${result.modelB.sampleCount} samples)`);
  lines.push('');

  lines.push(`Winner: ${result.winner === 'tie' ? 'No clear winner' : `Model ${result.winner}`}`);
  lines.push(`Confidence: ${(result.confidenceLevel * 100).toFixed(2)}%`);
  lines.push(`P-value: ${result.pValue.toFixed(4)}`);
  lines.push('');

  lines.push('Performance Differences:');
  lines.push(
    `  Reward:   ${result.details.rewardDifference >= 0 ? '+' : ''}${result.details.rewardDifference.toFixed(4)}`
  );
  lines.push(
    `  Accuracy: ${result.details.accuracyDifference >= 0 ? '+' : ''}${(result.details.accuracyDifference * 100).toFixed(2)}%`
  );
  lines.push(`  Effect Size: ${result.details.effectSize.toFixed(3)} (Cohen's d)`);
  lines.push('');

  lines.push('Recommendation:');
  lines.push(`  ${result.details.recommendation}`);

  return lines.join('\n');
}
