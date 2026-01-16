#!/usr/bin/env npx tsx
/**
 * Classification Quality Benchmark Runner
 *
 * Evaluates classification accuracy against labeled test cases.
 *
 * Usage:
 *   npx tsx tests/benchmarks/run-classification-quality.ts
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { CLASSIFICATION_TEST_CASES, getDatasetStats } from './classification-quality-dataset.js';
import {
  calculateAggregatedMetrics,
  formatMetricsReport,
  runTestCase,
} from './classification-quality-evaluator.js';
import type {
  ClassificationTestResult,
  ClassificationBenchmarkResults,
} from './classification-quality-types.js';
import { ClassificationService } from '../../src/services/classification/index.js';
import type { ClassificationServiceConfig } from '../../src/services/classification/index.js';

// Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = resolve(__dirname, '../../data/benchmark-classification');

/**
 * Initialize a fresh database for benchmarking
 */
function initBenchmarkDb(dbPath: string) {
  const sqlite = new Database(dbPath);

  // Create classification tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS classification_feedback (
      id TEXT PRIMARY KEY,
      text_hash TEXT NOT NULL,
      text_preview TEXT,
      session_id TEXT,
      predicted_type TEXT NOT NULL,
      actual_type TEXT NOT NULL,
      method TEXT NOT NULL,
      confidence REAL NOT NULL,
      matched_patterns TEXT,
      was_correct INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pattern_confidence (
      id TEXT PRIMARY KEY,
      pattern_id TEXT NOT NULL UNIQUE,
      pattern_type TEXT NOT NULL,
      base_weight REAL DEFAULT 0.7 NOT NULL,
      feedback_multiplier REAL DEFAULT 1.0 NOT NULL,
      total_matches INTEGER DEFAULT 0 NOT NULL,
      correct_matches INTEGER DEFAULT 0 NOT NULL,
      incorrect_matches INTEGER DEFAULT 0 NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cf_text_hash ON classification_feedback(text_hash);
    CREATE INDEX IF NOT EXISTS idx_cf_predicted ON classification_feedback(predicted_type, was_correct);
    CREATE INDEX IF NOT EXISTS idx_cf_created ON classification_feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_cf_session ON classification_feedback(session_id);
    CREATE INDEX IF NOT EXISTS idx_pc_type ON pattern_confidence(pattern_type);
    CREATE INDEX IF NOT EXISTS idx_pc_multiplier ON pattern_confidence(feedback_multiplier);
  `);

  return { sqlite, db: drizzle(sqlite) };
}

/**
 * Ensure data directory exists
 */
async function ensureDataDir() {
  const fs = await import('fs');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║         CLASSIFICATION QUALITY BENCHMARK                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Dataset stats
  const stats = getDatasetStats();
  console.log('Dataset Statistics:');
  console.log(`  Total test cases: ${stats.total}`);
  console.log(`  By type:`, stats.byType);
  console.log(`  By difficulty:`, stats.byDifficulty);
  console.log('');

  // Initialize database
  const fs = await import('fs');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = resolve(dataDir, `classification-bench-${Date.now()}.db`);
  console.log(`Initializing benchmark database: ${dbPath}`);

  const { sqlite, db } = initBenchmarkDb(dbPath);

  // Create classification service
  const config: ClassificationServiceConfig = {
    highConfidenceThreshold: 0.85,
    lowConfidenceThreshold: 0.6,
    enableLLMFallback: false, // Pure regex for benchmark
    feedbackDecayDays: 30,
    maxPatternBoost: 0.15,
    maxPatternPenalty: 0.3,
    cacheSize: 500,
    cacheTTLMs: 300000,
    learningRate: 0.1,
  };

  const classificationService = new ClassificationService(db as never, null, config);
  console.log('Classification service initialized (regex-only mode)');
  console.log('');

  // Run test cases
  console.log('Running test cases...');
  const results: ClassificationTestResult[] = [];

  for (let i = 0; i < CLASSIFICATION_TEST_CASES.length; i++) {
    const testCase = CLASSIFICATION_TEST_CASES[i]!;
    const result = await runTestCase(testCase, classificationService);
    results.push(result);

    // Progress indicator
    if ((i + 1) % 10 === 0 || i === CLASSIFICATION_TEST_CASES.length - 1) {
      process.stdout.write(`\r  Progress: ${i + 1}/${CLASSIFICATION_TEST_CASES.length}`);
    }
  }
  console.log('\n');

  // Calculate and display metrics
  const metrics = calculateAggregatedMetrics(results);
  console.log(formatMetricsReport(metrics));

  // Summary verdict
  console.log('');
  const passOverall = metrics.accuracy >= 0.85;
  const passGuideline = metrics.byType['guideline']!.precision >= 0.9;
  const passKnowledge = metrics.byType['knowledge']!.precision >= 0.8;
  const passTool = metrics.byType['tool']!.precision >= 0.9;

  console.log('SUCCESS CRITERIA:');
  console.log(
    `  Overall Accuracy ≥85%:     ${passOverall ? '✓ PASS' : '✗ FAIL'} (${(metrics.accuracy * 100).toFixed(1)}%)`
  );
  console.log(
    `  Guideline Precision ≥90%:  ${passGuideline ? '✓ PASS' : '✗ FAIL'} (${(metrics.byType['guideline']!.precision * 100).toFixed(1)}%)`
  );
  console.log(
    `  Knowledge Precision ≥80%:  ${passKnowledge ? '✓ PASS' : '✗ FAIL'} (${(metrics.byType['knowledge']!.precision * 100).toFixed(1)}%)`
  );
  console.log(
    `  Tool Precision ≥90%:       ${passTool ? '✓ PASS' : '✗ FAIL'} (${(metrics.byType['tool']!.precision * 100).toFixed(1)}%)`
  );
  console.log('');

  // Show failed cases
  const failedCases = results.filter((r) => !r.correct && !r.error);
  if (failedCases.length > 0) {
    console.log('FAILED TEST CASES:');
    console.log('───────────────────────────────────────────────────────────────────────');
    for (const failed of failedCases) {
      console.log(
        `  [${failed.testCaseId}] "${failed.text.slice(0, 50)}${failed.text.length > 50 ? '...' : ''}"`
      );
      console.log(
        `    Expected: ${failed.expectedType}, Got: ${failed.predictedType} (conf: ${(failed.confidence * 100).toFixed(0)}%)`
      );
    }
    console.log('');
  }

  // Build full results object
  const benchmarkResults: ClassificationBenchmarkResults = {
    timestamp: new Date().toISOString(),
    config: {
      testCasesRun: stats.total,
      llmFallbackEnabled: config.enableLLMFallback,
      highConfidenceThreshold: config.highConfidenceThreshold,
      lowConfidenceThreshold: config.lowConfidenceThreshold,
    },
    overall: metrics,
    testCaseResults: results,
  };

  // Write results to JSON
  const resultsPath = resolve(dataDir, `classification-results-${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(benchmarkResults, null, 2));
  console.log(`Results saved to: ${resultsPath}`);

  // Cleanup
  sqlite.close();

  // Exit with appropriate code
  const allPass = passOverall && passGuideline && passKnowledge && passTool;
  process.exit(allPass ? 0 : 1);
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
