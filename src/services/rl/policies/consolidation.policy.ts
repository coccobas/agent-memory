/**
 * Consolidation Policy
 *
 * Decides how to handle groups of similar memory entries:
 * - merge: Combine multiple entries into one
 * - dedupe: Remove exact duplicates
 * - archive: Move old entries to archive
 * - abstract: Create higher-level summary
 * - keep: Leave as-is
 *
 * Uses learned policy when available, falls back to quality gate thresholds.
 */

import { BasePolicy } from './base.policy.js';
import type {
  ConsolidationState,
  ConsolidationAction,
  PolicyDecision,
  PolicyConfig,
} from '../types.js';

// =============================================================================
// CONSOLIDATION POLICY
// =============================================================================

export class ConsolidationPolicy extends BasePolicy<
  ConsolidationState,
  ConsolidationAction
> {
  constructor(config: PolicyConfig) {
    super(config);
  }

  /**
   * Make consolidation decision using learned model
   * For now, this calls the fallback until models are trained
   */
  async decide(
    state: ConsolidationState
  ): Promise<PolicyDecision<ConsolidationAction>> {
    // TODO: Implement model inference when trained models are available
    // For now, use fallback rules
    return this.getFallback()(state);
  }

  /**
   * Fallback rule-based consolidation logic
   *
   * Decision rules:
   * 1. Very high similarity (>0.95) -> dedupe
   * 2. High similarity + low usage -> merge
   * 3. Old entries + zero retrievals -> archive
   * 4. Large group + high usage -> abstract
   * 5. Default -> keep
   */
  getFallback(): (state: ConsolidationState) => PolicyDecision<ConsolidationAction> {
    return (state: ConsolidationState): PolicyDecision<ConsolidationAction> => {
      const { groupFeatures, usageStats, scopeStats } = state;

      // Dedupe if entries are nearly identical
      if (groupFeatures.minSimilarity > 0.95 && groupFeatures.groupSize > 1) {
        return {
          action: {
            action: 'dedupe',
          },
          confidence: 0.95,
          metadata: { reason: 'exact_duplicates' },
        };
      }

      // Archive if old and never used
      const neverUsed = usageStats.totalRetrievals === 0;
      const veryOld = usageStats.lastAccessedDaysAgo > 90;

      if (neverUsed && veryOld) {
        return {
          action: {
            action: 'archive',
          },
          confidence: 0.9,
          metadata: { reason: 'unused_old_entries' },
        };
      }

      // Archive if old and low success rate
      const lowSuccess = usageStats.successRate < 0.3;
      const old = usageStats.lastAccessedDaysAgo > 60;

      if (lowSuccess && old && usageStats.totalRetrievals > 5) {
        return {
          action: {
            action: 'archive',
          },
          confidence: 0.85,
          metadata: { reason: 'low_success_old_entries' },
        };
      }

      // Merge if high similarity and low usage
      const highSimilarity = groupFeatures.avgSimilarity > 0.8;
      const lowUsage = usageStats.totalRetrievals < 10;

      if (highSimilarity && lowUsage && groupFeatures.groupSize >= 2) {
        return {
          action: {
            action: 'merge',
            mergeStrategy: 'union',
          },
          confidence: 0.8,
          metadata: { reason: 'similar_low_usage' },
        };
      }

      // Abstract if large group with high usage (create general rule)
      const largeGroup = groupFeatures.groupSize >= 5;
      const highUsage = usageStats.totalRetrievals > 50;
      const goodSuccess = usageStats.successRate > 0.6;

      if (largeGroup && highUsage && goodSuccess) {
        return {
          action: {
            action: 'abstract',
          },
          confidence: 0.85,
          metadata: { reason: 'pattern_abstraction' },
        };
      }

      // Merge if medium similarity and same type
      const mediumSimilarity = groupFeatures.avgSimilarity > 0.7;
      const sameType = new Set(groupFeatures.entryTypes).size === 1;

      if (mediumSimilarity && sameType && groupFeatures.groupSize >= 3) {
        return {
          action: {
            action: 'merge',
            mergeStrategy: 'weighted',
          },
          confidence: 0.75,
          metadata: { reason: 'similar_same_type' },
        };
      }

      // Archive if scope has too many duplicates
      const tooManyDuplicates = scopeStats.duplicateRatio > 0.3;
      const moderateSimilarity = groupFeatures.avgSimilarity > 0.65;

      if (tooManyDuplicates && moderateSimilarity) {
        return {
          action: {
            action: 'merge',
            mergeStrategy: 'intersection',
          },
          confidence: 0.7,
          metadata: { reason: 'reduce_duplicates' },
        };
      }

      // Keep if actively used with good success
      const activelyUsed = usageStats.lastAccessedDaysAgo < 7;
      const recentlySuccessful = usageStats.successRate > 0.7;

      if (activelyUsed && recentlySuccessful) {
        return {
          action: {
            action: 'keep',
          },
          confidence: 0.9,
          metadata: { reason: 'active_successful' },
        };
      }

      // Keep if high-quality results (low rank = shown near top)
      const highQuality = usageStats.avgRetrievalRank < 3;

      if (highQuality && usageStats.totalRetrievals > 0) {
        return {
          action: {
            action: 'keep',
          },
          confidence: 0.85,
          metadata: { reason: 'high_quality' },
        };
      }

      // Default: keep (conservative approach)
      return {
        action: {
          action: 'keep',
        },
        confidence: 0.6,
        metadata: { reason: 'default_keep' },
      };
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create consolidation policy instance
 */
export function createConsolidationPolicy(config: PolicyConfig): ConsolidationPolicy {
  return new ConsolidationPolicy(config);
}
