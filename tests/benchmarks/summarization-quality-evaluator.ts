/**
 * Summarization Quality Evaluator
 *
 * Evaluates summarization quality using ROUGE, BERTScore, and Groundedness.
 * Tests the hierarchical summarization feature.
 */

import type { EmbeddingService } from '../../src/services/embedding.service.js';
import {
  calculateROUGE,
  BERTScoreEvaluator,
  GroundednessEvaluator,
  tokenize,
} from './metrics/index.js';
import type {
  SummarizationTestCase,
  SummarizationTestResult,
  AggregatedSummarizationMetrics,
  SummarizationBenchmarkResults,
  SummarizationTestCategory,
} from './summarization-quality-types.js';
import { SUMMARIZATION_CATEGORY_NAMES } from './summarization-quality-types.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Summarization function signature
 */
export type SummarizeFn = (sourceContents: string[]) => Promise<string>;

/**
 * Evaluation configuration
 */
export interface SummarizationEvalConfig {
  /** Embedding service for semantic metrics */
  embeddingService: EmbeddingService;
  /** Groundedness threshold (default: 0.7) */
  groundednessThreshold?: number;
  /** Enable BERTScore (may be slow) */
  enableBERTScore?: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate compression ratio (source tokens / summary tokens)
 */
function calculateCompressionRatio(source: string, summary: string): number {
  const sourceTokens = tokenize(source).length;
  const summaryTokens = tokenize(summary).length;

  if (summaryTokens === 0) {
    return sourceTokens > 0 ? Infinity : 1;
  }

  return sourceTokens / summaryTokens;
}

/**
 * Check which keywords are present in the summary
 */
function checkKeywords(
  summary: string,
  keywords?: string[]
): { found: string[]; missing: string[] } {
  if (!keywords || keywords.length === 0) {
    return { found: [], missing: [] };
  }

  const summaryLower = summary.toLowerCase();
  const found: string[] = [];
  const missing: string[] = [];

  for (const keyword of keywords) {
    if (summaryLower.includes(keyword.toLowerCase())) {
      found.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  return { found, missing };
}

// =============================================================================
// EVALUATOR FUNCTIONS
// =============================================================================

/**
 * Evaluate a single summarization test case
 */
export async function evaluateTestCase(
  testCase: SummarizationTestCase,
  summarizeFn: SummarizeFn,
  config: SummarizationEvalConfig
): Promise<SummarizationTestResult> {
  const startTime = Date.now();

  try {
    // Get source contents
    const sourceContents = testCase.sourceEntries.map(e => e.content);
    const combinedSource = sourceContents.join(' ');

    // Generate summary
    const generatedSummary = await summarizeFn(sourceContents);
    const processingTimeMs = Date.now() - startTime;

    // Calculate compression ratio
    const compressionRatio = calculateCompressionRatio(combinedSource, generatedSummary);

    // Check keywords
    const { found: keywordsFound, missing: keywordsMissing } = checkKeywords(
      generatedSummary,
      testCase.mustContainKeywords
    );

    // Calculate ROUGE if reference summary available
    let rouge;
    if (testCase.expectedSummary) {
      rouge = calculateROUGE(testCase.expectedSummary, generatedSummary);
    }

    // Calculate Groundedness
    const groundednessEvaluator = new GroundednessEvaluator(config.embeddingService, {
      enabled: true,
      threshold: config.groundednessThreshold ?? 0.7,
      fragmentSize: 'sentence',
    });
    const groundedness = await groundednessEvaluator.evaluateGroundedness(
      generatedSummary,
      combinedSource
    );

    // Calculate BERTScore (optional, slow)
    let bertScore;
    if (config.enableBERTScore) {
      const bertEvaluator = new BERTScoreEvaluator(config.embeddingService);
      bertScore = await bertEvaluator.calculateBERTScore(combinedSource, generatedSummary);
    }

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      category: testCase.category,
      difficulty: testCase.difficulty,
      generatedSummary,
      rouge,
      bertScore,
      groundedness,
      compressionRatio,
      processingTimeMs,
      keywordsFound,
      keywordsMissing,
    };
  } catch (error) {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      category: testCase.category,
      difficulty: testCase.difficulty,
      generatedSummary: '',
      groundedness: {
        score: 0,
        groundedFragments: [],
        ungroundedFragments: [],
        details: [],
        threshold: config.groundednessThreshold ?? 0.7,
      },
      compressionRatio: 0,
      processingTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Aggregate results across all test cases
 */
export function aggregateResults(
  results: SummarizationTestResult[]
): AggregatedSummarizationMetrics {
  const validResults = results.filter(r => !r.error);
  const errorCount = results.length - validResults.length;

  // Calculate averages
  let totalGroundedness = 0;
  let totalHallucinationRate = 0;
  let totalCompression = 0;
  let totalTimeMs = 0;

  // ROUGE aggregation (for cases with reference)
  let rouge1Sum = 0;
  let rouge2Sum = 0;
  let rougeLSum = 0;
  let rougeCount = 0;

  // BERTScore aggregation
  let bertPrecisionSum = 0;
  let bertRecallSum = 0;
  let bertF1Sum = 0;
  let bertCount = 0;

  // Keyword coverage
  let totalExpectedKeywords = 0;
  let totalFoundKeywords = 0;

  for (const result of validResults) {
    totalGroundedness += result.groundedness.score;
    totalHallucinationRate += 1 - result.groundedness.score;
    totalCompression += result.compressionRatio;
    totalTimeMs += result.processingTimeMs;

    if (result.rouge) {
      rouge1Sum += result.rouge.rouge1.f1;
      rouge2Sum += result.rouge.rouge2.f1;
      rougeLSum += result.rouge.rougeL.f1;
      rougeCount++;
    }

    if (result.bertScore) {
      bertPrecisionSum += result.bertScore.precision;
      bertRecallSum += result.bertScore.recall;
      bertF1Sum += result.bertScore.f1;
      bertCount++;
    }

    if (result.keywordsFound || result.keywordsMissing) {
      totalFoundKeywords += result.keywordsFound?.length ?? 0;
      totalExpectedKeywords += (result.keywordsFound?.length ?? 0) + (result.keywordsMissing?.length ?? 0);
    }
  }

  const n = validResults.length || 1;

  // By difficulty
  const byDifficulty: AggregatedSummarizationMetrics['byDifficulty'] = {
    easy: { count: 0, avgGroundedness: 0, avgCompressionRatio: 0 },
    medium: { count: 0, avgGroundedness: 0, avgCompressionRatio: 0 },
    hard: { count: 0, avgGroundedness: 0, avgCompressionRatio: 0 },
  };

  for (const diff of ['easy', 'medium', 'hard'] as const) {
    const diffResults = validResults.filter(r => r.difficulty === diff);
    if (diffResults.length > 0) {
      const rougeResults = diffResults.filter(r => r.rouge);
      byDifficulty[diff] = {
        count: diffResults.length,
        avgGroundedness: diffResults.reduce((s, r) => s + r.groundedness.score, 0) / diffResults.length,
        avgCompressionRatio: diffResults.reduce((s, r) => s + r.compressionRatio, 0) / diffResults.length,
        avgRougeL: rougeResults.length > 0
          ? rougeResults.reduce((s, r) => s + (r.rouge?.rougeL.f1 ?? 0), 0) / rougeResults.length
          : undefined,
      };
    }
  }

  // By category
  const byCategory: Record<string, { count: number; avgGroundedness: number; avgCompressionRatio: number; avgRougeL?: number }> = {};
  const categories = Array.from(new Set(validResults.map(r => r.category)));

  for (const category of categories) {
    const catResults = validResults.filter(r => r.category === category);
    if (catResults.length > 0) {
      const rougeResults = catResults.filter(r => r.rouge);
      byCategory[SUMMARIZATION_CATEGORY_NAMES[category as SummarizationTestCategory] || category] = {
        count: catResults.length,
        avgGroundedness: catResults.reduce((s, r) => s + r.groundedness.score, 0) / catResults.length,
        avgCompressionRatio: catResults.reduce((s, r) => s + r.compressionRatio, 0) / catResults.length,
        avgRougeL: rougeResults.length > 0
          ? rougeResults.reduce((s, r) => s + (r.rouge?.rougeL.f1 ?? 0), 0) / rougeResults.length
          : undefined,
      };
    }
  }

  return {
    totalTestCases: results.length,
    errorCount,
    avgRouge: rougeCount > 0 ? {
      rouge1F1: rouge1Sum / rougeCount,
      rouge2F1: rouge2Sum / rougeCount,
      rougeLF1: rougeLSum / rougeCount,
      testCasesWithReference: rougeCount,
    } : undefined,
    avgBERTScore: bertCount > 0 ? {
      precision: bertPrecisionSum / bertCount,
      recall: bertRecallSum / bertCount,
      f1: bertF1Sum / bertCount,
    } : undefined,
    avgGroundednessScore: totalGroundedness / n,
    avgHallucinationRate: totalHallucinationRate / n,
    avgCompressionRatio: totalCompression / n,
    keywordCoverage: totalExpectedKeywords > 0 ? {
      totalExpected: totalExpectedKeywords,
      totalFound: totalFoundKeywords,
      coverageRate: totalFoundKeywords / totalExpectedKeywords,
    } : undefined,
    byDifficulty,
    byCategory,
    processing: {
      totalTimeMs,
      avgTimePerCase: totalTimeMs / n,
    },
  };
}

/**
 * Run the full benchmark
 */
export async function runBenchmark(
  testCases: SummarizationTestCase[],
  summarizeFn: SummarizeFn,
  config: SummarizationEvalConfig & {
    level?: 'chunk' | 'topic' | 'domain';
  },
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<SummarizationBenchmarkResults> {
  const results: SummarizationTestResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]!;

    if (onProgress) {
      onProgress(i, testCases.length, testCase.name);
    }

    const result = await evaluateTestCase(testCase, summarizeFn, config);
    results.push(result);
  }

  if (onProgress) {
    onProgress(testCases.length, testCases.length, 'Complete');
  }

  return {
    timestamp: new Date().toISOString(),
    config: {
      level: config.level ?? 'chunk',
      embeddingsEnabled: config.embeddingService.isAvailable(),
      testCasesRun: testCases.length,
      groundednessThreshold: config.groundednessThreshold ?? 0.7,
    },
    overall: aggregateResults(results),
    testCaseResults: results,
  };
}

/**
 * Print benchmark results in formatted output
 */
export function printBenchmarkResults(results: SummarizationBenchmarkResults): void {
  console.log('\n========================================');
  console.log('Summarization Quality Benchmark Results');
  console.log('========================================');
  console.log(`Level: ${results.config.level}`);
  console.log(`Embeddings: ${results.config.embeddingsEnabled ? 'Enabled' : 'Disabled'}`);
  console.log(`Test Cases: ${results.config.testCasesRun}`);
  console.log(`Groundedness Threshold: ${results.config.groundednessThreshold}`);
  console.log('========================================\n');

  const o = results.overall;
  console.log('OVERALL METRICS:');
  console.log(`  Groundedness:       ${(o.avgGroundednessScore * 100).toFixed(1)}%`);
  console.log(`  Hallucination Rate: ${(o.avgHallucinationRate * 100).toFixed(1)}%`);
  console.log(`  Compression Ratio:  ${o.avgCompressionRatio.toFixed(1)}x`);
  console.log(`  Errors:             ${o.errorCount}`);

  if (o.avgRouge) {
    console.log('\nROUGE SCORES (vs reference summaries):');
    console.log(`  Test Cases with Reference: ${o.avgRouge.testCasesWithReference}`);
    console.log(`  ROUGE-1 F1:  ${o.avgRouge.rouge1F1.toFixed(3)}`);
    console.log(`  ROUGE-2 F1:  ${o.avgRouge.rouge2F1.toFixed(3)}`);
    console.log(`  ROUGE-L F1:  ${o.avgRouge.rougeLF1.toFixed(3)}`);
  }

  if (o.avgBERTScore) {
    console.log('\nBERTSCORE:');
    console.log(`  Precision: ${o.avgBERTScore.precision.toFixed(3)}`);
    console.log(`  Recall:    ${o.avgBERTScore.recall.toFixed(3)}`);
    console.log(`  F1:        ${o.avgBERTScore.f1.toFixed(3)}`);
  }

  if (o.keywordCoverage) {
    console.log('\nKEYWORD COVERAGE:');
    console.log(`  Found: ${o.keywordCoverage.totalFound}/${o.keywordCoverage.totalExpected}`);
    console.log(`  Coverage Rate: ${(o.keywordCoverage.coverageRate * 100).toFixed(1)}%`);
  }

  console.log('\nBY DIFFICULTY:');
  console.log('Difficulty | Count | Ground. | Compress | ROUGE-L');
  console.log('-----------|-------|---------|----------|--------');
  for (const diff of ['easy', 'medium', 'hard'] as const) {
    const d = o.byDifficulty[diff];
    const rougeL = d.avgRougeL !== undefined ? d.avgRougeL.toFixed(3) : 'N/A';
    console.log(
      `${diff.padEnd(10)} | ${d.count.toString().padStart(5)} | ` +
      `${(d.avgGroundedness * 100).toFixed(1).padStart(6)}% | ` +
      `${d.avgCompressionRatio.toFixed(1).padStart(7)}x | ` +
      `${rougeL.padStart(7)}`
    );
  }

  console.log('\nBY CATEGORY:');
  console.log('Category              | Count | Ground. | Compress | ROUGE-L');
  console.log('----------------------|-------|---------|----------|--------');

  const sortedCategories = Object.entries(o.byCategory)
    .sort((a, b) => b[1].avgGroundedness - a[1].avgGroundedness);

  for (const [cat, m] of sortedCategories) {
    const rougeL = m.avgRougeL !== undefined ? m.avgRougeL.toFixed(3) : 'N/A';
    console.log(
      `${cat.substring(0, 21).padEnd(21)} | ${m.count.toString().padStart(5)} | ` +
      `${(m.avgGroundedness * 100).toFixed(1).padStart(6)}% | ` +
      `${m.avgCompressionRatio.toFixed(1).padStart(7)}x | ` +
      `${rougeL.padStart(7)}`
    );
  }

  console.log('\nPROCESSING:');
  console.log(`  Total Time:    ${(o.processing.totalTimeMs / 1000).toFixed(2)}s`);
  console.log(`  Avg Per Case:  ${o.processing.avgTimePerCase.toFixed(0)}ms`);

  // Show worst performing test cases
  const worstCases = results.testCaseResults
    .filter(r => !r.error)
    .sort((a, b) => a.groundedness.score - b.groundedness.score)
    .slice(0, 5);

  if (worstCases.length > 0) {
    console.log('\nWORST PERFORMING TEST CASES:');
    for (const tc of worstCases) {
      console.log(`  ${tc.testCaseId}: ${tc.testCaseName}`);
      console.log(`    Groundedness: ${(tc.groundedness.score * 100).toFixed(1)}%`);
      if (tc.keywordsMissing && tc.keywordsMissing.length > 0) {
        console.log(`    Missing keywords: ${tc.keywordsMissing.join(', ')}`);
      }
    }
  }

  // Show error cases
  const errorCases = results.testCaseResults.filter(r => r.error);
  if (errorCases.length > 0) {
    console.log('\nERROR CASES:');
    for (const tc of errorCases) {
      console.log(`  ${tc.testCaseId}: ${tc.error}`);
    }
  }

  console.log('\n========================================\n');
}

/**
 * Compare two benchmark results
 */
export function compareBenchmarks(
  current: SummarizationBenchmarkResults,
  baseline: SummarizationBenchmarkResults
): void {
  console.log('\n========================================');
  console.log('Benchmark Comparison');
  console.log('========================================');
  console.log(`Baseline: ${baseline.timestamp}`);
  console.log(`Current:  ${current.timestamp}`);
  console.log('========================================\n');

  const delta = (curr: number, base: number) => {
    const diff = curr - base;
    const sign = diff >= 0 ? '+' : '';
    return `${sign}${(diff * 100).toFixed(1)}%`;
  };

  console.log('METRIC          | Baseline | Current  | Delta');
  console.log('----------------|----------|----------|--------');
  console.log(
    `Groundedness    | ${(baseline.overall.avgGroundednessScore * 100).toFixed(1).padStart(7)}% | ` +
    `${(current.overall.avgGroundednessScore * 100).toFixed(1).padStart(7)}% | ` +
    `${delta(current.overall.avgGroundednessScore, baseline.overall.avgGroundednessScore)}`
  );
  console.log(
    `Hallucination   | ${(baseline.overall.avgHallucinationRate * 100).toFixed(1).padStart(7)}% | ` +
    `${(current.overall.avgHallucinationRate * 100).toFixed(1).padStart(7)}% | ` +
    `${delta(current.overall.avgHallucinationRate, baseline.overall.avgHallucinationRate)}`
  );

  if (current.overall.avgRouge && baseline.overall.avgRouge) {
    console.log(
      `ROUGE-L F1      | ${baseline.overall.avgRouge.rougeLF1.toFixed(3).padStart(8)} | ` +
      `${current.overall.avgRouge.rougeLF1.toFixed(3).padStart(8)} | ` +
      `${delta(current.overall.avgRouge.rougeLF1, baseline.overall.avgRouge.rougeLF1)}`
    );
  }

  console.log('\n========================================\n');
}
