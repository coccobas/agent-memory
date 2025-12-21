/**
 * Relations Stage
 *
 * Resolves related entry IDs using graph traversal.
 * Used for filtering entries by relation.
 */

import type { PipelineContext, QueryEntryType } from '../pipeline.js';
import type { RelationType } from '../../../db/schema.js';
import { traverseRelationGraph } from '../../query.service.js';

/**
 * Get related entry IDs with traversal options
 */
export function getRelatedEntryIdsWithTraversal(
  relatedTo:
    | {
        type?: string;
        id?: string;
        relation?: string;
        depth?: number;
        direction?: 'forward' | 'backward' | 'both';
        maxResults?: number;
      }
    | undefined
): Record<QueryEntryType, Set<string>> {
  const result: Record<QueryEntryType, Set<string>> = {
    tool: new Set(),
    guideline: new Set(),
    knowledge: new Set(),
  };

  if (!relatedTo || !relatedTo.type || !relatedTo.id) {
    return result;
  }

  const sourceType = relatedTo.type as QueryEntryType;
  const sourceId = relatedTo.id;
  const depth = relatedTo.depth ?? 1;
  const direction = relatedTo.direction ?? 'both';
  const maxResults = relatedTo.maxResults ?? 100;

  // Use graph traversal to find related entries
  const traversed = traverseRelationGraph(sourceType, sourceId, {
    depth,
    direction,
    maxResults,
    relationType: relatedTo.relation as RelationType | undefined,
  });

  return {
    tool: traversed.tool ?? new Set(),
    guideline: traversed.guideline ?? new Set(),
    knowledge: traversed.knowledge ?? new Set(),
  };
}

/**
 * Relations stage - resolves related entry IDs
 */
export function relationsStage(ctx: PipelineContext): PipelineContext {
  const { params } = ctx;

  const relatedIds = getRelatedEntryIdsWithTraversal(params.relatedTo);

  return {
    ...ctx,
    relatedIds,
  };
}
