/**
 * memory_task tool descriptor
 *
 * Manages work items (bugs, features, tasks, improvements, etc.)
 * stored in the tasks table. Supports hierarchical task structures,
 * blocking relationships, and workflow state management.
 *
 * Task Types:
 * - bug: Software defects and errors
 * - feature: New functionality requests
 * - improvement: Enhancements to existing features
 * - debt: Technical debt items
 * - research: Investigation and research tasks
 * - question: Questions needing answers
 * - other: Miscellaneous items
 *
 * Task Domains:
 * - agent: Automatic status transitions managed by AI agents
 * - physical: Manual transitions requiring human intervention
 */

import type { ToolDescriptor } from './types.js';
import { issueHandlers } from '../handlers/issues.handler.js';

export const memoryTaskDescriptor: ToolDescriptor = {
  name: 'memory_task',
  visibility: 'standard',
  description:
    'Manage work items (bugs, features, tasks). Actions: add, update, get, list, deactivate, delete, update_status, list_by_status, list_blocked, add_blocker, remove_blocker, get_subtasks, preview, confirm, reject',
  commonParams: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string' },
    taskType: {
      type: 'string',
      enum: ['bug', 'feature', 'improvement', 'debt', 'research', 'question', 'other'],
    },
    taskDomain: { type: 'string', enum: ['agent', 'physical'] },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    urgency: { type: 'string', enum: ['immediate', 'soon', 'normal', 'later'] },
    category: { type: 'string' },
    status: {
      type: 'string',
      enum: ['backlog', 'open', 'in_progress', 'blocked', 'review', 'done', 'wont_do'],
    },
    resolution: { type: 'string' },
    file: { type: 'string' },
    startLine: { type: 'number' },
    endLine: { type: 'number' },
    assignee: { type: 'string' },
    reporter: { type: 'string' },
    parentTaskId: { type: 'string' },
    blockerId: { type: 'string' },
    dueDate: { type: 'string' },
    estimatedMinutes: { type: 'number' },
    actualMinutes: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } },
    metadata: { type: 'object' },
    agentId: { type: 'string', description: 'Required for writes' },
    createdBy: { type: 'string' },
    updatedBy: { type: 'string' },
    includeInactive: { type: 'boolean' },
    inherit: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
    previewId: { type: 'string', description: 'Preview ID for confirm/reject actions' },
  },

  actions: {
    add: { contextHandler: issueHandlers.add },
    update: { contextHandler: issueHandlers.update },
    get: { contextHandler: issueHandlers.get },
    list: { contextHandler: issueHandlers.list },
    deactivate: { contextHandler: issueHandlers.deactivate },
    delete: { contextHandler: issueHandlers.delete },
    update_status: { contextHandler: issueHandlers.update_status },
    list_by_status: { contextHandler: issueHandlers.list_by_status },
    list_blocked: { contextHandler: issueHandlers.list_blocked },
    add_blocker: { contextHandler: issueHandlers.add_blocker },
    remove_blocker: { contextHandler: issueHandlers.remove_blocker },
    get_subtasks: { contextHandler: issueHandlers.get_subtasks },
    preview: { contextHandler: issueHandlers.preview },
    confirm: { contextHandler: issueHandlers.confirm },
    reject: { contextHandler: issueHandlers.reject },
  },
};
