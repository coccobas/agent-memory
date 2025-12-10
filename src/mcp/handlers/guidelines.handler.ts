/**
 * Guideline handlers
 */

import {
  guidelineRepo,
  type CreateGuidelineInput,
  type UpdateGuidelineInput,
} from '../../db/repositories/guidelines.js';

import type {
  GuidelineAddParams,
  GuidelineUpdateParams,
  GuidelineGetParams,
  GuidelineListParams,
  GuidelineHistoryParams,
  GuidelineDeactivateParams,
} from '../types.js';
import { createValidationError, createNotFoundError } from '../errors.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export const guidelineHandlers = {
  add(params: Record<string, unknown>) {
    const {
      scopeType,
      scopeId,
      name,
      category,
      priority,
      content,
      rationale,
      examples,
      createdBy,
    } = cast<GuidelineAddParams>(params);

    if (!scopeType) {
      throw createValidationError(
        'scopeType',
        'is required',
        "Specify 'global', 'org', 'project', or 'session'"
      );
    }
    if (!name) {
      throw createValidationError('name', 'is required', 'Provide a unique name for the guideline');
    }
    if (!content) {
      throw createValidationError('content', 'is required', 'Provide the guideline text');
    }
    if (scopeType !== 'global' && !scopeId) {
      throw createValidationError(
        'scopeId',
        `is required for ${scopeType} scope`,
        'Provide the ID of the parent scope'
      );
    }

    const input: CreateGuidelineInput = {
      scopeType,
      scopeId,
      name,
      category,
      priority,
      content,
      rationale,
      examples: examples as { bad?: string[]; good?: string[] } | undefined,
      createdBy,
    };

    const guideline = guidelineRepo.create(input);
    return { success: true, guideline };
  },

  update(params: Record<string, unknown>) {
    const { id, category, priority, content, rationale, examples, changeReason, updatedBy } =
      cast<GuidelineUpdateParams>(params);

    if (!id) {
      throw new Error('id is required');
    }

    const input: UpdateGuidelineInput = {};
    if (category !== undefined) input.category = category;
    if (priority !== undefined) input.priority = priority;
    if (content !== undefined) input.content = content;
    if (rationale !== undefined) input.rationale = rationale;
    if (examples !== undefined) input.examples = examples as { bad?: string[]; good?: string[] };
    if (changeReason !== undefined) input.changeReason = changeReason;
    if (updatedBy !== undefined) input.updatedBy = updatedBy;

    const guideline = guidelineRepo.update(id, input);
    if (!guideline) {
      throw createNotFoundError('Guideline', id);
    }

    return { success: true, guideline };
  },

  get(params: Record<string, unknown>) {
    const { id, name, scopeType, scopeId, inherit } = cast<GuidelineGetParams>(params);

    if (!id && !name) {
      throw new Error('Either id or name is required');
    }

    let guideline;
    if (id) {
      guideline = guidelineRepo.getById(id);
    } else if (name && scopeType) {
      guideline = guidelineRepo.getByName(name, scopeType, scopeId, inherit ?? true);
    } else {
      throw new Error('When using name, scopeType is required');
    }

    if (!guideline) {
      throw new Error('Guideline not found');
    }

    return { guideline };
  },

  list(params: Record<string, unknown>) {
    const { scopeType, scopeId, category, includeInactive, limit, offset } =
      cast<GuidelineListParams>(params);

    const guidelines = guidelineRepo.list(
      { scopeType, scopeId, category, includeInactive },
      { limit, offset }
    );

    return {
      guidelines,
      meta: {
        returnedCount: guidelines.length,
      },
    };
  },

  history(params: Record<string, unknown>) {
    const { id } = cast<GuidelineHistoryParams>(params);

    if (!id) {
      throw new Error('id is required');
    }

    const versions = guidelineRepo.getHistory(id);
    return { versions };
  },

  deactivate(params: Record<string, unknown>) {
    const { id } = cast<GuidelineDeactivateParams>(params);

    if (!id) {
      throw new Error('id is required');
    }

    const success = guidelineRepo.deactivate(id);
    if (!success) {
      throw new Error('Guideline not found');
    }

    return { success: true };
  },
};
