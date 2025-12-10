/**
 * Conflict listing and resolution handlers
 */

import { conflictRepo } from '../../db/repositories/conflicts.js';

import type { ConflictListParams, ConflictResolveParams } from '../types.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export const conflictHandlers = {
  list(params: Record<string, unknown>) {
    const { entryType, resolved, limit, offset } = cast<ConflictListParams>(params);

    const conflicts = conflictRepo.list({ entryType, resolved }, { limit, offset });

    return {
      conflicts,
      meta: {
        returnedCount: conflicts.length,
      },
    };
  },

  resolve(params: Record<string, unknown>) {
    const { id, resolution, resolvedBy } = cast<ConflictResolveParams>(params);

    if (!id) {
      throw new Error('id is required');
    }
    if (!resolution) {
      throw new Error('resolution is required');
    }

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
