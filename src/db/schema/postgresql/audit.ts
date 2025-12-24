/**
 * PostgreSQL Audit log table for compliance and debugging
 */

import { pgTable, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Audit log - tracks all actions for compliance and debugging
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id'),
    action: text('action').notNull(),
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge'] }),
    entryId: text('entry_id'),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }),
    scopeId: text('scope_id'),
    queryParams: jsonb('query_params'),
    resultCount: integer('result_count'),
    executionTime: integer('execution_time'),
    success: boolean('success').default(true),
    errorMessage: text('error_message'),
    subtaskType: text('subtask_type'),
    parentTaskId: text('parent_task_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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
