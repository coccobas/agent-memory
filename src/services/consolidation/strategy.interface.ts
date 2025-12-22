/**
 * Consolidation Strategy Interface
 *
 * Defines the contract that all consolidation strategies must implement.
 */

import type { ConsolidationStrategyType, SimilarityGroup, StrategyResult } from './types.js';

/**
 * Strategy interface for consolidation operations
 */
export interface ConsolidationStrategy {
  /**
   * The strategy type identifier
   */
  readonly name: ConsolidationStrategyType;

  /**
   * Execute the consolidation strategy on a similarity group
   *
   * @param group - The group of similar entries to consolidate
   * @param consolidatedBy - Optional agent/user identifier for audit
   * @returns Result of the consolidation operation
   */
  execute(group: SimilarityGroup, consolidatedBy?: string): StrategyResult;
}
