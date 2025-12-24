/**
 * memory_knowledge tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { knowledgeHandlers } from '../handlers/knowledge.handler.js';

export const memoryKnowledgeDescriptor: ToolDescriptor = {
  name: 'memory_knowledge',
  description: `Manage knowledge entries (facts, decisions, context to remember).

Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

When to store: After making a decision, learning a fact, or establishing context worth remembering.
Example: {"action":"add","title":"API uses REST","content":"This project uses REST API, not GraphQL","scopeType":"project","category":"decision"}`,
  commonParams: {
    id: { type: 'string', description: 'Knowledge ID' },
    title: { type: 'string', description: 'Knowledge title' },
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string' },
    category: { type: 'string', enum: ['decision', 'fact', 'context', 'reference'] },
    content: { type: 'string', description: 'The knowledge content' },
    source: { type: 'string', description: 'Where this knowledge came from' },
    confidence: { type: 'number', description: 'Confidence level 0-1' },
    validFrom: { type: 'string', description: 'When this knowledge becomes valid (ISO timestamp). For temporal knowledge graphs.' },
    validUntil: { type: 'string', description: 'When this knowledge expires (ISO timestamp). For temporal knowledge graphs.' },
    invalidatedBy: { type: 'string', description: 'ID of entry that supersedes/invalidates this knowledge. For temporal knowledge graphs.' },
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
