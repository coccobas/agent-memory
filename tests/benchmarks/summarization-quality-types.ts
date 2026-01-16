/**
 * Summarization Quality Benchmark Types
 *
 * Types for evaluating summarization quality using ROUGE, BERTScore,
 * and Groundedness metrics. Tests the hierarchical summarization feature.
 */

import type { ROUGEScores, BERTScoreResult, GroundednessResult } from './metrics/index.js';

// =============================================================================
// TEST CASE TYPES
// =============================================================================

/**
 * Source entry for summarization test
 */
export interface SummarizationSourceEntry {
  /** Entry type (for context) */
  type: 'guideline' | 'knowledge' | 'tool';
  /** Entry content to summarize */
  content: string;
  /** Optional category for grouping */
  category?: string;
}

/**
 * Single summarization test case
 */
export interface SummarizationTestCase {
  /** Unique test case ID */
  id: string;

  /** Test case name/description */
  name: string;

  /** Test category for grouping results */
  category: SummarizationTestCategory;

  /** Source entries to summarize */
  sourceEntries: SummarizationSourceEntry[];

  /** Optional reference summary (for ROUGE comparison) */
  expectedSummary?: string;

  /** Keywords that should appear in summary */
  mustContainKeywords?: string[];

  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';

  /** Optional notes about the test case */
  notes?: string;
}

/**
 * Test case categories
 */
export type SummarizationTestCategory =
  | 'simple-aggregation' // 2-3 related facts
  | 'mixed-types' // Guidelines + Knowledge + Tools
  | 'hierarchical' // Content forming natural hierarchy
  | 'contradiction-handling' // Conflicting information
  | 'noise-resistance' // Relevant + irrelevant content
  | 'large-scale' // 10+ entries
  | 'temporal' // Time-sensitive information
  | 'domain-specific' // Technical/domain-specific content
  // New adversarial/realistic categories
  | 'heavy-compression' // 20-50 source entries needing aggressive compression
  | 'length-constrained' // Target word/sentence count
  | 'redundancy-handling' // 80%+ repeated/overlapping information
  | 'scattered-info' // Non-linear, chaotic inputs
  | 'temporal-conflicts' // Old vs new conflicting information
  | 'multi-topic' // 3+ distinct concerns mixed together
  | 'authority-weighted' // Some sources more authoritative than others
  | 'partial-incomplete' // Truncated/incomplete entries
  | 'style-variations' // Executive/technical/casual tone requirements
  | 'true-contradictions' // Team A says X, Team B says not-X
  | 'extreme-noise' // 80%+ irrelevant content
  | 'ambiguous-importance'; // Unclear what matters most

/**
 * Category display names
 */
export const SUMMARIZATION_CATEGORY_NAMES: Record<SummarizationTestCategory, string> = {
  'simple-aggregation': 'Simple Aggregation',
  'mixed-types': 'Mixed Types',
  hierarchical: 'Hierarchical Content',
  'contradiction-handling': 'Contradiction Handling',
  'noise-resistance': 'Noise Resistance',
  'large-scale': 'Large Scale',
  temporal: 'Temporal',
  'domain-specific': 'Domain Specific',
  // New categories
  'heavy-compression': 'Heavy Compression',
  'length-constrained': 'Length Constrained',
  'redundancy-handling': 'Redundancy Handling',
  'scattered-info': 'Scattered Information',
  'temporal-conflicts': 'Temporal Conflicts',
  'multi-topic': 'Multi-Topic',
  'authority-weighted': 'Authority Weighted',
  'partial-incomplete': 'Partial/Incomplete',
  'style-variations': 'Style Variations',
  'true-contradictions': 'True Contradictions',
  'extreme-noise': 'Extreme Noise',
  'ambiguous-importance': 'Ambiguous Importance',
};

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result for a single summarization test case
 */
export interface SummarizationTestResult {
  /** Test case ID */
  testCaseId: string;

  /** Test case name */
  testCaseName: string;

  /** Test category */
  category: SummarizationTestCategory;

  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';

  /** Generated summary text */
  generatedSummary: string;

  /** ROUGE scores (if reference summary available) */
  rouge?: ROUGEScores;

  /** BERTScore comparing summary to source content */
  bertScore?: BERTScoreResult;

  /** Groundedness of summary in source content */
  groundedness: GroundednessResult;

  /** Compression ratio (source tokens / summary tokens) */
  compressionRatio: number;

  /** Processing time in ms */
  processingTimeMs: number;

  /** Keywords found in summary (if mustContainKeywords specified) */
  keywordsFound?: string[];

  /** Keywords missing from summary */
  keywordsMissing?: string[];

  /** Error message if summarization failed */
  error?: string;
}

/**
 * Aggregated metrics across multiple test cases
 */
export interface AggregatedSummarizationMetrics {
  /** Total test cases run */
  totalTestCases: number;

  /** Test cases with errors */
  errorCount: number;

  /** Average ROUGE scores (for cases with reference summaries) */
  avgRouge?: {
    rouge1F1: number;
    rouge2F1: number;
    rougeLF1: number;
    testCasesWithReference: number;
  };

  /** Average BERTScore */
  avgBERTScore?: {
    precision: number;
    recall: number;
    f1: number;
  };

  /** Average groundedness score */
  avgGroundednessScore: number;

  /** Average hallucination rate */
  avgHallucinationRate: number;

  /** Average compression ratio */
  avgCompressionRatio: number;

  /** Keyword coverage (if keywords specified) */
  keywordCoverage?: {
    totalExpected: number;
    totalFound: number;
    coverageRate: number;
  };

  /** Metrics by difficulty */
  byDifficulty: Record<
    'easy' | 'medium' | 'hard',
    {
      count: number;
      avgGroundedness: number;
      avgCompressionRatio: number;
      avgRougeL?: number;
    }
  >;

  /** Metrics by category */
  byCategory: Record<
    string,
    {
      count: number;
      avgGroundedness: number;
      avgCompressionRatio: number;
      avgRougeL?: number;
    }
  >;

  /** Processing statistics */
  processing: {
    totalTimeMs: number;
    avgTimePerCase: number;
  };
}

/**
 * Full benchmark results
 */
export interface SummarizationBenchmarkResults {
  /** Timestamp of benchmark run */
  timestamp: string;

  /** Configuration used */
  config: {
    /** Summarization level tested */
    level: 'chunk' | 'topic' | 'domain';
    /** Whether embeddings were available */
    embeddingsEnabled: boolean;
    /** Test cases run */
    testCasesRun: number;
    /** Groundedness threshold used */
    groundednessThreshold: number;
  };

  /** Overall metrics */
  overall: AggregatedSummarizationMetrics;

  /** Individual test case results */
  testCaseResults: SummarizationTestResult[];

  /** Comparison to baseline (if available) */
  comparison?: {
    baselineTimestamp: string;
    groundednessDelta: number;
    compressionDelta: number;
    rougeLDelta?: number;
  };
}
