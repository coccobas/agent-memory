/**
 * Task decomposition handlers
 *
 * Supports two modes via `entryType`:
 * - 'task': Uses the tasks table with parentTaskId for hierarchy
 * - 'knowledge': Uses knowledge entries with relations (default, backward compatible)
 */

import type { CreateKnowledgeInput } from '../../db/repositories/knowledge.js';
import type { ListRelationsFilter } from '../../db/repositories/tags.js';
import type { AppContext } from '../../core/context.js';
import type {
  ScopeType,
  TaskType,
  TaskDomain,
  TaskSeverity,
  TaskUrgency,
} from '../../db/schema.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';

export type DecompositionEntryType = 'task' | 'knowledge';

export interface TaskAddParams {
  entryType?: DecompositionEntryType; // Default: 'knowledge' for backward compatibility
  parentTask?: string; // ID of parent task/knowledge entry
  subtasks: string[]; // Array of subtask descriptions/names
  decompositionStrategy?: 'maximal' | 'balanced' | 'minimal';
  scopeType: ScopeType;
  scopeId?: string;
  projectId?: string; // For storing decomposition metadata
  createdBy?: string;

  // Task-specific fields (only used when entryType='task')
  taskType?: TaskType;
  taskDomain?: TaskDomain;
  severity?: TaskSeverity;
  urgency?: TaskUrgency;
}

export interface TaskGetParams {
  entryType?: DecompositionEntryType;
  taskId: string;
}

