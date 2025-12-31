/**
 * Classification Quality Benchmark Types
 *
 * Types for evaluating classification accuracy with labeled test cases.
 * Measures accuracy, precision, recall, and confidence correlation.
 */

/**
 * Entry type classification result
 */
export type EntryType = 'guideline' | 'knowledge' | 'tool';

/**
 * Classification test case category
 */
export type ClassificationCategory =
  | 'imperative-rule'       // "Always...", "Must...", "Never..."
  | 'prohibition'           // "Don't...", "Avoid..."
  | 'team-standard'         // "We always...", "Our standard is..."
  | 'preference'            // "Prefer X over Y", "Use X instead of Y"
  | 'decision'              // "We decided...", "We chose..."
  | 'fact'                  // "The API uses...", "Our system is..."
  | 'system-description'    // "Our backend...", "The database..."
  | 'cli-command'           // "npm run...", "docker..."
  | 'git-command'           // "git checkout...", "git push..."
  | 'script'                // "Run `command`", "Execute..."
  | 'ambiguous'             // Text that's genuinely hard to classify
  | 'edge-case';            // Unusual patterns

/**
 * Category display names
 */
export const CLASSIFICATION_CATEGORY_NAMES: Record<ClassificationCategory, string> = {
  'imperative-rule': 'Imperative Rules',
  'prohibition': 'Prohibitions',
  'team-standard': 'Team Standards',
  'preference': 'Preferences',
  'decision': 'Decisions',
  'fact': 'Facts',
  'system-description': 'System Descriptions',
  'cli-command': 'CLI Commands',
  'git-command': 'Git Commands',
  'script': 'Scripts',
  'ambiguous': 'Ambiguous',
  'edge-case': 'Edge Cases',
};

/**
 * Single classification test case
 */
export interface ClassificationTestCase {
  /** Unique test case ID */
  id: string;
  /** Input text to classify */
  text: string;
  /** Expected entry type */
  expectedType: EntryType;
  /** Category for grouping results */
  category: ClassificationCategory;
  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Notes about this test case */
  notes?: string;
  /** Acceptable alternative types (for ambiguous cases) */
  acceptableAlternatives?: EntryType[];
}

/**
 * Result for a single classification test case
 */
export interface ClassificationTestResult {
  /** Test case ID */
  testCaseId: string;
  /** Input text */
  text: string;
  /** Expected type */
  expectedType: EntryType;
  /** Predicted type */
  predictedType: EntryType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Classification method used */
  method: string;
  /** Was the prediction correct? */
  correct: boolean;
  /** Was it correct including acceptable alternatives? */
  correctWithAlternatives: boolean;
  /** Category */
  category: ClassificationCategory;
  /** Difficulty */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Processing time in ms */
  processingTimeMs: number;
  /** Any error */
  error?: string;
}

/**
 * Confusion matrix entry
 */
export interface ConfusionMatrixEntry {
  predicted: EntryType;
  actual: EntryType;
  count: number;
}

/**
 * Metrics for a single entry type
 */
export interface TypeMetrics {
  /** True positives */
  tp: number;
  /** False positives */
  fp: number;
  /** False negatives */
  fn: number;
  /** True negatives */
  tn: number;
  /** Precision: TP / (TP + FP) */
  precision: number;
  /** Recall: TP / (TP + FN) */
  recall: number;
  /** F1 score: 2 * (precision * recall) / (precision + recall) */
  f1: number;
}

/**
 * Aggregated classification metrics
 */
export interface AggregatedClassificationMetrics {
  /** Total test cases */
  totalTestCases: number;
  /** Correct predictions */
  correctCount: number;
  /** Overall accuracy */
  accuracy: number;
  /** Correct with alternatives */
  correctWithAlternativesCount: number;
  /** Accuracy with alternatives */
  accuracyWithAlternatives: number;
  /** Error count */
  errorCount: number;
  /** Metrics by entry type */
  byType: Record<EntryType, TypeMetrics>;
  /** Metrics by category */
  byCategory: Record<ClassificationCategory, {
    count: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
  }>;
  /** Metrics by difficulty */
  byDifficulty: Record<'easy' | 'medium' | 'hard', {
    count: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
  }>;
  /** Confidence correlation */
  confidenceCorrelation: {
    /** Average confidence for correct predictions */
    avgConfidenceCorrect: number;
    /** Average confidence for incorrect predictions */
    avgConfidenceIncorrect: number;
    /** High confidence (>0.8) accuracy */
    highConfidenceAccuracy: number;
    /** Low confidence (<0.6) accuracy */
    lowConfidenceAccuracy: number;
  };
  /** Confusion matrix */
  confusionMatrix: ConfusionMatrixEntry[];
  /** Processing stats */
  processing: {
    totalTimeMs: number;
    avgTimePerClassification: number;
    minTimeMs: number;
    maxTimeMs: number;
  };
}

/**
 * Full benchmark results
 */
export interface ClassificationBenchmarkResults {
  /** Timestamp of benchmark run */
  timestamp: string;
  /** Configuration */
  config: {
    testCasesRun: number;
    llmFallbackEnabled: boolean;
    highConfidenceThreshold: number;
    lowConfidenceThreshold: number;
  };
  /** Overall metrics */
  overall: AggregatedClassificationMetrics;
  /** Individual test case results */
  testCaseResults: ClassificationTestResult[];
}
