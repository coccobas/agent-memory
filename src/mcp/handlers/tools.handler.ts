/**
 * Tool registry handlers
 */

import {
  toolRepo,
  type CreateToolInput,
  type UpdateToolInput,
} from '../../db/repositories/tools.js';
import { checkPermission } from '../../services/permission.service.js';
import { transaction } from '../../db/connection.js';
import { checkForDuplicates } from '../../services/duplicate.service.js';
import { logAction } from '../../services/audit.service.js';
import { detectRedFlags } from '../../services/redflag.service.js';
import { invalidateCacheEntry } from '../../services/query.service.js';
import {
  validateEntry,
  validateTextLength,
  validateJsonSize,
  validateArrayLength,
  SIZE_LIMITS,
} from '../../services/validation.service.js';
import { createValidationError, createNotFoundError, createPermissionError } from '../errors.js';
import { createComponentLogger } from '../../utils/logger.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isScopeType,
  isObject,
  isArray,
  isNumber,
  isBoolean,
  isToolCategory,
  isArrayOfObjects,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';

const logger = createComponentLogger('tools');

import type { ToolAddParams, ToolUpdateParams } from '../types.js';

export const toolHandlers = {
  add(params: Record<string, unknown>) {
    const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const name = getRequiredParam(params, 'name', isString);
    const category = getOptionalParam(params, 'category', isToolCategory);
    const description = getOptionalParam(params, 'description', isString);
    const parameters = getOptionalParam(params, 'parameters', isObject);
    const examples = getOptionalParam(params, 'examples', isArrayOfObjects);
    const constraints = getOptionalParam(params, 'constraints', isString);
    const createdBy = getOptionalParam(params, 'createdBy', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

    if (scopeType !== 'global' && !scopeId) {
      throw createValidationError(
        'scopeId',
        `is required for ${scopeType} scope`,
        'Provide the ID of the parent scope'
      );
    }

    // Validate input sizes
    validateTextLength(name, 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
    validateTextLength(description, 'description', SIZE_LIMITS.DESCRIPTION_MAX_LENGTH);
    validateJsonSize(parameters, 'parameters', SIZE_LIMITS.PARAMETERS_MAX_BYTES);
    validateJsonSize(examples, 'examples', SIZE_LIMITS.EXAMPLES_MAX_BYTES);

    // Check permission (write required for add)
    if (agentId && !checkPermission(agentId, 'write', 'tool', null, scopeType, scopeId ?? null)) {
      throw createPermissionError('write', 'tool');
    }

    // Check for duplicates (warn but don't block)
    const duplicateCheck = checkForDuplicates('tool', name, scopeType, scopeId ?? null);
    if (duplicateCheck.isDuplicate) {
      logger.warn(
        {
          toolName: name,
          scopeType,
          scopeId,
          similarEntries: duplicateCheck.similarEntries.map((e) => ({
            name: e.name,
            similarity: e.similarity,
          })),
        },
        'Potential duplicate tool found'
      );
    }

    // Validate entry data
    const validation = validateEntry(
      'tool',
      { name, description, parameters, examples, constraints },
      scopeType,
      scopeId
    );
    if (!validation.valid) {
      throw createValidationError(
        'entry',
        `Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
        'Check the validation errors and correct the input data'
      );
    }

    const input: CreateToolInput = {
      scopeType,
      scopeId,
      name,
      category,
      description,
      parameters: parameters,
      examples: examples,
      constraints,
      createdBy,
    };

    const tool = toolRepo.create(input);

    // Check for red flags
    const redFlags = detectRedFlags({
      type: 'tool',
      content: description || '',
    });
    if (redFlags.length > 0) {
      logger.warn(
        {
          toolName: name,
          toolId: tool.id,
          redFlags: redFlags.map((f) => ({
            pattern: f.pattern,
            severity: f.severity,
            description: f.description,
          })),
        },
        'Red flags detected in tool'
      );
    }

    // Log audit
    logAction({
      agentId,
      action: 'create',
      entryType: 'tool',
      entryId: tool.id,
      scopeType,
      scopeId: scopeId ?? null,
    });

    return formatTimestamps({ success: true, tool, redFlags: redFlags.length > 0 ? redFlags : undefined });
  },

  update(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);
    const description = getOptionalParam(params, 'description', isString);
    const parameters = getOptionalParam(params, 'parameters', isObject);
    const examples = getOptionalParam(params, 'examples', isArrayOfObjects);
    const constraints = getOptionalParam(params, 'constraints', isString);
    const changeReason = getOptionalParam(params, 'changeReason', isString);
    const updatedBy = getOptionalParam(params, 'updatedBy', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

    // Get tool to check scope and permission
    const existingTool = toolRepo.getById(id);
    if (!existingTool) {
      throw createNotFoundError('tool', id);
    }

    // Validate input sizes
    validateTextLength(description, 'description', SIZE_LIMITS.DESCRIPTION_MAX_LENGTH);
    validateJsonSize(parameters, 'parameters', SIZE_LIMITS.PARAMETERS_MAX_BYTES);
    validateJsonSize(examples, 'examples', SIZE_LIMITS.EXAMPLES_MAX_BYTES);

    // Check permission (write required for update)
    if (
      agentId &&
      !checkPermission(
        agentId,
        'write',
        'tool',
        id,
        existingTool.scopeType,
        existingTool.scopeId ?? null
      )
    ) {
      throw createPermissionError('write', 'tool', id);
    }

    const input: UpdateToolInput = {};
    if (description !== undefined) input.description = description;
    if (parameters !== undefined) input.parameters = parameters;
    if (examples !== undefined) input.examples = examples;
    if (constraints !== undefined) input.constraints = constraints;
    if (changeReason !== undefined) input.changeReason = changeReason;
    if (updatedBy !== undefined) input.updatedBy = updatedBy;

    // Validate entry data (include existing name for validation)
    const validation = validateEntry(
      'tool',
      { name: existingTool.name, description, parameters, examples, constraints },
      existingTool.scopeType,
      existingTool.scopeId ?? undefined
    );
    if (!validation.valid) {
      throw createValidationError(
        'entry',
        `Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
        'Check the validation errors and correct the input data'
      );
    }

    const tool = toolRepo.update(id, input);
    if (!tool) {
      throw createNotFoundError('tool', id);
    }

    // Invalidate cache for this entry
    invalidateCacheEntry('tool', id);

    // Log audit
    logAction({
      agentId,
      action: 'update',
      entryType: 'tool',
      entryId: id,
      scopeType: existingTool.scopeType,
      scopeId: existingTool.scopeId ?? null,
    });

    return formatTimestamps({ success: true, tool });
  },

  get(params: Record<string, unknown>) {
    const id = getOptionalParam(params, 'id', isString);
    const name = getOptionalParam(params, 'name', isString);
    const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const inherit = getOptionalParam(params, 'inherit', isBoolean);
    const agentId = getOptionalParam(params, 'agentId', isString);

    if (!id && !name) {
      throw createValidationError(
        'id or name',
        'is required',
        'Provide either the tool ID or name with scopeType'
      );
    }

    let tool;
    if (id) {
      tool = toolRepo.getById(id);
    } else if (name && scopeType) {
      tool = toolRepo.getByName(name, scopeType, scopeId, inherit ?? true);
    } else {
      throw createValidationError(
        'scopeType',
        'is required when using name',
        'Provide scopeType when searching by name'
      );
    }

    if (!tool) {
      throw createNotFoundError('tool', id || name);
    }

    // Check permission (read required for get)
    if (
      agentId &&
      !checkPermission(agentId, 'read', 'tool', tool.id, tool.scopeType, tool.scopeId ?? null)
    ) {
      throw createPermissionError('read', 'tool', tool.id);
    }

    // Log audit
    logAction({
      agentId,
      action: 'read',
      entryType: 'tool',
      entryId: tool.id,
      scopeType: tool.scopeType,
      scopeId: tool.scopeId ?? null,
    });

    return formatTimestamps({ tool });
  },

  list(params: Record<string, unknown>) {
    const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const category = getOptionalParam(params, 'category', isToolCategory);
    const includeInactive = getOptionalParam(params, 'includeInactive', isBoolean);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const tools = toolRepo.list(
      { scopeType, scopeId, category, includeInactive },
      { limit, offset }
    );

    return formatTimestamps({
      tools,
      meta: {
        returnedCount: tools.length,
      },
    });
  },

  history(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);

    const versions = toolRepo.getHistory(id);
    return formatTimestamps({ versions });
  },

  deactivate(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

    // Get tool to check scope and permission
    const existingTool = toolRepo.getById(id);
    if (!existingTool) {
      throw createNotFoundError('tool', id);
    }

    // Check permission (delete/write required for deactivate)
    if (
      agentId &&
      !checkPermission(
        agentId,
        'delete',
        'tool',
        id,
        existingTool.scopeType,
        existingTool.scopeId ?? null
      )
    ) {
      throw createPermissionError('delete', 'tool', id);
    }

    const success = toolRepo.deactivate(id);
    if (!success) {
      throw createNotFoundError('tool', id);
    }

    // Log audit
    logAction({
      agentId,
      action: 'delete',
      entryType: 'tool',
      entryId: id,
      scopeType: existingTool.scopeType,
      scopeId: existingTool.scopeId ?? null,
    });

    return { success: true };
  },

  bulk_add(params: Record<string, unknown>) {
    const entries = getRequiredParam(params, 'entries', isArrayOfObjects);
    const agentId = getOptionalParam(params, 'agentId', isString);

    // Validate bulk operation size
    validateArrayLength(entries, 'entries', SIZE_LIMITS.BULK_OPERATION_MAX);

    if (entries.length === 0) {
      throw createValidationError(
        'entries',
        'must be a non-empty array',
        'Provide an array of tool entries to add'
      );
    }

    // Check permissions for all entries
    if (agentId) {
      for (const entry of entries) {
        if (!isObject(entry)) continue;
        const entryObj = entry as unknown as ToolAddParams;
        if (
          !checkPermission(
            agentId,
            'write',
            'tool',
            null,
            entryObj.scopeType,
            entryObj.scopeId ?? null
          )
        ) {
          throw createPermissionError(
            'write',
            'tool',
            `scope ${String(entry.scopeType)}:${String(entry.scopeId ?? '')}`
          );
        }
      }
    }

    // Execute in transaction for atomicity
    const results = transaction(() => {
      return entries.map((entry) => {
        // Validate entry structure
        if (!isObject(entry)) {
          throw createValidationError(
            'entry',
            'must be an object',
            'Each entry must be a valid object'
          );
        }

        const entryObj = entry as unknown as ToolAddParams;
        const scopeType = isScopeType(entryObj.scopeType)
          ? entryObj.scopeType
          : (() => {
              throw createValidationError(
                'scopeType',
                'is required and must be a valid scope type',
                "Specify 'global', 'org', 'project', or 'session'"
              );
            })();
        const scopeId = entryObj.scopeId;
        const name = isString(entryObj.name)
          ? entryObj.name
          : (() => {
              throw createValidationError(
                'name',
                'is required',
                'Provide a unique name for the tool'
              );
            })();
        const category = entryObj.category;
        const description = entryObj.description;
        const parameters = entryObj.parameters;
        const examples = entryObj.examples;
        const constraints = entryObj.constraints;
        const createdBy = entryObj.createdBy;

        if (!scopeType) {
          throw createValidationError(
            'scopeType',
            'is required',
            "Specify 'global', 'org', 'project', or 'session'"
          );
        }
        if (!name) {
          throw createValidationError('name', 'is required', 'Provide a unique name for the tool');
        }
        if (scopeType !== 'global' && !scopeId) {
          throw createValidationError(
            'scopeId',
            `is required for ${scopeType} scope`,
            'Provide the ID of the parent scope'
          );
        }

        const input: CreateToolInput = {
          scopeType,
          scopeId,
          name,
          category,
          description,
          parameters: parameters,
          examples: examples,
          constraints,
          createdBy,
        };

        return toolRepo.create(input);
      });
    });

    return formatTimestamps({ success: true, tools: results, count: results.length });
  },

  bulk_update(params: Record<string, unknown>) {
    const updates = getRequiredParam(params, 'updates', isArrayOfObjects);
    const agentId = getOptionalParam(params, 'agentId', isString);

    // Validate bulk operation size
    validateArrayLength(updates, 'updates', SIZE_LIMITS.BULK_OPERATION_MAX);

    if (updates.length === 0) {
      throw createValidationError(
        'updates',
        'must be a non-empty array',
        'Provide an array of tool updates'
      );
    }

    // Check permissions for all entries
    if (agentId) {
      for (const update of updates) {
        if (!isObject(update)) continue;
        const updateObj = update as unknown as { id: string } & ToolUpdateParams;
        const existingTool = toolRepo.getById(updateObj.id);
        if (!existingTool) {
          throw createNotFoundError('tool', updateObj.id);
        }
        if (
          !checkPermission(
            agentId,
            'write',
            'tool',
            updateObj.id,
            existingTool.scopeType,
            existingTool.scopeId ?? null
          )
        ) {
          throw createPermissionError('write', 'tool', updateObj.id);
        }
      }
    }

    // Execute in transaction
    const results = transaction(() => {
      return updates.map((update) => {
        // Validate update structure
        if (!isObject(update)) {
          throw createValidationError(
            'update',
            'must be an object',
            'Each update must be a valid object'
          );
        }

        const updateObj = update as unknown as { id: string } & ToolUpdateParams;
        const id = isString(updateObj.id)
          ? updateObj.id
          : (() => {
              throw createValidationError('id', 'is required', 'Provide the tool ID to update');
            })();
        const description = updateObj.description;
        const parameters = updateObj.parameters;
        const examples = updateObj.examples;
        const constraints = updateObj.constraints;
        const changeReason = updateObj.changeReason;
        const updatedBy = updateObj.updatedBy;

        const input: UpdateToolInput = {};
        if (description !== undefined) input.description = description;
        if (parameters !== undefined) input.parameters = parameters;
        if (examples !== undefined) input.examples = examples;
        if (constraints !== undefined) input.constraints = constraints;
        if (changeReason !== undefined) input.changeReason = changeReason;
        if (updatedBy !== undefined) input.updatedBy = updatedBy;

        const tool = toolRepo.update(id, input);
        if (!tool) {
          throw createNotFoundError('tool', id);
        }

        return tool;
      });
    });

    return formatTimestamps({ success: true, tools: results, count: results.length });
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
      throw createValidationError(
        'ids',
        'must be a non-empty array',
        'Provide an array of tool IDs to delete'
      );
    }

    // Check permissions for all entries
    if (agentId) {
      for (const id of ids) {
        const existingTool = toolRepo.getById(id);
        if (!existingTool) {
          throw createNotFoundError('tool', id);
        }
        if (
          !checkPermission(
            agentId,
            'delete',
            'tool',
            id,
            existingTool.scopeType,
            existingTool.scopeId ?? null
          )
        ) {
          throw createPermissionError('delete', 'tool', id);
        }
      }
    }

    // Execute in transaction
    const results = transaction(() => {
      return ids.map((id) => {
        const success = toolRepo.deactivate(id);
        if (!success) {
          throw createNotFoundError('tool', id);
        }
        return { id, success: true };
      });
    });

    return formatTimestamps({ success: true, deleted: results, count: results.length });
  },
};
