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

import { createValidationError, createNotFoundError } from '../errors.js';
import { createComponentLogger } from '../../utils/logger.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isScopeType,
  isNumber,
  isBoolean,
  isArray,
  isArrayOfObjects,
  isExamplesObject,
  isObject,
} from '../../utils/type-guards.js';
import type { GuidelineAddParams, GuidelineUpdateParams } from '../types.js';

const logger = createComponentLogger('guidelines');

export const guidelineHandlers = {
  add(params: Record<string, unknown>) {
    const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const name = getRequiredParam(params, 'name', isString);
    const category = getOptionalParam(params, 'category', isString);
    const priority = getOptionalParam(params, 'priority', isNumber);
    const content = getRequiredParam(params, 'content', isString);
    const rationale = getOptionalParam(params, 'rationale', isString);
    const examples = getOptionalParam(params, 'examples', isExamplesObject);
    const createdBy = getOptionalParam(params, 'createdBy', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

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
      examples,
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
    const id = getRequiredParam(params, 'id', isString);
    const category = getOptionalParam(params, 'category', isString);
    const priority = getOptionalParam(params, 'priority', isNumber);
    const content = getOptionalParam(params, 'content', isString);
    const rationale = getOptionalParam(params, 'rationale', isString);
    const examples = getOptionalParam(params, 'examples', isExamplesObject);
    const changeReason = getOptionalParam(params, 'changeReason', isString);
    const updatedBy = getOptionalParam(params, 'updatedBy', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

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
    const id = getOptionalParam(params, 'id', isString);
    const name = getOptionalParam(params, 'name', isString);
    const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const inherit = getOptionalParam(params, 'inherit', isBoolean);
    const agentId = getOptionalParam(params, 'agentId', isString);

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
    const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const category = getOptionalParam(params, 'category', isString);
    const includeInactive = getOptionalParam(params, 'includeInactive', isBoolean);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

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
    const id = getRequiredParam(params, 'id', isString);

    const versions = guidelineRepo.getHistory(id);
    return { versions };
  },

  deactivate(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

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
    const entries = getRequiredParam(params, 'entries', isArrayOfObjects);
    const agentId = getOptionalParam(params, 'agentId', isString);

    if (entries.length === 0) {
      throw new Error('entries array must not be empty');
    }

    // Check permissions for all entries
    if (agentId) {
      for (const entry of entries) {
        if (!isObject(entry)) continue;
        const entryObj = entry as unknown as GuidelineAddParams;
        if (
          !checkPermission(
            agentId,
            'write',
            'guideline',
            null,
            entryObj.scopeType,
            entryObj.scopeId ?? null
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
        // Validate entry structure
        if (!isObject(entry)) {
          throw createValidationError('entry', 'must be an object', 'Each entry must be a valid object');
        }

        const entryObj = entry as unknown as GuidelineAddParams;
        const scopeType = isScopeType(entryObj.scopeType)
          ? entryObj.scopeType
          : (() => {
              throw createValidationError('scopeType', 'is required', 'Specify scope type');
            })();
        const scopeId = entryObj.scopeId;
        const name = isString(entryObj.name)
          ? entryObj.name
          : (() => {
              throw createValidationError('name', 'is required', 'Provide a unique name');
            })();
        const category = entryObj.category;
        const priority = entryObj.priority;
        const content = isString(entryObj.content)
          ? entryObj.content
          : (() => {
              throw createValidationError('content', 'is required', 'Provide the guideline text');
            })();
        const rationale = entryObj.rationale;
        const examples = entryObj.examples;
        const createdBy = entryObj.createdBy;

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
          examples,
          createdBy,
        };

        return guidelineRepo.create(input);
      });
    });

    return { success: true, guidelines: results, count: results.length };
  },

  bulk_update(params: Record<string, unknown>) {
    const updates = getRequiredParam(params, 'updates', isArrayOfObjects);
    const agentId = getOptionalParam(params, 'agentId', isString);

    if (updates.length === 0) {
      throw new Error('updates array must not be empty');
    }

    // Check permissions for all entries
    if (agentId) {
      for (const update of updates) {
        if (!isObject(update)) continue;
        const updateObj = update as unknown as { id: string } & GuidelineUpdateParams;
        const existingGuideline = guidelineRepo.getById(updateObj.id);
        if (!existingGuideline) {
          throw createNotFoundError('Guideline', updateObj.id);
        }
        if (
          !checkPermission(
            agentId,
            'write',
            'guideline',
            updateObj.id,
            existingGuideline.scopeType,
            existingGuideline.scopeId ?? null
          )
        ) {
          throw new Error(`Permission denied: write access required for guideline ${updateObj.id}`);
        }
      }
    }

    // Execute in transaction
    const results = transaction(() => {
      return updates.map((update) => {
        // Validate update structure
        if (!isObject(update)) {
          throw createValidationError('update', 'must be an object', 'Each update must be a valid object');
        }

        const updateObj = update as unknown as { id: string } & GuidelineUpdateParams;
        const id = isString(updateObj.id)
          ? updateObj.id
          : (() => {
              throw new Error('id is required');
            })();
        const category = updateObj.category;
        const priority = updateObj.priority;
        const content = updateObj.content;
        const rationale = updateObj.rationale;
        const examples = updateObj.examples;
        const changeReason = updateObj.changeReason;
        const updatedBy = updateObj.updatedBy;

        const input: UpdateGuidelineInput = {};
        if (category !== undefined) input.category = category;
        if (priority !== undefined) input.priority = priority;
        if (content !== undefined) input.content = content;
        if (rationale !== undefined) input.rationale = rationale;
        if (examples !== undefined)
          input.examples = examples;
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
    const idsParam = getRequiredParam(params, 'ids', isArray);
    const agentId = getOptionalParam(params, 'agentId', isString);

    // Validate all IDs are strings
    const ids: string[] = [];
    for (let i = 0; i < idsParam.length; i++) {
      const id = idsParam[i];
      if (!isString(id)) {
        throw createValidationError(
          'ids',
          `element at index ${i} is not a string`,
          'All IDs must be strings'
        );
      }
      ids.push(id);
    }

    if (ids.length === 0) {
      throw new Error('ids array must not be empty');
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
