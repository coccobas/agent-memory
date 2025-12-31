/**
 * memory_guideline tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { guidelineHandlers } from '../handlers/guidelines.handler.js';

export const memoryGuidelineDescriptor: ToolDescriptor = {
  name: 'memory_guideline',
  description: `Manage coding/behavioral guidelines (rules the AI should follow).

Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

When to store: When user establishes a coding standard, pattern preference, or rule.
Example: {"action":"add","name":"no-any","content":"Never use 'any' type","scopeType":"project","category":"code_style","priority":90}`,
  commonParams: {
    agentId: { type: 'string', description: 'Agent identifier (required for write operations)' },
    id: { type: 'string', description: 'Guideline ID' },
    name: { type: 'string', description: 'Guideline name' },
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string' },
    category: { type: 'string', description: 'Category (e.g., security, code_style)' },
    priority: { type: 'number', description: 'Priority 0-100' },
    content: { type: 'string', description: 'The guideline text' },
    rationale: { type: 'string', description: 'Why this guideline exists' },
    examples: {
      type: 'object',
      properties: {
        bad: { type: 'array', items: { type: 'string' } },
        good: { type: 'array', items: { type: 'string' } },
      },
    },
    createdBy: { type: 'string' },
    changeReason: { type: 'string' },
    updatedBy: { type: 'string' },
    inherit: { type: 'boolean' },
    includeInactive: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    add: { contextHandler: guidelineHandlers.add },
    update: { contextHandler: guidelineHandlers.update },
    get: { contextHandler: guidelineHandlers.get },
    list: { contextHandler: guidelineHandlers.list },
    history: { contextHandler: guidelineHandlers.history },
    deactivate: { contextHandler: guidelineHandlers.deactivate },
    delete: { contextHandler: guidelineHandlers.delete },
    bulk_add: { contextHandler: guidelineHandlers.bulk_add },
    bulk_update: { contextHandler: guidelineHandlers.bulk_update },
    bulk_delete: { contextHandler: guidelineHandlers.bulk_delete },
  },
};
