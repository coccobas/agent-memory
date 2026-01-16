#!/usr/bin/env npx tsx
/**
 * Extraction Quality Benchmark Runner
 *
 * Runs the extraction quality benchmark against ground truth test cases.
 * Measures precision, recall, F1, and proxy metrics.
 * Optionally computes semantic metrics (BERTScore, Groundedness).
 *
 * Usage:
 *   npx tsx tests/benchmarks/run-extraction-quality.ts [options]
 *
 * Options:
 *   --category CAT        Only run tests in this category
 *   --difficulty D        Only run tests with this difficulty (easy|medium|hard)
 *   --limit N             Limit to first N test cases
 *   --provider P          Extraction provider (openai|anthropic|ollama)
 *   --model M             Model to use
 *   --save FILE           Save results to JSON file
 *   --compare FILE        Compare against baseline results file
 *   --debug               Show detailed output for each test case
 *   --semantic            Enable semantic metrics (BERTScore, Groundedness)
 *   --bert-threshold N    BERTScore similarity threshold (default: 0.85)
 *   --grounded-threshold N  Groundedness threshold (default: 0.7)
 *   --help, -h            Show this help
 */

// Load .env file FIRST
import 'dotenv/config';

import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Parse command line args
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const debugMode = args.includes('--debug');

