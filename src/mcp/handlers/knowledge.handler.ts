/**
 * Knowledge handlers
 */

import {
  knowledgeRepo,
  type CreateKnowledgeInput,
  type UpdateKnowledgeInput,
} from '../../db/repositories/knowledge.js';

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
    } = cast<KnowledgeAddParams>(params);

    if (!scopeType) {
      throw new Error('scopeType is required');
    }
    if (!title) {
      throw new Error('title is required');
    }
    if (!content) {
      throw new Error('content is required');
    }
    if (scopeType !== 'global' && !scopeId) {
      throw new Error('scopeId is required for non-global scope');
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
    return { success: true, knowledge };
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
    } = cast<KnowledgeUpdateParams>(params);

    if (!id) {
      throw new Error('id is required');
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
      throw new Error('Knowledge entry not found');
    }

    return { success: true, knowledge };
  },

  get(params: Record<string, unknown>) {
    const { id, title, scopeType, scopeId, inherit } = cast<KnowledgeGetParams>(params);

    if (!id && !title) {
      throw new Error('Either id or title is required');
    }

    let knowledge;
    if (id) {
      knowledge = knowledgeRepo.getById(id);
    } else if (title && scopeType) {
      knowledge = knowledgeRepo.getByTitle(title, scopeType, scopeId, inherit ?? true);
    } else {
      throw new Error('When using title, scopeType is required');
    }

    if (!knowledge) {
      throw new Error('Knowledge entry not found');
    }

    return { knowledge };
  },

  list(params: Record<string, unknown>) {
    const { scopeType, scopeId, category, includeInactive, limit, offset } = cast<KnowledgeListParams>(params);

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
      throw new Error('id is required');
    }

    const versions = knowledgeRepo.getHistory(id);
    return { versions };
  },

  deactivate(params: Record<string, unknown>) {
    const { id } = cast<KnowledgeDeactivateParams>(params);

    if (!id) {
      throw new Error('id is required');
    }

    const success = knowledgeRepo.deactivate(id);
    if (!success) {
      throw new Error('Knowledge entry not found');
    }

    return { success: true };
  },
};
