#!/usr/bin/env npx tsx
/**
 * Summarization Quality Benchmark Runner
 *
 * Runs the summarization quality benchmark against test cases.
 * Measures ROUGE, BERTScore, Groundedness, and compression metrics.
 *
 * Usage:
 *   npx tsx tests/benchmarks/run-summarization-quality.ts [options]
 *
 * Options:
 *   --category CAT           Only run tests in this category
 *   --difficulty D           Only run tests with this difficulty (easy|medium|hard)
 *   --limit N                Limit to first N test cases
 *   --provider P             LLM provider for summarization (openai|anthropic|ollama|mock)
 *   --model M                Model to use (default: provider's default)
 *   --grounded-threshold N   Groundedness threshold (default: 0.7)
 *   --enable-bert            Enable BERTScore (slow, requires embeddings)
 *   --save FILE              Save results to JSON file
 *   --compare FILE           Compare against baseline results file
 *   --debug                  Show detailed output for each test case
 *   --help, -h               Show this help
 */

// Load .env file FIRST
import 'dotenv/config';

import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Parse command line args
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const debugMode = args.includes('--debug');
const enableBert = args.includes('--enable-bert');

const getArgValue = (flag: string): string | undefined => {
  const idx = args.findIndex(a => a === flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
};

const category = getArgValue('--category');
const difficulty = getArgValue('--difficulty') as 'easy' | 'medium' | 'hard' | undefined;
const limit = getArgValue('--limit') ? parseInt(getArgValue('--limit')!, 10) : undefined;
const provider = getArgValue('--provider') || 'mock';
const model = getArgValue('--model');
const groundedThreshold = getArgValue('--grounded-threshold') ? parseFloat(getArgValue('--grounded-threshold')!) : 0.7;
const saveFile = getArgValue('--save');
const compareFile = getArgValue('--compare');

if (showHelp) {
  console.log(`
Summarization Quality Benchmark Runner

Evaluates summarization quality using ROUGE, BERTScore, and Groundedness.
Tests the hierarchical summarization feature.

Usage: npx tsx tests/benchmarks/run-summarization-quality.ts [options]

Options:
  --category CAT           Only run tests in this category
                           Categories: simple-aggregation, mixed-types,
                           hierarchical, contradiction-handling, noise-resistance,
                           large-scale, temporal, domain-specific
  --difficulty D           Only run tests with this difficulty (easy|medium|hard)
  --limit N                Limit to first N test cases
  --provider P             LLM provider (openai|anthropic|ollama|mock)
  --model M                Model to use (default: provider's default)
  --grounded-threshold N   Groundedness threshold (default: 0.7)
  --enable-bert            Enable BERTScore (slow, requires embeddings)
  --save FILE              Save results to JSON file
  --compare FILE           Compare against baseline results file
  --debug                  Show detailed output for each test case
  --help, -h               Show this help

Examples:
  npx tsx tests/benchmarks/run-summarization-quality.ts
  npx tsx tests/benchmarks/run-summarization-quality.ts --category simple-aggregation
  npx tsx tests/benchmarks/run-summarization-quality.ts --difficulty hard --debug
  npx tsx tests/benchmarks/run-summarization-quality.ts --provider openai --enable-bert
  npx tsx tests/benchmarks/run-summarization-quality.ts --limit 10 --save baseline.json
`);
  process.exit(0);
}

// Dynamic imports
const { config: appConfig } = await import('../../src/config/index.js');
const { EmbeddingService } = await import('../../src/services/embedding.service.js');
const { LLMSummarizer } = await import('../../src/services/summarization/summarizer/llm-summarizer.js');
const { SUMMARIZATION_TEST_CASES, getDatasetStats } = await import('./summarization-quality-dataset.js');
const { runBenchmark, printBenchmarkResults, compareBenchmarks } = await import('./summarization-quality-evaluator.js');
import type { SummarizationBenchmarkResults } from './summarization-quality-types.js';
import type { SummarizeFn } from './summarization-quality-evaluator.js';

// =============================================================================
// MOCK SUMMARIZER
// =============================================================================

/**
 * Simple mock summarizer for testing without LLM costs
 * Concatenates content with basic compression
 */
function createMockSummarizer(): SummarizeFn {
  return async (sourceContents: string[]) => {
    // Simple summary: combine unique sentences, remove duplicates
    const allContent = sourceContents.join(' ');
    const sentences = allContent
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    // Take key sentences (first 3 or 30% whichever is less)
    const numSentences = Math.min(3, Math.ceil(sentences.length * 0.3));
    const summary = sentences.slice(0, numSentences).join(' ');

    return summary || 'Summary of provided content.';
  };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('\n========================================');
  console.log('Summarization Quality Benchmark');
  console.log('========================================');

  // Get dataset stats
  const stats = getDatasetStats();
  console.log(`Dataset: ${stats.totalTestCases} test cases, ${stats.totalSourceEntries} source entries`);
  console.log(`By difficulty: easy=${stats.byDifficulty.easy}, medium=${stats.byDifficulty.medium}, hard=${stats.byDifficulty.hard}`);
  console.log(`Reference summaries: ${stats.casesWithExpectedSummary}`);

  // Filter test cases
  let testCases = [...SUMMARIZATION_TEST_CASES];

  if (category) {
    testCases = testCases.filter(tc => tc.category === category);
    console.log(`Filtering to category: ${category} (${testCases.length} cases)`);
  }

  if (difficulty) {
    testCases = testCases.filter(tc => tc.difficulty === difficulty);
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

  // Create embedding service for semantic metrics
  const embeddingService = new EmbeddingService();
  if (!embeddingService.isAvailable()) {
    console.error('Warning: Embedding service not available. Semantic metrics will be limited.');
  }

  // Create summarize function
  let summarizeFn: SummarizeFn;

  if (provider === 'mock') {
    console.log('Provider: mock (no LLM calls)');
    summarizeFn = createMockSummarizer();
  } else {
    // Create real summarizer
    const summarizerConfig: {
      provider: 'openai' | 'anthropic' | 'ollama';
      openaiApiKey?: string;
      anthropicApiKey?: string;
      ollamaBaseUrl?: string;
      model?: string;
    } = {
      provider: provider as 'openai' | 'anthropic' | 'ollama',
      openaiApiKey: appConfig.extraction.openaiApiKey || process.env.OPENAI_API_KEY,
      anthropicApiKey: appConfig.extraction.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
      ollamaBaseUrl: appConfig.extraction.ollamaBaseUrl || 'http://localhost:11434',
      model: model,
    };

    console.log(`Provider: ${summarizerConfig.provider}`);
    console.log(`Model: ${model || 'default'}`);

    const summarizer = new LLMSummarizer(summarizerConfig);

    summarizeFn = async (sourceContents: string[]) => {
      const items = sourceContents.map((content, i) => ({
        id: `item-${i}`,
        type: 'knowledge' as const,
        title: `Item ${i + 1}`,
        content,
      }));

      const result = await summarizer.summarize({
        items,
        hierarchyLevel: 0, // Chunk level
      });

      return result.content;
    };
  }

  console.log(`Groundedness Threshold: ${groundedThreshold}`);
  console.log(`BERTScore: ${enableBert ? 'Enabled' : 'Disabled'}`);
  console.log('');

  // Run benchmark with progress
  let lastPercent = 0;
  const results = await runBenchmark(
    testCases,
    summarizeFn,
    {
      embeddingService,
      groundednessThreshold: groundedThreshold,
      enableBERTScore: enableBert,
      level: 'chunk',
    },
    (completed, total, current) => {
      const percent = Math.floor((completed / total) * 100);
      if (percent > lastPercent || completed === total) {
        process.stdout.write(`\rProgress: ${percent}% (${completed}/${total}) - ${current.substring(0, 40).padEnd(40)}`);
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
      console.log(`  Groundedness: ${(tc.groundedness.score * 100).toFixed(1)}%`);
      console.log(`  Compression Ratio: ${tc.compressionRatio.toFixed(1)}x`);

      if (tc.rouge) {
        console.log(`  ROUGE-L F1: ${tc.rouge.rougeL.f1.toFixed(3)}`);
      }

      if (tc.error) {
        console.log(`  ERROR: ${tc.error}`);
      }

      if (tc.keywordsMissing && tc.keywordsMissing.length > 0) {
        console.log(`  Missing keywords: ${tc.keywordsMissing.join(', ')}`);
      }

      console.log(`  Summary: ${tc.generatedSummary.substring(0, 100)}...`);
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
    const baseline = JSON.parse(baselineData) as SummarizationBenchmarkResults;
    compareBenchmarks(results, baseline);
  }

  // Exit with error if groundedness < 50%
  if (results.overall.avgGroundednessScore < 0.5) {
    console.log('⚠ Warning: Groundedness score below 50%');
    process.exit(1);
  }

  // Cleanup
  embeddingService.cleanup();
}

// =============================================================================
// RUN
// =============================================================================

main().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
