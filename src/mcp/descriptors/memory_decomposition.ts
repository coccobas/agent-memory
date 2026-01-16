/**
 * memory_decomposition tool descriptor
 *
 * Manages task decomposition - breaking down larger tasks into subtasks.
 * This is separate from work item tracking (memory_task).
 *
 * Supports two modes via `entryType`:
 * - 'task': Uses the tasks table with parentTaskId for hierarchy
 * - 'knowledge': Uses knowledge entries with relations (default, backward compatible)
 */

import type { ToolDescriptor } from './types.js';
import {
  taskHandlers,
  type TaskAddParams,
  type TaskGetParams,
  type TaskListParams,
} from '../handlers/tasks.handler.js';

export const memoryDecompositionDescriptor: ToolDescriptor = {
  name: 'memory_decomposition',
  visibility: 'advanced',
  description: `Manage task decomposition - breaking down larger tasks into subtasks.

Actions: add, get, list

Supports two modes via entryType:
- 'task': Uses tasks table with built-in hierarchy (parentTaskId)
- 'knowledge': Uses knowledge entries with relations (default)

Example (task mode): {"action":"add","entryType":"task","subtasks":["Design API","Implement endpoints","Write tests"],"taskType":"feature","scopeType":"project","scopeId":"proj-123"}
Example (knowledge mode): {"action":"add","subtasks":["Research options","Document findings"],"scopeType":"project","scopeId":"proj-123"}`,
  commonParams: {
    // Mode selection
    entryType: {
      type: 'string',
      enum: ['task', 'knowledge'],
      description:
        'Target entry type: task (uses tasks table) or knowledge (uses knowledge entries with relations). Default: knowledge',
    },

    // Common parameters
    parentTask: { type: 'string', description: 'ID of parent task/knowledge entry (add)' },
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
    taskId: { type: 'string', description: 'Task/knowledge ID (get)' },
    parentTaskId: { type: 'string', description: 'Filter by parent task ID (list)' },
    limit: { type: 'number' },
    offset: { type: 'number' },

    // Task-specific parameters (only used when entryType='task')
    taskType: {
      type: 'string',
      enum: ['bug', 'feature', 'improvement', 'debt', 'research', 'question', 'other'],
      description: 'Task type (only for entryType=task)',
    },
    taskDomain: {
      type: 'string',
      enum: ['agent', 'physical'],
      description:
        'Task domain: agent (auto-transitions) or physical (manual). Only for entryType=task',
    },
    severity: {
      type: 'string',
      enum: ['critical', 'high', 'medium', 'low'],
      description: 'Task severity (only for entryType=task)',
    },
    urgency: {
      type: 'string',
      enum: ['immediate', 'soon', 'normal', 'later'],
      description: 'Task urgency (only for entryType=task)',
    },
  },
  actions: {
    add: {
      contextHandler: (ctx, p) => taskHandlers.add(ctx, p as unknown as TaskAddParams),
    },
    get: {
      contextHandler: (ctx, p) => taskHandlers.get(ctx, p as unknown as TaskGetParams),
    },
    list: {
      contextHandler: (ctx, p) => taskHandlers.list(ctx, p as unknown as TaskListParams),
    },
  },
};
