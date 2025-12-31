/**
 * Task Repository
 *
 * Manages work items/issues to track. Tasks are directly mutable (no versioning)
 * and support both agent-managed and physical (human-managed) workflows.
 *
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { transactionWithRetry } from '../connection.js';
import {
  tasks,
  type Task,
  type NewTask,
  type ScopeType,
  type TaskType,
  type TaskDomain,
  type TaskSeverity,
  type TaskUrgency,
  type TaskStatus,
} from '../schema.js';
import { type PaginationOptions } from './base.js';
import { normalizePagination, buildScopeConditions } from './entry-utils.js';
import type { DatabaseDeps } from '../../core/types.js';
import { createNotFoundError, createValidationError } from '../../core/errors.js';

// =============================================================================
// INPUT/OUTPUT TYPES
// =============================================================================

/** Input for creating a new task */
export interface CreateTaskInput {
  scopeType: ScopeType;
  scopeId?: string;
  title: string;
  description: string;
  taskType: TaskType;
  taskDomain?: TaskDomain;
  severity?: TaskSeverity;
  urgency?: TaskUrgency;
  status?: TaskStatus;
  category?: string;
  resolution?: string;
  file?: string;
  startLine?: number;
  endLine?: number;
  assignee?: string;
  reporter?: string;
  parentTaskId?: string;
  blockedBy?: string[];
  dueDate?: string;
  estimatedMinutes?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

/** Input for updating a task */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  taskType?: TaskType;
  taskDomain?: TaskDomain;
  severity?: TaskSeverity;
  urgency?: TaskUrgency;
  status?: TaskStatus;
  category?: string;
  resolution?: string;
  file?: string;
  startLine?: number;
  endLine?: number;
  assignee?: string;
  parentTaskId?: string;
  blockedBy?: string[];
  dueDate?: string;
  startedAt?: string;
  resolvedAt?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  updatedBy?: string;
}

/** Filter for listing tasks */
export interface ListTasksFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  status?: TaskStatus;
  taskType?: TaskType;
  taskDomain?: TaskDomain;
  severity?: TaskSeverity;
  urgency?: TaskUrgency;
  category?: string;
  assignee?: string;
  parentTaskId?: string;
  includeInactive?: boolean;
  inherit?: boolean;
}

// =============================================================================
// REPOSITORY INTERFACE
// =============================================================================

