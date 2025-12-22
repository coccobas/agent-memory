/**
 * Consolidation Orchestrator
 *
 * Coordinates consolidation operations using the strategy pattern.
 */

import { createComponentLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import type { ConsolidationParams, ConsolidationResult } from './types.js';
import { findSimilarGroups } from './discovery.js';
import { getStrategy } from './strategies/index.js';

const logger = createComponentLogger('consolidation.orchestrator');

/**
 * Execute consolidation based on strategy
 */
export async function consolidate(params: ConsolidationParams): Promise<ConsolidationResult> {
  const {
    strategy,
    dryRun = false,
    threshold = config.semanticSearch.duplicateThreshold,
    consolidatedBy,
  } = params;

  const result: ConsolidationResult = {
    strategy,
    dryRun,
    groupsFound: 0,
    entriesProcessed: 0,
    entriesMerged: 0,
    entriesDeactivated: 0,
    groups: [],
    errors: [],
  };

  try {
    // Find similar groups
    const groups = await findSimilarGroups({
      ...params,
      threshold,
    });

    result.groupsFound = groups.length;
    result.groups = groups;

    if (dryRun) {
      // Just return what would be consolidated
      result.entriesProcessed = groups.reduce((sum, g) => sum + g.members.length + 1, 0);
      return result;
    }

    // Get the strategy implementation
    const strategyImpl = getStrategy(strategy);

    // Execute consolidation for each group
    for (const group of groups) {
      try {
        const strategyResult = strategyImpl.execute(group, consolidatedBy);

        if (strategyResult.success) {
          result.entriesProcessed += strategyResult.entriesProcessed;
          result.entriesMerged += strategyResult.entriesMerged;
          result.entriesDeactivated += strategyResult.entriesDeactivated;
        } else if (strategyResult.error) {
          result.errors.push(strategyResult.error);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to consolidate group ${group.primaryId}: ${errorMsg}`);
        logger.error({ group: group.primaryId, error }, 'Consolidation failed for group');
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Consolidation failed: ${errorMsg}`);
    logger.error({ error }, 'Consolidation failed');
  }

  return result;
}
