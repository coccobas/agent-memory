/**
 * Task decomposition handlers
 *
 * Tasks are stored as knowledge entries with special relations for decomposition tracking.
 * This allows tracking parent-child relationships between tasks and subtasks.
 */

import type { CreateKnowledgeInput } from '../../db/repositories/knowledge.js';
import type { ListRelationsFilter } from '../../db/repositories/tags.js';
import type { AppContext } from '../../core/context.js';
import type { ScopeType } from '../../db/schema.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';

export interface TaskAddParams {
  parentTask?: string; // ID of parent task (knowledge entry)
  subtasks: string[]; // Array of subtask descriptions/names
  decompositionStrategy?: 'maximal' | 'balanced' | 'minimal';
  scopeType: ScopeType;
  scopeId?: string;
  projectId?: string; // For storing decomposition metadata
  createdBy?: string;
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
  } = params;

  if (!subtasks || subtasks.length === 0) {
    throw createValidationError(
      'subtasks',
      'at least one subtask is required',
      'Provide an array of subtask descriptions'
    );
  }

  const { repos } = context;
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
        depth: parentTask ? 1 : 0, // Simple depth calculation
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

  return {
    tasks: tasks.filter(
      (t): t is { id: string; title: string; subtaskCount: number } => t !== null
    ),
    meta: {
      returnedCount: tasks.length,
    },
  };
}

export const taskHandlers = {
  add: (context: AppContext, params: TaskAddParams) => addTask(context, params),
  get: (context: AppContext, params: TaskGetParams) => getTask(context, params),
  list: (context: AppContext, params: TaskListParams) => listTasks(context, params),
};