const getArgValue = (flag: string): string | undefined => {
  const idx = args.findIndex((a) => a === flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
};

const category = getArgValue('--category');
const difficulty = getArgValue('--difficulty') as 'easy' | 'medium' | 'hard' | undefined;
const limit = getArgValue('--limit') ? parseInt(getArgValue('--limit')!, 10) : undefined;
const provider = getArgValue('--provider') || 'openai';
const model = getArgValue('--model');
const saveFile = getArgValue('--save');
const compareFile = getArgValue('--compare');
const semanticEnabled = args.includes('--semantic');
const bertThreshold = getArgValue('--bert-threshold')
  ? parseFloat(getArgValue('--bert-threshold')!)
  : 0.85;
const groundedThreshold = getArgValue('--grounded-threshold')
  ? parseFloat(getArgValue('--grounded-threshold')!)
  : 0.7;

if (showHelp) {
  console.log(`
Extraction Quality Benchmark Runner

Evaluates extraction quality against 75+ ground truth test cases.
Measures precision, recall, F1 scores, and proxy metrics.

Usage: npx tsx tests/benchmarks/run-extraction-quality.ts [options]

Options:
  --category CAT           Only run tests in this category
                           Categories: guidelines-explicit, guidelines-implicit,
                           guidelines-compound, knowledge-decisions, knowledge-facts,
                           knowledge-temporal, tools-cli, tools-api, mixed-content,
                           noise-resistance, edge-cases
  --difficulty D           Only run tests with this difficulty (easy|medium|hard)
  --limit N                Limit to first N test cases
  --provider P             Extraction provider (openai|anthropic|ollama)
  --model M                Model to use (default: provider's default)
  --save FILE              Save results to JSON file
  --compare FILE           Compare against baseline results file
  --debug                  Show detailed output for each test case
  --semantic               Enable semantic metrics (BERTScore, Groundedness)
  --bert-threshold N       BERTScore similarity threshold (default: 0.85)
  --grounded-threshold N   Groundedness threshold (default: 0.7)
  --help, -h               Show this help

Examples:
  npx tsx tests/benchmarks/run-extraction-quality.ts
  npx tsx tests/benchmarks/run-extraction-quality.ts --category guidelines-explicit
  npx tsx tests/benchmarks/run-extraction-quality.ts --difficulty hard --debug
  npx tsx tests/benchmarks/run-extraction-quality.ts --limit 10 --save baseline.json
  npx tsx tests/benchmarks/run-extraction-quality.ts --compare baseline.json
  npx tsx tests/benchmarks/run-extraction-quality.ts --semantic --limit 20
`);
  process.exit(0);
}

// Dynamic imports
const { config: appConfig } = await import('../../src/config/index.js');
const { ExtractionService } = await import('../../src/services/extraction.service.js');
const { EmbeddingService } = await import('../../src/services/embedding.service.js');
const { EXTRACTION_TEST_CASES, getDatasetStats } = await import('./extraction-quality-dataset.js');
const { runBenchmark, printBenchmarkResults, compareBenchmarks } =
  await import('./extraction-quality-evaluator.js');
import type { ExtractionBenchmarkResults } from './extraction-quality-types.js';
import type { SemanticEvalConfig } from './extraction-quality-evaluator.js';

// =============================================================================
// SETUP
// =============================================================================

async function main() {
  console.log('\n========================================');
  console.log('Extraction Quality Benchmark');
  console.log('========================================');

  // Get dataset stats
  const stats = getDatasetStats();
  console.log(
    `Dataset: ${stats.totalTestCases} test cases, ${stats.totalExpectedEntries} expected entries`
  );
  console.log(
    `By difficulty: easy=${stats.byDifficulty.easy}, medium=${stats.byDifficulty.medium}, hard=${stats.byDifficulty.hard}`
  );

  // Filter test cases
  let testCases = [...EXTRACTION_TEST_CASES];

  if (category) {
    testCases = testCases.filter((tc) => tc.category === category);
    console.log(`Filtering to category: ${category} (${testCases.length} cases)`);
  }

  if (difficulty) {
    testCases = testCases.filter((tc) => tc.difficulty === difficulty);
    console.log(`Filtering to difficulty: ${difficulty} (${testCases.length} cases)`);
  }

  if (limit && limit < testCases.length) {
    testCases = testCases.slice(0, limit);
    console.log(`Limiting to first ${limit} cases`);
  }

  if (testCases.length === 0) {
    console.error('No test cases match the filters');
    process.exit(1);
  }

  console.log(`\nRunning ${testCases.length} test cases...`);
  console.log('========================================\n');

  // Create extraction service
  const extractionConfig = {
    provider: provider as 'openai' | 'anthropic' | 'ollama',
    openaiApiKey: appConfig.extraction.openaiApiKey || process.env.OPENAI_API_KEY,
    openaiModel: model || appConfig.extraction.openaiModel || 'gpt-4o-mini',
    anthropicApiKey: appConfig.extraction.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    anthropicModel: model || appConfig.extraction.anthropicModel || 'claude-3-5-sonnet-20241022',
    ollamaBaseUrl: appConfig.extraction.ollamaBaseUrl || 'http://localhost:11434',
    ollamaModel: model || appConfig.extraction.ollamaModel || 'llama3.2',
  };

  console.log(`Provider: ${extractionConfig.provider}`);
  console.log(
    `Model: ${extractionConfig[`${extractionConfig.provider}Model` as keyof typeof extractionConfig]}`
  );
  console.log(`Atomicity: ${appConfig.extraction.atomicityEnabled ? 'Enabled' : 'Disabled'}`);
  console.log(`Semantic Metrics: ${semanticEnabled ? 'Enabled' : 'Disabled'}`);
  if (semanticEnabled) {
    console.log(`  BERTScore Threshold: ${bertThreshold}`);
    console.log(`  Groundedness Threshold: ${groundedThreshold}`);
  }
  console.log('');

  const extractionService = new ExtractionService(extractionConfig);

  // Create semantic config if enabled
  let semanticConfig: SemanticEvalConfig | undefined;
  if (semanticEnabled) {
    const embeddingService = new EmbeddingService();
    if (!embeddingService.isAvailable()) {
      console.error('Warning: Embedding service not available. Semantic metrics will be skipped.');
    } else {
      semanticConfig = {
        enabled: true,
        embeddingService,
        bertScoreThreshold: bertThreshold,
        groundednessThreshold: groundedThreshold,
      };
    }
  }

  // Create extract function wrapper
  const extractFn = async (context: string, contextType: string) => {
    if (!context || context.trim() === '') {
      return { entries: [], processingTimeMs: 0, tokensUsed: 0 };
    }

    const result = await extractionService.extract({
      context,
      contextType: contextType as 'conversation' | 'code' | 'mixed',
    });

    return {
      entries: result.entries.map((e) => ({
        type: e.type,
        name: e.name,
        title: e.title,
        content: e.content,
        category: e.category,
        confidence: e.confidence,
        suggestedTags: e.suggestedTags,
      })),
      processingTimeMs: result.processingTimeMs || 0,
      tokensUsed: result.tokensUsed || 0,
    };
  };

  // Run benchmark with progress
  let lastPercent = 0;
  const results = await runBenchmark(
    testCases,
    extractFn,
    {
      provider: extractionConfig.provider,
      model: String(
        extractionConfig[`${extractionConfig.provider}Model` as keyof typeof extractionConfig]
      ),
      atomicityEnabled: appConfig.extraction.atomicityEnabled,
      semanticConfig,
    },
    (completed, total, current) => {
      const percent = Math.floor((completed / total) * 100);
      if (percent > lastPercent || completed === total) {
        process.stdout.write(
          `\rProgress: ${percent}% (${completed}/${total}) - ${current.substring(0, 40).padEnd(40)}`
        );
        lastPercent = percent;
      }
    }
  );

  console.log('\n');

  // Print detailed results for each test case in debug mode
  if (debugMode) {
    console.log('\nDETAILED RESULTS:');
    console.log('=================\n');

    for (const tc of results.testCaseResults) {
      console.log(`[${tc.testCaseId}] ${tc.testCaseName}`);
      console.log(`  Category: ${tc.category}, Difficulty: ${tc.difficulty}`);
      console.log(
        `  Expected: ${tc.expectedCount}, Extracted: ${tc.extractedCount}, Matched: ${tc.matchedCount}`
      );
      console.log(
        `  Precision: ${(tc.precision * 100).toFixed(1)}%, Recall: ${(tc.recall * 100).toFixed(1)}%, F1: ${(tc.f1Score * 100).toFixed(1)}%`
      );

      if (tc.error) {
        console.log(`  ERROR: ${tc.error}`);
      }

      for (const entry of tc.entryResults) {
        const status = entry.matched ? '✓' : '✗';
        console.log(
          `  ${status} [${entry.expected.type}] ${entry.expected.mustContain.join(', ')}`
        );
        console.log(`    ${entry.details}`);
      }

      if (tc.noiseExtracted.length > 0) {
        console.log(`  ⚠ Noise extracted: ${tc.noiseExtracted.join(', ')}`);
      }

      console.log('');
    }
  }

  // Print summary results
  printBenchmarkResults(results);

  // Save results if requested
  if (saveFile) {
    await writeFile(saveFile, JSON.stringify(results, null, 2));
    console.log(`Results saved to: ${saveFile}`);
  }

  // Compare to baseline if requested
  if (compareFile && existsSync(compareFile)) {
    const baselineData = await readFile(compareFile, 'utf-8');
    const baseline = JSON.parse(baselineData) as ExtractionBenchmarkResults;
    compareBenchmarks(results, baseline);
  }

  // Exit with error if F1 < 50%
  if (results.overall.avgF1Score < 0.5) {
    console.log('⚠ Warning: F1 score below 50%');
    process.exit(1);
  }
}

// =============================================================================
// MAIN
// =============================================================================

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
