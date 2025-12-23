/**
 * Consolidation Strategy Interface
 *
 * Defines the contract that all consolidation strategies must implement.
 */

import type { DbClient } from '../../db/connection.js';
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
   * @param db - Database client for database operations
   * @returns Result of the consolidation operation
   */
  execute(group: SimilarityGroup, consolidatedBy: string | undefined, db: DbClient): StrategyResult;
}
