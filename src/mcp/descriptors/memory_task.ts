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
  description: `Manage work items (bugs, features, tasks, improvements, etc.).

Actions: add, update, get, list, deactivate, delete, update_status, list_by_status, list_blocked, get_subtasks, add_blocker, remove_blocker

Task Types:
- bug: Software defects and errors
- feature: New functionality requests
- improvement: Enhancements to existing features
- debt: Technical debt items
- research: Investigation and research tasks
- question: Questions needing answers
- other: Miscellaneous items

Workflow States:
- backlog: Not yet scheduled
- open: Ready to start
- in_progress: Currently being worked on
- blocked: Waiting on dependencies
- review: Awaiting review/approval
- done: Completed successfully
- wont_do: Closed without completion

Example usage:
1. Create a bug: {"action":"add","title":"Fix login timeout","description":"Users get logged out after 5 minutes","taskType":"bug","severity":"high","scopeType":"project","scopeId":"proj-123"}
2. Update status: {"action":"update_status","id":"task_abc","status":"in_progress","agentId":"agent-1"}
3. Add blocker: {"action":"add_blocker","id":"task_abc","blockerId":"task_xyz","agentId":"agent-1"}
4. List blocked: {"action":"list_blocked","scopeType":"project","scopeId":"proj-123"}`,

  commonParams: {
    // Identity
    id: { type: 'string', description: 'Task ID' },
    title: { type: 'string', description: 'Task title (max 200 chars)' },
    description: { type: 'string', description: 'Detailed task description' },

    // Scope
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope level',
    },
    scopeId: { type: 'string', description: 'Scope ID (required for non-global scopes)' },

    // Classification
    taskType: {
      type: 'string',
      enum: ['bug', 'feature', 'improvement', 'debt', 'research', 'question', 'other'],
      description: 'Type of work item',
    },
    taskDomain: {
      type: 'string',
      enum: ['agent', 'physical'],
      description: 'Workflow domain: agent (auto-transitions) or physical (manual)',
    },
    severity: {
      type: 'string',
      enum: ['critical', 'high', 'medium', 'low'],
      description: 'Impact level of the task',
    },
    urgency: {
      type: 'string',
      enum: ['immediate', 'soon', 'normal', 'later'],
      description: 'Time sensitivity',
    },
    category: { type: 'string', description: 'Optional grouping category' },

    // Workflow
    status: {
      type: 'string',
      enum: ['backlog', 'open', 'in_progress', 'blocked', 'review', 'done', 'wont_do'],
      description: 'Current workflow state',
    },
    resolution: { type: 'string', description: 'Explanation when done/wont_do' },

    // Location (optional file reference)
    file: { type: 'string', description: 'File path associated with the task' },
    startLine: { type: 'number', description: 'Starting line number in file' },
    endLine: { type: 'number', description: 'Ending line number in file' },

    // Assignment
    assignee: { type: 'string', description: 'Agent ID or user identifier assigned' },
    reporter: { type: 'string', description: 'Who created the task' },

    // Hierarchy and dependencies
    parentTaskId: { type: 'string', description: 'Parent task ID for subtasks' },
    blockerId: { type: 'string', description: 'ID of task that blocks this one (add_blocker/remove_blocker)' },

    // Scheduling
    dueDate: { type: 'string', description: 'Due date (ISO timestamp)' },

    // Effort tracking
    estimatedMinutes: { type: 'number', description: 'Estimated effort in minutes' },
    actualMinutes: { type: 'number', description: 'Actual time spent in minutes' },

    // Flexible data
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Array of tag strings',
    },
    metadata: { type: 'object', description: 'Additional metadata (JSON object)' },

    // Audit
    agentId: { type: 'string', description: 'Agent ID performing the action (required for writes)' },
    createdBy: { type: 'string', description: 'Creator identifier' },
    updatedBy: { type: 'string', description: 'Updater identifier' },

    // List filters
    includeInactive: { type: 'boolean', description: 'Include deactivated tasks' },
    inherit: { type: 'boolean', description: 'Search parent scopes (default true)' },
    limit: { type: 'number', description: 'Max results to return' },
    offset: { type: 'number', description: 'Skip N results' },
  },

  actions: {
    // Standard CRUD
    add: { contextHandler: issueHandlers.add },
    update: { contextHandler: issueHandlers.update },
    get: { contextHandler: issueHandlers.get },
    list: { contextHandler: issueHandlers.list },
    deactivate: { contextHandler: issueHandlers.deactivate },
    delete: { contextHandler: issueHandlers.delete },

    // Status management
    update_status: { contextHandler: issueHandlers.update_status },
    list_by_status: { contextHandler: issueHandlers.list_by_status },

    // Blocking/dependency management
    list_blocked: { contextHandler: issueHandlers.list_blocked },
    add_blocker: { contextHandler: issueHandlers.add_blocker },
    remove_blocker: { contextHandler: issueHandlers.remove_blocker },

    // Hierarchy
    get_subtasks: { contextHandler: issueHandlers.get_subtasks },
  },
};
