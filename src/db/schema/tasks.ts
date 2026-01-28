/**
 * Tasks table schema for Agent Memory
 *
 * Tasks represent work items that agents or users need to complete.
 * They support both agent-managed (auto-transitions) and physical
 * (manual human-managed) workflow domains.
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Task type enum - categorizes the nature of the task
 */
export type TaskType =
  | 'bug'
  | 'feature'
  | 'improvement'
  | 'debt'
  | 'research'
  | 'question'
  | 'other';

/**
 * Task domain enum - determines workflow automation
 * - agent: Automatic status transitions managed by the agent
 * - physical: Manual transitions requiring human intervention
 */
export type TaskDomain = 'agent' | 'physical';

/**
 * Task severity enum - impact level of the task
 */
export type TaskSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Task urgency enum - time sensitivity
 */
export type TaskUrgency = 'immediate' | 'soon' | 'normal' | 'later';

/**
 * Task status enum - workflow states
 */
export type TaskStatus =
  | 'backlog'
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'review'
  | 'done'
  | 'wont_do';

/**
 * Tasks - work items and issues to track
 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(), // task_<nanoid>

    // Scope
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),

    // Identity
    title: text('title').notNull(), // max 200 chars enforced at application level
    description: text('description').notNull(),
    taskType: text('task_type', {
      enum: ['bug', 'feature', 'improvement', 'debt', 'research', 'question', 'other'],
    }).notNull(),
    taskDomain: text('task_domain', { enum: ['agent', 'physical'] })
      .notNull()
      .default('agent'),
    severity: text('severity', { enum: ['critical', 'high', 'medium', 'low'] })
      .notNull()
      .default('medium'),
    urgency: text('urgency', { enum: ['immediate', 'soon', 'normal', 'later'] })
      .notNull()
      .default('normal'),
    category: text('category'), // Optional grouping category

    // Workflow
    status: text('status', {
      enum: ['backlog', 'open', 'in_progress', 'blocked', 'review', 'done', 'wont_do'],
    })
      .notNull()
      .default('open'),
    resolution: text('resolution'), // Explanation when done/wont_do

    // Location (optional file reference)
    file: text('file'),
    startLine: integer('start_line'),
    endLine: integer('end_line'),

    // Assignment
    assignee: text('assignee'), // Agent ID or user identifier
    reporter: text('reporter'), // Who created the task

    // Hierarchy and dependencies
    parentTaskId: text('parent_task_id'), // Self-reference for subtasks
    blockedBy: text('blocked_by'), // JSON array of task IDs

    // Scheduling
    dueDate: text('due_date'),
    startedAt: text('started_at'),
    resolvedAt: text('resolved_at'),

    // Effort tracking
    estimatedMinutes: integer('estimated_minutes'),
    actualMinutes: integer('actual_minutes'),

    // Flexible data
    tags: text('tags'), // JSON array of strings
    metadata: text('metadata'), // JSON object for extensibility

    // Audit
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedBy: text('updated_by'),

    // Soft delete
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),

    // Version history
    currentVersionId: text('current_version_id'),
  },
  (table) => [
    index('idx_tasks_scope').on(table.scopeType, table.scopeId),
    index('idx_tasks_status').on(table.status),
    index('idx_tasks_severity').on(table.severity),
    index('idx_tasks_urgency').on(table.urgency),
    index('idx_tasks_assignee').on(table.assignee),
    index('idx_tasks_parent').on(table.parentTaskId),
    index('idx_tasks_due_date').on(table.dueDate),
    index('idx_tasks_created_at').on(table.createdAt),
    index('idx_tasks_active').on(table.isActive),
    // Composite index for common query pattern: active entries within a scope
    index('idx_tasks_scope_active').on(table.scopeType, table.scopeId, table.isActive),
  ]
);

export const taskVersions = sqliteTable(
  'task_versions',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    versionNum: integer('version_num').notNull(),
    title: text('title'),
    description: text('description'),
    status: text('status', {
      enum: ['backlog', 'open', 'in_progress', 'blocked', 'review', 'done', 'wont_do'],
    }),
    resolution: text('resolution'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    changeReason: text('change_reason'),
    conflictFlag: integer('conflict_flag', { mode: 'boolean' }).default(false).notNull(),
  },
  (table) => [
    index('idx_task_versions_task').on(table.taskId),
    uniqueIndex('idx_task_versions_unique').on(table.taskId, table.versionNum),
  ]
);

// Type exports
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskVersion = typeof taskVersions.$inferSelect;
export type NewTaskVersion = typeof taskVersions.$inferInsert;
