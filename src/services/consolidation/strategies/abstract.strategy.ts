/**
 * Abstract Strategy
 *
 * Create relations between similar entries without modifying them.
 */

import { createComponentLogger } from '../../../utils/logger.js';
import type { ConsolidationStrategy } from '../strategy.interface.js';
import type { SimilarityGroup, StrategyResult } from '../types.js';
import { createConsolidationRelation } from '../helpers.js';

const logger = createComponentLogger('consolidation.abstract');

export class AbstractStrategy implements ConsolidationStrategy {
  readonly name = 'abstract' as const;

  execute(group: SimilarityGroup, _consolidatedBy?: string): StrategyResult {
    // Link all members as related to the primary
    for (const member of group.members) {
      createConsolidationRelation(group.entryType, group.primaryId, member.id, 'related');
    }

    logger.info(
      {
        primaryId: group.primaryId,
        relatedCount: group.members.length,
      },
      'Abstract consolidation completed (relations created)'
    );

    return {
      success: true,
      entriesProcessed: group.members.length + 1,
      entriesDeactivated: 0,
      entriesMerged: 0,
      relationsCreated: group.members.length,
    };
  }
}
