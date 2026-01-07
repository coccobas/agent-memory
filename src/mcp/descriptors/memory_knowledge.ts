/**
 * memory_knowledge tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { knowledgeHandlers } from '../handlers/knowledge.handler.js';

export const memoryKnowledgeDescriptor: ToolDescriptor = {
  name: 'memory_knowledge',
  visibility: 'core',
  description: 'Manage knowledge entries (facts, decisions, context). Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete',
  commonParams: {
    agentId: { type: 'string', description: 'Required for writes' },
    id: { type: 'string' },
    title: { type: 'string' },
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string' },
    category: { type: 'string', enum: ['decision', 'fact', 'context', 'reference'] },
    content: { type: 'string' },
    source: { type: 'string' },
    confidence: { type: 'number' },
    validFrom: { type: 'string' },
    validUntil: { type: 'string' },
    invalidatedBy: { type: 'string' },
    createdBy: { type: 'string' },
    changeReason: { type: 'string' },
    updatedBy: { type: 'string' },
    inherit: { type: 'boolean' },
    includeInactive: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    add: { contextHandler: knowledgeHandlers.add },
    update: { contextHandler: knowledgeHandlers.update },
    get: { contextHandler: knowledgeHandlers.get },
    list: { contextHandler: knowledgeHandlers.list },
    history: { contextHandler: knowledgeHandlers.history },
    deactivate: { contextHandler: knowledgeHandlers.deactivate },
    delete: { contextHandler: knowledgeHandlers.delete },
    bulk_add: { contextHandler: knowledgeHandlers.bulk_add },
    bulk_update: { contextHandler: knowledgeHandlers.bulk_update },
    bulk_delete: { contextHandler: knowledgeHandlers.bulk_delete },
  },
};
