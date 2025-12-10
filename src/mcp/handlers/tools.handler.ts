/**
 * Tool registry handlers
 */

import {
  toolRepo,
  type CreateToolInput,
  type UpdateToolInput,
} from '../../db/repositories/tools.js';

import type {
  ToolAddParams,
  ToolUpdateParams,
  ToolGetParams,
  ToolListParams,
  ToolHistoryParams,
  ToolDeactivateParams,
} from '../types.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export const toolHandlers = {
  add(params: Record<string, unknown>) {
    const {
      scopeType,
      scopeId,
      name,
      category,
      description,
      parameters,
      examples,
      constraints,
      createdBy,
    } = cast<ToolAddParams>(params);

    if (!scopeType) {
      throw new Error('scopeType is required');
    }
    if (!name) {
      throw new Error('name is required');
    }
    if (scopeType !== 'global' && !scopeId) {
      throw new Error('scopeId is required for non-global scope');
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
    return { success: true, tool };
  },

  update(params: Record<string, unknown>) {
    const { id, description, parameters, examples, constraints, changeReason, updatedBy } =
      cast<ToolUpdateParams>(params);

    if (!id) {
      throw new Error('id is required');
    }

    const input: UpdateToolInput = {};
    if (description !== undefined) input.description = description;
    if (parameters !== undefined) input.parameters = parameters;
    if (examples !== undefined) input.examples = examples;
    if (constraints !== undefined) input.constraints = constraints;
    if (changeReason !== undefined) input.changeReason = changeReason;
    if (updatedBy !== undefined) input.updatedBy = updatedBy;

    const tool = toolRepo.update(id, input);
    if (!tool) {
      throw new Error('Tool not found');
    }

    return { success: true, tool };
  },

  get(params: Record<string, unknown>) {
    const { id, name, scopeType, scopeId, inherit } = cast<ToolGetParams>(params);

    if (!id && !name) {
      throw new Error('Either id or name is required');
    }

    let tool;
    if (id) {
      tool = toolRepo.getById(id);
    } else if (name && scopeType) {
      tool = toolRepo.getByName(name, scopeType, scopeId, inherit ?? true);
    } else {
      throw new Error('When using name, scopeType is required');
    }

    if (!tool) {
      throw new Error('Tool not found');
    }

    return { tool };
  },

  list(params: Record<string, unknown>) {
    const { scopeType, scopeId, category, includeInactive, limit, offset } =
      cast<ToolListParams>(params);

    const tools = toolRepo.list(
      { scopeType, scopeId, category, includeInactive },
      { limit, offset }
    );

    return {
      tools,
      meta: {
        returnedCount: tools.length,
      },
    };
  },

  history(params: Record<string, unknown>) {
    const { id } = cast<ToolHistoryParams>(params);

    if (!id) {
      throw new Error('id is required');
    }

    const versions = toolRepo.getHistory(id);
    return { versions };
  },

  deactivate(params: Record<string, unknown>) {
    const { id } = cast<ToolDeactivateParams>(params);

    if (!id) {
      throw new Error('id is required');
    }

    const success = toolRepo.deactivate(id);
    if (!success) {
      throw new Error('Tool not found');
    }

    return { success: true };
  },
};
