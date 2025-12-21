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
    validUntil: { type: 'string', description: 'Expiration date (ISO format)' },
    createdBy: { type: 'string' },
    changeReason: { type: 'string' },
    updatedBy: { type: 'string' },
    inherit: { type: 'boolean' },
    includeInactive: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    add: { handler: knowledgeHandlers.add },
    update: { handler: knowledgeHandlers.update },
    get: { handler: knowledgeHandlers.get },
    list: { handler: knowledgeHandlers.list },
    history: { handler: knowledgeHandlers.history },
    deactivate: { handler: knowledgeHandlers.deactivate },
    delete: { handler: knowledgeHandlers.delete },
    bulk_add: { handler: knowledgeHandlers.bulk_add },
    bulk_update: { handler: knowledgeHandlers.bulk_update },
    bulk_delete: { handler: knowledgeHandlers.bulk_delete },
  },
};
