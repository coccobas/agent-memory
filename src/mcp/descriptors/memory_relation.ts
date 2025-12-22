/**
 * memory_relation tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { relationHandlers } from '../handlers/relations.handler.js';

export const memoryRelationDescriptor: ToolDescriptor = {
  name: 'memory_relation',
  description: 'Manage entry relations. Actions: create, list, delete',
  commonParams: {
    agentId: { type: 'string', description: 'Agent identifier for access control/auditing' },
    id: { type: 'string', description: 'Relation ID (delete)' },
    sourceType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
    sourceId: { type: 'string' },
    targetType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
    targetId: { type: 'string' },
    relationType: {
      type: 'string',
      enum: [
        'applies_to',
        'depends_on',
        'conflicts_with',
        'related_to',
        'parent_task',
        'subtask_of',
      ],
    },
    createdBy: { type: 'string' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    create: { contextHandler: relationHandlers.create },
    list: { contextHandler: relationHandlers.list },
    delete: { contextHandler: relationHandlers.delete },
  },
};
