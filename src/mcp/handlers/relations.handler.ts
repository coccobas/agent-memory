/**
 * Relation handlers
 */

import { entryRelationRepo, type CreateRelationInput } from '../../db/repositories/tags.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isEntryType,
  isRelationType,
  isNumber,
} from '../../utils/type-guards.js';

export const relationHandlers = {
  create(params: Record<string, unknown>) {
    const sourceType = getRequiredParam(params, 'sourceType', isEntryType);
    const sourceId = getRequiredParam(params, 'sourceId', isString);
    const targetType = getRequiredParam(params, 'targetType', isEntryType);
    const targetId = getRequiredParam(params, 'targetId', isString);
    const relationType = getRequiredParam(params, 'relationType', isRelationType);
    const createdBy = getOptionalParam(params, 'createdBy', isString);

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
    const sourceType = getOptionalParam(params, 'sourceType', isEntryType);
    const sourceId = getOptionalParam(params, 'sourceId', isString);
    const targetType = getOptionalParam(params, 'targetType', isEntryType);
    const targetId = getOptionalParam(params, 'targetId', isString);
    const relationType = getOptionalParam(params, 'relationType', isRelationType);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

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
    const id = getOptionalParam(params, 'id', isString);
    const sourceType = getOptionalParam(params, 'sourceType', isEntryType);
    const sourceId = getOptionalParam(params, 'sourceId', isString);
    const targetType = getOptionalParam(params, 'targetType', isEntryType);
    const targetId = getOptionalParam(params, 'targetId', isString);
    const relationType = getOptionalParam(params, 'relationType', isRelationType);

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
