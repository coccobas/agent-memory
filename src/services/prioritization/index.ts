/**
 * Smart Prioritization Module
 *
 * Adaptive memory prioritization that learns from feedback data.
 *
 * @example
 * ```typescript
 * import { createSmartPrioritizationService, createDefaultSmartPriorityConfig } from './services/prioritization';
 *
 * const service = createSmartPrioritizationService(
 *   createDefaultSmartPriorityConfig(),
 *   getOutcomesFn,
 *   getMetricsFn,
 *   findSimilarFn
 * );
 *
 * const scores = await service.getPriorityScores(entries, intent, embedding, scopeId);
 * ```
 */

// Types and configuration
export {
  ENTRY_TYPES,
  type EntryType,
  type AdaptiveWeightsConfig,
  type UsefulnessConfig,
  type ContextSimilarityConfig,
  type CompositeConfig,
  type SmartPriorityConfig,
  type SmartPriorityResult,
  type AdaptiveTypeWeights,
  type IntentAdaptiveWeights,
  type IntentTypeOutcomeData,
  type UsefulnessMetrics,
  type SuccessfulContext,
  type ValidationResult,
  createDefaultSmartPriorityConfig,
  validateSmartPriorityConfig,
} from './types.js';

// Main service
export {
  SmartPrioritizationService,
  createSmartPrioritizationService,
  type PriorityEntry,
} from './smart-prioritization.service.js';

// Calculators
export {
  AdaptiveWeightsCalculator,
  STATIC_INTENT_WEIGHTS,
  clampWeight,
  computeConfidence,
  blendWeights,
  type OutcomeAggregation,
  type GetOutcomesFn,
} from './calculators/adaptive-weights.calculator.js';

export {
  UsefulnessCalculator,
  calculateRecencyBoost,
  normalizeScore,
  type GetUsefulnessMetricsFn,
} from './calculators/usefulness.calculator.js';

export {
  ContextSimilarityCalculator,
  aggregateEntrySuccess,
  calculateBoost,
  type FindSimilarContextsFn,
} from './calculators/context-similarity.calculator.js';

// Repository
export {
  PrioritizationRepository,
  createPrioritizationRepository,
} from './repositories/prioritization.repository.js';

// Cache
export {
  PriorityCache,
  createPriorityCache,
  getPriorityCache,
  resetPriorityCache,
  type PriorityCacheConfig,
  type CacheStats,
} from './cache/priority-cache.js';
