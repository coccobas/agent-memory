/**
 * Task decomposition handlers
 *
 * Uses the tasks table with parentTaskId for hierarchy.
 */

import type { AppContext } from '../../core/context.js';
import type {
  ScopeType,
  TaskType,
  TaskDomain,
  TaskSeverity,
  TaskUrgency,
} from '../../db/schema.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';

export interface TaskAddParams {
  parentTask?: string; // ID of parent task
  subtasks: string[]; // Array of subtask descriptions/names
  decompositionStrategy?: 'maximal' | 'balanced' | 'minimal';
  scopeType: ScopeType;
  scopeId?: string;
  projectId?: string; // For storing decomposition metadata
  createdBy?: string;
  taskType?: TaskType;
  taskDomain?: TaskDomain;
  severity?: TaskSeverity;
  urgency?: TaskUrgency;
}

export interface TaskGetParams {
  taskId: string;
}

export interface TaskListParams {
  parentTaskId?: string;
  scopeType?: ScopeType;
  scopeId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Add a task with subtasks, creating decomposition relationships
 *
 * Creates entries in tasks table with parentTaskId hierarchy.
 */
export async function addTask(
  context: AppContext,
  params: TaskAddParams
): Promise<{
  success: boolean;
  task: { id: string; title: string };
  subtasks: Array<{ id: string; title: string }>;
}> {
  const {
    parentTask,
    subtasks,
    decompositionStrategy = 'balanced',
    scopeType,
    scopeId,
    projectId,
    createdBy,
    taskType = 'other',
    taskDomain,
    severity,
    urgency,
  } = params;

  if (!subtasks || subtasks.length === 0) {
    throw createValidationError(
      'subtasks',
      'at least one subtask is required',
      'Provide an array of subtask descriptions'
    );
  }

  const { repos } = context;
  const { tasks: tasksRepo, projects: projectRepo } = repos;

  if (!tasksRepo) {
    throw createValidationError(
      'tasks',
      'tasks repository not available',
      'Ensure tasks repository is configured'
    );
  }

  // Create main task in tasks table
  const mainTask = await tasksRepo.create({
    scopeType,
    scopeId,
    title: `Task with ${subtasks.length} subtask(s)`,
    description: `Decomposition strategy: ${decompositionStrategy}\nSubtasks: ${subtasks.join(', ')}`,
    taskType,
    taskDomain,
    severity,
    urgency,
    parentTaskId: parentTask, // Link to parent if provided
    createdBy,
  });

  // Create subtasks in tasks table with parentTaskId pointing to main task
  const createdSubtasks = [];
  for (const subtaskDesc of subtasks) {
    const subtask = await tasksRepo.create({
      scopeType,
      scopeId,
      title: subtaskDesc,
      description: `Subtask of ${mainTask.id}`,
      taskType,
      taskDomain,
      severity,
      urgency,
      parentTaskId: mainTask.id,
      createdBy,
    });
    createdSubtasks.push(subtask);
  }

  // Store decomposition metadata in project if projectId provided
  if (projectId && projectRepo) {
    const project = await projectRepo.getById(projectId);
    if (project) {
      const metadata = (project.metadata as Record<string, unknown>) || {};
      const decompositionData = (metadata.decomposition as Record<string, unknown>) || {};
      decompositionData[mainTask.id] = {
        strategy: decompositionStrategy,
        subtaskCount: subtasks.length,
        depth: parentTask ? 1 : 0,
      };
      metadata.decomposition = decompositionData;
      await projectRepo.update(projectId, { metadata });
    }
  }

  return {
    success: true,
    task: {
      id: mainTask.id,
      title: mainTask.title,
    },
    subtasks: createdSubtasks.map((s) => ({
      id: s.id,
      title: s.title,
    })),
  };
}

/**
 * Get a task and its subtasks
 *
 * Looks up in tasks table, uses getSubtasks().
 */
export async function getTask(
  context: AppContext,
  params: TaskGetParams
): Promise<{
  task: {
    id: string;
    title: string;
    content: string;
  };
  subtasks: Array<{ id: string; title: string }>;
  parentTask?: { id: string; title: string };
}> {
  const { taskId } = params;
  const { repos } = context;
  const { tasks: tasksRepo } = repos;

  if (!tasksRepo) {
    throw createValidationError(
      'tasks',
      'tasks repository not available',
      'Ensure tasks repository is configured'
    );
  }

  const task = await tasksRepo.getById(taskId);
  if (!task) {
    throw createNotFoundError('Task', taskId);
  }

  // Get subtasks using built-in parentTaskId
  const subtaskEntries = await tasksRepo.getSubtasks(taskId);
  const subtasks = subtaskEntries.map((s) => ({
    id: s.id,
    title: s.title,
  }));

  // Get parent task if this task has a parentTaskId
  let parentTask: { id: string; title: string } | undefined;
  if (task.parentTaskId) {
    const parent = await tasksRepo.getById(task.parentTaskId);
    if (parent) {
      parentTask = {
        id: parent.id,
        title: parent.title,
      };
    }
  }

  return {
    task: {
      id: task.id,
      title: task.title,
      content: task.description || '',
    },
    subtasks,
    parentTask,
  };
}

/**
 * List tasks, optionally filtered by parent or scope
 *
 * Lists from tasks table using parentTaskId filter.
 */
export async function listTasks(
  context: AppContext,
  params: TaskListParams
): Promise<{
  tasks: Array<{
    id: string;
    title: string;
    subtaskCount: number;
  }>;
  meta: {
    returnedCount: number;
  };
}> {
  const { parentTaskId, scopeType, scopeId, limit = 20, offset = 0 } = params;
  const { repos } = context;
  const { tasks: tasksRepo } = repos;

  if (!tasksRepo) {
    throw createValidationError(
      'tasks',
      'tasks repository not available',
      'Ensure tasks repository is configured'
    );
  }

  // Build filter for tasks table
  const filter: {
    scopeType?: ScopeType;
    scopeId?: string;
    parentTaskId?: string;
    includeInactive?: boolean;
  } = {
    includeInactive: false,
  };

  if (scopeType) filter.scopeType = scopeType;
  if (scopeId) filter.scopeId = scopeId;
  if (parentTaskId) filter.parentTaskId = parentTaskId;

  const taskEntries = await tasksRepo.list(filter, { limit, offset });

  // Get subtask counts for each task
  const tasksWithCounts = await Promise.all(
    taskEntries.map(async (task) => {
      const subtasks = await tasksRepo.getSubtasks(task.id);
      return {
        id: task.id,
        title: task.title,
        subtaskCount: subtasks.length,
      };
    })
  );

  return {
    tasks: tasksWithCounts,
    meta: {
      returnedCount: tasksWithCounts.length,
    },
  };
}

export const taskHandlers = {
  add: (context: AppContext, params: TaskAddParams) => addTask(context, params),
  get: (context: AppContext, params: TaskGetParams) => getTask(context, params),
  list: (context: AppContext, params: TaskListParams) => listTasks(context, params),
};
