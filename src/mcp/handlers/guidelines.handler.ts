/**
 * Guideline handlers
 */

import {
  guidelineRepo,
  type CreateGuidelineInput,
  type UpdateGuidelineInput,
} from '../../db/repositories/guidelines.js';
import { checkPermission } from '../../services/permission.service.js';
import { transaction } from '../../db/connection.js';
import { checkForDuplicates } from '../../services/duplicate.service.js';
import { logAction } from '../../services/audit.service.js';
import { detectRedFlags } from '../../services/redflag.service.js';
import { invalidateCacheEntry } from '../../services/query.service.js';
import { validateEntry } from '../../services/validation.service.js';

import type {
  GuidelineAddParams,
  GuidelineUpdateParams,
  GuidelineGetParams,
  GuidelineListParams,
  GuidelineHistoryParams,
  GuidelineDeactivateParams,
} from '../types.js';
import { createValidationError, createNotFoundError } from '../errors.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('guidelines');

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
      agentId,
    } = cast<GuidelineAddParams & { agentId?: string }>(params);

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

    // Check permission (write required for add)
    if (
      agentId &&
      !checkPermission(agentId, 'write', 'guideline', null, scopeType, scopeId ?? null)
    ) {
      throw new Error('Permission denied: write access required');
    }

    // Check for duplicates (warn but don't block)
    const duplicateCheck = checkForDuplicates('guideline', name, scopeType, scopeId ?? null);
    if (duplicateCheck.isDuplicate) {
      logger.warn(
        {
          guidelineName: name,
          scopeType,
          scopeId,
          similarEntries: duplicateCheck.similarEntries.map((e) => ({
            name: e.name,
            similarity: e.similarity,
          })),
        },
        'Potential duplicate guideline found'
      );
    }

    // Validate entry data
    const validation = validateEntry(
      'guideline',
      { name, content, rationale, priority, category },
      scopeType,
      scopeId
    );
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`);
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

    // Check for red flags
    const redFlags = detectRedFlags({
      type: 'guideline',
      content: content || '',
    });
    if (redFlags.length > 0) {
      logger.warn(
        {
          guidelineName: name,
          guidelineId: guideline.id,
          redFlags: redFlags.map((f) => ({
            pattern: f.pattern,
            severity: f.severity,
            description: f.description,
          })),
        },
        'Red flags detected in guideline'
      );
    }

    // Log audit
    logAction({
      agentId,
      action: 'create',
      entryType: 'guideline',
      entryId: guideline.id,
      scopeType,
      scopeId: scopeId ?? null,
    });

    return { success: true, guideline, redFlags: redFlags.length > 0 ? redFlags : undefined };
  },

  update(params: Record<string, unknown>) {
    const {
      id,
      category,
      priority,
      content,
      rationale,
      examples,
      changeReason,
      updatedBy,
      agentId,
    } = cast<GuidelineUpdateParams & { agentId?: string }>(params);

    if (!id) {
      throw new Error('id is required');
    }

    // Get guideline to check scope and permission
    const existingGuideline = guidelineRepo.getById(id);
    if (!existingGuideline) {
      throw createNotFoundError('Guideline', id);
    }

    // Check permission (write required for update)
    if (
      agentId &&
      !checkPermission(
        agentId,
        'write',
        'guideline',
        id,
        existingGuideline.scopeType,
        existingGuideline.scopeId ?? null
      )
    ) {
      throw new Error('Permission denied: write access required');
    }

    const input: UpdateGuidelineInput = {};
    if (category !== undefined) input.category = category;
    if (priority !== undefined) input.priority = priority;
    if (content !== undefined) input.content = content;
    if (rationale !== undefined) input.rationale = rationale;
    if (examples !== undefined) input.examples = examples as { bad?: string[]; good?: string[] };
    if (changeReason !== undefined) input.changeReason = changeReason;
    if (updatedBy !== undefined) input.updatedBy = updatedBy;

    // Validate entry data (include existing name for validation)
    const validation = validateEntry(
      'guideline',
      { name: existingGuideline.name, content, rationale, priority, category },
      existingGuideline.scopeType,
      existingGuideline.scopeId ?? undefined
    );
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`);
    }

    const guideline = guidelineRepo.update(id, input);
    if (!guideline) {
      throw createNotFoundError('Guideline', id);
    }

    // Invalidate cache for this entry
    invalidateCacheEntry('guideline', id);

    // Log audit
    logAction({
      agentId,
      action: 'update',
      entryType: 'guideline',
      entryId: id,
      scopeType: existingGuideline.scopeType,
      scopeId: existingGuideline.scopeId ?? null,
    });

    return { success: true, guideline };
  },

  get(params: Record<string, unknown>) {
    const { id, name, scopeType, scopeId, inherit, agentId } = cast<
      GuidelineGetParams & { agentId?: string }
    >(params);

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

    // Check permission (read required for get)
    if (
      agentId &&
      !checkPermission(
        agentId,
        'read',
        'guideline',
        guideline.id,
        guideline.scopeType,
        guideline.scopeId ?? null
      )
    ) {
      throw new Error('Permission denied: read access required');
    }

    // Log audit
    logAction({
      agentId,
      action: 'read',
      entryType: 'guideline',
      entryId: guideline.id,
      scopeType: guideline.scopeType,
      scopeId: guideline.scopeId ?? null,
    });

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
    const { id, agentId } = cast<GuidelineDeactivateParams & { agentId?: string }>(params);

    if (!id) {
      throw new Error('id is required');
    }

    // Get guideline to check scope and permission
    const existingGuideline = guidelineRepo.getById(id);
    if (!existingGuideline) {
      throw new Error('Guideline not found');
    }

    // Check permission (delete/write required for deactivate)
    if (
      agentId &&
      !checkPermission(
        agentId,
        'delete',
        'guideline',
        id,
        existingGuideline.scopeType,
        existingGuideline.scopeId ?? null
      )
    ) {
      throw new Error('Permission denied: delete access required');
    }

    const success = guidelineRepo.deactivate(id);
    if (!success) {
      throw new Error('Guideline not found');
    }

    // Log audit
    logAction({
      agentId,
      action: 'delete',
      entryType: 'guideline',
      entryId: id,
      scopeType: existingGuideline.scopeType,
      scopeId: existingGuideline.scopeId ?? null,
    });

    return { success: true };
  },

  bulk_add(params: Record<string, unknown>) {
    const { entries, agentId } = cast<{ entries: GuidelineAddParams[]; agentId?: string }>(params);

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      throw new Error('entries array is required and must not be empty');
    }

    // Check permissions for all entries
    if (agentId) {
      for (const entry of entries) {
        if (
          !checkPermission(
            agentId,
            'write',
            'guideline',
            null,
            entry.scopeType,
            entry.scopeId ?? null
          )
        ) {
          throw new Error(
            `Permission denied: write access required for scope ${entry.scopeType}:${entry.scopeId ?? ''}`
          );
        }
      }
    }

    // Execute in transaction
    const results = transaction(() => {
      return entries.map((entry) => {
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
        } = entry;

        if (!scopeType) {
          throw createValidationError('scopeType', 'is required', 'Specify scope type');
        }
        if (!name) {
          throw createValidationError('name', 'is required', 'Provide a unique name');
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

        return guidelineRepo.create(input);
      });
    });

    return { success: true, guidelines: results, count: results.length };
  },

  bulk_update(params: Record<string, unknown>) {
    const { updates, agentId } = cast<{
      updates: Array<{ id: string } & GuidelineUpdateParams>;
      agentId?: string;
    }>(params);

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      throw new Error('updates array is required and must not be empty');
    }

    // Check permissions for all entries
    if (agentId) {
      for (const update of updates) {
        const existingGuideline = guidelineRepo.getById(update.id);
        if (!existingGuideline) {
          throw createNotFoundError('Guideline', update.id);
        }
        if (
          !checkPermission(
            agentId,
            'write',
            'guideline',
            update.id,
            existingGuideline.scopeType,
            existingGuideline.scopeId ?? null
          )
        ) {
          throw new Error(`Permission denied: write access required for guideline ${update.id}`);
        }
      }
    }

    // Execute in transaction
    const results = transaction(() => {
      return updates.map((update) => {
        const { id, category, priority, content, rationale, examples, changeReason, updatedBy } =
          update;

        if (!id) {
          throw new Error('id is required');
        }

        const input: UpdateGuidelineInput = {};
        if (category !== undefined) input.category = category;
        if (priority !== undefined) input.priority = priority;
        if (content !== undefined) input.content = content;
        if (rationale !== undefined) input.rationale = rationale;
        if (examples !== undefined)
          input.examples = examples as { bad?: string[]; good?: string[] };
        if (changeReason !== undefined) input.changeReason = changeReason;
        if (updatedBy !== undefined) input.updatedBy = updatedBy;

        const guideline = guidelineRepo.update(id, input);
        if (!guideline) {
          throw createNotFoundError('Guideline', id);
        }

        // Invalidate cache for this entry
        invalidateCacheEntry('guideline', id);

        return guideline;
      });
    });

    return { success: true, guidelines: results, count: results.length };
  },

  bulk_delete(params: Record<string, unknown>) {
    const { ids, agentId } = cast<{ ids: string[]; agentId?: string }>(params);

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new Error('ids array is required and must not be empty');
    }

    // Check permissions for all entries
    if (agentId) {
      for (const id of ids) {
        const existingGuideline = guidelineRepo.getById(id);
        if (!existingGuideline) {
          throw new Error(`Guideline not found: ${id}`);
        }
        if (
          !checkPermission(
            agentId,
            'delete',
            'guideline',
            id,
            existingGuideline.scopeType,
            existingGuideline.scopeId ?? null
          )
        ) {
          throw new Error(`Permission denied: delete access required for guideline ${id}`);
        }
      }
    }

    // Execute in transaction
    const results = transaction(() => {
      return ids.map((id) => {
        const success = guidelineRepo.deactivate(id);
        if (!success) {
          throw new Error(`Guideline not found: ${id}`);
        }
        return { id, success: true };
      });
    });

    return { success: true, deleted: results, count: results.length };
  },
};
