/**
 * Graph Edge handlers
 *
 * MCP handlers for graph_edge tool operations.
 */

import type { AppContext } from '../../core/context.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
} from '../../utils/type-guards.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';
import type { GraphTraversalOptions } from '../../db/schema/types.js';

// Type guard for objects
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Type guard for string arrays
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// Type guard for edge direction
function isEdgeDirection(value: unknown): value is 'out' | 'in' | 'both' {
  return value === 'out' || value === 'in' || value === 'both';
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

export const graphEdgeHandlers = {
  /**
   * Create a new graph edge
   */
  async add(context: AppContext, params: Record<string, unknown>) {
    const { edgeRepo } = ensureGraphRepos(context);

    const edgeTypeName = getRequiredParam(params, 'edgeTypeName', isString);
    const sourceId = getRequiredParam(params, 'sourceId', isString);
    const targetId = getRequiredParam(params, 'targetId', isString);
    const properties = getOptionalParam(params, 'properties', isObject);
    const weight = getOptionalParam(params, 'weight', isNumber);
    const createdBy = getOptionalParam(params, 'createdBy', isString);

    const edge = await edgeRepo.create({
      edgeTypeName,
      sourceId,
      targetId,
      properties,
      weight,
      createdBy,
    });

    return { success: true, edge };
  },

  /**
   * Get an edge by ID
   */
  async get(context: AppContext, params: Record<string, unknown>) {
    const { edgeRepo } = ensureGraphRepos(context);

    const id = getRequiredParam(params, 'id', isString);

    const edge = await edgeRepo.getById(id);
    if (!edge) {
      throw createNotFoundError('edge', id);
    }

    return { edge };
  },

  /**
   * List edges with filtering
   */
  async list(context: AppContext, params: Record<string, unknown>) {
    const { edgeRepo } = ensureGraphRepos(context);

    const edgeTypeName = getOptionalParam(params, 'edgeTypeName', isString);
    const sourceId = getOptionalParam(params, 'sourceId', isString);
    const targetId = getOptionalParam(params, 'targetId', isString);
    const limit = getOptionalParam(params, 'limit', isNumber) ?? 20;
    const offset = getOptionalParam(params, 'offset', isNumber) ?? 0;

    const edges = await edgeRepo.list(
      { edgeTypeName, sourceId, targetId },
      { limit, offset }
    );

    return {
      edges,
      meta: {
        returnedCount: edges.length,
        limit,
        offset,
      },
    };
  },

  /**
   * Update an edge
   */
  async update(context: AppContext, params: Record<string, unknown>) {
    const { edgeRepo } = ensureGraphRepos(context);

    const id = getRequiredParam(params, 'id', isString);
    const properties = getOptionalParam(params, 'properties', isObject);
    const weight = getOptionalParam(params, 'weight', isNumber);

    const edge = await edgeRepo.update(id, { properties, weight });

    if (!edge) {
      throw createNotFoundError('edge', id);
    }

    return { success: true, edge };
  },

  /**
   * Delete an edge
   */
  async delete(context: AppContext, params: Record<string, unknown>) {
    const { edgeRepo } = ensureGraphRepos(context);

    const id = getRequiredParam(params, 'id', isString);

    const success = await edgeRepo.delete(id);
    if (!success) {
      throw createNotFoundError('edge', id);
    }

    return { success };
  },

  /**
   * Get neighbors of a node
   */
  async neighbors(context: AppContext, params: Record<string, unknown>) {
    const { edgeRepo } = ensureGraphRepos(context);

    const nodeId = getRequiredParam(params, 'nodeId', isString);
    const edgeTypes = getOptionalParam(params, 'edgeTypes', isStringArray);
    const direction = getOptionalParam(params, 'direction', isEdgeDirection);
    const nodeTypeFilter = getOptionalParam(params, 'nodeTypeFilter', isStringArray);
    const limit = getOptionalParam(params, 'limit', isNumber);

    const options: GraphTraversalOptions = {
      edgeTypes,
      direction,
      nodeTypeFilter,
      limit,
    };

    const neighbors = await edgeRepo.getNeighbors(nodeId, options);

    return {
      neighbors,
      meta: {
        returnedCount: neighbors.length,
      },
    };
  },

  /**
   * Traverse the graph from a starting node
   */
  async traverse(context: AppContext, params: Record<string, unknown>) {
    const { edgeRepo } = ensureGraphRepos(context);

    const startNodeId = getRequiredParam(params, 'startNodeId', isString);
    const edgeTypes = getOptionalParam(params, 'edgeTypes', isStringArray);
    const direction = getOptionalParam(params, 'direction', isEdgeDirection);
    const maxDepth = getOptionalParam(params, 'maxDepth', isNumber);
    const nodeTypeFilter = getOptionalParam(params, 'nodeTypeFilter', isStringArray);
    const limit = getOptionalParam(params, 'limit', isNumber);

    const options: GraphTraversalOptions = {
      edgeTypes,
      direction,
      maxDepth,
      nodeTypeFilter,
      limit,
    };

    const nodes = await edgeRepo.traverse(startNodeId, options);

    return {
      nodes,
      meta: {
        returnedCount: nodes.length,
        maxDepth: maxDepth ?? 3,
      },
    };
  },

  /**
   * Find paths between two nodes
   */
  async paths(context: AppContext, params: Record<string, unknown>) {
    const { edgeRepo } = ensureGraphRepos(context);

    const startNodeId = getRequiredParam(params, 'startNodeId', isString);
    const endNodeId = getRequiredParam(params, 'endNodeId', isString);
    const maxDepth = getOptionalParam(params, 'maxDepth', isNumber);

    const paths = await edgeRepo.findPaths(startNodeId, endNodeId, maxDepth);

    return {
      paths,
      meta: {
        pathCount: paths.length,
        maxDepth: maxDepth ?? 5,
      },
    };
  },
};
