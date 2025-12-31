/**
 * Extraction Quality Evaluator
 *
 * Evaluates extraction quality against ground truth test cases.
 * Calculates precision, recall, F1 scores, and proxy metrics.
 */

import type {
  ExtractionTestCase,
  ExpectedEntry,
  EntryMatchResult,
  TestCaseResult,
  AggregatedExtractionMetrics,
  ExtractionProxyMetrics,
  ExtractionBenchmarkResults,
  ExtractionTestCategory,
} from './extraction-quality-types.js';
import { EXTRACTION_CATEGORY_NAMES } from './extraction-quality-types.js';

/**
 * Extracted entry from the extraction service
 */
interface ExtractedEntry {
  type: string;
  name?: string;
  title?: string;
  content: string;
  category?: string;
  confidence: number;
  suggestedTags?: string[];
  isDuplicate?: boolean;
}

/**
 * Extraction result from the service
 */
interface ExtractionResult {
  entries: ExtractedEntry[];
  processingTimeMs: number;
  tokensUsed: number;
  atomicitySplits?: number;
  compoundDetected?: number;
  duplicatesFound?: number;
}

/**
 * Extract function signature
 */
type ExtractFn = (context: string, contextType: string) => Promise<ExtractionResult>;

/**
 * Check if an extracted entry matches an expected entry
 */
function matchEntry(extracted: ExtractedEntry, expected: ExpectedEntry): { matches: boolean; score: number; details: string } {
  // Type must match
  if (extracted.type !== expected.type) {
    return { matches: false, score: 0, details: `Type mismatch: expected ${expected.type}, got ${extracted.type}` };
  }

  // For tools, check both name and content fields since commands may be in name
  const searchText = extracted.type === 'tool' && extracted.name
    ? `${extracted.name} ${extracted.content}`.toLowerCase()
    : extracted.content.toLowerCase();
  const matchedFragments: string[] = [];

  // Helper to normalize text for comparison (handle kebab-case vs spaces)
  const normalize = (text: string): string => text.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
  const normalizedSearchText = normalize(searchText);

  for (const fragment of expected.mustContain) {
    const normalizedFragment = normalize(fragment);
    // Check both original and normalized versions
    if (searchText.includes(fragment.toLowerCase()) ||
        normalizedSearchText.includes(normalizedFragment)) {
      matchedFragments.push(fragment);
    }
  }

  if (matchedFragments.length === 0) {
    return {
      matches: false,
      score: 0,
      details: `Content missing required fragments: ${expected.mustContain.join(', ')}`
    };
  }

  // Calculate match score based on fragments matched
  let score = matchedFragments.length / expected.mustContain.length;
  const details: string[] = [`Matched fragments: ${matchedFragments.join(', ')}`];

  // Check optional constraints
  if (expected.category && extracted.category) {
    if (extracted.category.toLowerCase() === expected.category.toLowerCase()) {
      score += 0.1;
      details.push('Category matched');
    } else {
      score -= 0.05;
      details.push(`Category mismatch: expected ${expected.category}, got ${extracted.category}`);
    }
  }

  if (expected.minConfidence !== undefined) {
    if (extracted.confidence >= expected.minConfidence) {
      details.push(`Confidence OK: ${extracted.confidence} >= ${expected.minConfidence}`);
    } else {
      score -= 0.1;
      details.push(`Low confidence: ${extracted.confidence} < ${expected.minConfidence}`);
    }
  }

  // Cap score at 1.0
  score = Math.min(1.0, Math.max(0, score));

  return { matches: true, score, details: details.join('; ') };
}

/**
 * Find the best matching extracted entry for an expected entry
 */
function findBestMatch(
  expected: ExpectedEntry,
  extractedEntries: ExtractedEntry[],
  usedIndices: Set<number>
): { matchResult: EntryMatchResult; usedIndex: number | null } {
  let bestMatch: { entry: ExtractedEntry; score: number; details: string; index: number } | null = null;

  for (let i = 0; i < extractedEntries.length; i++) {
    if (usedIndices.has(i)) continue;

    const extracted = extractedEntries[i]!;
    const { matches, score, details } = matchEntry(extracted, expected);

    if (matches && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { entry: extracted, score, details, index: i };
    }
  }

  if (bestMatch) {
    return {
      matchResult: {
        expected,
        matched: true,
        matchedEntry: {
          type: bestMatch.entry.type,
          name: bestMatch.entry.name,
          title: bestMatch.entry.title,
          content: bestMatch.entry.content,
          category: bestMatch.entry.category,
          confidence: bestMatch.entry.confidence,
          suggestedTags: bestMatch.entry.suggestedTags,
        },
        matchScore: bestMatch.score,
        details: bestMatch.details,
      },
      usedIndex: bestMatch.index,
    };
  }

  return {
    matchResult: {
      expected,
      matched: false,
      matchScore: 0,
      details: `No matching entry found for: ${expected.mustContain.join(', ')}`,
    },
    usedIndex: null,
  };
}

