/**
 * Query Quality Evaluator
 *
 * Evaluates query/retrieval quality against ground truth test cases.
 * Calculates Precision@K, Recall@K, MRR, and nDCG metrics.
 */

import type {
  QueryTestCase,
  QueryTestCaseResult,
  AggregatedQueryMetrics,
  QueryBenchmarkResults,
  ExpectedResult,
  QueryTestCategory,
  SeedEntry,
} from './query-quality-types.js';
import { QUERY_CATEGORY_NAMES } from './query-quality-types.js';

// =============================================================================
// METRIC CALCULATIONS
// =============================================================================

/**
 * Calculate Precision at K
 * Precision@K = (relevant items in top K) / K
 */
export function precisionAtK(
  returnedIds: string[],
  relevantIds: Set<string>,
  k: number
): number {
  if (k === 0) return 0;
  const topK = returnedIds.slice(0, k);
  const relevantInTopK = topK.filter(id => relevantIds.has(id)).length;
  return relevantInTopK / k;
}

/**
 * Calculate Recall at K
 * Recall@K = (relevant items in top K) / (total relevant items)
 */
export function recallAtK(
  returnedIds: string[],
  relevantIds: Set<string>,
  k: number
): number {
  if (relevantIds.size === 0) return 1; // If no relevant items, perfect recall
  const topK = returnedIds.slice(0, k);
  const relevantInTopK = topK.filter(id => relevantIds.has(id)).length;
  return relevantInTopK / relevantIds.size;
}

/**
 * Calculate Mean Reciprocal Rank
 * MRR = 1 / (rank of first relevant result)
 */
export function meanReciprocalRank(
  returnedIds: string[],
  relevantIds: Set<string>
): number {
  for (let i = 0; i < returnedIds.length; i++) {
    if (relevantIds.has(returnedIds[i]!)) {
      return 1 / (i + 1);
    }
  }
  return 0; // No relevant result found
}

/**
 * Calculate Discounted Cumulative Gain
 * DCG = sum of (relevance / log2(rank + 1))
 */
function dcg(
  returnedIds: string[],
  relevanceGrades: Map<string, number>,
  k: number
): number {
  let dcgScore = 0;
  const topK = returnedIds.slice(0, k);

  for (let i = 0; i < topK.length; i++) {
    const id = topK[i]!;
    const relevance = relevanceGrades.get(id) || 0;
    // Using log2(rank + 1) where rank is 1-indexed
    dcgScore += relevance / Math.log2(i + 2);
  }

  return dcgScore;
}

/**
 * Calculate Ideal DCG (DCG with perfect ranking)
 */
function idealDcg(
  relevanceGrades: Map<string, number>,
  k: number
): number {
  // Sort relevance grades in descending order
  const sortedGrades = Array.from(relevanceGrades.values())
    .sort((a, b) => b - a)
    .slice(0, k);

  let idcgScore = 0;
  for (let i = 0; i < sortedGrades.length; i++) {
    idcgScore += sortedGrades[i]! / Math.log2(i + 2);
  }

  return idcgScore;
}

/**
 * Calculate Normalized DCG
 * nDCG = DCG / IDCG
 */
export function normalizedDcg(
  returnedIds: string[],
  relevanceGrades: Map<string, number>,
  k: number
): number {
  const idcgScore = idealDcg(relevanceGrades, k);
  if (idcgScore === 0) return 1; // If no relevant items, perfect nDCG

  const dcgScore = dcg(returnedIds, relevanceGrades, k);
  return dcgScore / idcgScore;
}

// =============================================================================
// RESULT MAPPING
// =============================================================================

/**
 * Map seed entry IDs to actual database entry IDs
 * The seed entries have predictable IDs based on their seed ID
 */
export type IdMapper = (seedEntryId: string) => string | undefined;

/**
 * Create an ID mapper from seed data and stored entries
 */
export function createIdMapper(
  seedToDbIdMap: Map<string, string>
): IdMapper {
  return (seedEntryId: string) => seedToDbIdMap.get(seedEntryId);
}

/**
 * Extract entry ID from a returned result
 */
export function extractReturnedId(result: {
  id?: string;
  entryId?: string;
  name?: string;
  title?: string;
}): string | undefined {
  return result.id || result.entryId;
}

