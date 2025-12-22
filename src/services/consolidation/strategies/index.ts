/**
 * Consolidation Strategy Registry
 *
 * Provides access to all consolidation strategies via a registry pattern.
 */

import type { ConsolidationStrategy } from '../strategy.interface.js';
import type { ConsolidationStrategyType } from '../types.js';
import { DedupeStrategy } from './dedupe.strategy.js';
import { MergeStrategy } from './merge.strategy.js';
import { AbstractStrategy } from './abstract.strategy.js';

// Instantiate strategies
const dedupeStrategy = new DedupeStrategy();
const mergeStrategy = new MergeStrategy();
const abstractStrategy = new AbstractStrategy();

/**
 * Strategy registry - maps strategy types to implementations
 */
export const strategyRegistry: Record<ConsolidationStrategyType, ConsolidationStrategy> = {
  dedupe: dedupeStrategy,
  semantic_merge: mergeStrategy,
  abstract: abstractStrategy,
};

/**
 * Get a strategy by type
 */
export function getStrategy(strategyType: ConsolidationStrategyType): ConsolidationStrategy {
  return strategyRegistry[strategyType];
}

// Re-export strategy classes for direct use if needed
export { DedupeStrategy, MergeStrategy, AbstractStrategy };
