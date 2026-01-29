/**
 * memory_guideline tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { guidelineHandlers } from '../handlers/guidelines.handler.js';

export const memoryGuidelineDescriptor: ToolDescriptor = {
  name: 'memory_guideline',
  visibility: 'standard',
  description:
    'Manage coding/behavioral guidelines. Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete',
  commonParams: {
    agentId: { type: 'string', description: 'Required for writes' },
    id: { type: 'string' },
    name: { type: 'string' },
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string' },
    category: { type: 'string' },
    priority: { type: 'number' },
    content: { type: 'string' },
    rationale: { type: 'string' },
    examples: {
      type: 'object',
      properties: {
        bad: { type: 'array', items: { type: 'string' } },
        good: { type: 'array', items: { type: 'string' } },
      },
    },
    verificationRules: {
      type: 'object',
      description:
        'Machine-readable rules for automated compliance checking. Set to null to clear existing rules.',
      properties: {
        filePatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'File path patterns that trigger this guideline (glob-like)',
        },
        contentPatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Regex patterns to detect violations in file content',
        },
        forbiddenActions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Action types that are forbidden (file_write, code_generate, api_call, command)',
        },
        requiredPatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Regex patterns that must be present in content',
        },
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