// =============================================================================
// TEST CASE EVALUATION
// =============================================================================

/**
 * Query function signature
 */
export type QueryFn = (params: QueryTestCase['query']) => Promise<{
  results: Array<{ id?: string; entryId?: string; name?: string; title?: string; type?: string }>;
  processingTimeMs: number;
}>;

/**
 * Evaluate a single test case
 */
export async function evaluateQueryTestCase(
  testCase: QueryTestCase,
  queryFn: QueryFn,
  idMapper: IdMapper,
  options: {
    defaultK?: number;
    semanticAvailable?: boolean;
    fts5Available?: boolean;
  } = {}
): Promise<QueryTestCaseResult> {
  const { defaultK = 10, semanticAvailable = false, fts5Available = true } = options;
  const startTime = Date.now();

  // Check if test should be skipped
  if (testCase.requiresSemantic && !semanticAvailable) {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      category: testCase.category,
      difficulty: testCase.difficulty,
      returnedCount: 0,
      relevantCount: 0,
      precisionAtK: 0,
      recallAtK: 0,
      mrr: 0,
      ndcg: 0,
      k: defaultK,
      returnedIds: [],
      missedIds: [],
      unexpectedIds: [],
      processingTimeMs: 0,
      skipped: true,
      skipReason: 'Semantic search not available',
    };
  }

  if (testCase.requiresFts5 && !fts5Available) {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      category: testCase.category,
      difficulty: testCase.difficulty,
      returnedCount: 0,
      relevantCount: 0,
      precisionAtK: 0,
      recallAtK: 0,
      mrr: 0,
      ndcg: 0,
      k: defaultK,
      returnedIds: [],
      missedIds: [],
      unexpectedIds: [],
      processingTimeMs: 0,
      skipped: true,
      skipReason: 'FTS5 not available',
    };
  }

  try {
    // Run the query
    const queryResult = await queryFn(testCase.query);
    const processingTimeMs = queryResult.processingTimeMs || (Date.now() - startTime);

    // Extract returned IDs
    const returnedDbIds = queryResult.results
      .map(r => extractReturnedId(r))
      .filter((id): id is string => id !== undefined);

    // Build expected data structures
    const expectedDbIds = new Map<string, string>(); // seedId -> dbId
    const relevanceGrades = new Map<string, number>(); // dbId -> grade
    const relevantDbIds = new Set<string>(); // dbIds with grade >= 2

    for (const expected of testCase.expectedResults) {
      const dbId = idMapper(expected.seedEntryId);
      if (dbId) {
        expectedDbIds.set(expected.seedEntryId, dbId);
        relevanceGrades.set(dbId, expected.relevanceGrade);
        if (expected.relevanceGrade >= 2) {
          relevantDbIds.add(dbId);
        }
      }
    }

    // Calculate K (use query limit if specified, otherwise default)
    const k = testCase.query.limit || defaultK;

    // Calculate metrics
    const precision = precisionAtK(returnedDbIds, relevantDbIds, k);
    const recall = recallAtK(returnedDbIds, relevantDbIds, k);
    const mrr = meanReciprocalRank(returnedDbIds, relevantDbIds);
    const ndcg = normalizedDcg(returnedDbIds, relevanceGrades, k);

    // Find missed and unexpected IDs
    const returnedSet = new Set(returnedDbIds);
    const missedIds: string[] = [];
    for (const [seedId, dbId] of expectedDbIds) {
      if (!returnedSet.has(dbId)) {
        missedIds.push(seedId);
      }
    }

    const unexpectedIds: string[] = [];
    if (testCase.shouldNotReturn) {
      for (const seedId of testCase.shouldNotReturn) {
        const dbId = idMapper(seedId);
        if (dbId && returnedSet.has(dbId)) {
          unexpectedIds.push(seedId);
        }
      }
    }

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      category: testCase.category,
      difficulty: testCase.difficulty,
      returnedCount: returnedDbIds.length,
      relevantCount: relevantDbIds.size,
      precisionAtK: precision,
      recallAtK: recall,
      mrr,
      ndcg,
      k,
      returnedIds: returnedDbIds,
      missedIds,
      unexpectedIds,
      processingTimeMs,
    };
  } catch (error) {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      category: testCase.category,
      difficulty: testCase.difficulty,
      returnedCount: 0,
      relevantCount: testCase.expectedResults.filter(e => e.relevanceGrade >= 2).length,
      precisionAtK: 0,
      recallAtK: 0,
      mrr: 0,
      ndcg: 0,
      k: defaultK,
      returnedIds: [],
      missedIds: testCase.expectedResults.map(e => e.seedEntryId),
      unexpectedIds: [],
      processingTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// AGGREGATION
// =============================================================================

/**
 * Aggregate results across all test cases
 */
export function aggregateQueryResults(results: QueryTestCaseResult[]): AggregatedQueryMetrics {
  const validResults = results.filter(r => !r.error && !r.skipped);
  const skippedCount = results.filter(r => r.skipped).length;
  const errorCount = results.filter(r => r.error).length;

  if (validResults.length === 0) {
    return {
      totalTestCases: results.length,
      skippedCount,
      errorCount,
      avgPrecisionAtK: 0,
      avgRecallAtK: 0,
      avgMrr: 0,
      avgNdcg: 0,
      byDifficulty: {
        easy: { count: 0, avgPrecision: 0, avgRecall: 0, avgMrr: 0, avgNdcg: 0 },
        medium: { count: 0, avgPrecision: 0, avgRecall: 0, avgMrr: 0, avgNdcg: 0 },
        hard: { count: 0, avgPrecision: 0, avgRecall: 0, avgMrr: 0, avgNdcg: 0 },
      },
      byCategory: {},
      processing: {
        totalTimeMs: 0,
        avgTimePerQuery: 0,
        minTimeMs: 0,
        maxTimeMs: 0,
      },
    };
  }

  // Overall averages
  const avgPrecisionAtK = validResults.reduce((sum, r) => sum + r.precisionAtK, 0) / validResults.length;
  const avgRecallAtK = validResults.reduce((sum, r) => sum + r.recallAtK, 0) / validResults.length;
  const avgMrr = validResults.reduce((sum, r) => sum + r.mrr, 0) / validResults.length;
  const avgNdcg = validResults.reduce((sum, r) => sum + r.ndcg, 0) / validResults.length;

  // By difficulty
  const byDifficulty: AggregatedQueryMetrics['byDifficulty'] = {
    easy: { count: 0, avgPrecision: 0, avgRecall: 0, avgMrr: 0, avgNdcg: 0 },
    medium: { count: 0, avgPrecision: 0, avgRecall: 0, avgMrr: 0, avgNdcg: 0 },
    hard: { count: 0, avgPrecision: 0, avgRecall: 0, avgMrr: 0, avgNdcg: 0 },
  };

  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const diffResults = validResults.filter(r => r.difficulty === difficulty);
    if (diffResults.length > 0) {
      byDifficulty[difficulty] = {
        count: diffResults.length,
        avgPrecision: diffResults.reduce((sum, r) => sum + r.precisionAtK, 0) / diffResults.length,
        avgRecall: diffResults.reduce((sum, r) => sum + r.recallAtK, 0) / diffResults.length,
        avgMrr: diffResults.reduce((sum, r) => sum + r.mrr, 0) / diffResults.length,
        avgNdcg: diffResults.reduce((sum, r) => sum + r.ndcg, 0) / diffResults.length,
      };
    }
  }

  // By category
  const byCategory: Record<string, { count: number; avgPrecision: number; avgRecall: number; avgMrr: number; avgNdcg: number }> = {};
  const categories = Array.from(new Set(validResults.map(r => r.category)));

  for (const category of categories) {
    const catResults = validResults.filter(r => r.category === category);
    if (catResults.length > 0) {
      const displayName = QUERY_CATEGORY_NAMES[category as QueryTestCategory] || category;
      byCategory[displayName] = {
        count: catResults.length,
        avgPrecision: catResults.reduce((sum, r) => sum + r.precisionAtK, 0) / catResults.length,
        avgRecall: catResults.reduce((sum, r) => sum + r.recallAtK, 0) / catResults.length,
        avgMrr: catResults.reduce((sum, r) => sum + r.mrr, 0) / catResults.length,
        avgNdcg: catResults.reduce((sum, r) => sum + r.ndcg, 0) / catResults.length,
      };
    }
  }

  // Processing stats
  const times = validResults.map(r => r.processingTimeMs);
  const totalTimeMs = times.reduce((sum, t) => sum + t, 0);

  return {
    totalTestCases: results.length,
    skippedCount,
    errorCount,
    avgPrecisionAtK,
    avgRecallAtK,
    avgMrr,
    avgNdcg,
    byDifficulty,
    byCategory,
    processing: {
      totalTimeMs,
      avgTimePerQuery: totalTimeMs / validResults.length,
      minTimeMs: Math.min(...times),
      maxTimeMs: Math.max(...times),
    },
  };
}

