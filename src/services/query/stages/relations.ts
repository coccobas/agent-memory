/**
 * Relations Stage
 *
 * Resolves related entry IDs using graph traversal.
 * Used for filtering entries by relation.
 *
 * Uses injected dependencies for graph traversal to support testing with mocks.
 */

import type { PipelineContext, QueryEntryType, PipelineDependencies } from '../pipeline.js';

/**
 * Get related entry IDs with traversal options
 *
 * Uses injected traverseRelationGraph instead of the global function.
 */
function getRelatedEntryIdsWithTraversal(
  relatedTo:
    | {
        type?: string;
        id?: string;
        relation?: string;
        depth?: number;
        direction?: 'forward' | 'backward' | 'both';
        maxResults?: number;
      }
    | undefined,
  traverseRelationGraph: PipelineDependencies['traverseRelationGraph']
): Record<QueryEntryType, Set<string>> {
  const result: Record<QueryEntryType, Set<string>> = {
    tool: new Set(),
    guideline: new Set(),
    knowledge: new Set(),
    experience: new Set(),
  };

  if (!relatedTo || !relatedTo.type || !relatedTo.id) {
    return result;
  }

  const sourceType = relatedTo.type as QueryEntryType;
  const sourceId = relatedTo.id;
  const depth = relatedTo.depth ?? 1;
  const direction = relatedTo.direction ?? 'both';
  const maxResults = relatedTo.maxResults ?? 100;

  // Use graph traversal to find related entries via injected dependency
  const traversed = traverseRelationGraph(sourceType, sourceId, {
    depth,
    direction,
    maxResults,
    relationType: relatedTo.relation,
  });

  return {
    tool: traversed.tool ?? new Set(),
    guideline: traversed.guideline ?? new Set(),
    knowledge: traversed.knowledge ?? new Set(),
    experience: traversed.experience ?? new Set(),
  };
}

/**
 * Relations stage - resolves related entry IDs
 *
 * Uses ctx.deps.traverseRelationGraph() instead of calling the global function directly.
 */
export function relationsStage(ctx: PipelineContext): PipelineContext {
  const { params, deps } = ctx;

  const relatedIds = getRelatedEntryIdsWithTraversal(params.relatedTo, deps.traverseRelationGraph);

  return {
    ...ctx,
    relatedIds,
  };
}
