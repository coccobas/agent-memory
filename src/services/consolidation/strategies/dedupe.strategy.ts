/**
 * Dedupe Strategy
 *
 * Keep the primary (most recent or highest quality), deactivate others.
 */

import { createComponentLogger } from '../../../utils/logger.js';
import type { ConsolidationStrategy } from '../strategy.interface.js';
import type { SimilarityGroup, StrategyResult } from '../types.js';
import { batchDeactivateEntries, createConsolidationRelation } from '../helpers.js';

const logger = createComponentLogger('consolidation.dedupe');

export class DedupeStrategy implements ConsolidationStrategy {
  readonly name = 'dedupe' as const;

  execute(group: SimilarityGroup, _consolidatedBy?: string): StrategyResult {
    // Batch deactivate all duplicate entries (single UPDATE instead of N)
    const memberIds = group.members.map((m) => m.id);
    batchDeactivateEntries(group.entryType, memberIds);

    // Create relations to track provenance
    for (const member of group.members) {
      createConsolidationRelation(group.entryType, member.id, group.primaryId, 'consolidated_into');
    }

    logger.info(
      {
        primaryId: group.primaryId,
        deactivatedCount: group.members.length,
      },
      'Dedupe consolidation completed'
    );

    return {
      success: true,
      entriesProcessed: group.members.length + 1,
      entriesDeactivated: group.members.length,
      entriesMerged: 0,
      relationsCreated: group.members.length,
    };
  }
}