// =============================================================================
// BENCHMARK RUNNER
// =============================================================================

/**
 * Run the full query benchmark
 */
export async function runQueryBenchmark(
  testCases: QueryTestCase[],
  queryFn: QueryFn,
  idMapper: IdMapper,
  config: {
    semanticEnabled: boolean;
    fts5Enabled: boolean;
    defaultK: number;
  },
  seedDataStats: {
    totalEntries: number;
    byType: { guidelines: number; knowledge: number; tools: number };
    scopes: string[];
  },
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<QueryBenchmarkResults> {
  const results: QueryTestCaseResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]!;

    if (onProgress) {
      onProgress(i, testCases.length, testCase.name);
    }

    const result = await evaluateQueryTestCase(testCase, queryFn, idMapper, {
      defaultK: config.defaultK,
      semanticAvailable: config.semanticEnabled,
      fts5Available: config.fts5Enabled,
    });
    results.push(result);
  }

  if (onProgress) {
    onProgress(testCases.length, testCases.length, 'Complete');
  }

  return {
    timestamp: new Date().toISOString(),
    config: {
      testCasesRun: testCases.length,
      semanticEnabled: config.semanticEnabled,
      fts5Enabled: config.fts5Enabled,
      defaultK: config.defaultK,
    },
    seedDataStats,
    overall: aggregateQueryResults(results),
    testCaseResults: results,
  };
}

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

