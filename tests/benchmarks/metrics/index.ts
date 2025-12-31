/**
 * Evaluation Metrics Module
 *
 * Exports ROUGE, BERTScore, and Groundedness metrics for
 * evaluating extraction and summarization quality.
 */

// Types
export type {
  ROUGEScores,
  ROUGEVariantScore,
  BERTScoreResult,
  GroundednessResult,
  GroundednessDetail,
  ROUGEConfig,
  BERTScoreConfig,
  GroundednessConfig,
  MetricsConfig,
  AggregatedSemanticMetrics,
  TestCaseSemanticMetrics,
} from './metric-types.js';

export { DEFAULT_METRICS_CONFIG } from './metric-types.js';

// ROUGE
export {
  tokenize,
  getNgrams,
  rouge1,
  rouge2,
  rougeL,
  rougeN,
  lcsLength,
  calculateROUGE,
  calculateROUGEBatch,
  aggregateROUGEScores,
} from './rouge.js';

// BERTScore
export {
  BERTScoreEvaluator,
  splitIntoSentences,
  aggregateBERTScores,
} from './bert-score.js';

// Groundedness
export {
  GroundednessEvaluator,
  fragmentText,
  splitIntoPhrases,
  aggregateGroundednessResults,
} from './groundedness.js';
