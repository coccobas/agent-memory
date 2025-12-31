/**
 * Evaluation Metrics Types
 *
 * Shared types for ROUGE, BERTScore, and Groundedness metrics.
 */

// =============================================================================
// ROUGE TYPES
// =============================================================================

/**
 * Individual ROUGE variant scores (precision, recall, F1)
 */
export interface ROUGEVariantScore {
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Complete ROUGE scores across all variants
 */
export interface ROUGEScores {
  /** Unigram overlap */
  rouge1: ROUGEVariantScore;
  /** Bigram overlap */
  rouge2: ROUGEVariantScore;
  /** Longest Common Subsequence */
  rougeL: ROUGEVariantScore;
}

// =============================================================================
// BERTSCORE TYPES
// =============================================================================

/**
 * BERTScore result for semantic similarity
 */
export interface BERTScoreResult {
  /** Precision: avg max similarity for each candidate sentence to reference */
  precision: number;
  /** Recall: avg max similarity for each reference sentence to candidate */
  recall: number;
  /** F1: harmonic mean of precision and recall */
  f1: number;
  /** Model used for embeddings */
  embeddingModel: string;
  /** Provider used (openai/local) */
  embeddingProvider: string;
}

// =============================================================================
// GROUNDEDNESS TYPES
// =============================================================================

/**
 * Detail for a single fragment's groundedness evaluation
 */
export interface GroundednessDetail {
  /** The extracted fragment being evaluated */
  extractedFragment: string;
  /** Best matching source fragment (null if ungrounded) */
  sourceFragment: string | null;
  /** Similarity score to best match */
  similarity: number;
  /** Whether this fragment is considered grounded */
  isGrounded: boolean;
}

/**
 * Complete groundedness evaluation result
 */
export interface GroundednessResult {
  /** Overall groundedness score (0-1): % of fragments grounded in source */
  score: number;
  /** List of fragments that are grounded */
  groundedFragments: string[];
  /** List of fragments that are NOT grounded (potential hallucinations) */
  ungroundedFragments: string[];
  /** Detailed per-fragment results */
  details: GroundednessDetail[];
  /** Threshold used for grounding */
  threshold: number;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Configuration for ROUGE evaluation
 */
export interface ROUGEConfig {
  /** Enable ROUGE evaluation */
  enabled: boolean;
  /** Which variants to compute */
  variants: ('rouge1' | 'rouge2' | 'rougeL')[];
}

/**
 * Configuration for BERTScore evaluation
 */
export interface BERTScoreConfig {
  /** Enable BERTScore evaluation */
  enabled: boolean;
  /** Similarity threshold for considering a match (0-1) */
  threshold: number;
}

/**
 * Configuration for Groundedness evaluation
 */
export interface GroundednessConfig {
  /** Enable Groundedness evaluation */
  enabled: boolean;
  /** Minimum similarity to consider a fragment grounded (0-1) */
  threshold: number;
  /** How to split text into fragments */
  fragmentSize: 'sentence' | 'phrase';
}

/**
 * Combined metrics configuration
 */
export interface MetricsConfig {
  rouge?: ROUGEConfig;
  bertScore?: BERTScoreConfig;
  groundedness?: GroundednessConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_METRICS_CONFIG: Required<MetricsConfig> = {
  rouge: {
    enabled: true,
    variants: ['rouge1', 'rouge2', 'rougeL'],
  },
  bertScore: {
    enabled: true,
    threshold: 0.85,
  },
  groundedness: {
    enabled: true,
    threshold: 0.7,
    fragmentSize: 'sentence',
  },
};

// =============================================================================
// AGGREGATED METRICS TYPES
// =============================================================================

/**
 * Aggregated semantic metrics for multiple test cases
 */
export interface AggregatedSemanticMetrics {
  /** Average BERTScore F1 across all test cases */
  avgBERTScoreF1?: number;
  /** Average BERTScore Precision */
  avgBERTScorePrecision?: number;
  /** Average BERTScore Recall */
  avgBERTScoreRecall?: number;
  /** Average groundedness score (0-1) */
  avgGroundednessScore?: number;
  /** Rate of ungrounded content (hallucination rate) */
  ungroundedRate?: number;
  /** Number of test cases with semantic metrics */
  testCasesEvaluated: number;
}

/**
 * Semantic metrics for a single test case
 */
export interface TestCaseSemanticMetrics {
  /** BERTScore result (optional, expensive) */
  bertScore?: BERTScoreResult;
  /** Groundedness result (optional, expensive) */
  groundedness?: GroundednessResult;
}
