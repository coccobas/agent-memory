/**
 * Smart Prioritization Service
 *
 * Orchestrates three calculators to produce adaptive priority scores:
 * - AdaptiveWeightsCalculator: Learns optimal type weights from feedback
 * - UsefulnessCalculator: Scores entries based on historical success
 * - ContextSimilarityCalculator: Boosts entries that succeeded in similar contexts
 *
 * Formula:
 *   Smart Priority Score =
 *     (adaptive_type_weight × 0.4) +
 *     (usefulness_score × 0.3) +
 *     (context_similarity_boost × 0.3)
 */

import type { QueryEntryType } from '../query/pipeline.js';
import type { QueryIntent } from '../query-rewrite/types.js';
import type { SmartPriorityConfig, SmartPriorityResult, AdaptiveTypeWeights } from './types.js';
import {
  AdaptiveWeightsCalculator,
  type GetOutcomesFn,
} from './calculators/adaptive-weights.calculator.js';
import {
  UsefulnessCalculator,
  type GetUsefulnessMetricsFn,
} from './calculators/usefulness.calculator.js';
import {
  ContextSimilarityCalculator,
  type FindSimilarContextsFn,
} from './calculators/context-similarity.calculator.js';

// =============================================================================
// SERVICE INTERFACE
// =============================================================================

/**
 * Entry for priority calculation.
 */
export interface PriorityEntry {
  id: string;
  type: QueryEntryType;
}

// =============================================================================
// SMART PRIORITIZATION SERVICE
// =============================================================================

/**
 * Main service for smart memory prioritization.
 * Coordinates sub-calculators and combines their results.
 */
export class SmartPrioritizationService {
  constructor(
    private readonly config: SmartPriorityConfig,
    private readonly adaptiveCalc: AdaptiveWeightsCalculator,
    private readonly usefulnessCalc: UsefulnessCalculator,
    private readonly contextCalc: ContextSimilarityCalculator
  ) {}

  /**
   * Calculates smart priority scores for a batch of entries.
   *
   * @param entries - Entries to calculate scores for
   * @param intent - Query intent
   * @param queryEmbedding - Optional query embedding for context similarity
   * @param scopeId - Optional scope ID for adaptive weights
   * @returns Map of entry ID to priority result
   */
  async getPriorityScores(
    entries: PriorityEntry[],
    intent: QueryIntent,
    queryEmbedding?: number[],
    scopeId?: string
  ): Promise<Map<string, SmartPriorityResult>> {
    // Return empty map if disabled
    if (!this.config.enabled) {
      return new Map();
    }

    // Return empty map for empty entries
    if (entries.length === 0) {
      return new Map();
    }

    const entryIds = entries.map((e) => e.id);

    // Fetch all component scores in parallel
    const [adaptiveWeights, usefulnessScores, contextBoosts] = await Promise.all([
      this.getAdaptiveWeights(intent, scopeId),
      this.usefulnessCalc.calculateScores(entryIds),
      this.contextCalc.calculateBoosts(queryEmbedding, entryIds),
    ]);

    // Combine into composite scores
    return new Map(
      entries.map((entry) => [
        entry.id,
        this.computeCompositeScore(entry, adaptiveWeights, usefulnessScores, contextBoosts),
      ])
    );
  }

  /**
   * Gets adaptive weights, falling back to static on error.
   */
  private async getAdaptiveWeights(
    intent: QueryIntent,
    scopeId?: string
  ): Promise<AdaptiveTypeWeights> {
    try {
      return await this.adaptiveCalc.calculateWeights(intent, scopeId ?? 'global');
    } catch {
      // Fall back to static weights on error
      return this.adaptiveCalc.getStaticWeights(intent);
    }
  }

  /**
   * Computes the composite priority score for a single entry.
   */
  private computeCompositeScore(
    entry: PriorityEntry,
    adaptiveWeights: AdaptiveTypeWeights,
    usefulnessScores: Map<string, number>,
    contextBoosts: Map<string, number>
  ): SmartPriorityResult {
    // Get component values (with fallbacks)
    const adaptiveWeight = adaptiveWeights[entry.type] ?? 1.0;
    const usefulnessScore = usefulnessScores.get(entry.id) ?? 0.5;
    const contextSimilarityBoost = contextBoosts.get(entry.id) ?? 1.0;

    // Compute weighted composite score
    const compositePriorityScore =
      adaptiveWeight * this.config.composite.adaptiveWeightInfluence +
      usefulnessScore * this.config.composite.usefulnessInfluence +
      contextSimilarityBoost * this.config.composite.contextSimilarityInfluence;

    return {
      entryId: entry.id,
      entryType: entry.type,
      adaptiveWeight,
      usefulnessScore,
      contextSimilarityBoost,
      compositePriorityScore,
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a SmartPrioritizationService with all dependencies wired up.
 *
 * @param config - Service configuration
 * @param getOutcomes - Function to fetch outcome data for adaptive weights
 * @param getMetrics - Function to fetch usefulness metrics
 * @param findSimilarContexts - Function to find similar successful contexts
 * @returns Configured SmartPrioritizationService instance
 */
export function createSmartPrioritizationService(
  config: SmartPriorityConfig,
  getOutcomes: GetOutcomesFn,
  getMetrics: GetUsefulnessMetricsFn,
  findSimilarContexts: FindSimilarContextsFn
): SmartPrioritizationService {
  const adaptiveCalc = new AdaptiveWeightsCalculator(config.adaptiveWeights, getOutcomes);
  const usefulnessCalc = new UsefulnessCalculator(config.usefulness, getMetrics);
  const contextCalc = new ContextSimilarityCalculator(
    config.contextSimilarity,
    findSimilarContexts
  );

  return new SmartPrioritizationService(config, adaptiveCalc, usefulnessCalc, contextCalc);
}
