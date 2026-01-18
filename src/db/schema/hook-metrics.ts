/**
 * Hook Metrics Schema
 *
 * Stores analytics data from Claude Code hooks:
 * - Tool execution metrics (PostToolUse)
 * - Subagent completion metrics (SubagentStop)
 * - Notification metrics (Notification)
 */

import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

// =============================================================================
// HOOK METRICS TABLE
// =============================================================================

export const hookMetrics = sqliteTable(
  'hook_metrics',
  {
    id: text('id').primaryKey().notNull(),
    metricType: text('metric_type', {
      enum: ['tool_execution', 'subagent', 'notification'],
    }).notNull(),
    sessionId: text('session_id'),
    projectId: text('project_id'),
    data: text('data').notNull(), // JSON string
    timestamp: text('timestamp').notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
  },
  (table) => ({
    sessionIdx: index('idx_hook_metrics_session').on(table.sessionId),
    typeIdx: index('idx_hook_metrics_type').on(table.metricType),
    timestampIdx: index('idx_hook_metrics_timestamp').on(table.timestamp),
    projectIdx: index('idx_hook_metrics_project').on(table.projectId),
  })
);

// =============================================================================
// TYPES
// =============================================================================

export type HookMetric = typeof hookMetrics.$inferSelect;
export type NewHookMetric = typeof hookMetrics.$inferInsert;

export type HookMetricType = 'tool_execution' | 'subagent' | 'notification';

/**
 * Tool execution metric data stored in the data field
 */
export interface ToolExecutionMetricData {
  toolName: string;
  durationMs?: number;
  success: boolean;
  errorType?: string;
  inputSize?: number;
  outputSize?: number;
  fileType?: string; // For Read/Edit/Write operations
  commandCategory?: string; // For Bash commands
}

/**
 * Subagent completion metric data
 */
export interface SubagentMetricData {
  subagentId: string;
  subagentType: string;
  parentSessionId?: string;
  durationMs?: number;
  success: boolean;
  resultSize?: number;
  delegationDepth?: number;
}

/**
 * Notification metric data
 */
export interface NotificationMetricData {
  type: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category?: string;
}
