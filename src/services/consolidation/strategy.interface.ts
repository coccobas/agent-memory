import type { DbClient } from '../../db/connection.js';
import type { ConsolidationStrategyType, SimilarityGroup, StrategyResult } from './types.js';

export interface ConsolidationStrategy {
  readonly name: ConsolidationStrategyType;

  execute(
    group: SimilarityGroup,
    consolidatedBy: string | undefined,
    db: DbClient
  ): StrategyResult | Promise<StrategyResult>;
}
