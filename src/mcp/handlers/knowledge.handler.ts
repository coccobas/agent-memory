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

const logger = createComponentLogger('knowledge');

import type {
  KnowledgeAddParams,
  KnowledgeUpdateParams,
  KnowledgeGetParams,
  KnowledgeListParams,
  KnowledgeHistoryParams,
  KnowledgeDeactivateParams,
} from '../types.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export const knowledgeHandlers = {
  add(params: Record<string, unknown>) {
    const {
      scopeType,
      scopeId,
      title,
      category,
      content,
      source,
      confidence,
      validUntil,
      createdBy,
      agentId,
    } = cast<KnowledgeAddParams & { agentId?: string }>(params);

    if (!scopeType) {
      throw createValidationError(
        'scopeType',
        'is required',
        "Specify 'global', 'org', 'project', or 'session'"
      );
    }
    if (!title) {
      throw createValidationError(
        'title',
        'is required',
        'Provide a unique title for the knowledge entry'
      );
    }
    if (!content) {
      throw createValidationError('content', 'is required', 'Provide the knowledge content');
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
    const {
      id,
      category,
      content,
      source,
      confidence,
      validUntil,
      changeReason,
      updatedBy,
      agentId,
    } = cast<KnowledgeUpdateParams & { agentId?: string }>(params);

    if (!id) {
      throw createValidationError('id', 'is required', 'Provide the knowledge entry ID to update');
    }

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
    const { id, title, scopeType, scopeId, inherit, agentId } = cast<
      KnowledgeGetParams & { agentId?: string }
    >(params);

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
    const { scopeType, scopeId, category, includeInactive, limit, offset } =
      cast<KnowledgeListParams>(params);

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
    const { id } = cast<KnowledgeHistoryParams>(params);

    if (!id) {
      throw createValidationError(
        'id',
        'is required',
        'Provide the knowledge entry ID to get history'
      );
    }

    const versions = knowledgeRepo.getHistory(id);
    return { versions };
  },

  deactivate(params: Record<string, unknown>) {
    const { id, agentId } = cast<KnowledgeDeactivateParams & { agentId?: string }>(params);

    if (!id) {
      throw createValidationError(
        'id',
        'is required',
        'Provide the knowledge entry ID to deactivate'
      );
    }

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
    const { entries, agentId } = cast<{ entries: KnowledgeAddParams[]; agentId?: string }>(params);

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      throw createValidationError(
        'entries',
        'is required and must be a non-empty array',
        'Provide an array of knowledge entries to add'
      );
    }

    // Check permissions for all entries
    if (agentId) {
      for (const entry of entries) {
        if (
          !checkPermission(
            agentId,
            'write',
            'knowledge',
            null,
            entry.scopeType,
            entry.scopeId ?? null
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
        const {
          scopeType,
          scopeId,
          title,
          category,
          content,
          source,
          confidence,
          validUntil,
          createdBy,
        } = entry;

        if (!scopeType) {
          throw createValidationError(
            'scopeType',
            'is required',
            "Specify 'global', 'org', 'project', or 'session'"
          );
        }
        if (!title) {
          throw createValidationError(
            'title',
            'is required',
            'Provide a unique title for the knowledge entry'
          );
        }
        if (!content) {
          throw createValidationError('content', 'is required', 'Provide the knowledge content');
        }
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
    const { updates, agentId } = cast<{
      updates: Array<{ id: string } & KnowledgeUpdateParams>;
      agentId?: string;
    }>(params);

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      throw createValidationError(
        'updates',
        'is required and must be a non-empty array',
        'Provide an array of knowledge updates'
      );
    }

    // Check permissions for all entries
    if (agentId) {
      for (const update of updates) {
        const existingKnowledge = knowledgeRepo.getById(update.id);
        if (!existingKnowledge) {
          throw createNotFoundError('knowledge', update.id);
        }
        if (
          !checkPermission(
            agentId,
            'write',
            'knowledge',
            update.id,
            existingKnowledge.scopeType,
            existingKnowledge.scopeId ?? null
          )
        ) {
          throw createPermissionError('write', 'knowledge', update.id);
        }
      }
    }

    // Execute in transaction
    const results = transaction(() => {
      return updates.map((update) => {
        const { id, category, content, source, confidence, validUntil, changeReason, updatedBy } =
          update;

        if (!id) {
          throw createValidationError(
            'id',
            'is required',
            'Provide the knowledge entry ID to update'
          );
        }

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
    const { ids, agentId } = cast<{ ids: string[]; agentId?: string }>(params);

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw createValidationError(
        'ids',
        'is required and must be a non-empty array',
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
