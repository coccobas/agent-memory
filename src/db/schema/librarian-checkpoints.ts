/**
 * Librarian Checkpoints tables: Incremental processing tracking
 *
 * The Librarian Agent uses these checkpoints to track what has been analyzed,
 * enabling incremental processing instead of re-analyzing everything each run.
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Checkpoint status enum
 */
export type CheckpointStatus = 'idle' | 'running' | 'paused';

/**
 * Librarian scope checkpoints - timestamp cursors for incremental processing
 *
 * Uses timestamp cursor approach: tracks last analyzed experience timestamp
 * to know where to resume from on next run.
 */
export const librarianScopeCheckpoints = sqliteTable(
  'librarian_scope_checkpoints',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),

    // Last analysis run info
    lastAnalysisRunId: text('last_analysis_run_id'),
    lastAnalysisAt: text('last_analysis_at'),

    // Timestamp cursor for incremental collection
    // This is the createdAt of the most recently analyzed experience
    lastExperienceCreatedAt: text('last_experience_created_at'),

    // Stats
    experiencesProcessed: integer('experiences_processed').default(0).notNull(),
    patternsDetected: integer('patterns_detected').default(0).notNull(),
    recommendationsGenerated: integer('recommendations_generated').default(0).notNull(),

    // Run state
    status: text('status', { enum: ['idle', 'running', 'paused'] })
      .default('idle')
      .notNull(),

    // Error tracking
    lastError: text('last_error'),
    consecutiveErrors: integer('consecutive_errors').default(0).notNull(),

    // Audit
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_librarian_checkpoints_scope').on(table.scopeType, table.scopeId),
    index('idx_librarian_checkpoints_status').on(table.status),
    index('idx_librarian_checkpoints_last_analysis').on(table.lastAnalysisAt),
  ]
);

// Type exports
export type LibrarianScopeCheckpoint = typeof librarianScopeCheckpoints.$inferSelect;
export type NewLibrarianScopeCheckpoint = typeof librarianScopeCheckpoints.$inferInsert;
