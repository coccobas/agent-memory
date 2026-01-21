/**
 * Smart Prioritization Types and Configuration
 *
 * Defines interfaces and configuration for the adaptive memory prioritization system.
 *
 * Smart Priority Score Formula:
 *   (adaptive_type_weight × 0.4) +
 *   (usefulness_score × 0.3) +
 *   (context_similarity_boost × 0.3)
 */

import type { QueryEntryType } from '../query/pipeline.js';
import type { QueryIntent } from '../query-rewrite/types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * All supported entry types for prioritization.
 */
export const ENTRY_TYPES = ['guideline', 'knowledge', 'tool', 'experience'] as const;

/**
 * Entry type union derived from the constant array.
 */
export type EntryType = (typeof ENTRY_TYPES)[number];

// =============================================================================
// CONFIGURATION INTERFACES
// =============================================================================

/**
 * Configuration for adaptive type weights learning.
 */
export interface AdaptiveWeightsConfig {
  /** Whether adaptive weights are enabled */
  enabled: boolean;
  /** Minimum feedback samples before adaptation kicks in */
  minSamplesForAdaptation: number;
  /** Learning rate for weight updates (0-1) */
  learningRate: number;
  /** Number of days to look back for feedback data */
  lookbackDays: number;
}

/**
 * Configuration for entry usefulness scoring.
 */
export interface UsefulnessConfig {
  /** Whether usefulness scoring is enabled */
  enabled: boolean;
  /** Weight for retrieval volume factor (0-1) */
  retrievalWeight: number;
  /** Weight for success rate factor (0-1) */
  successWeight: number;
  /** Weight for recency of success factor (0-1) */
  recencyWeight: number;
}

/**
 * Configuration for context similarity boosting.
 */
export interface ContextSimilarityConfig {
  /** Whether context similarity is enabled */
  enabled: boolean;
  /** Minimum similarity threshold for context matching (0-1) */
  similarityThreshold: number;
  /** Maximum number of past contexts to consider */
  maxContextsToConsider: number;
  /** Multiplier for entries that succeeded in similar contexts (>= 1) */
  boostMultiplier: number;
}

/**
 * Configuration for combining component scores.
 */
export interface CompositeConfig {
  /** Weight for adaptive type weight in final score (0-1) */
  adaptiveWeightInfluence: number;
  /** Weight for usefulness score in final score (0-1) */
  usefulnessInfluence: number;
  /** Weight for context similarity boost in final score (0-1) */
  contextSimilarityInfluence: number;
}

/**
 * Complete smart prioritization configuration.
 */
export interface SmartPriorityConfig {
  /** Master switch for smart prioritization */
  enabled: boolean;
  /** Adaptive weight learning configuration */
  adaptiveWeights: AdaptiveWeightsConfig;
  /** Entry usefulness scoring configuration */
  usefulness: UsefulnessConfig;
  /** Context similarity boosting configuration */
  contextSimilarity: ContextSimilarityConfig;
  /** Composite score blending configuration */
  composite: CompositeConfig;
}

// =============================================================================
// RESULT INTERFACES
// =============================================================================

/**
 * Priority score result for a single entry.
 */
export interface SmartPriorityResult {
  /** Entry ID */
  entryId: string;
  /** Entry type */
  entryType: QueryEntryType;
  /** Adaptive weight based on learned intent-type patterns */
  adaptiveWeight: number;
  /** Usefulness score based on retrieval success history (0-1) */
  usefulnessScore: number;
  /** Context similarity boost (>= 1) */
  contextSimilarityBoost: number;
  /** Final composite priority score */
  compositePriorityScore: number;
}

/**
 * Adaptive weights for each entry type, learned from feedback.
 */
export type AdaptiveTypeWeights = Record<QueryEntryType, number>;

/**
 * Intent-specific adaptive weights.
 */
export type IntentAdaptiveWeights = Record<QueryIntent, AdaptiveTypeWeights>;

// =============================================================================
// DATA INTERFACES
// =============================================================================

/**
 * Outcome data for a specific intent-type combination.
 */
