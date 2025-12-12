/**
 * Knowledge handlers
 */

import {
  knowledgeRepo,
  type CreateKnowledgeInput,
  type UpdateKnowledgeInput,
} from '../../db/repositories/knowledge.js';
import { checkPermission } from '../../services/permission.service.js';
import { transaction } from '../../db/connection.js';
import { checkForDuplicates } from '../../services/duplicate.service.js';
import { logAction } from '../../services/audit.service.js';
import { detectRedFlags } from '../../services/redflag.service.js';
import { invalidateCacheEntry } from '../../services/query.service.js';
import { validateEntry } from '../../services/validation.service.js';
import { createValidationError, createNotFoundError, createPermissionError } from '../errors.js';
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
  isISODateString,
  isObject,
} from '../../utils/type-guards.js';

const logger = createComponentLogger('knowledge');

import type {
  KnowledgeAddParams,
  KnowledgeUpdateParams,
} from '../types.js';

export const knowledgeHandlers = {
  add(params: Record<string, unknown>) {
    const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const title = getRequiredParam(params, 'title', isString);
    // Category can be any string (SQLite doesn't strictly enforce enum)
    const category = getOptionalParam(params, 'category', isString) as
      | 'decision'
      | 'fact'
      | 'context'
      | 'reference'
      | undefined;
    const content = getRequiredParam(params, 'content', isString);
    const source = getOptionalParam(params, 'source', isString);
    const confidence = getOptionalParam(params, 'confidence', isNumber);
    const validUntil = getOptionalParam(params, 'validUntil', isISODateString);
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
      !checkPermission(agentId, 'write', 'knowledge', null, scopeType, scopeId ?? null)
    ) {
      throw createPermissionError('write', 'knowledge');
    }

    // Check for duplicates (warn but don't block)
    const duplicateCheck = checkForDuplicates('knowledge', title, scopeType, scopeId ?? null);
    if (duplicateCheck.isDuplicate) {
      logger.warn(
        {
          title,
          scopeType,
          scopeId,
          similarEntries: duplicateCheck.similarEntries.map((e) => ({
            name: e.name,
            similarity: e.similarity,
          })),
        },
        'Potential duplicate knowledge entry found'
      );
    }

    // Validate entry data
    const validation = validateEntry(
      'knowledge',
      { title, content, source, confidence, validUntil, category },
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

    const input: CreateKnowledgeInput = {
      scopeType,
      scopeId,
      title,
      category,
      content,
      source,
      confidence,
      validUntil,
      createdBy,
    };

    const knowledge = knowledgeRepo.create(input);

    // Check for red flags
    const redFlags = detectRedFlags({
      type: 'knowledge',
      content: content || '',
    });
    if (redFlags.length > 0) {
      logger.warn(
        {
          title,
          knowledgeId: knowledge.id,
          redFlags: redFlags.map((f) => ({
            pattern: f.pattern,
            severity: f.severity,
            description: f.description,
          })),
        },
        'Red flags detected in knowledge entry'
      );
    }

    // Log audit
    logAction({
      agentId,
      action: 'create',
      entryType: 'knowledge',
      entryId: knowledge.id,
      scopeType,
      scopeId: scopeId ?? null,
    });

    return { success: true, knowledge, redFlags: redFlags.length > 0 ? redFlags : undefined };
  },

  update(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);
    // Category can be any string (SQLite doesn't strictly enforce enum)
    const category = getOptionalParam(params, 'category', isString) as
      | 'decision'
      | 'fact'
      | 'context'
      | 'reference'
      | undefined;
    const content = getOptionalParam(params, 'content', isString);
    const source = getOptionalParam(params, 'source', isString);
    const confidence = getOptionalParam(params, 'confidence', isNumber);
    const validUntil = getOptionalParam(params, 'validUntil', isISODateString);
    const changeReason = getOptionalParam(params, 'changeReason', isString);
    const updatedBy = getOptionalParam(params, 'updatedBy', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

    // Get knowledge to check scope and permission
    const existingKnowledge = knowledgeRepo.getById(id);
    if (!existingKnowledge) {
      throw createNotFoundError('knowledge', id);
    }

    // Check permission (write required for update)
    if (
      agentId &&
      !checkPermission(
        agentId,
        'write',
        'knowledge',
        id,
        existingKnowledge.scopeType,
        existingKnowledge.scopeId ?? null
      )
    ) {
      throw createPermissionError('write', 'knowledge', id);
    }

    const input: UpdateKnowledgeInput = {};
    if (category !== undefined) input.category = category;
    if (content !== undefined) input.content = content;
    if (source !== undefined) input.source = source;
    if (confidence !== undefined) input.confidence = confidence;
    if (validUntil !== undefined) input.validUntil = validUntil;
    if (changeReason !== undefined) input.changeReason = changeReason;
    if (updatedBy !== undefined) input.updatedBy = updatedBy;

    // Validate entry data (include existing title for validation)
    const validation = validateEntry(
      'knowledge',
      { title: existingKnowledge.title, content, source, confidence, validUntil, category },
      existingKnowledge.scopeType,
      existingKnowledge.scopeId ?? undefined
    );
    if (!validation.valid) {
      throw createValidationError(
        'entry',
        `Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
        'Check the validation errors and correct the input data'
      );
    }

    const knowledge = knowledgeRepo.update(id, input);
    if (!knowledge) {
      throw createNotFoundError('knowledge', id);
    }

    // Invalidate cache for this entry
    invalidateCacheEntry('knowledge', id);

    // Log audit
    logAction({
      agentId,
      action: 'update',
      entryType: 'knowledge',
      entryId: id,
      scopeType: existingKnowledge.scopeType,
      scopeId: existingKnowledge.scopeId ?? null,
    });

    return { success: true, knowledge };
  },

  get(params: Record<string, unknown>) {
    const id = getOptionalParam(params, 'id', isString);
    const title = getOptionalParam(params, 'title', isString);
    const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const inherit = getOptionalParam(params, 'inherit', isBoolean);
    const agentId = getOptionalParam(params, 'agentId', isString);

    if (!id && !title) {
      throw createValidationError(
        'id or title',
        'is required',
        'Provide either the knowledge entry ID or title with scopeType'
      );
    }

    let knowledge;
    if (id) {
      knowledge = knowledgeRepo.getById(id);
    } else if (title && scopeType) {
      knowledge = knowledgeRepo.getByTitle(title, scopeType, scopeId, inherit ?? true);
    } else {
      throw createValidationError(
        'scopeType',
        'is required when using title',
        'Provide scopeType when searching by title'
      );
    }

    if (!knowledge) {
      throw createNotFoundError('knowledge', id || title);
    }

    // Check permission (read required for get)
    if (
      agentId &&
      !checkPermission(
        agentId,
        'read',
        'knowledge',
        knowledge.id,
        knowledge.scopeType,
        knowledge.scopeId ?? null
      )
    ) {
      throw createPermissionError('read', 'knowledge', knowledge.id);
    }

    // Log audit
    logAction({
      agentId,
      action: 'read',
      entryType: 'knowledge',
      entryId: knowledge.id,
      scopeType: knowledge.scopeType,
      scopeId: knowledge.scopeId ?? null,
    });

    return { knowledge };
  },

  list(params: Record<string, unknown>) {
    const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    // Category can be any string (SQLite doesn't strictly enforce enum)
    const category = getOptionalParam(params, 'category', isString) as
      | 'decision'
      | 'fact'
      | 'context'
      | 'reference'
      | undefined;
    const includeInactive = getOptionalParam(params, 'includeInactive', isBoolean);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const entries = knowledgeRepo.list(
      { scopeType, scopeId, category, includeInactive },
      { limit, offset }
    );

    return {
      knowledge: entries,
      meta: {
        returnedCount: entries.length,
      },
    };
  },

  history(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);

    const versions = knowledgeRepo.getHistory(id);
    return { versions };
  },

  deactivate(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

    // Get knowledge to check scope and permission
    const existingKnowledge = knowledgeRepo.getById(id);
    if (!existingKnowledge) {
      throw createNotFoundError('knowledge', id);
    }

    // Check permission (delete/write required for deactivate)
    if (
      agentId &&
      !checkPermission(
        agentId,
        'delete',
        'knowledge',
        id,
        existingKnowledge.scopeType,
        existingKnowledge.scopeId ?? null
      )
    ) {
      throw createPermissionError('delete', 'knowledge', id);
    }

    const success = knowledgeRepo.deactivate(id);
    if (!success) {
      throw createNotFoundError('knowledge', id);
    }

    // Log audit
    logAction({
      agentId,
      action: 'delete',
      entryType: 'knowledge',
      entryId: id,
      scopeType: existingKnowledge.scopeType,
      scopeId: existingKnowledge.scopeId ?? null,
    });

    return { success: true };
  },

  bulk_add(params: Record<string, unknown>) {
    const entries = getRequiredParam(params, 'entries', isArrayOfObjects);
    const agentId = getOptionalParam(params, 'agentId', isString);

    if (entries.length === 0) {
      throw createValidationError(
        'entries',
        'must be a non-empty array',
        'Provide an array of knowledge entries to add'
      );
    }

    // Check permissions for all entries
    if (agentId) {
      for (const entry of entries) {
        if (!isObject(entry)) continue;
        const entryObj = entry as unknown as KnowledgeAddParams;
        if (
          !checkPermission(
            agentId,
            'write',
            'knowledge',
            null,
            entryObj.scopeType,
            entryObj.scopeId ?? null
          )
        ) {
          throw createPermissionError(
            'write',
            'knowledge',
            `scope ${entry.scopeType}:${entry.scopeId ?? ''}`
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

        const entryObj = entry as unknown as KnowledgeAddParams;
        const scopeType = isScopeType(entryObj.scopeType)
          ? entryObj.scopeType
          : (() => {
              throw createValidationError(
                'scopeType',
                'is required',
                "Specify 'global', 'org', 'project', or 'session'"
              );
            })();
        const scopeId = entryObj.scopeId;
        const title = isString(entryObj.title)
          ? entryObj.title
          : (() => {
              throw createValidationError(
                'title',
                'is required',
                'Provide a unique title for the knowledge entry'
              );
            })();
        const category = entryObj.category;
        const content = isString(entryObj.content)
          ? entryObj.content
          : (() => {
              throw createValidationError('content', 'is required', 'Provide the knowledge content');
            })();
        const source = entryObj.source;
        const confidence = entryObj.confidence;
        const validUntil = entryObj.validUntil;
        const createdBy = entryObj.createdBy;

        if (scopeType !== 'global' && !scopeId) {
          throw createValidationError(
            'scopeId',
            `is required for ${scopeType} scope`,
            'Provide the ID of the parent scope'
          );
        }

        const input: CreateKnowledgeInput = {
          scopeType,
          scopeId,
          title,
          category,
          content,
          source,
          confidence,
          validUntil,
          createdBy,
        };

        return knowledgeRepo.create(input);
      });
    });

    return { success: true, knowledge: results, count: results.length };
  },

  bulk_update(params: Record<string, unknown>) {
    const updates = getRequiredParam(params, 'updates', isArrayOfObjects);
    const agentId = getOptionalParam(params, 'agentId', isString);

    if (updates.length === 0) {
      throw createValidationError(
        'updates',
        'must be a non-empty array',
        'Provide an array of knowledge updates'
      );
    }

    // Check permissions for all entries
    if (agentId) {
      for (const update of updates) {
        if (!isObject(update)) continue;
        const updateObj = update as unknown as { id: string } & KnowledgeUpdateParams;
        const existingKnowledge = knowledgeRepo.getById(updateObj.id);
        if (!existingKnowledge) {
          throw createNotFoundError('knowledge', updateObj.id);
        }
        if (
          !checkPermission(
            agentId,
            'write',
            'knowledge',
            updateObj.id,
            existingKnowledge.scopeType,
            existingKnowledge.scopeId ?? null
          )
        ) {
          throw createPermissionError('write', 'knowledge', updateObj.id);
        }
      }
    }

    // Execute in transaction
    const results = transaction(() => {
      return updates.map((update: Record<string, unknown>) => {
        // Validate update structure
        if (!isObject(update)) {
          throw createValidationError('update', 'must be an object', 'Each update must be a valid object');
        }

        const updateObj = update as unknown as { id: string } & KnowledgeUpdateParams;
        const id = isString(updateObj.id)
          ? updateObj.id
          : (() => {
              throw createValidationError(
                'id',
                'is required',
                'Provide the knowledge entry ID to update'
              );
            })();
        const category = updateObj.category;
        const content = updateObj.content;
        const source = updateObj.source;
        const confidence = updateObj.confidence;
        const validUntil = updateObj.validUntil;
        const changeReason = updateObj.changeReason;
        const updatedBy = updateObj.updatedBy;

        const input: UpdateKnowledgeInput = {};
        if (category !== undefined) input.category = category;
        if (content !== undefined) input.content = content;
        if (source !== undefined) input.source = source;
        if (confidence !== undefined) input.confidence = confidence;
        if (validUntil !== undefined) input.validUntil = validUntil;
        if (changeReason !== undefined) input.changeReason = changeReason;
        if (updatedBy !== undefined) input.updatedBy = updatedBy;

        const knowledge = knowledgeRepo.update(id, input);
        if (!knowledge) {
          throw createNotFoundError('knowledge', id);
        }

        // Invalidate cache for this entry
        invalidateCacheEntry('knowledge', id);

        return knowledge;
      });
    });

    return { success: true, knowledge: results, count: results.length };
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
        'Provide an array of knowledge entry IDs to delete'
      );
    }

    // Check permissions for all entries
    if (agentId) {
      for (const id of ids) {
        const existingKnowledge = knowledgeRepo.getById(id);
        if (!existingKnowledge) {
          throw createNotFoundError('knowledge', id);
        }
        if (
          !checkPermission(
            agentId,
            'delete',
            'knowledge',
            id,
            existingKnowledge.scopeType,
            existingKnowledge.scopeId ?? null
          )
        ) {
          throw createPermissionError('delete', 'knowledge', id);
        }
      }
    }

    // Execute in transaction
    const results = transaction(() => {
      return ids.map((id) => {
        const success = knowledgeRepo.deactivate(id);
        if (!success) {
          throw createNotFoundError('knowledge', id);
        }
        return { id, success: true };
      });
    });

    return { success: true, deleted: results, count: results.length };
  },
};
