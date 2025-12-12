/**
 * Conflict listing and resolution handlers
 */

import { conflictRepo } from '../../db/repositories/conflicts.js';
import {
  getRequiredParam,
  getOptionalParam,
  isEntryType,
  isBoolean,
  isNumber,
  isString,
} from '../../utils/type-guards.js';

export const conflictHandlers = {
  list(params: Record<string, unknown>) {
    const entryType = getOptionalParam(params, 'entryType', isEntryType);
    const resolved = getOptionalParam(params, 'resolved', isBoolean);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const conflicts = conflictRepo.list({ entryType, resolved }, { limit, offset });

    return {
      conflicts,
      meta: {
        returnedCount: conflicts.length,
      },
    };
  },

  resolve(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);
    const resolution = getRequiredParam(params, 'resolution', isString);
    const resolvedBy = getOptionalParam(params, 'resolvedBy', isString);

    const conflict = conflictRepo.resolve(id, resolution, resolvedBy);
    if (!conflict) {
      throw new Error('Conflict not found');
    }

    return {
      success: true,
      conflict,
    };
  },
};