export interface TaskListParams {
  entryType?: DecompositionEntryType;
  parentTaskId?: string;
  scopeType?: ScopeType;
  scopeId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Add a task with subtasks, creating decomposition relationships
 *
 * When entryType='task': Creates entries in tasks table with parentTaskId hierarchy
 * When entryType='knowledge' (default): Creates knowledge entries with relations
 */
export async function addTask(
  context: AppContext,
  params: TaskAddParams
): Promise<{
  success: boolean;
  entryType: DecompositionEntryType;
  task: { id: string; title: string };
  subtasks: Array<{ id: string; title: string }>;
}> {
  const {
    entryType = 'knowledge', // Default for backward compatibility
    parentTask,
    subtasks,
    decompositionStrategy = 'balanced',
    scopeType,
    scopeId,
    projectId,
    createdBy,
    // Task-specific fields
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

  // ========================================
  // TASK MODE: Use tasks table
  // ========================================
  if (entryType === 'task') {
    const { tasks: tasksRepo, projects: projectRepo } = repos;

    if (!tasksRepo) {
      throw createValidationError(
        'entryType',
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
          entryType: 'task',
        };
        metadata.decomposition = decompositionData;
        await projectRepo.update(projectId, { metadata });
      }
    }

    return {
      success: true,
      entryType: 'task',
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

  // ========================================
  // KNOWLEDGE MODE: Use knowledge entries with relations (default)
  // ========================================
  const { knowledge: knowledgeRepo, entryRelations: entryRelationRepo, projects: projectRepo } = repos;

  // Create main task as a knowledge entry
  const mainTaskInput: CreateKnowledgeInput = {
    scopeType,
    scopeId,
    title: `Task with ${subtasks.length} subtask(s)`,
    category: 'context',
    content: `Decomposition strategy: ${decompositionStrategy}\nSubtasks: ${subtasks.join(', ')}`,
    createdBy,
  };

  const mainTask = await knowledgeRepo.create(mainTaskInput);

  // Create subtasks as knowledge entries and link them
  const createdSubtasks = [];
  for (const subtaskDesc of subtasks) {
    const subtaskInput: CreateKnowledgeInput = {
      scopeType,
      scopeId,
      title: subtaskDesc,
      category: 'context',
      content: `Subtask of task ${mainTask.id}`,
      createdBy,
    };

    const subtask = await knowledgeRepo.create(subtaskInput);
    createdSubtasks.push(subtask);

    // Create relation: main task -> subtask (parent_task)
    await entryRelationRepo.create({
      sourceType: 'knowledge',
      sourceId: mainTask.id,
      targetType: 'knowledge',
      targetId: subtask.id,
      relationType: 'parent_task',
      createdBy,
    });

    // Create inverse relation: subtask -> main task (subtask_of)
    await entryRelationRepo.create({
      sourceType: 'knowledge',
      sourceId: subtask.id,
      targetType: 'knowledge',
      targetId: mainTask.id,
      relationType: 'subtask_of',
      createdBy,
    });
  }

  // If there's a parent task, link it
  if (parentTask) {
    await entryRelationRepo.create({
      sourceType: 'knowledge',
      sourceId: parentTask,
      targetType: 'knowledge',
      targetId: mainTask.id,
      relationType: 'parent_task',
      createdBy,
    });

    await entryRelationRepo.create({
      sourceType: 'knowledge',
      sourceId: mainTask.id,
      targetType: 'knowledge',
      targetId: parentTask,
      relationType: 'subtask_of',
      createdBy,
    });
  }

  // Store decomposition metadata in project if projectId provided
  if (projectId) {
    const project = await projectRepo.getById(projectId);
    if (project) {
      const metadata = (project.metadata as Record<string, unknown>) || {};
      const decompositionData = (metadata.decomposition as Record<string, unknown>) || {};
      decompositionData[mainTask.id] = {
        strategy: decompositionStrategy,
        subtaskCount: subtasks.length,
        depth: parentTask ? 1 : 0,
        entryType: 'knowledge',
      };

      metadata.decomposition = decompositionData;

      await projectRepo.update(projectId, { metadata });
    }
  }

  return {
    success: true,
    entryType: 'knowledge',
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
 * When entryType='task': Looks up in tasks table, uses getSubtasks()
 * When entryType='knowledge' (default): Looks up in knowledge table, uses relations
 */
export async function getTask(
  context: AppContext,
  params: TaskGetParams
): Promise<{
  entryType: DecompositionEntryType;
  task: {
    id: string;
    title: string;
    content: string;
  };
  subtasks: Array<{ id: string; title: string }>;
  parentTask?: { id: string; title: string };
}> {
  const { taskId, entryType = 'knowledge' } = params;
  const { repos } = context;

  // ========================================
  // TASK MODE: Use tasks table
  // ========================================
  if (entryType === 'task') {
    const { tasks: tasksRepo } = repos;

    if (!tasksRepo) {
      throw createValidationError(
        'entryType',
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
      entryType: 'task',
      task: {
        id: task.id,
        title: task.title,
        content: task.description || '',
      },
      subtasks,
      parentTask,
    };
  }

  // ========================================
  // KNOWLEDGE MODE: Use knowledge entries with relations (default)
  // ========================================
  const { knowledge: knowledgeRepo, entryRelations: entryRelationRepo } = repos;

  const task = await knowledgeRepo.getById(taskId);
  if (!task) {
    throw createNotFoundError('Task', taskId);
  }

  // Get subtasks (tasks where this is the parent)
  const filter: ListRelationsFilter = {
    sourceType: 'knowledge',
    sourceId: taskId,
    relationType: 'parent_task',
  };
  const relations = await entryRelationRepo.list(filter);

  const subtasks: Array<{ id: string; title: string }> = [];
  for (const rel of relations) {
    if (rel.targetType === 'knowledge') {
      const subtask = await knowledgeRepo.getById(rel.targetId);
      if (subtask) {
        subtasks.push({
          id: subtask.id,
          title: subtask.title,
        });
      }
    }
  }

  // Get parent task (if this is a subtask)
  const parentFilter: ListRelationsFilter = {
    sourceType: 'knowledge',
    sourceId: taskId,
    relationType: 'subtask_of',
  };
  const parentRelations = await entryRelationRepo.list(parentFilter);

  let parentTask: { id: string; title: string } | undefined;
  if (parentRelations.length > 0 && parentRelations[0]?.targetType === 'knowledge') {
    const firstRelation = parentRelations[0];
    if (firstRelation) {
      const parent = await knowledgeRepo.getById(firstRelation.targetId);
      if (parent) {
        parentTask = {
          id: parent.id,
          title: parent.title,
        };
      }
    }
  }

  return {
    entryType: 'knowledge',
    task: {
      id: task.id,
      title: task.title,
      content: task.currentVersion?.content || '',
    },
    subtasks,
    parentTask,
  };
}

/**
 * List tasks, optionally filtered by parent or scope
 *
 * When entryType='task': Lists from tasks table using parentTaskId filter
 * When entryType='knowledge' (default): Lists from knowledge entries with relations
 */
export async function listTasks(
  context: AppContext,
  params: TaskListParams
): Promise<{
  entryType: DecompositionEntryType;
  tasks: Array<{
    id: string;
    title: string;
    subtaskCount: number;
  }>;
  meta: {
    returnedCount: number;
  };
}> {
  const { entryType = 'knowledge', parentTaskId, scopeType, scopeId, limit = 20, offset = 0 } = params;
  const { repos } = context;

  // ========================================
  // TASK MODE: Use tasks table
  // ========================================
  if (entryType === 'task') {
    const { tasks: tasksRepo } = repos;

    if (!tasksRepo) {
      throw createValidationError(
        'entryType',
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
      entryType: 'task',
      tasks: tasksWithCounts,
      meta: {
        returnedCount: tasksWithCounts.length,
      },
    };
  }

  // ========================================
  // KNOWLEDGE MODE: Use knowledge entries with relations (default)
  // ========================================
  const { knowledge: knowledgeRepo, entryRelations: entryRelationRepo } = repos;

  let taskIds: string[] = [];

  if (parentTaskId) {
    // Get all subtasks of the parent
    const filter: ListRelationsFilter = {
      sourceType: 'knowledge',
      sourceId: parentTaskId,
      relationType: 'parent_task',
    };
    const relations = await entryRelationRepo.list(filter);
    taskIds = relations
      .filter((rel: { targetType: string }) => rel.targetType === 'knowledge')
      .map((rel: { targetId: string }) => rel.targetId);
  } else {
    // Get all tasks (knowledge entries that are parents)
    const filter: ListRelationsFilter = {
      relationType: 'parent_task',
    };
    const allRelations = await entryRelationRepo.list(filter);
    taskIds = Array.from(
      new Set(
        allRelations
          .filter((rel: { sourceType: string }) => rel.sourceType === 'knowledge')
          .map((rel: { sourceId: string }) => rel.sourceId)
      )
    );
  }

  // Filter by scope if provided
  if (scopeType) {
    const tasks = await knowledgeRepo.list(
      {
        scopeType,
        scopeId,
        includeInactive: false,
      },
      { limit: 1000, offset: 0 } // Get all to filter
    );

    const taskIdsInScope = new Set(tasks.map((t: { id: string }) => t.id));
    taskIds = taskIds.filter((id) => taskIdsInScope.has(id));
  }

  // Get task details and count subtasks
  const tasksToProcess = taskIds.slice(offset, offset + limit);
  const tasks: Array<{ id: string; title: string; subtaskCount: number } | null> = [];

  for (const taskId of tasksToProcess) {
    const task = await knowledgeRepo.getById(taskId);
    if (!task) {
      tasks.push(null);
      continue;
    }

    const subtaskFilter: ListRelationsFilter = {
      sourceType: 'knowledge',
      sourceId: taskId,
      relationType: 'parent_task',
    };
    const subtaskRelations = await entryRelationRepo.list(subtaskFilter);

    tasks.push({
      id: task.id,
      title: task.title,
      subtaskCount: subtaskRelations.length,
    });
  }

  const filteredTasks = tasks.filter(
    (t): t is { id: string; title: string; subtaskCount: number } => t !== null
  );

  return {
    entryType: 'knowledge',
    tasks: filteredTasks,
    meta: {
      returnedCount: filteredTasks.length,
    },
  };
}

export const taskHandlers = {
  add: (context: AppContext, params: TaskAddParams) => addTask(context, params),
  get: (context: AppContext, params: TaskGetParams) => getTask(context, params),
  list: (context: AppContext, params: TaskListParams) => listTasks(context, params),
};
