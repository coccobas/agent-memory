/**
 * Graph Node handlers
 *
 * MCP handlers for graph_node tool operations.
 */

import type { AppContext } from '../../core/context.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isScopeType,
  isBoolean,
} from '../../utils/type-guards.js';
import {
  createValidationError,
  createNotFoundError,
  createPermissionError,
} from '../../core/errors.js';
import { logAction } from '../../services/audit.service.js';
import type { ScopeType } from '../../db/schema.js';

// Type guard for objects
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check permission for graph operations
 * Graph operations use 'knowledge' entry type as they are knowledge-graph related
 */
function requireGraphPermission(
  context: AppContext,
  agentId: string | undefined,
  permission: 'read' | 'write' | 'delete',
  scopeType: ScopeType = 'global',
  scopeId: string | null = null
): void {
  const hasPermission = context.services.permission.check(
    agentId,
    permission,
    'knowledge', // Graph operations are knowledge-related
    null,
    scopeType,
    scopeId
  );

  if (!hasPermission) {
    throw createPermissionError(permission, 'graph_node');
  }
}

/**
 * Ensure graph repositories are available in context
 */
function ensureGraphRepos(context: AppContext) {
  if (!context.repos.graphNodes || !context.repos.graphEdges || !context.repos.typeRegistry) {
    throw createValidationError(
      'repositories',
      'Graph repositories not initialized. Run database migration first.'
    );
  }
  return {
    nodeRepo: context.repos.graphNodes,
    edgeRepo: context.repos.graphEdges,
    typeRegistry: context.repos.typeRegistry,
  };
}

