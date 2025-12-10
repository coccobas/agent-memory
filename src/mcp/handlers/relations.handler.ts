/**
 * Relation handlers
 */

import { entryRelationRepo, type CreateRelationInput } from '../../db/repositories/tags.js';

import type { RelationCreateParams, RelationListParams, RelationDeleteParams } from '../types.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export const relationHandlers = {
  create(params: Record<string, unknown>) {
    const { sourceType, sourceId, targetType, targetId, relationType, createdBy } =
      cast<RelationCreateParams>(params);

    if (!sourceType) throw new Error('sourceType is required');
    if (!sourceId) throw new Error('sourceId is required');
    if (!targetType) throw new Error('targetType is required');
    if (!targetId) throw new Error('targetId is required');
    if (!relationType) throw new Error('relationType is required');

    const input: CreateRelationInput = {
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationType,
      createdBy,
    };

    const relation = entryRelationRepo.create(input);
    return { success: true, relation };
  },

  list(params: Record<string, unknown>) {
    const { sourceType, sourceId, targetType, targetId, relationType, limit, offset } =
      cast<RelationListParams>(params);

    const relations = entryRelationRepo.list(
      { sourceType, sourceId, targetType, targetId, relationType },
      { limit, offset }
    );

    return {
      relations,
      meta: {
        returnedCount: relations.length,
      },
    };
  },

  delete(params: Record<string, unknown>) {
    const { id, sourceType, sourceId, targetType, targetId, relationType } =
      cast<RelationDeleteParams>(params);

    let success = false;

    if (id) {
      success = entryRelationRepo.delete(id);
    } else if (sourceType && sourceId && targetType && targetId && relationType) {
      success = entryRelationRepo.deleteByEntries(
        sourceType,
        sourceId,
        targetType,
        targetId,
        relationType
      );
    } else {
      throw new Error(
        'Either id or all of (sourceType, sourceId, targetType, targetId, relationType) are required'
      );
    }

    return { success };
  },
};
