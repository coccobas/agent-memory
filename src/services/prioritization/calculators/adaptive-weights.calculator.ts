/**
 * Adaptive Weights Calculator
 *
 * Learns optimal type weights per intent from outcome data.
 * Uses confidence-based blending between learned and static weights.
 *
 * Key Concepts:
 * - Success rate → learned weight: Higher success → higher weight
 * - Confidence: Scales with sample count (10→0.1, 100→1.0)
 * - Blending: (confidence × learned) + ((1-confidence) × static)
 * - Learning rate: Limits how fast weights can change
 */

import type { QueryEntryType } from '../../query/pipeline.js';
import type { QueryIntent } from '../../query-rewrite/types.js';
import type { AdaptiveWeightsConfig, AdaptiveTypeWeights } from '../types.js';

// =============================================================================
// STATIC INTENT-TYPE WEIGHTS (Fallback)
// =============================================================================

/**
 * Static intent-type weight multipliers.
 * These are used as fallback when insufficient feedback data is available.
 * Values are multipliers: 1.0 = no change, >1.0 = boost, <1.0 = reduce
 */
export const STATIC_INTENT_WEIGHTS: Record<QueryIntent, AdaptiveTypeWeights> = {
  lookup: { knowledge: 1.15, guideline: 0.95, tool: 0.95, experience: 0.9 },
  how_to: { guideline: 1.15, experience: 1.1, tool: 1.0, knowledge: 0.95 },
  debug: { experience: 1.15, knowledge: 1.05, guideline: 0.95, tool: 0.95 },
  explore: { knowledge: 1.0, guideline: 1.0, experience: 1.0, tool: 1.0 },
  compare: { knowledge: 1.1, experience: 1.05, guideline: 0.95, tool: 0.95 },
  configure: { guideline: 1.15, tool: 1.1, knowledge: 0.95, experience: 0.95 },
};

// =============================================================================
// WEIGHT BOUNDS
// =============================================================================

const MIN_WEIGHT = 0.5;
const MAX_WEIGHT = 2.0;

/**
 * Clamps a weight value to the valid range [0.5, 2.0].
 *
 * @param weight - Raw weight value
 * @returns Clamped weight
 */
export function clampWeight(weight: number): number {
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, weight));
}

// =============================================================================
// CONFIDENCE CALCULATION
// =============================================================================

const CONFIDENCE_MIN_SAMPLES = 10;
const CONFIDENCE_MAX_SAMPLES = 100;

/**
 * Computes confidence based on sample count.
 * - < 10 samples: 0 confidence (use static weights)
 * - 10-100 samples: linear scaling from 0.1 to 1.0
 * - 100+ samples: 1.0 confidence (fully trust learned weights)
 *
 * @param sampleCount - Number of feedback samples
 * @returns Confidence value between 0 and 1
 */
export function computeConfidence(sampleCount: number): number {
  if (sampleCount < CONFIDENCE_MIN_SAMPLES) {
    return 0;
  }
  if (sampleCount >= CONFIDENCE_MAX_SAMPLES) {
    return 1;
  }
  // Linear interpolation from 0.1 to 1.0
  return sampleCount / CONFIDENCE_MAX_SAMPLES;
}

// =============================================================================
// WEIGHT BLENDING
// =============================================================================

/**
 * Blends learned weights with static weights based on confidence.
 *
 * Formula: (confidence × learned) + ((1-confidence) × static)
 *
 * @param learned - Learned weights from feedback data
 * @param staticWeights - Static fallback weights
 * @param confidence - Confidence level (0-1)
 * @returns Blended weights
 */