export interface ITaskRepository {
  // Standard CRUD
  create(input: CreateTaskInput): Promise<Task>;
  getById(id: string): Promise<Task | undefined>;
  getByIds(ids: string[]): Promise<Task[]>;
  list(filter?: ListTasksFilter, options?: PaginationOptions): Promise<Task[]>;
  update(id: string, input: UpdateTaskInput): Promise<Task | undefined>;
  deactivate(id: string): Promise<boolean>;
  reactivate(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;

  // Task-specific operations
  updateStatus(id: string, status: TaskStatus, updatedBy?: string): Promise<Task | undefined>;
  listByStatus(status: TaskStatus, filter?: Omit<ListTasksFilter, 'status'>): Promise<Task[]>;
  listBlocked(): Promise<Task[]>;
  getSubtasks(parentTaskId: string): Promise<Task[]>;
  addBlocker(taskId: string, blockerId: string, updatedBy?: string): Promise<Task | undefined>;
  removeBlocker(taskId: string, blockerId: string, updatedBy?: string): Promise<Task | undefined>;
}

// =============================================================================
// TASK REPOSITORY FACTORY
// =============================================================================

/**
 * Generate a task ID with task_ prefix
 */
function generateTaskId(): string {
  return `task_${nanoid()}`;
}

/**
 * Parse blockedBy JSON field to array
 */
function parseBlockedBy(blockedByJson: string | null): string[] {
  if (!blockedByJson) return [];
  try {
    const parsed = JSON.parse(blockedByJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Serialize blockedBy array to JSON string
 */
function serializeBlockedBy(blockedBy: string[] | undefined): string | null {
  if (!blockedBy || blockedBy.length === 0) return null;
  return JSON.stringify(blockedBy);
}

/**
 * Serialize tags array to JSON string
 */
function serializeTags(tags: string[] | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  return JSON.stringify(tags);
}

/**
 * Serialize metadata object to JSON string
 */
function serializeMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  return JSON.stringify(metadata);
}

/**
 * Create a task repository with injected database dependencies
 */
export function createTaskRepository(deps: DatabaseDeps): ITaskRepository {
  const { db, sqlite } = deps;

  // Helper to get a task by ID
  function getByIdSync(id: string): Task | undefined {
    return db.select().from(tasks).where(eq(tasks.id, id)).get();
  }

  const repo: ITaskRepository = {
    async create(input: CreateTaskInput): Promise<Task> {
      return await transactionWithRetry(sqlite, () => {
        const taskId = generateTaskId();
        const now = new Date().toISOString();

        const entry: NewTask = {
          id: taskId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          title: input.title,
          description: input.description,
          taskType: input.taskType,
          taskDomain: input.taskDomain ?? 'agent',
          severity: input.severity ?? 'medium',
          urgency: input.urgency ?? 'normal',
          status: input.status ?? 'open',
          category: input.category,
          resolution: input.resolution,
          file: input.file,
          startLine: input.startLine,
          endLine: input.endLine,
          assignee: input.assignee,
          reporter: input.reporter,
          parentTaskId: input.parentTaskId,
          blockedBy: serializeBlockedBy(input.blockedBy),
          dueDate: input.dueDate,
          estimatedMinutes: input.estimatedMinutes,
          tags: serializeTags(input.tags),
          metadata: serializeMetadata(input.metadata),
          createdAt: now,
          createdBy: input.createdBy,
          updatedAt: now,
          updatedBy: input.createdBy,
          isActive: true,
        };

        db.insert(tasks).values(entry).run();

        const result = getByIdSync(taskId);
        if (!result) {
          throw createValidationError('task', `failed to create task ${taskId}`);
        }

        return result;
      });
    },

    async getById(id: string): Promise<Task | undefined> {
      return getByIdSync(id);
    },

    async getByIds(ids: string[]): Promise<Task[]> {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(tasks)
        .where(and(inArray(tasks.id, ids), eq(tasks.isActive, true)))
        .all();
    },

    async list(
      filter: ListTasksFilter = {},
      options: PaginationOptions = {}
    ): Promise<Task[]> {
      const { limit, offset } = normalizePagination(options);

      // Build conditions using shared utility + task-specific conditions
      const conditions = buildScopeConditions(tasks, filter);

      if (filter.status !== undefined) {
        conditions.push(eq(tasks.status, filter.status));
      }
      if (filter.taskType !== undefined) {
        conditions.push(eq(tasks.taskType, filter.taskType));
      }
      if (filter.taskDomain !== undefined) {
        conditions.push(eq(tasks.taskDomain, filter.taskDomain));
      }
      if (filter.severity !== undefined) {
        conditions.push(eq(tasks.severity, filter.severity));
      }
      if (filter.urgency !== undefined) {
        conditions.push(eq(tasks.urgency, filter.urgency));
      }
      if (filter.category !== undefined) {
        conditions.push(eq(tasks.category, filter.category));
      }
      if (filter.assignee !== undefined) {
        conditions.push(eq(tasks.assignee, filter.assignee));
      }
      if (filter.parentTaskId !== undefined) {
        conditions.push(eq(tasks.parentTaskId, filter.parentTaskId));
      }

      let query = db.select().from(tasks);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      return query
        .orderBy(desc(tasks.urgency), desc(tasks.severity), asc(tasks.createdAt))
        .limit(limit)
        .offset(offset)
        .all();
    },

    async update(id: string, input: UpdateTaskInput): Promise<Task | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        const now = new Date().toISOString();

        const updates: Partial<NewTask> = {
          updatedAt: now,
          updatedBy: input.updatedBy,
        };

        if (input.title !== undefined) updates.title = input.title;
        if (input.description !== undefined) updates.description = input.description;
        if (input.taskType !== undefined) updates.taskType = input.taskType;
        if (input.taskDomain !== undefined) updates.taskDomain = input.taskDomain;
        if (input.severity !== undefined) updates.severity = input.severity;
        if (input.urgency !== undefined) updates.urgency = input.urgency;
        if (input.status !== undefined) {
          updates.status = input.status;
          // Auto-set timestamps based on status transitions
          if (input.status === 'in_progress' && !existing.startedAt) {
            updates.startedAt = now;
          }
          if ((input.status === 'done' || input.status === 'wont_do') && !existing.resolvedAt) {
            updates.resolvedAt = now;
          }
        }
        if (input.category !== undefined) updates.category = input.category;
        if (input.resolution !== undefined) updates.resolution = input.resolution;
        if (input.file !== undefined) updates.file = input.file;
        if (input.startLine !== undefined) updates.startLine = input.startLine;
        if (input.endLine !== undefined) updates.endLine = input.endLine;
        if (input.assignee !== undefined) updates.assignee = input.assignee;
        if (input.parentTaskId !== undefined) updates.parentTaskId = input.parentTaskId;
        if (input.blockedBy !== undefined) updates.blockedBy = serializeBlockedBy(input.blockedBy);
        if (input.dueDate !== undefined) updates.dueDate = input.dueDate;
        if (input.startedAt !== undefined) updates.startedAt = input.startedAt;
        if (input.resolvedAt !== undefined) updates.resolvedAt = input.resolvedAt;
        if (input.estimatedMinutes !== undefined) updates.estimatedMinutes = input.estimatedMinutes;
        if (input.actualMinutes !== undefined) updates.actualMinutes = input.actualMinutes;
        if (input.tags !== undefined) updates.tags = serializeTags(input.tags);
        if (input.metadata !== undefined) updates.metadata = serializeMetadata(input.metadata);

        db.update(tasks).set(updates).where(eq(tasks.id, id)).run();

        return getByIdSync(id);
      });
    },

    async deactivate(id: string): Promise<boolean> {
      const result = db
        .update(tasks)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(tasks.id, id))
        .run();
      return result.changes > 0;
    },

