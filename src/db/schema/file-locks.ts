/**
 * File locks table for multi-agent coordination
 */

import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { sessions } from './scopes.js';
import { projects } from './scopes.js';

/**
 * File locks - tracks filesystem files checked out by agents
 */
export const fileLocks = sqliteTable(
  'file_locks',
  {
    id: text('id').primaryKey(),
    filePath: text('file_path').notNull(),
    checkedOutBy: text('checked_out_by').notNull(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    checkedOutAt: text('checked_out_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    expiresAt: text('expires_at'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
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
