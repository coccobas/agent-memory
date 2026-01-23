import type { IExtractionService } from '../../../core/context.js';
import type { ConsolidationStrategy } from '../strategy.interface.js';
import type { ConsolidationStrategyType } from '../types.js';
import { DedupeStrategy } from './dedupe.strategy.js';
import { MergeStrategy } from './merge.strategy.js';
import { AbstractStrategy } from './abstract.strategy.js';

const dedupeStrategy = new DedupeStrategy();
let mergeStrategy = new MergeStrategy();
const abstractStrategy = new AbstractStrategy();

export const strategyRegistry: Record<ConsolidationStrategyType, ConsolidationStrategy> = {
  dedupe: dedupeStrategy,
  semantic_merge: mergeStrategy,
  abstract: abstractStrategy,
};

export function getStrategy(strategyType: ConsolidationStrategyType): ConsolidationStrategy {
  return strategyRegistry[strategyType];
}

export function configureMergeStrategy(extractionService?: IExtractionService): void {
  mergeStrategy = new MergeStrategy({ extractionService });
  strategyRegistry.semantic_merge = mergeStrategy;
}

export { DedupeStrategy, MergeStrategy, AbstractStrategy };