/**
 * Check if extracted content matches any noise patterns
 */
function checkNoiseExtracted(
  extractedEntries: ExtractedEntry[],
  shouldNotExtract?: string[]
): string[] {
  if (!shouldNotExtract || shouldNotExtract.length === 0) {
    return [];
  }

  const noiseFound: string[] = [];

  for (const entry of extractedEntries) {
    const content = entry.content.toLowerCase();
    for (const noise of shouldNotExtract) {
      if (content.includes(noise.toLowerCase())) {
        noiseFound.push(noise);
      }
    }
  }

  return Array.from(new Set(noiseFound));
}

/**
 * Evaluate a single test case
 */
export async function evaluateTestCase(
  testCase: ExtractionTestCase,
  extractFn: ExtractFn
): Promise<TestCaseResult> {
  const startTime = Date.now();

  try {
    // Run extraction
    const result = await extractFn(testCase.context, testCase.contextType);
    const processingTimeMs = result.processingTimeMs || (Date.now() - startTime);

    // Match expected entries to extracted entries
    const usedIndices = new Set<number>();
    const entryResults: EntryMatchResult[] = [];

    for (const expected of testCase.expectedEntries) {
      const { matchResult, usedIndex } = findBestMatch(expected, result.entries, usedIndices);
      entryResults.push(matchResult);
      if (usedIndex !== null) {
        usedIndices.add(usedIndex);
      }
    }

    // Calculate metrics
    const matchedCount = entryResults.filter(r => r.matched).length;
    const expectedCount = testCase.expectedEntries.length;
    const extractedCount = result.entries.length;
    const falsePositiveCount = extractedCount - usedIndices.size;

    // Precision: of the entries we extracted, how many were correct?
    const precision = extractedCount > 0 ? usedIndices.size / extractedCount : (expectedCount === 0 ? 1 : 0);

    // Recall: of the entries we should have extracted, how many did we get?
    const recall = expectedCount > 0 ? matchedCount / expectedCount : 1;

    // F1 score
    const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    // Check for noise extraction
    const noiseExtracted = checkNoiseExtracted(result.entries, testCase.shouldNotExtract);

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      category: testCase.category,
      difficulty: testCase.difficulty,
      expectedCount,
      extractedCount,
      matchedCount,
      falsePositiveCount,
      precision,
      recall,
      f1Score,
      entryResults,
      noiseExtracted,
      processingTimeMs,
      tokensUsed: result.tokensUsed || 0,
    };
  } catch (error) {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      category: testCase.category,
      difficulty: testCase.difficulty,
      expectedCount: testCase.expectedEntries.length,
      extractedCount: 0,
      matchedCount: 0,
      falsePositiveCount: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      entryResults: [],
      noiseExtracted: [],
      processingTimeMs: Date.now() - startTime,
      tokensUsed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Calculate proxy metrics from test results
 */
function calculateProxyMetrics(results: TestCaseResult[]): ExtractionProxyMetrics {
  let totalEntries = 0;
  let guidelineCount = 0;
  let knowledgeCount = 0;
  let toolCount = 0;
  let totalConfidence = 0;
  let lowConfidenceCount = 0;
  let totalTimeMs = 0;
  let totalTokens = 0;
  const confidences: number[] = [];
  const categories = new Set<string>();

  for (const result of results) {
    totalEntries += result.extractedCount;
    totalTimeMs += result.processingTimeMs;
    totalTokens += result.tokensUsed;

    for (const entry of result.entryResults) {
      if (entry.matchedEntry) {
        if (entry.matchedEntry.type === 'guideline') guidelineCount++;
        if (entry.matchedEntry.type === 'knowledge') knowledgeCount++;
        if (entry.matchedEntry.type === 'tool') toolCount++;

        const conf = entry.matchedEntry.confidence;
        confidences.push(conf);
        totalConfidence += conf;
        if (conf < 0.7) lowConfidenceCount++;

        if (entry.matchedEntry.category) {
          categories.add(entry.matchedEntry.category);
        }
      }
    }
  }

  // Calculate confidence stats
  const avgConfidence = confidences.length > 0 ? totalConfidence / confidences.length : 0;
  const variance = confidences.length > 0
    ? confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidences.length
    : 0;
  const stdDev = Math.sqrt(variance);

  return {
    totalEntries,
    byType: {
      guidelines: guidelineCount,
      knowledge: knowledgeCount,
      tools: toolCount,
    },
    atomicity: {
      splitCount: 0, // Would need to be tracked by extraction service
      compoundDetected: 0,
      splitRate: 0,
    },
    confidence: {
      min: confidences.length > 0 ? Math.min(...confidences) : 0,
      max: confidences.length > 0 ? Math.max(...confidences) : 0,
      avg: avgConfidence,
      stdDev,
      lowConfidenceCount,
    },
    duplicates: {
      found: 0, // Would need to be tracked by extraction service
      rate: 0,
    },
    categories: {
      unique: Array.from(categories),
      count: categories.size,
    },
    processing: {
      totalTimeMs,
      avgTimePerEntry: totalEntries > 0 ? totalTimeMs / totalEntries : 0,
      tokensUsed: totalTokens,
      tokensPerEntry: totalEntries > 0 ? totalTokens / totalEntries : 0,
    },
  };
}

/**
 * Aggregate results across all test cases
 */
export function aggregateResults(results: TestCaseResult[]): AggregatedExtractionMetrics {
  const validResults = results.filter(r => !r.error);
  const errorCount = results.length - validResults.length;

  // Overall averages
  const avgPrecision = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.precision, 0) / validResults.length
    : 0;
  const avgRecall = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.recall, 0) / validResults.length
    : 0;
  const avgF1Score = validResults.length > 0
    ? validResults.reduce((sum, r) => sum + r.f1Score, 0) / validResults.length
    : 0;

  // By difficulty
  const byDifficulty: AggregatedExtractionMetrics['byDifficulty'] = {
    easy: { count: 0, avgPrecision: 0, avgRecall: 0, avgF1: 0 },
    medium: { count: 0, avgPrecision: 0, avgRecall: 0, avgF1: 0 },
    hard: { count: 0, avgPrecision: 0, avgRecall: 0, avgF1: 0 },
  };

  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const diffResults = validResults.filter(r => r.difficulty === difficulty);
    if (diffResults.length > 0) {
      byDifficulty[difficulty] = {
        count: diffResults.length,
        avgPrecision: diffResults.reduce((sum, r) => sum + r.precision, 0) / diffResults.length,
        avgRecall: diffResults.reduce((sum, r) => sum + r.recall, 0) / diffResults.length,
        avgF1: diffResults.reduce((sum, r) => sum + r.f1Score, 0) / diffResults.length,
      };
    }
  }

  // By category
  const byCategory: Record<string, { count: number; avgPrecision: number; avgRecall: number; avgF1: number }> = {};
  const categories = Array.from(new Set(validResults.map(r => r.category)));

  for (const category of categories) {
    const catResults = validResults.filter(r => r.category === category);
    if (catResults.length > 0) {
      byCategory[EXTRACTION_CATEGORY_NAMES[category as ExtractionTestCategory] || category] = {
        count: catResults.length,
        avgPrecision: catResults.reduce((sum, r) => sum + r.precision, 0) / catResults.length,
        avgRecall: catResults.reduce((sum, r) => sum + r.recall, 0) / catResults.length,
        avgF1: catResults.reduce((sum, r) => sum + r.f1Score, 0) / catResults.length,
      };
    }
  }

  return {
    totalTestCases: results.length,
    errorCount,
    avgPrecision,
    avgRecall,
    avgF1Score,
    byDifficulty,
    byCategory,
    proxyMetrics: calculateProxyMetrics(validResults),
  };
}

