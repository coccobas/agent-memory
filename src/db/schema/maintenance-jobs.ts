/**
 * Maintenance Jobs table schema for Agent Memory
 *
 * Tracks background maintenance tasks executed by the Librarian service.
 * Jobs persist across process restarts and context clears, enabling
 * status queries and audit trail for maintenance operations.
 *
 * Design decisions:
 * - Non-versioned: Jobs are mutable operational records, not memory entries
 * - No scope inheritance: Jobs are standalone operational records
 * - Task progress stored as JSON: Simpler than separate table, adequate for query needs
 * - Request/result stored as JSON: Preserves full structure without schema coupling
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// TYPES
// =============================================================================

export type MaintenanceJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type MaintenanceTaskName =
  | 'consolidation'
  | 'forgetting'
  | 'graphBackfill'
  | 'latentPopulation'
  | 'tagRefinement'
  | 'semanticEdgeInference';

/**
 * Task progress structure (stored as JSON)
 */
export interface StoredTaskProgress {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

/**
 * Progress structure (stored as JSON)
 */
export interface StoredJobProgress {
  currentTask?: string;
  completedTasks: number;
  totalTasks: number;
  tasks: StoredTaskProgress[];
}

// =============================================================================
// TABLE DEFINITION
// =============================================================================

/**
 * Maintenance Jobs - tracks background maintenance task execution
 */
export const maintenanceJobs = sqliteTable(
  'maintenance_jobs',
  {
    id: text('id').primaryKey(), // job_<8-char-uuid>

    // Status
    status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] })
      .notNull()
      .default('pending'),

    // Request parameters (stored as JSON to avoid schema coupling)
    requestScopeType: text('request_scope_type', {
      enum: ['global', 'org', 'project', 'session'],
    }).notNull(),
    requestScopeId: text('request_scope_id'),
    requestTasks: text('request_tasks'), // JSON array of task names
    requestDryRun: integer('request_dry_run', { mode: 'boolean' }).default(false),
    requestInitiatedBy: text('request_initiated_by'),
    requestConfigOverrides: text('request_config_overrides'), // JSON object

    // Progress tracking (stored as JSON for simplicity)
    progress: text('progress'), // JSON: StoredJobProgress

    // Result (stored as JSON to preserve full structure)
    result: text('result'), // JSON: MaintenanceResult

    // Error tracking
    error: text('error'),

    // Timestamps
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => [
    // Status queries (list running, list completed, etc.)
    index('idx_maintenance_jobs_status').on(table.status),
    // Scope-based queries (jobs for a specific project)
    index('idx_maintenance_jobs_scope').on(table.requestScopeType, table.requestScopeId),
    // Time-based queries (recent jobs, cleanup old jobs)
    index('idx_maintenance_jobs_created_at').on(table.createdAt),
    // Composite: scope + status (common query pattern)
    index('idx_maintenance_jobs_scope_status').on(
      table.requestScopeType,
      table.requestScopeId,
      table.status
    ),
  ]
);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type MaintenanceJobRecord = typeof maintenanceJobs.$inferSelect;
export type NewMaintenanceJobRecord = typeof maintenanceJobs.$inferInsert;
