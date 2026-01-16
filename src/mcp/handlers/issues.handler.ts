/**
 * Issue/Task handlers
 *
 * Manages work items (bugs, features, issues, etc.) stored in the tasks table.
 * Supports hierarchical task structures, blocking relationships, and workflow
 * state management.
 */

import type { AppContext } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';
import type {
  TaskType,
  TaskDomain,
  TaskSeverity,
  TaskUrgency,
  TaskStatus,
} from '../../db/schema.js';
import type {
  ITaskRepository,
  CreateTaskInput,
  UpdateTaskInput,
  ListTasksFilter,
} from '../../db/repositories/tasks.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isBoolean,
  isScopeType,
  isArrayOfStrings,
  isObject,
} from '../../utils/type-guards.js';
import {
  createValidationError,
  createNotFoundError,
  createServiceUnavailableError,
} from '../../core/errors.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { logAction } from '../../services/audit.service.js';

// =============================================================================
// Type Guards for Task-specific Types
// =============================================================================

function isTaskType(v: unknown): v is TaskType {
  return (
    v === 'bug' ||
    v === 'feature' ||
    v === 'improvement' ||
    v === 'debt' ||
    v === 'research' ||
    v === 'question' ||
    v === 'other'
  );
}

function isTaskDomain(v: unknown): v is TaskDomain {
  return v === 'agent' || v === 'physical';
}

function isTaskSeverity(v: unknown): v is TaskSeverity {
  return v === 'critical' || v === 'high' || v === 'medium' || v === 'low';
}

function isTaskUrgency(v: unknown): v is TaskUrgency {
  return v === 'immediate' || v === 'soon' || v === 'normal' || v === 'later';
}

function isTaskStatus(v: unknown): v is TaskStatus {
  return (
    v === 'backlog' ||
    v === 'open' ||
    v === 'in_progress' ||
    v === 'blocked' ||
    v === 'review' ||
    v === 'done' ||
    v === 'wont_do'
  );
}

// =============================================================================
// Repository Interface (to be implemented in db/repositories/tasks.ts)
// =============================================================================

// =============================================================================
// Handler Implementations
// =============================================================================

// Audit log entry type - use 'knowledge' as the closest existing type
// until 'task' is added to the audit log schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
const TASK_AUDIT_ENTRY_TYPE = 'knowledge' as any;

/**
 * Get task repository from context, throw if not available
 *
 * The task repository is optionally available in Repositories interface.
 * This helper validates its presence before use.
 */
function getTaskRepo(context: AppContext): ITaskRepository {
  const repo = context.repos.tasks;
  if (!repo) {
    throw createServiceUnavailableError('Tasks', 'repository not initialized');
  }
  return repo;
}

/**
 * Add a new task/issue
 */
const addHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  // Required params
  const title = getRequiredParam(params, 'title', isString);
  const description = getRequiredParam(params, 'description', isString);
  const taskType = getRequiredParam(params, 'taskType', isTaskType);
  const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
  const agentId = getRequiredParam(params, 'agentId', isString);

  // Scope validation
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  if (scopeType !== 'global' && !scopeId) {
    throw createValidationError(
      'scopeId',
      `is required for ${scopeType} scope`,
      'Provide the ID of the parent scope'
    );
  }

  // Validate title length
  if (title.length > 200) {
    throw createValidationError(
      'title',
      'must be 200 characters or less',
      'Shorten the title to 200 characters or less'
    );
  }

  // Optional params
  const taskDomain = getOptionalParam(params, 'taskDomain', isTaskDomain);
  const severity = getOptionalParam(params, 'severity', isTaskSeverity);
  const urgency = getOptionalParam(params, 'urgency', isTaskUrgency);
  const category = getOptionalParam(params, 'category', isString);
  const status = getOptionalParam(params, 'status', isTaskStatus);
  const file = getOptionalParam(params, 'file', isString);
  const startLine = getOptionalParam(params, 'startLine', isNumber);
  const endLine = getOptionalParam(params, 'endLine', isNumber);
  const assignee = getOptionalParam(params, 'assignee', isString);
  const reporter = getOptionalParam(params, 'reporter', isString);
  const parentTaskId = getOptionalParam(params, 'parentTaskId', isString);
  const dueDate = getOptionalParam(params, 'dueDate', isString);
  const estimatedMinutes = getOptionalParam(params, 'estimatedMinutes', isNumber);
  const tags = getOptionalParam(params, 'tags', isArrayOfStrings);
  const metadata = getOptionalParam(params, 'metadata', isObject);
  const createdBy = getOptionalParam(params, 'createdBy', isString);

  const input: CreateTaskInput = {
    scopeType,
    scopeId,
    title,
    description,
    taskType,
    taskDomain,
    severity,
    urgency,
    category,
    status,
    file,
    startLine,
    endLine,
    assignee,
    reporter: reporter ?? agentId,
    parentTaskId,
    dueDate,
    estimatedMinutes,
    tags,
    metadata,
    createdBy: createdBy ?? agentId,
  };

  const task = await repo.create(input);

  // Log audit
  logAction(
    {
      agentId,
      action: 'create',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      entryType: TASK_AUDIT_ENTRY_TYPE,
      entryId: task.id,
      scopeType,
      scopeId: scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    task,
  });
};

