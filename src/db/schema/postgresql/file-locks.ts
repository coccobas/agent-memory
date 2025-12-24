/**
 * PostgreSQL File locks table for multi-agent coordination
 */

import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sessions, projects } from './scopes.js';

/**
 * File locks - tracks filesystem files checked out by agents
 */
export const fileLocks = pgTable(
  'file_locks',
  {
    id: text('id').primaryKey(),
    filePath: text('file_path').notNull(),
    checkedOutBy: text('checked_out_by').notNull(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    checkedOutAt: timestamp('checked_out_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => [
    uniqueIndex('idx_file_locks_path').on(table.filePath),
    index('idx_file_locks_agent').on(table.checkedOutBy),
    index('idx_file_locks_expires').on(table.expiresAt),
    index('idx_file_locks_project').on(table.projectId),
  ]
);

// Type exports
export type FileLock = typeof fileLocks.$inferSelect;
export type NewFileLock = typeof fileLocks.$inferInsert;
