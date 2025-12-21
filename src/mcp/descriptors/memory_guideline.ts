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
    add: { handler: guidelineHandlers.add },
    update: { handler: guidelineHandlers.update },
    get: { handler: guidelineHandlers.get },
    list: { handler: guidelineHandlers.list },
    history: { handler: guidelineHandlers.history },
    deactivate: { handler: guidelineHandlers.deactivate },
    delete: { handler: guidelineHandlers.delete },
    bulk_add: { handler: guidelineHandlers.bulk_add },
    bulk_update: { handler: guidelineHandlers.bulk_update },
    bulk_delete: { handler: guidelineHandlers.bulk_delete },
  },
};
