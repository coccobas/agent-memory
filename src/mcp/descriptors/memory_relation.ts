/**
 * memory_relation tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { relationHandlers } from '../handlers/relations.handler.js';

export const memoryRelationDescriptor: ToolDescriptor = {
  name: 'memory_relation',
  visibility: 'standard',
  description: 'Manage entry relations. Actions: create, list, delete',
  commonParams: {
    agentId: { type: 'string' },
    id: { type: 'string' },
    sourceType: {
      type: 'string',
      enum: ['tool', 'guideline', 'knowledge', 'project', 'experience'],
    },
    sourceId: { type: 'string' },
    targetType: {
      type: 'string',
      enum: ['tool', 'guideline', 'knowledge', 'project', 'experience'],
    },
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
        'promoted_to',
      ],
    },
    createdBy: { type: 'string' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    create: { contextHandler: (ctx, params) => relationHandlers.create(ctx, params) },
    list: { contextHandler: (ctx, params) => relationHandlers.list(ctx, params) },
    delete: { contextHandler: (ctx, params) => relationHandlers.delete(ctx, params) },
  },
};