    async reactivate(id: string): Promise<boolean> {
      const result = db
        .update(tasks)
        .set({ isActive: true, updatedAt: new Date().toISOString() })
        .where(eq(tasks.id, id))
        .run();
      return result.changes > 0;
    },

    async delete(id: string): Promise<boolean> {
      return await transactionWithRetry(sqlite, () => {
        // Delete related records (tags, relations, etc.)
        // Note: Tasks use 'task' as entry type if supported, otherwise skip
        // For now, tasks don't have entry tags/relations in the same way

        // Delete the task
        const deleteResult = db.delete(tasks).where(eq(tasks.id, id)).run();
        return deleteResult.changes > 0;
      });
    },

    // Task-specific operations

    async updateStatus(
      id: string,
      status: TaskStatus,
      updatedBy?: string
    ): Promise<Task | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        const now = new Date().toISOString();
        const updates: Partial<NewTask> = {
          status,
          updatedAt: now,
          updatedBy,
        };

        // Auto-set timestamps based on status transitions
        if (status === 'in_progress' && !existing.startedAt) {
          updates.startedAt = now;
        }
        if ((status === 'done' || status === 'wont_do') && !existing.resolvedAt) {
          updates.resolvedAt = now;
        }

        db.update(tasks).set(updates).where(eq(tasks.id, id)).run();

        return getByIdSync(id);
      });
    },

    async listByStatus(
      status: TaskStatus,
      filter: Omit<ListTasksFilter, 'status'> = {}
    ): Promise<Task[]> {
      return this.list({ ...filter, status });
    },

    async listBlocked(): Promise<Task[]> {
      // Find all active tasks with status 'blocked' or that have blockedBy entries
      const blockedTasks = db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.isActive, true),
            eq(tasks.status, 'blocked')
          )
        )
        .all();

      // Also find tasks that have blockedBy set (even if not in blocked status)
      const tasksWithBlockers = db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.isActive, true),
            // blockedBy is not null and not empty
            // Note: This is a basic check; we check non-null
            // In practice, we need to filter in code for non-empty arrays
          )
        )
        .all()
        .filter((t) => {
          const blockers = parseBlockedBy(t.blockedBy);
          return blockers.length > 0;
        });

      // Deduplicate by ID
      const seenIds = new Set<string>();
      const result: Task[] = [];

      for (const task of [...blockedTasks, ...tasksWithBlockers]) {
        if (!seenIds.has(task.id)) {
          seenIds.add(task.id);
          result.push(task);
        }
      }

      return result;
    },

    async getSubtasks(parentTaskId: string): Promise<Task[]> {
      return db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.parentTaskId, parentTaskId),
            eq(tasks.isActive, true)
          )
        )
        .orderBy(asc(tasks.createdAt))
        .all();
    },

    async addBlocker(
      taskId: string,
      blockerId: string,
      updatedBy?: string
    ): Promise<Task | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(taskId);
        if (!existing) return undefined;

        // Validate blocker exists
        const blocker = getByIdSync(blockerId);
        if (!blocker) {
          throw createNotFoundError('task', blockerId);
        }

        // Prevent self-blocking
        if (taskId === blockerId) {
          throw createValidationError('blockerId', 'task cannot block itself');
        }

        const currentBlockers = parseBlockedBy(existing.blockedBy);

        // Check if already blocked by this task
        if (currentBlockers.includes(blockerId)) {
          return existing; // Already blocked, no change needed
        }

        const newBlockers = [...currentBlockers, blockerId];
        const now = new Date().toISOString();

        db.update(tasks)
          .set({
            blockedBy: serializeBlockedBy(newBlockers),
            status: 'blocked', // Auto-transition to blocked status
            updatedAt: now,
            updatedBy,
          })
          .where(eq(tasks.id, taskId))
          .run();

        return getByIdSync(taskId);
      });
    },

    async removeBlocker(
      taskId: string,
      blockerId: string,
      updatedBy?: string
    ): Promise<Task | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(taskId);
        if (!existing) return undefined;

        const currentBlockers = parseBlockedBy(existing.blockedBy);

        // Check if this task is actually blocking
        if (!currentBlockers.includes(blockerId)) {
          return existing; // Not blocked by this task, no change needed
        }

        const newBlockers = currentBlockers.filter((id) => id !== blockerId);
        const now = new Date().toISOString();

        const updates: Partial<NewTask> = {
          blockedBy: serializeBlockedBy(newBlockers),
          updatedAt: now,
          updatedBy,
        };

        // If no more blockers, transition out of blocked status
        if (newBlockers.length === 0 && existing.status === 'blocked') {
          updates.status = 'open'; // Return to open status when unblocked
        }

        db.update(tasks).set(updates).where(eq(tasks.id, taskId)).run();

        return getByIdSync(taskId);
      });
    },
  };

  return repo;
}

// Re-export types for convenience
export type {
  Task,
  NewTask,
  TaskType,
  TaskDomain,
  TaskSeverity,
  TaskUrgency,
  TaskStatus,
} from '../schema.js';