/**
 * Update an existing task
 */
const updateHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  const id = getRequiredParam(params, 'id', isString);
  const agentId = getRequiredParam(params, 'agentId', isString);

  // Get existing task
  const existingTask = await repo.getById(id);
  if (!existingTask) {
    throw createNotFoundError('task', id);
  }

  // Build update input
  const title = getOptionalParam(params, 'title', isString);
  const description = getOptionalParam(params, 'description', isString);
  const taskType = getOptionalParam(params, 'taskType', isTaskType);
  const taskDomain = getOptionalParam(params, 'taskDomain', isTaskDomain);
  const severity = getOptionalParam(params, 'severity', isTaskSeverity);
  const urgency = getOptionalParam(params, 'urgency', isTaskUrgency);
  const category = getOptionalParam(params, 'category', isString);
  const status = getOptionalParam(params, 'status', isTaskStatus);
  const resolution = getOptionalParam(params, 'resolution', isString);
  const file = getOptionalParam(params, 'file', isString);
  const startLine = getOptionalParam(params, 'startLine', isNumber);
  const endLine = getOptionalParam(params, 'endLine', isNumber);
  const assignee = getOptionalParam(params, 'assignee', isString);
  const parentTaskId = getOptionalParam(params, 'parentTaskId', isString);
  const dueDate = getOptionalParam(params, 'dueDate', isString);
  const estimatedMinutes = getOptionalParam(params, 'estimatedMinutes', isNumber);
  const actualMinutes = getOptionalParam(params, 'actualMinutes', isNumber);
  const tags = getOptionalParam(params, 'tags', isArrayOfStrings);
  const metadata = getOptionalParam(params, 'metadata', isObject);
  const updatedBy = getOptionalParam(params, 'updatedBy', isString);

  // Validate title length if provided
  if (title && title.length > 200) {
    throw createValidationError(
      'title',
      'must be 200 characters or less',
      'Shorten the title to 200 characters or less'
    );
  }

  const input: UpdateTaskInput = {};
  if (title !== undefined) input.title = title;
  if (description !== undefined) input.description = description;
  if (taskType !== undefined) input.taskType = taskType;
  if (taskDomain !== undefined) input.taskDomain = taskDomain;
  if (severity !== undefined) input.severity = severity;
  if (urgency !== undefined) input.urgency = urgency;
  if (category !== undefined) input.category = category;
  if (status !== undefined) input.status = status;
  if (resolution !== undefined) input.resolution = resolution;
  if (file !== undefined) input.file = file;
  if (startLine !== undefined) input.startLine = startLine;
  if (endLine !== undefined) input.endLine = endLine;
  if (assignee !== undefined) input.assignee = assignee;
  if (parentTaskId !== undefined) input.parentTaskId = parentTaskId;
  if (dueDate !== undefined) input.dueDate = dueDate;
  if (estimatedMinutes !== undefined) input.estimatedMinutes = estimatedMinutes;
  if (actualMinutes !== undefined) input.actualMinutes = actualMinutes;
  if (tags !== undefined) input.tags = tags;
  if (metadata !== undefined) input.metadata = metadata;
  input.updatedBy = updatedBy ?? agentId;

  const task = await repo.update(id, input);
  if (!task) {
    throw createNotFoundError('task', id);
  }

  // Log audit
  logAction(
    {
      agentId,
      action: 'update',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      entryType: TASK_AUDIT_ENTRY_TYPE,
      entryId: id,
      scopeType: existingTask.scopeType,
      scopeId: existingTask.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    task,
  });
};

