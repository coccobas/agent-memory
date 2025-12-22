/**
 * Merge Strategy
 *
 * Combine content from similar entries into the primary.
 */

import { createComponentLogger } from '../../../utils/logger.js';
import type { ConsolidationStrategy } from '../strategy.interface.js';
import type { SimilarityGroup, StrategyResult } from '../types.js';
import {
  getEntryDetails,
  batchDeactivateEntries,
  updateEntryContent,
  createConsolidationRelation,
  createMergedContent,
} from '../helpers.js';

const logger = createComponentLogger('consolidation.merge');

export class MergeStrategy implements ConsolidationStrategy {
  readonly name = 'semantic_merge' as const;

  execute(group: SimilarityGroup, consolidatedBy?: string): StrategyResult {
    // Get full content of all entries
    const allEntryIds = [group.primaryId, ...group.members.map((m) => m.id)];
    const entries = getEntryDetails(group.entryType, allEntryIds);

    // Build a Map for O(1) lookups
    const entriesById = new Map(entries.map((e) => [e.id, e]));

    const primaryEntry = entriesById.get(group.primaryId);
    if (!primaryEntry) {
      return {
        success: false,
        entriesProcessed: 0,
        entriesDeactivated: 0,
        entriesMerged: 0,
        relationsCreated: 0,
        error: `Primary entry ${group.primaryId} not found`,
      };
    }

    // Combine content (append unique points from members) - O(1) lookups
    const memberContents = group.members
      .map((m) => {
        const entry = entriesById.get(m.id);
        return entry?.content || '';
      })
      .filter((c) => c.length > 0);

    // Create merged content
    const mergedContent = createMergedContent(primaryEntry.content, memberContents);

    // Update primary entry with merged content
    updateEntryContent(
      group.entryType,
      group.primaryId,
      mergedContent,
      `Merged from ${group.members.length} similar entries`,
      consolidatedBy
    );

    // Batch deactivate merged entries (single UPDATE instead of N)
    const memberIds = group.members.map((m) => m.id);
    batchDeactivateEntries(group.entryType, memberIds);

    // Create relations to track provenance
    for (const member of group.members) {
      createConsolidationRelation(group.entryType, member.id, group.primaryId, 'merged_into');
    }

    logger.info(
      {
        primaryId: group.primaryId,
        mergedCount: group.members.length,
      },
      'Merge consolidation completed'
    );

    return {
      success: true,
      entriesProcessed: group.members.length + 1,
      entriesDeactivated: group.members.length,
      entriesMerged: group.members.length,
      relationsCreated: group.members.length,
    };
  }
}
