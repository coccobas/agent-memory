/**
 * Audit log table for compliance and debugging
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Audit log - tracks all actions for compliance and debugging
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id'),
    action: text('action').notNull(),
    entryType: text('entry_type', {
      enum: ['tool', 'guideline', 'knowledge', 'experience', 'permission'],
    }),
    entryId: text('entry_id'),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }),
    scopeId: text('scope_id'),
    queryParams: text('query_params', { mode: 'json' }),
    resultCount: integer('result_count'),
    executionTime: integer('execution_time'),
    success: integer('success', { mode: 'boolean' }).default(true),
    errorMessage: text('error_message'),
    subtaskType: text('subtask_type'),
    parentTaskId: text('parent_task_id'),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_audit_agent').on(table.agentId),
    index('idx_audit_action').on(table.action),
    index('idx_audit_entry').on(table.entryType, table.entryId),
    index('idx_audit_created').on(table.createdAt),
    index('idx_audit_execution').on(table.success, table.subtaskType),
    index('idx_audit_parent_task').on(table.parentTaskId),
  ]
);

// Type exports
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
