/**
 * Task decomposition handlers
 *
 * Tasks are stored as knowledge entries with special relations for decomposition tracking.
 * This allows tracking parent-child relationships between tasks and subtasks.
 */

import { knowledgeRepo, type CreateKnowledgeInput } from '../../db/repositories/knowledge.js';
import { entryRelationRepo, type ListRelationsFilter } from '../../db/repositories/tags.js';
import { getDb } from '../../db/connection.js';
import { projects } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ScopeType } from '../../db/schema.js';

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
export function addTask(params: TaskAddParams): {
  success: boolean;
  task: { id: string; title: string };
  subtasks: Array<{ id: string; title: string }>;
} {
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
    throw new Error('At least one subtask is required');
  }

  const db = getDb();

  // Create main task as a knowledge entry
  const mainTaskInput: CreateKnowledgeInput = {
    scopeType,
    scopeId,
    title: `Task with ${subtasks.length} subtask(s)`,
    category: 'context',
    content: `Decomposition strategy: ${decompositionStrategy}\nSubtasks: ${subtasks.join(', ')}`,
    createdBy,
  };

  const mainTask = knowledgeRepo.create(mainTaskInput);

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

    const subtask = knowledgeRepo.create(subtaskInput);
    createdSubtasks.push(subtask);

    // Create relation: main task -> subtask (parent_task)
    entryRelationRepo.create({
      sourceType: 'knowledge',
      sourceId: mainTask.id,
      targetType: 'knowledge',
      targetId: subtask.id,
      relationType: 'parent_task',
      createdBy,
    });

    // Create inverse relation: subtask -> main task (subtask_of)
    entryRelationRepo.create({
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
    entryRelationRepo.create({
      sourceType: 'knowledge',
      sourceId: parentTask,
      targetType: 'knowledge',
      targetId: mainTask.id,
      relationType: 'parent_task',
      createdBy,
    });

    entryRelationRepo.create({
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
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (project) {
      const metadata = (project.metadata as Record<string, unknown>) || {};
      const decompositionData = (metadata.decomposition as Record<string, unknown>) || {};
      decompositionData[mainTask.id] = {
        strategy: decompositionStrategy,
        subtaskCount: subtasks.length,
        depth: parentTask ? 1 : 0, // Simple depth calculation
      };

      metadata.decomposition = decompositionData;

      db.update(projects).set({ metadata }).where(eq(projects.id, projectId)).run();
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
export function getTask(params: TaskGetParams): {
  task: {
    id: string;
    title: string;
    content: string;
  };
  subtasks: Array<{ id: string; title: string }>;
  parentTask?: { id: string; title: string };
} {
  const { taskId } = params;

  const task = knowledgeRepo.getById(taskId);
  if (!task) {
    throw new Error('Task not found');
  }

  // Get subtasks (tasks where this is the parent)
  const filter: ListRelationsFilter = {
    sourceType: 'knowledge',
    sourceId: taskId,
    relationType: 'parent_task',
  };
  const relations = entryRelationRepo.list(filter);

  const subtasks = relations
    .map((rel) => {
      if (rel.targetType === 'knowledge') {
        const subtask = knowledgeRepo.getById(rel.targetId);
        return subtask
          ? {
              id: subtask.id,
              title: subtask.title,
            }
          : null;
      }
      return null;
    })
    .filter((s): s is { id: string; title: string } => s !== null);

  // Get parent task (if this is a subtask)
  const parentFilter: ListRelationsFilter = {
    sourceType: 'knowledge',
    sourceId: taskId,
    relationType: 'subtask_of',
  };
  const parentRelations = entryRelationRepo.list(parentFilter);

  const parentTask =
    parentRelations.length > 0 && parentRelations[0]?.targetType === 'knowledge'
      ? (() => {
          const firstRelation = parentRelations[0];
          if (!firstRelation) return undefined;
          const parent = knowledgeRepo.getById(firstRelation.targetId);
          return parent
            ? {
                id: parent.id,
                title: parent.title,
              }
            : undefined;
        })()
      : undefined;

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
export function listTasks(params: TaskListParams): {
  tasks: Array<{
    id: string;
    title: string;
    subtaskCount: number;
  }>;
  meta: {
    returnedCount: number;
  };
} {
  const { parentTaskId, scopeType, scopeId, limit = 20, offset = 0 } = params;

  let taskIds: string[] = [];

  if (parentTaskId) {
    // Get all subtasks of the parent
    const filter: ListRelationsFilter = {
      sourceType: 'knowledge',
      sourceId: parentTaskId,
      relationType: 'parent_task',
    };
    const relations = entryRelationRepo.list(filter);
    taskIds = relations.filter((rel) => rel.targetType === 'knowledge').map((rel) => rel.targetId);
  } else {
    // Get all tasks (knowledge entries that are parents)
    const filter: ListRelationsFilter = {
      relationType: 'parent_task',
    };
    const allRelations = entryRelationRepo.list(filter);
    taskIds = Array.from(
      new Set(
        allRelations.filter((rel) => rel.sourceType === 'knowledge').map((rel) => rel.sourceId)
      )
    );
  }

  // Filter by scope if provided
  if (scopeType) {
    const tasks = knowledgeRepo.list(
      {
        scopeType,
        scopeId,
        includeInactive: false,
      },
      { limit: 1000, offset: 0 } // Get all to filter
    );

    const taskIdsInScope = new Set(tasks.map((t) => t.id));
    taskIds = taskIds.filter((id) => taskIdsInScope.has(id));
  }

  // Get task details and count subtasks
  const tasks = taskIds.slice(offset, offset + limit).map((taskId) => {
    const task = knowledgeRepo.getById(taskId);
    if (!task) return null;

    const subtaskFilter: ListRelationsFilter = {
      sourceType: 'knowledge',
      sourceId: taskId,
      relationType: 'parent_task',
    };
    const subtaskRelations = entryRelationRepo.list(subtaskFilter);

    return {
      id: task.id,
      title: task.title,
      subtaskCount: subtaskRelations.length,
    };
  });

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
  add: addTask,
  get: getTask,
  list: listTasks,
};


