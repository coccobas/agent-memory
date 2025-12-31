/**
 * Human Evaluation Types
 *
 * Types for human evaluation of benchmark outputs, enabling external
 * validation beyond automated metrics.
 */

/**
 * Benchmark types that support human evaluation
 */
export type EvaluableBenchmark = 'extraction' | 'summarization' | 'query';

/**
 * Rating scale (1-5 Likert scale)
 */
export type LikertRating = 1 | 2 | 3 | 4 | 5;

/**
 * Rating labels for display
 */
export const RATING_LABELS: Record<LikertRating, string> = {
  1: 'Very Poor',
  2: 'Poor',
  3: 'Acceptable',
  4: 'Good',
  5: 'Excellent',
};

/**
 * Dimensions for extraction evaluation
 */
export interface ExtractionRating {
  /** Is the extracted content accurate? (not hallucinated) */
  accuracy: LikertRating;
  /** Is the content complete? (nothing important missing) */
  completeness: LikertRating;
  /** Is the categorization correct? (guideline vs knowledge vs tool) */
  categorization: LikertRating;
  /** Is the content useful for its intended purpose? */
  usefulness: LikertRating;
}

/**
 * Dimensions for summarization evaluation
 */
export interface SummarizationRating {
  /** Is the summary grounded in source content? (no hallucination) */
  groundedness: LikertRating;
  /** Are the key points covered? */
  completeness: LikertRating;
  /** Is the summary well-organized and readable? */
  coherence: LikertRating;
  /** Would this summary be useful to a reader? */
  usefulness: LikertRating;
}

/**
 * Dimensions for query/retrieval evaluation
 */
export interface QueryRating {
  /** Are the returned results relevant to the query? */
  relevance: LikertRating;
  /** Are the most important results ranked at the top? */
  ranking: LikertRating;
  /** Are there important results that were missed? */
  recall: LikertRating;
  /** Would this result set satisfy the query intent? */
  satisfaction: LikertRating;
}

/**
 * Union of all rating types
 */
export type EvaluationRating = ExtractionRating | SummarizationRating | QueryRating;

/**
 * Rating dimension names by benchmark type
 */
export const RATING_DIMENSIONS: Record<EvaluableBenchmark, string[]> = {
  extraction: ['accuracy', 'completeness', 'categorization', 'usefulness'],
  summarization: ['groundedness', 'completeness', 'coherence', 'usefulness'],
  query: ['relevance', 'ranking', 'recall', 'satisfaction'],
};

/**
 * Rating dimension descriptions
 */
export const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  // Extraction
  accuracy: 'Is the extracted content accurate? (not hallucinated)',
  completeness: 'Is the content complete? (nothing important missing)',
  categorization: 'Is the categorization correct? (guideline vs knowledge vs tool)',
  usefulness: 'Is the content useful for its intended purpose?',
  // Summarization
  groundedness: 'Is the summary grounded in source content? (no hallucination)',
  coherence: 'Is the summary well-organized and readable?',
  // Query
  relevance: 'Are the returned results relevant to the query?',
  ranking: 'Are the most important results ranked at the top?',
  recall: 'Are there important results that were missed?',
  satisfaction: 'Would this result set satisfy the query intent?',
};

/**
 * Single evaluation item (one test case rated by one evaluator)
 */
export interface EvaluationItem {
  /** Test case ID from the benchmark */
  testCaseId: string;
  /** Test case name/description */
  testCaseName: string;
  /** Benchmark type */
  benchmarkType: EvaluableBenchmark;
  /** The input that was processed */
  input: string;
  /** The output that was generated */
  output: string;
  /** Optional expected output for reference */
  expectedOutput?: string;
  /** Ratings for each dimension */
  ratings: EvaluationRating;
  /** Optional notes from the evaluator */
  notes?: string;
  /** Timestamp when this was evaluated */
  evaluatedAt: string;
  /** Evaluator identifier (for inter-annotator agreement) */
  evaluatorId: string;
  /** Time spent evaluating in seconds */
  evaluationTimeSeconds: number;
}

