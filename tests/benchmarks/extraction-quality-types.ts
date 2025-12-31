/**
 * Extraction Quality Benchmark Types
 *
 * Types for evaluating extraction quality with ground truth test cases.
 * Measures precision, recall, and quality of extracted entries.
 */

/**
 * Expected extraction from a test case
 */
export interface ExpectedEntry {
  /** Entry type */
  type: 'guideline' | 'knowledge' | 'tool';

  /** Required content fragments (at least one must appear in extracted content) */
  mustContain: string[];

  /** Optional: expected name pattern (regex) */
  namePattern?: string;

  /** Optional: expected category */
  category?: string;

  /** Optional: minimum confidence threshold */
  minConfidence?: number;

  /** Optional: expected priority (for guidelines) */
  priority?: number;

  /** Optional: tags that should be suggested */
  expectedTags?: string[];
}

/**
 * Single extraction test case
 */
export interface ExtractionTestCase {
  /** Unique test case ID */
  id: string;

  /** Test case name/description */
  name: string;

  /** Category for grouping results */
  category: ExtractionTestCategory;

  /** Input context to extract from */
  context: string;

  /** Context type */
  contextType: 'conversation' | 'code' | 'mixed';

  /** Expected extractions */
  expectedEntries: ExpectedEntry[];

  /** Content that should NOT be extracted (noise) */
  shouldNotExtract?: string[];

  /** Difficulty level for analysis */
  difficulty: 'easy' | 'medium' | 'hard';

  /** Optional notes about the test case */
  notes?: string;
}

/**
 * Test case categories for analysis
 */
export type ExtractionTestCategory =
  | 'guidelines-explicit'      // "Always do X", "Never do Y"
  | 'guidelines-implicit'      // Implied rules from context
  | 'guidelines-compound'      // Multiple rules in one statement
  | 'knowledge-decisions'      // "We chose X because Y"
  | 'knowledge-facts'          // Factual information
  | 'knowledge-temporal'       // Time-sensitive information
  | 'tools-cli'                // Command line tools
  | 'tools-api'                // API endpoints
  | 'tools-scripts'            // Scripts and automation
  | 'mixed-content'            // Multiple types in one context
  | 'noise-resistance'         // Should extract little/nothing
  | 'edge-cases'               // Unusual patterns
  | 'atomicity'                // Compound statements to split
  | 'deduplication';           // Similar/duplicate content

/**
 * Category display names
 */
export const EXTRACTION_CATEGORY_NAMES: Record<ExtractionTestCategory, string> = {
  'guidelines-explicit': 'Explicit Guidelines',
  'guidelines-implicit': 'Implicit Guidelines',
  'guidelines-compound': 'Compound Guidelines',
  'knowledge-decisions': 'Decisions',
  'knowledge-facts': 'Facts',
  'knowledge-temporal': 'Temporal Knowledge',
  'tools-cli': 'CLI Tools',
  'tools-api': 'API Tools',
  'tools-scripts': 'Scripts',
  'mixed-content': 'Mixed Content',
  'noise-resistance': 'Noise Resistance',
  'edge-cases': 'Edge Cases',
  'atomicity': 'Atomicity',
  'deduplication': 'Deduplication',
};

/**
 * Result of evaluating a single expected entry
 */
export interface EntryMatchResult {
  /** The expected entry */
  expected: ExpectedEntry;

  /** Whether a matching entry was found */
  matched: boolean;

  /** The matching extracted entry (if found) */
  matchedEntry?: {
    type: string;
    name?: string;
    title?: string;
    content: string;
    category?: string;
    confidence: number;
    suggestedTags?: string[];
  };

  /** Match quality score (0-1) */
  matchScore: number;

  /** Details about the match/mismatch */
  details: string;
}

/**
 * Result of evaluating a single test case
 */
export interface TestCaseResult {
  /** Test case ID */
  testCaseId: string;

  /** Test case name */
  testCaseName: string;

  /** Test case category */
  category: ExtractionTestCategory;

  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';

  /** Number of expected entries */
  expectedCount: number;

  /** Number of entries actually extracted */
  extractedCount: number;

  /** Number of expected entries that were matched */
  matchedCount: number;

  /** Number of false positives (extracted but not expected) */
  falsePositiveCount: number;

  /** Precision: matched / extracted */
  precision: number;

  /** Recall: matched / expected */
  recall: number;

  /** F1 score: 2 * (precision * recall) / (precision + recall) */
  f1Score: number;

  /** Individual entry match results */
  entryResults: EntryMatchResult[];

  /** Noise that was incorrectly extracted */
  noiseExtracted: string[];

  /** Processing time in ms */
  processingTimeMs: number;

  /** Tokens used */
  tokensUsed: number;

  /** Any errors during extraction */
  error?: string;
}

/**
 * Proxy metrics collected during extraction
 */
export interface ExtractionProxyMetrics {
  /** Total entries extracted */
  totalEntries: number;

  /** Entries by type */
  byType: {
    guidelines: number;
    knowledge: number;
    tools: number;
  };

  /** Atomicity metrics */
  atomicity: {
    /** Entries that were split */
    splitCount: number;
    /** Original compound entries detected */
    compoundDetected: number;
    /** Split rate */
    splitRate: number;
  };

  /** Confidence distribution */
  confidence: {
    min: number;
    max: number;
    avg: number;
    stdDev: number;
    /** Entries below 0.7 confidence */
    lowConfidenceCount: number;
  };

  /** Duplicate detection */
  duplicates: {
    /** Duplicates found */
    found: number;
    /** Duplicate rate */
    rate: number;
  };

  /** Category coverage */
  categories: {
    unique: string[];
    count: number;
  };

  /** Processing metrics */
  processing: {
    totalTimeMs: number;
    avgTimePerEntry: number;
    tokensUsed: number;
    tokensPerEntry: number;
  };
}

/**
 * Aggregated metrics across multiple test cases
 */
export interface AggregatedExtractionMetrics {
  /** Total test cases run */
  totalTestCases: number;

  /** Test cases with errors */
  errorCount: number;

  /** Average precision across all test cases */
  avgPrecision: number;

  /** Average recall across all test cases */
  avgRecall: number;

  /** Average F1 score */
  avgF1Score: number;

  /** Precision by difficulty */
  byDifficulty: Record<'easy' | 'medium' | 'hard', {
    count: number;
    avgPrecision: number;
    avgRecall: number;
    avgF1: number;
  }>;

  /** Metrics by category */
  byCategory: Record<string, {
    count: number;
    avgPrecision: number;
    avgRecall: number;
    avgF1: number;
  }>;

  /** Aggregated proxy metrics */
  proxyMetrics: ExtractionProxyMetrics;
}

/**
 * Full benchmark results
 */
export interface ExtractionBenchmarkResults {
  /** Timestamp of benchmark run */
  timestamp: string;

  /** Configuration used */
  config: {
    provider: string;
    model: string;
    atomicityEnabled: boolean;
    testCasesRun: number;
  };

  /** Overall metrics */
  overall: AggregatedExtractionMetrics;

  /** Individual test case results */
  testCaseResults: TestCaseResult[];

  /** Comparison to baseline (if available) */
  comparison?: {
    baselineTimestamp: string;
    precisionDelta: number;
    recallDelta: number;
    f1Delta: number;
  };
}