/**
 * Print benchmark results
 */
export function printQueryBenchmarkResults(results: QueryBenchmarkResults): void {
  console.log('\n========================================');
  console.log('Query Quality Benchmark Results');
  console.log('========================================');
  console.log(`Test Cases: ${results.config.testCasesRun}`);
  console.log(`Semantic Search: ${results.config.semanticEnabled ? 'Enabled' : 'Disabled'}`);
  console.log(`FTS5: ${results.config.fts5Enabled ? 'Enabled' : 'Disabled'}`);
  console.log(`Default K: ${results.config.defaultK}`);
  console.log('========================================\n');

  console.log('SEED DATA:');
  console.log(`  Total Entries: ${results.seedDataStats.totalEntries}`);
  console.log(`  By Type: G=${results.seedDataStats.byType.guidelines} K=${results.seedDataStats.byType.knowledge} T=${results.seedDataStats.byType.tools}`);
  console.log(`  Scopes: ${results.seedDataStats.scopes.join(', ')}`);

  const o = results.overall;
  console.log('\nOVERALL METRICS:');
  console.log(`  Precision@K:  ${(o.avgPrecisionAtK * 100).toFixed(1)}%`);
  console.log(`  Recall@K:     ${(o.avgRecallAtK * 100).toFixed(1)}%`);
  console.log(`  MRR:          ${(o.avgMrr * 100).toFixed(1)}%`);
  console.log(`  nDCG:         ${(o.avgNdcg * 100).toFixed(1)}%`);
  console.log(`  Skipped:      ${o.skippedCount}`);
  console.log(`  Errors:       ${o.errorCount}`);

  console.log('\nBY DIFFICULTY:');
  console.log('Difficulty | Count | P@K     | R@K     | MRR     | nDCG');
  console.log('-----------|-------|---------|---------|---------|--------');
  for (const diff of ['easy', 'medium', 'hard'] as const) {
    const d = o.byDifficulty[diff];
    console.log(
      `${diff.padEnd(10)} | ${d.count.toString().padStart(5)} | ` +
      `${(d.avgPrecision * 100).toFixed(1).padStart(6)}% | ` +
      `${(d.avgRecall * 100).toFixed(1).padStart(6)}% | ` +
      `${(d.avgMrr * 100).toFixed(1).padStart(6)}% | ` +
      `${(d.avgNdcg * 100).toFixed(1).padStart(5)}%`
    );
  }

  console.log('\nBY CATEGORY:');
  console.log('Category              | Count | P@K     | R@K     | MRR     | nDCG');
  console.log('----------------------|-------|---------|---------|---------|--------');

  const sortedCategories = Object.entries(o.byCategory)
    .sort((a, b) => b[1].avgNdcg - a[1].avgNdcg);

  for (const [cat, m] of sortedCategories) {
    console.log(
      `${cat.substring(0, 21).padEnd(21)} | ${m.count.toString().padStart(5)} | ` +
      `${(m.avgPrecision * 100).toFixed(1).padStart(6)}% | ` +
      `${(m.avgRecall * 100).toFixed(1).padStart(6)}% | ` +
      `${(m.avgMrr * 100).toFixed(1).padStart(6)}% | ` +
      `${(m.avgNdcg * 100).toFixed(1).padStart(5)}%`
    );
  }

  console.log('\nPROCESSING:');
  console.log(`  Total Time:      ${o.processing.totalTimeMs.toFixed(0)}ms`);
  console.log(`  Avg per Query:   ${o.processing.avgTimePerQuery.toFixed(0)}ms`);
  console.log(`  Min:             ${o.processing.minTimeMs.toFixed(0)}ms`);
  console.log(`  Max:             ${o.processing.maxTimeMs.toFixed(0)}ms`);

  // Show worst performing test cases
  const worstCases = results.testCaseResults
    .filter(r => !r.error && !r.skipped)
    .sort((a, b) => a.ndcg - b.ndcg)
    .slice(0, 5);

  if (worstCases.length > 0) {
    console.log('\nWORST PERFORMING TEST CASES:');
    for (const tc of worstCases) {
      console.log(`  ${tc.testCaseId}: ${tc.testCaseName}`);
      console.log(`    P@K=${(tc.precisionAtK * 100).toFixed(0)}% R@K=${(tc.recallAtK * 100).toFixed(0)}% MRR=${(tc.mrr * 100).toFixed(0)}% nDCG=${(tc.ndcg * 100).toFixed(0)}%`);
      if (tc.missedIds.length > 0) {
        console.log(`    Missed: ${tc.missedIds.join(', ')}`);
      }
      if (tc.unexpectedIds.length > 0) {
        console.log(`    Unexpected: ${tc.unexpectedIds.join(', ')}`);
      }
    }
  }

  // Show skipped and error cases
  const skippedCases = results.testCaseResults.filter(r => r.skipped);
  if (skippedCases.length > 0) {
    console.log('\nSKIPPED CASES:');
    for (const tc of skippedCases) {
      console.log(`  ${tc.testCaseId}: ${tc.skipReason}`);
    }
  }

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
export function compareQueryBenchmarks(
  current: QueryBenchmarkResults,
  baseline: QueryBenchmarkResults
): void {
  console.log('\n========================================');
  console.log('Query Benchmark Comparison');
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
    `Precision@K     | ${(baseline.overall.avgPrecisionAtK * 100).toFixed(1).padStart(7)}% | ` +
    `${(current.overall.avgPrecisionAtK * 100).toFixed(1).padStart(7)}% | ` +
    `${delta(current.overall.avgPrecisionAtK, baseline.overall.avgPrecisionAtK)}`
  );
  console.log(
    `Recall@K        | ${(baseline.overall.avgRecallAtK * 100).toFixed(1).padStart(7)}% | ` +
    `${(current.overall.avgRecallAtK * 100).toFixed(1).padStart(7)}% | ` +
    `${delta(current.overall.avgRecallAtK, baseline.overall.avgRecallAtK)}`
  );
  console.log(
    `MRR             | ${(baseline.overall.avgMrr * 100).toFixed(1).padStart(7)}% | ` +
    `${(current.overall.avgMrr * 100).toFixed(1).padStart(7)}% | ` +
    `${delta(current.overall.avgMrr, baseline.overall.avgMrr)}`
  );
  console.log(
    `nDCG            | ${(baseline.overall.avgNdcg * 100).toFixed(1).padStart(7)}% | ` +
    `${(current.overall.avgNdcg * 100).toFixed(1).padStart(7)}% | ` +
    `${delta(current.overall.avgNdcg, baseline.overall.avgNdcg)}`
  );

  console.log('\n========================================\n');
}
