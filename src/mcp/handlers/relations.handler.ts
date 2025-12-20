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
import { requireEntryPermission } from '../../utils/entry-access.js';
import { createValidationError } from '../errors.js';

export const relationHandlers = {
  create(params: Record<string, unknown>) {
    const agentId = getRequiredParam(params, 'agentId', isString);
    const sourceType = getRequiredParam(params, 'sourceType', isEntryType);
    const sourceId = getRequiredParam(params, 'sourceId', isString);
    const targetType = getRequiredParam(params, 'targetType', isEntryType);
    const targetId = getRequiredParam(params, 'targetId', isString);
    const relationType = getRequiredParam(params, 'relationType', isRelationType);
    const createdBy = getOptionalParam(params, 'createdBy', isString);

    requireEntryPermission({ agentId, action: 'write', entryType: sourceType, entryId: sourceId });
    requireEntryPermission({ agentId, action: 'write', entryType: targetType, entryId: targetId });

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
    const agentId = getRequiredParam(params, 'agentId', isString);
    const sourceType = getOptionalParam(params, 'sourceType', isEntryType);
    const sourceId = getOptionalParam(params, 'sourceId', isString);
    const targetType = getOptionalParam(params, 'targetType', isEntryType);
    const targetId = getOptionalParam(params, 'targetId', isString);
    const relationType = getOptionalParam(params, 'relationType', isRelationType);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    // Avoid broad enumeration: require at least one anchored entry filter
    const anchored =
      (sourceType && sourceId) || (targetType && targetId);
    if (!anchored) {
      throw createValidationError(
        'sourceType/sourceId or targetType/targetId',
        'is required',
        'Provide an entry to list relations for'
      );
    }
    if (sourceType && sourceId) {
      requireEntryPermission({ agentId, action: 'read', entryType: sourceType, entryId: sourceId });
    }
    if (targetType && targetId) {
      requireEntryPermission({ agentId, action: 'read', entryType: targetType, entryId: targetId });
    }

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
    const agentId = getRequiredParam(params, 'agentId', isString);
    const id = getOptionalParam(params, 'id', isString);
    const sourceType = getOptionalParam(params, 'sourceType', isEntryType);
    const sourceId = getOptionalParam(params, 'sourceId', isString);
    const targetType = getOptionalParam(params, 'targetType', isEntryType);
    const targetId = getOptionalParam(params, 'targetId', isString);
    const relationType = getOptionalParam(params, 'relationType', isRelationType);

    let success = false;

    if (id) {
      const rel = entryRelationRepo.getById(id);
      if (!rel) return { success: false };
      // Only check entry permission for non-project types (projects have different access control)
      if (rel.sourceType !== 'project') {
        requireEntryPermission({ agentId, action: 'delete', entryType: rel.sourceType, entryId: rel.sourceId });
      }
      success = entryRelationRepo.delete(id);
    } else if (sourceType && sourceId && targetType && targetId && relationType) {
      requireEntryPermission({ agentId, action: 'delete', entryType: sourceType, entryId: sourceId });
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
