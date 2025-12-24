/**
 * Policy Evaluation
 *
 * Metrics and utilities for evaluating RL policy performance.
 * Compares policy decisions against test data and ground truth.
 */

import type { Dataset } from './dataset-builder.js';
import type { IPolicy } from '../policies/base.policy.js';

// =============================================================================
// TYPES
// =============================================================================

export interface EvaluationResult {
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
    throw new Error('Test data is empty');
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