/**
 * Run the full benchmark
 */
export async function runBenchmark(
  testCases: ExtractionTestCase[],
  extractFn: ExtractFn,
  config: { provider: string; model: string; atomicityEnabled: boolean },
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<ExtractionBenchmarkResults> {
  const results: TestCaseResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]!;

    if (onProgress) {
      onProgress(i, testCases.length, testCase.name);
    }

    const result = await evaluateTestCase(testCase, extractFn);
    results.push(result);
  }

  if (onProgress) {
    onProgress(testCases.length, testCases.length, 'Complete');
  }

  return {
    timestamp: new Date().toISOString(),
    config: {
      ...config,
      testCasesRun: testCases.length,
    },
    overall: aggregateResults(results),
    testCaseResults: results,
  };
}

/**
 * Print benchmark results in formatted output
 */
export function printBenchmarkResults(results: ExtractionBenchmarkResults): void {
  console.log('\n========================================');
  console.log('Extraction Quality Benchmark Results');
  console.log('========================================');
  console.log(`Provider: ${results.config.provider}`);
  console.log(`Model: ${results.config.model}`);
  console.log(`Test Cases: ${results.config.testCasesRun}`);
  console.log(`Atomicity: ${results.config.atomicityEnabled ? 'Enabled' : 'Disabled'}`);
  console.log('========================================\n');

  const o = results.overall;
  console.log('OVERALL METRICS:');
  console.log(`  Precision:  ${(o.avgPrecision * 100).toFixed(1)}%`);
  console.log(`  Recall:     ${(o.avgRecall * 100).toFixed(1)}%`);
  console.log(`  F1 Score:   ${(o.avgF1Score * 100).toFixed(1)}%`);
  console.log(`  Errors:     ${o.errorCount}`);

  console.log('\nBY DIFFICULTY:');
  console.log('Difficulty | Count | Precision | Recall  | F1');
  console.log('-----------|-------|-----------|---------|-------');
  for (const diff of ['easy', 'medium', 'hard'] as const) {
    const d = o.byDifficulty[diff];
    console.log(
      `${diff.padEnd(10)} | ${d.count.toString().padStart(5)} | ` +
      `${(d.avgPrecision * 100).toFixed(1).padStart(8)}% | ` +
      `${(d.avgRecall * 100).toFixed(1).padStart(6)}% | ` +
      `${(d.avgF1 * 100).toFixed(1).padStart(5)}%`
    );
  }

  console.log('\nBY CATEGORY:');
  console.log('Category              | Count | Precision | Recall  | F1');
  console.log('----------------------|-------|-----------|---------|-------');

  const sortedCategories = Object.entries(o.byCategory)
    .sort((a, b) => b[1].avgF1 - a[1].avgF1);

  for (const [cat, m] of sortedCategories) {
    console.log(
      `${cat.substring(0, 21).padEnd(21)} | ${m.count.toString().padStart(5)} | ` +
      `${(m.avgPrecision * 100).toFixed(1).padStart(8)}% | ` +
      `${(m.avgRecall * 100).toFixed(1).padStart(6)}% | ` +
      `${(m.avgF1 * 100).toFixed(1).padStart(5)}%`
    );
  }

  console.log('\nPROXY METRICS:');
  const pm = o.proxyMetrics;
  console.log(`  Total Entries:      ${pm.totalEntries}`);
  console.log(`  By Type:            G=${pm.byType.guidelines} K=${pm.byType.knowledge} T=${pm.byType.tools}`);
  console.log(`  Confidence:         min=${pm.confidence.min.toFixed(2)} avg=${pm.confidence.avg.toFixed(2)} max=${pm.confidence.max.toFixed(2)}`);
  console.log(`  Low Confidence:     ${pm.confidence.lowConfidenceCount} entries < 0.7`);
  console.log(`  Categories:         ${pm.categories.count} unique`);
  console.log(`  Avg Time/Entry:     ${pm.processing.avgTimePerEntry.toFixed(0)}ms`);
  console.log(`  Avg Tokens/Entry:   ${pm.processing.tokensPerEntry.toFixed(0)}`);

  // Show worst performing test cases
  const worstCases = results.testCaseResults
    .filter(r => !r.error)
    .sort((a, b) => a.f1Score - b.f1Score)
    .slice(0, 5);

  if (worstCases.length > 0) {
    console.log('\nWORST PERFORMING TEST CASES:');
    for (const tc of worstCases) {
      console.log(`  ${tc.testCaseId}: ${tc.testCaseName}`);
      console.log(`    P=${(tc.precision * 100).toFixed(0)}% R=${(tc.recall * 100).toFixed(0)}% F1=${(tc.f1Score * 100).toFixed(0)}%`);
      console.log(`    Expected: ${tc.expectedCount}, Extracted: ${tc.extractedCount}, Matched: ${tc.matchedCount}`);
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
  current: ExtractionBenchmarkResults,
  baseline: ExtractionBenchmarkResults
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
    `Precision       | ${(baseline.overall.avgPrecision * 100).toFixed(1).padStart(7)}% | ` +
    `${(current.overall.avgPrecision * 100).toFixed(1).padStart(7)}% | ` +
    `${delta(current.overall.avgPrecision, baseline.overall.avgPrecision)}`
  );
  console.log(
    `Recall          | ${(baseline.overall.avgRecall * 100).toFixed(1).padStart(7)}% | ` +
    `${(current.overall.avgRecall * 100).toFixed(1).padStart(7)}% | ` +
    `${delta(current.overall.avgRecall, baseline.overall.avgRecall)}`
  );
  console.log(
    `F1 Score        | ${(baseline.overall.avgF1Score * 100).toFixed(1).padStart(7)}% | ` +
    `${(current.overall.avgF1Score * 100).toFixed(1).padStart(7)}% | ` +
    `${delta(current.overall.avgF1Score, baseline.overall.avgF1Score)}`
  );

  console.log('\n========================================\n');
}
