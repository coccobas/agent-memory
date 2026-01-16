/**
 * graph_edge tool descriptor
 *
 * CRUD operations for graph edges and traversal in the flexible knowledge graph.
 */

import type { ToolDescriptor } from './types.js';
import { graphEdgeHandlers } from '../handlers/graph-edges.handler.js';

export const graphEdgeDescriptor: ToolDescriptor = {
  name: 'graph_edge',
  visibility: 'advanced',
  description: `Manage graph edges and perform traversal in the flexible knowledge graph.

Actions: add, get, list, update, delete, neighbors, traverse, paths

Edge types include: related_to, depends_on, imports, contains, calls, implements, extends, measures, controls, located_at, applies_to, supersedes, conflicts_with, parent_of, blocks, triggered, follows

Example: {"action":"add","edgeTypeName":"calls","sourceId":"node-123","targetId":"node-456"}
Example: {"action":"traverse","startNodeId":"node-123","maxDepth":2,"edgeTypes":["imports","calls"]}`,
  commonParams: {
    id: { type: 'string', description: 'Edge ID (get, update, delete)' },
    edgeTypeName: { type: 'string', description: 'Edge type name (add, list)' },
    sourceId: { type: 'string', description: 'Source node ID (add, list)' },
    targetId: { type: 'string', description: 'Target node ID (add, list)' },
    properties: { type: 'object', description: 'Edge properties (add, update)' },
    weight: { type: 'number', description: 'Edge weight (add, update)' },
    createdBy: { type: 'string', description: 'Creator identifier (add)' },
    nodeId: { type: 'string', description: 'Node ID for neighbor query (neighbors)' },
    startNodeId: { type: 'string', description: 'Starting node ID (traverse, paths)' },
    endNodeId: { type: 'string', description: 'Target node ID (paths)' },
    edgeTypes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by edge types (neighbors, traverse)',
    },
    direction: {
      type: 'string',
      enum: ['out', 'in', 'both'],
      description: 'Traversal direction (neighbors, traverse)',
    },
    maxDepth: { type: 'number', description: 'Max traversal depth (traverse, paths)' },
    nodeTypeFilter: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by node types (neighbors, traverse)',
    },
    limit: { type: 'number', description: 'Max results (list, neighbors, traverse)' },
    offset: { type: 'number', description: 'Skip N results (list)' },
  },
  actions: {
    add: {
      required: ['edgeTypeName', 'sourceId', 'targetId'],
      contextHandler: (ctx, params) => graphEdgeHandlers.add(ctx, params),
    },
    get: {
      required: ['id'],
      contextHandler: (ctx, params) => graphEdgeHandlers.get(ctx, params),
    },
    list: {
      contextHandler: (ctx, params) => graphEdgeHandlers.list(ctx, params),
    },
    update: {
      required: ['id'],
      contextHandler: (ctx, params) => graphEdgeHandlers.update(ctx, params),
    },
    delete: {
      required: ['id'],
      contextHandler: (ctx, params) => graphEdgeHandlers.delete(ctx, params),
    },
    neighbors: {
      required: ['nodeId'],
      contextHandler: (ctx, params) => graphEdgeHandlers.neighbors(ctx, params),
    },
    traverse: {
      required: ['startNodeId'],
      contextHandler: (ctx, params) => graphEdgeHandlers.traverse(ctx, params),
    },
    paths: {
      required: ['startNodeId', 'endNodeId'],
      contextHandler: (ctx, params) => graphEdgeHandlers.paths(ctx, params),
    },
  },
};