/**
 * Get a single task by ID
 */
const getHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  const id = getRequiredParam(params, 'id', isString);

  const task = await repo.getById(id);
  if (!task) {
    throw createNotFoundError('task', id);
  }

  return formatTimestamps({ task });
};

/**
 * List tasks with optional filters
 */
const listHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  // Build filter
  const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const status = getOptionalParam(params, 'status', isTaskStatus);
  const taskType = getOptionalParam(params, 'taskType', isTaskType);
  const severity = getOptionalParam(params, 'severity', isTaskSeverity);
  const urgency = getOptionalParam(params, 'urgency', isTaskUrgency);
  const assignee = getOptionalParam(params, 'assignee', isString);
  const parentTaskId = getOptionalParam(params, 'parentTaskId', isString);
  const includeInactive = getOptionalParam(params, 'includeInactive', isBoolean);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 50;
  const offset = getOptionalParam(params, 'offset', isNumber) ?? 0;

  const filter: ListTasksFilter = {
    scopeType,
    scopeId,
    status,
    taskType,
    severity,
    urgency,
    assignee,
    parentTaskId,
    includeInactive,
  };

  const tasks = await repo.list(filter, { limit, offset });

  return formatTimestamps({
    tasks,
    meta: {
      returnedCount: tasks.length,
      hasMore: tasks.length === limit,
    },
  });
};

/**
 * Soft-delete (deactivate) a task
 */
const deactivateHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  const id = getRequiredParam(params, 'id', isString);
  const agentId = getRequiredParam(params, 'agentId', isString);

  const existingTask = await repo.getById(id);
  if (!existingTask) {
    throw createNotFoundError('task', id);
  }

  const success = await repo.deactivate(id);
  if (!success) {
    throw createNotFoundError('task', id);
  }

  // Log audit
  logAction(
    {
      agentId,
      action: 'delete',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      entryType: TASK_AUDIT_ENTRY_TYPE,
      entryId: id,
      scopeType: existingTask.scopeType,
      scopeId: existingTask.scopeId ?? null,
    },
    context.db
  );

  return { success: true };
};

/**
 * Hard-delete a task permanently
 */
const deleteHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  const id = getRequiredParam(params, 'id', isString);
  const agentId = getRequiredParam(params, 'agentId', isString);

  const existingTask = await repo.getById(id);
  if (!existingTask) {
    throw createNotFoundError('task', id);
  }

  const success = await repo.delete(id);
  if (!success) {
    throw createNotFoundError('task', id);
  }

  // Log audit
  logAction(
    {
      agentId,
      action: 'delete',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      entryType: TASK_AUDIT_ENTRY_TYPE,
      entryId: id,
      scopeType: existingTask.scopeType,
      scopeId: existingTask.scopeId ?? null,
    },
    context.db
  );

  return { success: true, message: 'Task permanently deleted' };
};

/**
 * Update task status with automatic timestamp handling
 */
const updateStatusHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  const id = getRequiredParam(params, 'id', isString);
  const status = getRequiredParam(params, 'status', isTaskStatus);
  const agentId = getRequiredParam(params, 'agentId', isString);
  const resolution = getOptionalParam(params, 'resolution', isString);

  const existingTask = await repo.getById(id);
  if (!existingTask) {
    throw createNotFoundError('task', id);
  }

  // Build update with automatic timestamp handling
  const input: UpdateTaskInput = {
    status,
    updatedBy: agentId,
  };

  // Set startedAt when moving to in_progress
  if (status === 'in_progress' && !existingTask.startedAt) {
    input.startedAt = new Date().toISOString();
  }

  // Set resolvedAt when moving to done/wont_do
  if ((status === 'done' || status === 'wont_do') && !existingTask.resolvedAt) {
    input.resolvedAt = new Date().toISOString();
  }

  // Include resolution if provided
  if (resolution !== undefined) {
    input.resolution = resolution;
  }

  const task = await repo.update(id, input);
  if (!task) {
    throw createNotFoundError('task', id);
  }

  // Log audit
  logAction(
    {
      agentId,
      action: 'update',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      entryType: TASK_AUDIT_ENTRY_TYPE,
      entryId: id,
      scopeType: existingTask.scopeType,
      scopeId: existingTask.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    task,
    previousStatus: existingTask.status,
  });
};

/**
 * List tasks by status
 */
const listByStatusHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  const status = getRequiredParam(params, 'status', isTaskStatus);
  const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 50;
  const offset = getOptionalParam(params, 'offset', isNumber) ?? 0;

  const filter: ListTasksFilter = {
    status,
    scopeType,
    scopeId,
    includeInactive: false,
  };

  const tasks = await repo.list(filter, { limit, offset });

  return formatTimestamps({
    tasks,
    status,
    meta: {
      returnedCount: tasks.length,
      hasMore: tasks.length === limit,
    },
  });
};

/**
 * List blocked tasks
 */
const listBlockedHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);

  // Get all blocked tasks and filter manually if scope parameters provided
  let tasks = await repo.listBlocked();

  // Apply scope filtering if specified
  if (scopeType || scopeId) {
    tasks = tasks.filter((task) => {
      if (scopeType && task.scopeType !== scopeType) return false;
      if (scopeId && task.scopeId !== scopeId) return false;
      return true;
    });
  }

  return formatTimestamps({
    tasks,
    meta: {
      returnedCount: tasks.length,
    },
  });
};

/**
 * Get subtasks of a parent task
 */
const getSubtasksHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  const parentTaskId = getRequiredParam(params, 'id', isString);

  // Verify parent exists
  const parentTask = await repo.getById(parentTaskId);
  if (!parentTask) {
    throw createNotFoundError('task', parentTaskId);
  }

  const subtasks = await repo.getSubtasks(parentTaskId);

  return formatTimestamps({
    parentTask: {
      id: parentTask.id,
      title: parentTask.title,
      status: parentTask.status,
    },
    subtasks,
    meta: {
      subtaskCount: subtasks.length,
    },
  });
};

/**
 * Add a blocker to a task
 */
const addBlockerHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  const id = getRequiredParam(params, 'id', isString);
  const blockerId = getRequiredParam(params, 'blockerId', isString);
  const agentId = getRequiredParam(params, 'agentId', isString);

  // Verify both tasks exist
  const task = await repo.getById(id);
  if (!task) {
    throw createNotFoundError('task', id);
  }

  const blocker = await repo.getById(blockerId);
  if (!blocker) {
    throw createNotFoundError('blocker task', blockerId);
  }

  // Prevent self-blocking
  if (id === blockerId) {
    throw createValidationError(
      'blockerId',
      'cannot block a task with itself',
      'Provide a different task ID as the blocker'
    );
  }

  const updatedTask = await repo.addBlocker(id, blockerId);
  if (!updatedTask) {
    throw createNotFoundError('task', id);
  }

  // Log audit
  logAction(
    {
      agentId,
      action: 'update',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      entryType: TASK_AUDIT_ENTRY_TYPE,
      entryId: id,
      scopeType: task.scopeType,
      scopeId: task.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    task: updatedTask,
    addedBlocker: {
      id: blocker.id,
      title: blocker.title,
    },
  });
};

/**
 * Remove a blocker from a task
 */
const removeBlockerHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getTaskRepo(context);

  const id = getRequiredParam(params, 'id', isString);
  const blockerId = getRequiredParam(params, 'blockerId', isString);
  const agentId = getRequiredParam(params, 'agentId', isString);

  // Verify task exists
  const task = await repo.getById(id);
  if (!task) {
    throw createNotFoundError('task', id);
  }

  const updatedTask = await repo.removeBlocker(id, blockerId);
  if (!updatedTask) {
    throw createNotFoundError('task', id);
  }

  // Log audit
  logAction(
    {
      agentId,
      action: 'update',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      entryType: TASK_AUDIT_ENTRY_TYPE,
      entryId: id,
      scopeType: task.scopeType,
      scopeId: task.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    task: updatedTask,
    removedBlockerId: blockerId,
  });
};

// =============================================================================
// Export Handlers
// =============================================================================

export const issueHandlers = {
  // Standard CRUD
  add: addHandler,
  update: updateHandler,
  get: getHandler,
  list: listHandler,
  deactivate: deactivateHandler,
  delete: deleteHandler,

  // Status management
  update_status: updateStatusHandler,
  list_by_status: listByStatusHandler,

  // Blocking/dependency management
  list_blocked: listBlockedHandler,
  add_blocker: addBlockerHandler,
  remove_blocker: removeBlockerHandler,

  // Hierarchy
  get_subtasks: getSubtasksHandler,
};
