/**
 * Classification Quality Evaluator
 *
 * Calculates accuracy, precision, recall, F1, and other metrics
 * for classification benchmark results.
 */

import type {
  EntryType,
  ClassificationTestCase,
  ClassificationTestResult,
  TypeMetrics,
  AggregatedClassificationMetrics,
  ConfusionMatrixEntry,
  ClassificationCategory,
} from './classification-quality-types.js';

/**
 * Calculate metrics for a single entry type
 */
function calculateTypeMetrics(
  results: ClassificationTestResult[],
  targetType: EntryType
): TypeMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const result of results) {
    const actualIsTarget = result.expectedType === targetType;
    const predictedIsTarget = result.predictedType === targetType;

    if (actualIsTarget && predictedIsTarget) {
      tp++;
    } else if (!actualIsTarget && predictedIsTarget) {
      fp++;
    } else if (actualIsTarget && !predictedIsTarget) {
      fn++;
    } else {
      tn++;
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { tp, fp, fn, tn, precision, recall, f1 };
}

/**
 * Build confusion matrix from results
 */
function buildConfusionMatrix(results: ClassificationTestResult[]): ConfusionMatrixEntry[] {
  const matrix: Map<string, number> = new Map();
  const types: EntryType[] = ['guideline', 'knowledge', 'tool'];

  // Initialize all combinations
  for (const actual of types) {
    for (const predicted of types) {
      matrix.set(`${actual}-${predicted}`, 0);
    }
  }

  // Count occurrences
  for (const result of results) {
    const key = `${result.expectedType}-${result.predictedType}`;
    matrix.set(key, (matrix.get(key) ?? 0) + 1);
  }

  // Convert to entries
  const entries: ConfusionMatrixEntry[] = [];
  for (const actual of types) {
    for (const predicted of types) {
      entries.push({
        actual,
        predicted,
        count: matrix.get(`${actual}-${predicted}`) ?? 0,
      });
    }
  }

  return entries;
}

/**
 * Calculate aggregated metrics from test results
 */
export function calculateAggregatedMetrics(
  results: ClassificationTestResult[]
): AggregatedClassificationMetrics {
  const validResults = results.filter(r => !r.error);
  const errorCount = results.length - validResults.length;

  // Basic counts
  const totalTestCases = results.length;
  const correctCount = validResults.filter(r => r.correct).length;
  const correctWithAlternativesCount = validResults.filter(r => r.correctWithAlternatives).length;

  const accuracy = validResults.length > 0 ? correctCount / validResults.length : 0;
  const accuracyWithAlternatives = validResults.length > 0
    ? correctWithAlternativesCount / validResults.length
    : 0;

  // By type metrics
  const types: EntryType[] = ['guideline', 'knowledge', 'tool'];
  const byType = {} as Record<EntryType, TypeMetrics>;
  for (const type of types) {
    byType[type] = calculateTypeMetrics(validResults, type);
  }

  // By category metrics
  const categories = new Set(validResults.map(r => r.category));
  const byCategory = {} as Record<ClassificationCategory, {
    count: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
  }>;

  for (const category of categories) {
    const categoryResults = validResults.filter(r => r.category === category);
    const correct = categoryResults.filter(r => r.correct).length;
    const avgConfidence = categoryResults.reduce((sum, r) => sum + r.confidence, 0) / categoryResults.length;

    byCategory[category] = {
      count: categoryResults.length,
      correct,
      accuracy: categoryResults.length > 0 ? correct / categoryResults.length : 0,
      avgConfidence,
    };
  }

  // By difficulty metrics
  const difficulties: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];
  const byDifficulty = {} as Record<'easy' | 'medium' | 'hard', {
    count: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
  }>;

  for (const difficulty of difficulties) {
    const diffResults = validResults.filter(r => r.difficulty === difficulty);
    const correct = diffResults.filter(r => r.correct).length;
    const avgConfidence = diffResults.length > 0
      ? diffResults.reduce((sum, r) => sum + r.confidence, 0) / diffResults.length
      : 0;

    byDifficulty[difficulty] = {
      count: diffResults.length,
      correct,
      accuracy: diffResults.length > 0 ? correct / diffResults.length : 0,
      avgConfidence,
    };
  }

  // Confidence correlation
  const correctResults = validResults.filter(r => r.correct);
  const incorrectResults = validResults.filter(r => !r.correct);

  const avgConfidenceCorrect = correctResults.length > 0
    ? correctResults.reduce((sum, r) => sum + r.confidence, 0) / correctResults.length
    : 0;

  const avgConfidenceIncorrect = incorrectResults.length > 0
    ? incorrectResults.reduce((sum, r) => sum + r.confidence, 0) / incorrectResults.length
    : 0;

  const highConfidenceResults = validResults.filter(r => r.confidence > 0.8);
  const highConfidenceAccuracy = highConfidenceResults.length > 0
    ? highConfidenceResults.filter(r => r.correct).length / highConfidenceResults.length
    : 0;

  const lowConfidenceResults = validResults.filter(r => r.confidence < 0.6);
  const lowConfidenceAccuracy = lowConfidenceResults.length > 0
    ? lowConfidenceResults.filter(r => r.correct).length / lowConfidenceResults.length
    : 0;

  // Processing stats
  const processingTimes = validResults.map(r => r.processingTimeMs);
  const totalTimeMs = processingTimes.reduce((sum, t) => sum + t, 0);

  return {
    totalTestCases,
    correctCount,
    accuracy,
    correctWithAlternativesCount,
    accuracyWithAlternatives,
    errorCount,
    byType,
    byCategory,
    byDifficulty,
    confidenceCorrelation: {
      avgConfidenceCorrect,
      avgConfidenceIncorrect,
      highConfidenceAccuracy,
      lowConfidenceAccuracy,
    },
    confusionMatrix: buildConfusionMatrix(validResults),
    processing: {
      totalTimeMs,
      avgTimePerClassification: validResults.length > 0 ? totalTimeMs / validResults.length : 0,
      minTimeMs: processingTimes.length > 0 ? Math.min(...processingTimes) : 0,
      maxTimeMs: processingTimes.length > 0 ? Math.max(...processingTimes) : 0,
    },
  };
}

