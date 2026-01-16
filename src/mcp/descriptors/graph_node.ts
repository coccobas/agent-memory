/**
 * graph_node tool descriptor
 *
 * CRUD operations for graph nodes in the flexible knowledge graph.
 */

import type { ToolDescriptor } from './types.js';
import { graphNodeHandlers } from '../handlers/graph-nodes.handler.js';

export const graphNodeDescriptor: ToolDescriptor = {
  name: 'graph_node',
  visibility: 'advanced',
  description: `Manage graph nodes in the flexible knowledge graph.

Actions: add, get, list, update, history, deactivate, reactivate, delete

Node types include: entity, tool, guideline, knowledge, experience, file, function, class, module, interface, api_endpoint, sensor, measurement, weather_station, telemetry, architecture_decision, component, dependency, task

Example: {"action":"add","nodeTypeName":"function","scopeType":"project","scopeId":"proj-123","name":"calculateTotal","properties":{"signature":"function calculateTotal(items: Item[]): number"}}`,
  commonParams: {
    id: {
      type: 'string',
      description: 'Node ID (get, update, history, deactivate, reactivate, delete)',
    },
    nodeTypeName: { type: 'string', description: 'Node type name (add, list)' },
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope type (add, list)',
    },
    scopeId: { type: 'string', description: 'Scope ID (add, list)' },
    name: { type: 'string', description: 'Node name (add, update)' },
    properties: { type: 'object', description: 'Node properties (add, update)' },
    validFrom: { type: 'string', description: 'When this version becomes valid (ISO timestamp)' },
    validUntil: { type: 'string', description: 'When this version expires (ISO timestamp)' },
    changeReason: { type: 'string', description: 'Reason for update (update)' },
    createdBy: { type: 'string', description: 'Creator identifier (add)' },
    updatedBy: { type: 'string', description: 'Updater identifier (update)' },
    isActive: { type: 'boolean', description: 'Filter by active status (list)' },
    limit: { type: 'number', description: 'Max results (list)' },
    offset: { type: 'number', description: 'Skip N results (list)' },
  },
  actions: {
    add: {
      required: ['nodeTypeName', 'scopeType', 'name'],
      contextHandler: (ctx, params) => graphNodeHandlers.add(ctx, params),
    },
    get: {
      required: ['id'],
      contextHandler: (ctx, params) => graphNodeHandlers.get(ctx, params),
    },
    list: {
      contextHandler: (ctx, params) => graphNodeHandlers.list(ctx, params),
    },
    update: {
      required: ['id'],
      contextHandler: (ctx, params) => graphNodeHandlers.update(ctx, params),
    },
    history: {
      required: ['id'],
      contextHandler: (ctx, params) => graphNodeHandlers.history(ctx, params),
    },
    deactivate: {
      required: ['id'],
      contextHandler: (ctx, params) => graphNodeHandlers.deactivate(ctx, params),
    },
    reactivate: {
      required: ['id'],
      contextHandler: (ctx, params) => graphNodeHandlers.reactivate(ctx, params),
    },
    delete: {
      required: ['id'],
      contextHandler: (ctx, params) => graphNodeHandlers.delete(ctx, params),
    },
  },
};
