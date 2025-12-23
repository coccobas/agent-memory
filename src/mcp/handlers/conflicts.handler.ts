/**
 * Conflict listing and resolution handlers
 *
 * Context-aware handlers that receive AppContext for dependency injection.
 */

import type { AppContext } from '../../core/context.js';
import {
  getRequiredParam,
  getOptionalParam,
  isEntryType,
  isBoolean,
  isNumber,
  isString,
} from '../../utils/type-guards.js';
import type { ConflictListParams, ConflictResolveParams } from '../types.js';
import { createNotFoundError } from '../../core/errors.js';

export const conflictHandlers = {
  async list(context: AppContext, params: ConflictListParams) {
    const entryType = getOptionalParam(params, 'entryType', isEntryType);
    const resolved = getOptionalParam(params, 'resolved', isBoolean);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const conflicts = await context.repos.conflicts.list({ entryType, resolved }, { limit, offset });

    return {
      conflicts,
      meta: {
        returnedCount: conflicts.length,
      },
    };
  },

  async resolve(context: AppContext, params: ConflictResolveParams) {
    const id = getRequiredParam(params, 'id', isString);
    const resolution = getRequiredParam(params, 'resolution', isString);
    const resolvedBy = getOptionalParam(params, 'resolvedBy', isString);

    const conflict = await context.repos.conflicts.resolve(id, resolution, resolvedBy);
    if (!conflict) {
      throw createNotFoundError('Conflict', id);
    }

    return {
      success: true,
      conflict,
    };
  },
};