/**
 * Format metrics for console output
 */
export function formatMetricsReport(metrics: AggregatedClassificationMetrics): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push('                    CLASSIFICATION QUALITY REPORT                       ');
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push('');

  // Overall
  lines.push('OVERALL METRICS');
  lines.push('───────────────────────────────────────────────────────────────────────');
  lines.push(`  Total Test Cases:      ${metrics.totalTestCases}`);
  lines.push(`  Correct:               ${metrics.correctCount} (${(metrics.accuracy * 100).toFixed(1)}%)`);
  lines.push(`  Correct (w/ alts):     ${metrics.correctWithAlternativesCount} (${(metrics.accuracyWithAlternatives * 100).toFixed(1)}%)`);
  lines.push(`  Errors:                ${metrics.errorCount}`);
  lines.push('');

  // By type
  lines.push('METRICS BY TYPE');
  lines.push('───────────────────────────────────────────────────────────────────────');
  lines.push('  Type       | Precision | Recall | F1    | TP | FP | FN');
  lines.push('  -----------|-----------|--------|-------|----|----|----');
  for (const [type, m] of Object.entries(metrics.byType)) {
    lines.push(
      `  ${type.padEnd(10)} | ${(m.precision * 100).toFixed(1).padStart(8)}% | ${(m.recall * 100).toFixed(1).padStart(5)}% | ${m.f1.toFixed(3).padStart(5)} | ${String(m.tp).padStart(2)} | ${String(m.fp).padStart(2)} | ${String(m.fn).padStart(2)}`
    );
  }
  lines.push('');

  // By difficulty
  lines.push('METRICS BY DIFFICULTY');
  lines.push('───────────────────────────────────────────────────────────────────────');
  lines.push('  Difficulty | Count | Correct | Accuracy | Avg Conf');
  lines.push('  -----------|-------|---------|----------|----------');
  for (const [diff, m] of Object.entries(metrics.byDifficulty)) {
    lines.push(
      `  ${diff.padEnd(10)} | ${String(m.count).padStart(5)} | ${String(m.correct).padStart(7)} | ${(m.accuracy * 100).toFixed(1).padStart(7)}% | ${(m.avgConfidence * 100).toFixed(1).padStart(7)}%`
    );
  }
  lines.push('');

  // Confidence correlation
  lines.push('CONFIDENCE CORRELATION');
  lines.push('───────────────────────────────────────────────────────────────────────');
  lines.push(`  Avg Confidence (Correct):    ${(metrics.confidenceCorrelation.avgConfidenceCorrect * 100).toFixed(1)}%`);
  lines.push(`  Avg Confidence (Incorrect):  ${(metrics.confidenceCorrelation.avgConfidenceIncorrect * 100).toFixed(1)}%`);
  lines.push(`  High Confidence (>80%) Acc:  ${(metrics.confidenceCorrelation.highConfidenceAccuracy * 100).toFixed(1)}%`);
  lines.push(`  Low Confidence (<60%) Acc:   ${(metrics.confidenceCorrelation.lowConfidenceAccuracy * 100).toFixed(1)}%`);
  lines.push('');

  // Confusion matrix
  lines.push('CONFUSION MATRIX');
  lines.push('───────────────────────────────────────────────────────────────────────');
  lines.push('                      PREDICTED');
  lines.push('            | guideline | knowledge | tool');
  lines.push('  ----------|-----------|-----------|------');

  const types: Array<'guideline' | 'knowledge' | 'tool'> = ['guideline', 'knowledge', 'tool'];
  for (const actual of types) {
    const row: number[] = [];
    for (const predicted of types) {
      const entry = metrics.confusionMatrix.find(
        e => e.actual === actual && e.predicted === predicted
      );
      row.push(entry?.count ?? 0);
    }
    lines.push(
      `  ${actual.padEnd(9)} | ${String(row[0]).padStart(9)} | ${String(row[1]).padStart(9)} | ${String(row[2]).padStart(4)}`
    );
  }
  lines.push('');

  // Processing
  lines.push('PROCESSING STATS');
  lines.push('───────────────────────────────────────────────────────────────────────');
  lines.push(`  Total Time:     ${metrics.processing.totalTimeMs.toFixed(2)}ms`);
  lines.push(`  Avg per Query:  ${metrics.processing.avgTimePerClassification.toFixed(3)}ms`);
  lines.push(`  Min Time:       ${metrics.processing.minTimeMs.toFixed(3)}ms`);
  lines.push(`  Max Time:       ${metrics.processing.maxTimeMs.toFixed(3)}ms`);
  lines.push('');

  // By category (summary)
  lines.push('METRICS BY CATEGORY');
  lines.push('───────────────────────────────────────────────────────────────────────');
  const sortedCategories = Object.entries(metrics.byCategory)
    .sort(([, a], [, b]) => b.accuracy - a.accuracy);

  for (const [cat, m] of sortedCategories) {
    lines.push(
      `  ${cat.padEnd(20)} | ${m.correct}/${m.count} (${(m.accuracy * 100).toFixed(0)}%) | conf: ${(m.avgConfidence * 100).toFixed(0)}%`
    );
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Run a single test case against a classifier
 */
export async function runTestCase(
  testCase: ClassificationTestCase,
  classifier: { classify(text: string): Promise<{ type: string; confidence: number; method: string }> }
): Promise<ClassificationTestResult> {
  const start = performance.now();

  try {
    const result = await classifier.classify(testCase.text);
    const elapsed = performance.now() - start;

    const predictedType = result.type as EntryType;
    const correct = predictedType === testCase.expectedType;
    const correctWithAlternatives = correct ||
      (testCase.acceptableAlternatives?.includes(predictedType) ?? false);

    return {
      testCaseId: testCase.id,
      text: testCase.text,
      expectedType: testCase.expectedType,
      predictedType,
      confidence: result.confidence,
      method: result.method,
      correct,
      correctWithAlternatives,
      category: testCase.category,
      difficulty: testCase.difficulty,
      processingTimeMs: elapsed,
    };
  } catch (error) {
    const elapsed = performance.now() - start;
    return {
      testCaseId: testCase.id,
      text: testCase.text,
      expectedType: testCase.expectedType,
      predictedType: 'knowledge', // default
      confidence: 0,
      method: 'error',
      correct: false,
      correctWithAlternatives: false,
      category: testCase.category,
      difficulty: testCase.difficulty,
      processingTimeMs: elapsed,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
