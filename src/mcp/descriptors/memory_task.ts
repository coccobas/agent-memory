/**
 * memory_task tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import {
  taskHandlers,
  type TaskAddParams,
  type TaskGetParams,
  type TaskListParams,
} from '../handlers/tasks.handler.js';

export const memoryTaskDescriptor: ToolDescriptor = {
  name: 'memory_task',
  description: 'Manage task decomposition. Actions: add, get, list',
  commonParams: {
    parentTask: { type: 'string', description: 'ID of parent task (add)' },
    subtasks: {
      type: 'array',
      items: { type: 'string' },
      description: 'Array of subtask descriptions/names (add)',
    },
    decompositionStrategy: {
      type: 'string',
      enum: ['maximal', 'balanced', 'minimal'],
      description: 'Decomposition strategy (add)',
    },
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string' },
    projectId: { type: 'string', description: 'For storing decomposition metadata (add)' },
    createdBy: { type: 'string' },
    taskId: { type: 'string', description: 'Task ID (get)' },
    parentTaskId: { type: 'string', description: 'Filter by parent task ID (list)' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    add: {
      handler: (p) => taskHandlers.add(p as unknown as TaskAddParams),
    },
    get: {
      handler: (p) => taskHandlers.get(p as unknown as TaskGetParams),
    },
    list: {
      handler: (p) => taskHandlers.list(p as unknown as TaskListParams),
    },
  },
};