export function blendWeights(
  learned: AdaptiveTypeWeights,
  staticWeights: AdaptiveTypeWeights,
  confidence: number
): AdaptiveTypeWeights {
  const types: QueryEntryType[] = ['guideline', 'knowledge', 'tool', 'experience'];

  const result: Record<string, number> = {};

  for (const type of types) {
    const learnedWeight = learned[type];
    const staticWeight = staticWeights[type];
    const blendedWeight = confidence * learnedWeight + (1 - confidence) * staticWeight;
    result[type] = clampWeight(blendedWeight);
  }

  return result as AdaptiveTypeWeights;
}

// =============================================================================
// OUTCOME DATA TYPE
// =============================================================================

/**
 * Aggregated outcome data for weight calculation.
 */
export interface OutcomeAggregation {
  totalSamples: number;
  byType: Array<{
    entryType: QueryEntryType;
    totalRetrievals: number;
    successCount: number;
    partialCount: number;
    failureCount: number;
    successRate: number;
  }>;
}

/**
 * Function type for fetching outcome data.
 */
export type GetOutcomesFn = (
  intent: QueryIntent,
  scopeId: string,
  lookbackDays: number
) => Promise<OutcomeAggregation>;

// =============================================================================
// ADAPTIVE WEIGHTS CALCULATOR
// =============================================================================

/**
 * Calculator for learning optimal type weights from feedback data.
 */
export class AdaptiveWeightsCalculator {
  constructor(
    private readonly config: AdaptiveWeightsConfig,
    private readonly getOutcomes: GetOutcomesFn
  ) {}

  /**
   * Calculates adaptive weights for a given intent and scope.
   *
   * @param intent - Query intent
   * @param scopeId - Scope identifier
   * @returns Adaptive type weights
   */
  async calculateWeights(intent: QueryIntent, scopeId: string): Promise<AdaptiveTypeWeights> {
    // Return static weights if disabled
    if (!this.config.enabled) {
      return this.getStaticWeights(intent);
    }

    // Fetch outcome data
    const outcomes = await this.getOutcomes(intent, scopeId, this.config.lookbackDays);

    // Return static weights if insufficient samples
    if (outcomes.totalSamples < this.config.minSamplesForAdaptation) {
      return this.getStaticWeights(intent);
    }

    // Compute confidence from sample count
    const confidence = computeConfidence(outcomes.totalSamples);

    // Compute learned weights from success rates
    const learnedWeights = this.computeLearnedWeights(intent, outcomes);

    // Blend learned with static based on confidence
    return blendWeights(learnedWeights, this.getStaticWeights(intent), confidence);
  }

  /**
   * Returns static weights for a given intent.
   *
   * @param intent - Query intent
   * @returns Static type weights
   */
  getStaticWeights(intent: QueryIntent): AdaptiveTypeWeights {
    return STATIC_INTENT_WEIGHTS[intent] ?? STATIC_INTENT_WEIGHTS.explore;
  }

  /**
   * Computes learned weights from outcome data.
   *
   * @param intent - Query intent
   * @param outcomes - Aggregated outcome data
   * @returns Learned type weights
   */
  private computeLearnedWeights(
    intent: QueryIntent,
    outcomes: OutcomeAggregation
  ): AdaptiveTypeWeights {
    const staticWeights = this.getStaticWeights(intent);
    const learnedWeights = { ...staticWeights };

    // Create a map for quick lookup
    const outcomeMap = new Map(outcomes.byType.map((o) => [o.entryType, o]));

    for (const type of Object.keys(learnedWeights) as QueryEntryType[]) {
      const outcomeData = outcomeMap.get(type);
      if (!outcomeData) {
        continue;
      }

      // Success rate influence: 0.5 → no change, 1.0 → boost, 0.0 → reduce
      // We map success rate [0, 1] to a weight adjustment [-0.5, +0.5]
      const successInfluence = (outcomeData.successRate - 0.5) * 2;

      // Apply learning rate to limit change speed
      const weightDelta = successInfluence * this.config.learningRate;

      // Apply delta to static weight
      learnedWeights[type] = staticWeights[type] + weightDelta;
    }

    return learnedWeights;
  }
}