export const graphNodeHandlers = {
  /**
   * Create a new graph node
   */
  async add(context: AppContext, params: Record<string, unknown>) {
    const { nodeRepo } = ensureGraphRepos(context);

    const agentId = getRequiredParam(params, 'agentId', isString);
    const nodeTypeName = getRequiredParam(params, 'nodeTypeName', isString);
    const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const name = getRequiredParam(params, 'name', isString);
    const properties = getOptionalParam(params, 'properties', isObject);
    const validFrom = getOptionalParam(params, 'validFrom', isString);
    const validUntil = getOptionalParam(params, 'validUntil', isString);
    const createdBy = getOptionalParam(params, 'createdBy', isString);

    // Validate non-global scopes require scopeId
    if (scopeType !== 'global' && !scopeId) {
      throw createValidationError('scopeId', `scopeId is required for scope type '${scopeType}'`);
    }

    // Check permission
    requireGraphPermission(context, agentId, 'write', scopeType, scopeId ?? null);

    const node = await nodeRepo.create({
      nodeTypeName,
      scopeType,
      scopeId,
      name,
      properties,
      validFrom,
      validUntil,
      createdBy,
    });

    // Log audit
    logAction(
      {
        agentId,
        action: 'create',
        entryType: 'graph_node' as const,
        entryId: node.id,
        scopeType,
        scopeId: scopeId ?? null,
      },
      context.db
    );

    return { success: true, node };
  },

  /**
   * Get a node by ID
   */
  async get(context: AppContext, params: Record<string, unknown>) {
    const { nodeRepo } = ensureGraphRepos(context);

    const agentId = getOptionalParam(params, 'agentId', isString);
    const id = getRequiredParam(params, 'id', isString);

    const node = await nodeRepo.getById(id);
    if (!node) {
      throw createNotFoundError('node', id);
    }

    // Check permission based on node's scope
    requireGraphPermission(context, agentId, 'read', node.scopeType, node.scopeId);

    // Update access metrics
    await nodeRepo.updateAccessMetrics(id);

    return { node };
  },

  /**
   * List nodes with filtering
   */
  async list(context: AppContext, params: Record<string, unknown>) {
    const { nodeRepo } = ensureGraphRepos(context);

    const agentId = getOptionalParam(params, 'agentId', isString);
    const nodeTypeName = getOptionalParam(params, 'nodeTypeName', isString);
    const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const isActive = getOptionalParam(params, 'isActive', isBoolean);
    const limit = getOptionalParam(params, 'limit', isNumber) ?? 20;
    const offset = getOptionalParam(params, 'offset', isNumber) ?? 0;

    // Check permission based on requested scope
    requireGraphPermission(context, agentId, 'read', scopeType ?? 'global', scopeId ?? null);

    const nodes = await nodeRepo.list(
      { nodeTypeName, scopeType, scopeId, isActive },
      { limit, offset }
    );

    return {
      nodes,
      meta: {
        returnedCount: nodes.length,
        limit,
        offset,
      },
    };
  },

  /**
   * Update a node
   */
  async update(context: AppContext, params: Record<string, unknown>) {
    const { nodeRepo } = ensureGraphRepos(context);

    const agentId = getRequiredParam(params, 'agentId', isString);
    const id = getRequiredParam(params, 'id', isString);
    const name = getOptionalParam(params, 'name', isString);
    const properties = getOptionalParam(params, 'properties', isObject);
    const validFrom = getOptionalParam(params, 'validFrom', isString);
    const validUntil = getOptionalParam(params, 'validUntil', isString);
    const changeReason = getOptionalParam(params, 'changeReason', isString);
    const updatedBy = getOptionalParam(params, 'updatedBy', isString);

    // Get existing node to check scope
    const existingNode = await nodeRepo.getById(id);
    if (!existingNode) {
      throw createNotFoundError('node', id);
    }

    // Check permission based on node's scope
    requireGraphPermission(context, agentId, 'write', existingNode.scopeType, existingNode.scopeId);

    const node = await nodeRepo.update(id, {
      name,
      properties,
      validFrom,
      validUntil,
      changeReason,
      updatedBy,
    });

    if (!node) {
      throw createNotFoundError('node', id);
    }

    // Log audit
    logAction(
      {
        agentId,
        action: 'update',
        entryType: 'graph_node' as const,
        entryId: id,
        scopeType: existingNode.scopeType,
        scopeId: existingNode.scopeId,
      },
      context.db
    );

    return { success: true, node };
  },

  /**
   * Get node version history
   */
  async history(context: AppContext, params: Record<string, unknown>) {
    const { nodeRepo } = ensureGraphRepos(context);

    const agentId = getOptionalParam(params, 'agentId', isString);
    const id = getRequiredParam(params, 'id', isString);

    // Verify node exists
    const node = await nodeRepo.getById(id);
    if (!node) {
      throw createNotFoundError('node', id);
    }

    // Check permission based on node's scope
    requireGraphPermission(context, agentId, 'read', node.scopeType, node.scopeId);

    const versions = await nodeRepo.getHistory(id);

    return { versions };
  },

  /**
   * Deactivate a node (soft delete)
   */
  async deactivate(context: AppContext, params: Record<string, unknown>) {
    const { nodeRepo } = ensureGraphRepos(context);

    const agentId = getRequiredParam(params, 'agentId', isString);
    const id = getRequiredParam(params, 'id', isString);

    // Get existing node to check scope
    const existingNode = await nodeRepo.getById(id);
    if (!existingNode) {
      throw createNotFoundError('node', id);
    }

    // Check permission based on node's scope
    requireGraphPermission(context, agentId, 'write', existingNode.scopeType, existingNode.scopeId);

    const success = await nodeRepo.deactivate(id);
    if (!success) {
      throw createNotFoundError('node', id);
    }

    // Log audit
    logAction(
      {
        agentId,
        action: 'delete',
        entryType: 'graph_node' as const,
        entryId: id,
        scopeType: existingNode.scopeType,
        scopeId: existingNode.scopeId,
      },
      context.db
    );

    return { success };
  },

  /**
   * Reactivate a deactivated node
   */
  async reactivate(context: AppContext, params: Record<string, unknown>) {
    const { nodeRepo } = ensureGraphRepos(context);

    const agentId = getRequiredParam(params, 'agentId', isString);
    const id = getRequiredParam(params, 'id', isString);

    // Get existing node to check scope (inactive nodes should still be retrievable)
    const existingNode = await nodeRepo.getById(id);
    if (!existingNode) {
      throw createNotFoundError('node', id);
    }

    // Check permission based on node's scope
    requireGraphPermission(context, agentId, 'write', existingNode.scopeType, existingNode.scopeId);

    const success = await nodeRepo.reactivate(id);
    if (!success) {
      throw createNotFoundError('node', id);
    }

    // Log audit
    logAction(
      {
        agentId,
        action: 'update',
        entryType: 'graph_node' as const,
        entryId: id,
        scopeType: existingNode.scopeType,
        scopeId: existingNode.scopeId,
      },
      context.db
    );

    return { success };
  },

  /**
   * Permanently delete a node
   */
  async delete(context: AppContext, params: Record<string, unknown>) {
    const { nodeRepo } = ensureGraphRepos(context);

    const agentId = getRequiredParam(params, 'agentId', isString);
    const id = getRequiredParam(params, 'id', isString);

    // Get existing node to check scope
    const existingNode = await nodeRepo.getById(id);
    if (!existingNode) {
      throw createNotFoundError('node', id);
    }

    // Check permission based on node's scope
    requireGraphPermission(context, agentId, 'write', existingNode.scopeType, existingNode.scopeId);

    const success = await nodeRepo.delete(id);
    if (!success) {
      throw createNotFoundError('node', id);
    }

    // Log audit
    logAction(
      {
        agentId,
        action: 'delete',
        entryType: 'graph_node' as const,
        entryId: id,
        scopeType: existingNode.scopeType,
        scopeId: existingNode.scopeId,
      },
      context.db
    );

    return { success };
  },
};