export interface IntentTypeOutcomeData {
  /** Query intent */
  intent: QueryIntent;
  /** Entry type */
  entryType: QueryEntryType;
  /** Total retrieval count */
  totalRetrievals: number;
  /** Successful outcome count */
  successCount: number;
  /** Partial success count */
  partialCount: number;
  /** Failure count */
  failureCount: number;
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Usefulness metrics for a single entry.
 */
export interface UsefulnessMetrics {
  /** Entry ID */
  entryId: string;
  /** Total times this entry was retrieved */
  retrievalCount: number;
  /** Times retrieval led to successful outcome */
  successCount: number;
  /** Timestamp of last successful retrieval */
  lastSuccessAt: string | null;
  /** Timestamp of last retrieval (success or failure) */
  lastAccessAt: string | null;
}

/**
 * Successful context for similarity matching.
 */
export interface SuccessfulContext {
  /** Query embedding vector */
  queryEmbedding: number[];
  /** Entries that succeeded in this context */
  successfulEntryIds: string[];
  /** Similarity score to current query */
  similarityScore: number;
  /** When this context occurred */
  occurredAt: string;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validation result for config.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a smart priority configuration.
 *
 * @param config - Configuration to validate
 * @returns Validation result with any errors
 */
export function validateSmartPriorityConfig(config: SmartPriorityConfig): ValidationResult {
  const errors: string[] = [];

  // Validate weight ranges (0-1)
  const weightFields: Array<{ path: string; value: number }> = [
    { path: 'adaptiveWeights.learningRate', value: config.adaptiveWeights.learningRate },
    { path: 'usefulness.retrievalWeight', value: config.usefulness.retrievalWeight },
    { path: 'usefulness.successWeight', value: config.usefulness.successWeight },
    { path: 'usefulness.recencyWeight', value: config.usefulness.recencyWeight },
    {
      path: 'contextSimilarity.similarityThreshold',
      value: config.contextSimilarity.similarityThreshold,
    },
    { path: 'composite.adaptiveWeightInfluence', value: config.composite.adaptiveWeightInfluence },
    { path: 'composite.usefulnessInfluence', value: config.composite.usefulnessInfluence },
    {
      path: 'composite.contextSimilarityInfluence',
      value: config.composite.contextSimilarityInfluence,
    },
  ];

  for (const field of weightFields) {
    if (field.value < 0 || field.value > 1) {
      errors.push(`${field.path} must be between 0 and 1`);
    }
  }

  // Validate positive values
  const positiveFields: Array<{ path: string; value: number }> = [
    {
      path: 'adaptiveWeights.minSamplesForAdaptation',
      value: config.adaptiveWeights.minSamplesForAdaptation,
    },
    { path: 'adaptiveWeights.lookbackDays', value: config.adaptiveWeights.lookbackDays },
    {
      path: 'contextSimilarity.maxContextsToConsider',
      value: config.contextSimilarity.maxContextsToConsider,
    },
  ];

  for (const field of positiveFields) {
    if (field.value < 0) {
      errors.push(`${field.path} must be positive`);
    }
  }

  // Validate boost multiplier (must be >= 1)
  if (config.contextSimilarity.boostMultiplier < 1) {
    errors.push('contextSimilarity.boostMultiplier must be >= 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Creates the default smart priority configuration.
 *
 * @returns Default configuration with sensible values
 */
export function createDefaultSmartPriorityConfig(): SmartPriorityConfig {
  return {
    enabled: true,

    adaptiveWeights: {
      enabled: true,
      minSamplesForAdaptation: 10,
      learningRate: 0.1,
      lookbackDays: 30,
    },

    usefulness: {
      enabled: true,
      retrievalWeight: 0.3,
      successWeight: 0.5,
      recencyWeight: 0.2,
    },

    contextSimilarity: {
      enabled: true,
      similarityThreshold: 0.7,
      maxContextsToConsider: 50,
      boostMultiplier: 1.2,
    },

    composite: {
      adaptiveWeightInfluence: 0.4,
      usefulnessInfluence: 0.3,
      contextSimilarityInfluence: 0.3,
    },
  };
}