/**
 * Evaluation session state (for resumable evaluations)
 */
export interface EvaluationSession {
  /** Unique session ID */
  id: string;
  /** Benchmark being evaluated */
  benchmarkType: EvaluableBenchmark;
  /** Evaluator ID */
  evaluatorId: string;
  /** When session started */
  startedAt: string;
  /** When session ended (if completed) */
  endedAt?: string;
  /** Total items to evaluate */
  totalItems: number;
  /** Items completed so far */
  completedItems: number;
  /** IDs of completed test cases */
  completedTestCaseIds: string[];
  /** Items skipped by evaluator */
  skippedItems: number;
  /** IDs of skipped test cases */
  skippedTestCaseIds: string[];
  /** All evaluation items recorded */
  evaluations: EvaluationItem[];
  /** Session status */
  status: 'in_progress' | 'completed' | 'abandoned';
  /** Random seed used for item selection */
  randomSeed?: number;
}

/**
 * Aggregated scores for one dimension
 */
export interface DimensionScore {
  /** Dimension name */
  dimension: string;
  /** Mean rating (1-5) */
  mean: number;
  /** Standard deviation */
  stdDev: number;
  /** Median rating */
  median: number;
  /** Distribution of ratings */
  distribution: Record<LikertRating, number>;
  /** Number of ratings */
  count: number;
}

/**
 * Inter-annotator agreement metrics
 */
export interface AgreementMetrics {
  /** Percentage of exact agreement */
  percentAgreement: number;
  /** Cohen's Kappa (for 2 annotators) */
  cohensKappa?: number;
  /** Krippendorff's Alpha (for multiple annotators) */
  krippendorffsAlpha?: number;
  /** Number of annotators */
  annotatorCount: number;
  /** Dimensions with lowest agreement */
  lowestAgreement: Array<{
    dimension: string;
    agreement: number;
  }>;
}

/**
 * Full evaluation report
 */
export interface HumanEvaluationReport {
  /** Report generation timestamp */
  generatedAt: string;
  /** Benchmark type */
  benchmarkType: EvaluableBenchmark;
  /** Sessions included in this report */
  sessionIds: string[];
  /** Total evaluations analyzed */
  totalEvaluations: number;
  /** Number of unique test cases evaluated */
  uniqueTestCases: number;
  /** Number of unique evaluators */
  uniqueEvaluators: number;
  /** Overall scores by dimension */
  overallScores: DimensionScore[];
  /** Scores by difficulty level */
  byDifficulty: Record<string, DimensionScore[]>;
  /** Scores by category */
  byCategory: Record<string, DimensionScore[]>;
  /** Inter-annotator agreement (if multiple evaluators) */
  agreement?: AgreementMetrics;
  /** Test cases with lowest scores (for improvement focus) */
  lowestScoringCases: Array<{
    testCaseId: string;
    testCaseName: string;
    meanScore: number;
    dimensions: Record<string, number>;
  }>;
  /** Test cases with highest scores */
  highestScoringCases: Array<{
    testCaseId: string;
    testCaseName: string;
    meanScore: number;
    dimensions: Record<string, number>;
  }>;
  /** Average evaluation time per item */
  avgEvaluationTimeSeconds: number;
  /** Common themes from notes (if available) */
  commonThemes?: string[];
}

/**
 * Options for running human evaluation
 */
export interface HumanEvalOptions {
  /** Benchmark to evaluate */
  benchmark: EvaluableBenchmark;
  /** Maximum number of items to evaluate */
  limit?: number;
  /** Only evaluate items from specific category */
  category?: string;
  /** Only evaluate items with specific difficulty */
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Random seed for reproducible item selection */
  seed?: number;
  /** Resume from existing session */
  resumeSessionId?: string;
  /** Evaluator ID (for tracking multiple evaluators) */
  evaluatorId?: string;
  /** Output directory for results */
  outputDir?: string;
  /** Enable verbose output */
  verbose?: boolean;
}
