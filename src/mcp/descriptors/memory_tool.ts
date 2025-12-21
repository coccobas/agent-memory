/**
 * memory_tool tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { toolHandlers } from '../handlers/tools.handler.js';

export const memoryToolDescriptor: ToolDescriptor = {
  name: 'memory_tool',
  description: `Manage tool definitions (store reusable tool patterns for future reference).

Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

When to store: After successfully using a tool/command that could be reused.
Example: {"action":"add","name":"docker-build","description":"Build Docker image","scopeType":"project","category":"cli"}`,
  commonParams: {
    id: { type: 'string', description: 'Tool ID' },
    name: { type: 'string', description: 'Tool name' },
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope level',
    },
    scopeId: { type: 'string', description: 'Scope ID' },
    category: { type: 'string', enum: ['mcp', 'cli', 'function', 'api'] },
    description: { type: 'string', description: 'What this tool does' },
    parameters: { type: 'object', description: 'Parameter schema' },
    examples: { type: 'array', description: 'Usage examples' },
    constraints: { type: 'string', description: 'Usage constraints' },
    createdBy: { type: 'string', description: 'Creator identifier' },
    changeReason: { type: 'string', description: 'Reason for update' },
    updatedBy: { type: 'string' },
    inherit: { type: 'boolean', description: 'Search parent scopes (default true)' },
    includeInactive: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    add: { handler: toolHandlers.add },
    update: { handler: toolHandlers.update },
    get: { handler: toolHandlers.get },
    list: { handler: toolHandlers.list },
    history: { handler: toolHandlers.history },
    deactivate: { handler: toolHandlers.deactivate },
    delete: { handler: toolHandlers.delete },
    bulk_add: { handler: toolHandlers.bulk_add },
    bulk_update: { handler: toolHandlers.bulk_update },
    bulk_delete: { handler: toolHandlers.bulk_delete },
  },
};
