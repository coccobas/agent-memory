/**
 * memory_tool tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { toolHandlers } from '../handlers/tools.handler.js';

export const memoryToolDescriptor: ToolDescriptor = {
  name: 'memory_tool',
  visibility: 'core',
  description:
    'Manage tool definitions (reusable patterns). Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete',
  commonParams: {
    agentId: { type: 'string', description: 'Required for writes' },
    id: { type: 'string' },
    name: { type: 'string' },
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string' },
    category: { type: 'string', enum: ['mcp', 'cli', 'function', 'api'] },
    description: { type: 'string' },
    parameters: { type: 'object' },
    examples: { type: 'array' },
    constraints: { type: 'string' },
    createdBy: { type: 'string' },
    changeReason: { type: 'string' },
    updatedBy: { type: 'string' },
    inherit: { type: 'boolean' },
    includeInactive: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    add: { contextHandler: toolHandlers.add },
    update: { contextHandler: toolHandlers.update },
    get: { contextHandler: toolHandlers.get },
    list: { contextHandler: toolHandlers.list },
    history: { contextHandler: toolHandlers.history },
    deactivate: { contextHandler: toolHandlers.deactivate },
    delete: { contextHandler: toolHandlers.delete },
    bulk_add: { contextHandler: toolHandlers.bulk_add },
    bulk_update: { contextHandler: toolHandlers.bulk_update },
    bulk_delete: { contextHandler: toolHandlers.bulk_delete },
  },
};
