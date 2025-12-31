/**
 * Config Builders Index
 *
 * Re-exports all config builder functions for use in the main config module.
 * These builders construct nested configuration objects from environment variables.
 */

// Helper utilities
export { getEnvNumber, getEnvInt, getEnvBoolean } from './helpers.js';

// Extraction builders and types
export {
  buildExtractionThresholds,
  type ExtractionConfidenceThresholds,
} from './extraction.js';

// Rate limit builders and types
export {
  buildRateLimitPerAgent,
  buildRateLimitGlobal,
  buildRateLimitBurst,
  type RateLimitConfig,
} from './rate-limit.js';

// Recency builders and types
export {
  buildRecencyDecayHalfLife,
  type RecencyDecayHalfLifeDays,
} from './recency.js';

// Scoring builders and types
export {
  buildScoringWeights,
  buildFeedbackScoring,
  buildEntityScoring,
  type ScoringWeights,
  type FeedbackScoringConfig,
  type EntityScoringConfig,
} from './scoring.js';
