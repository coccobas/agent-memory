/**
 * Permissions table for fine-grained access control
 */

import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Permissions - fine-grained access control for agents/users
 */
export const permissions = sqliteTable(
  'permissions',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').notNull(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }),
    scopeId: text('scope_id'),
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge'] }),
    entryId: text('entry_id'),
    permission: text('permission', { enum: ['read', 'write', 'admin'] }).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_permissions_agent').on(table.agentId),
    index('idx_permissions_scope').on(table.scopeType, table.scopeId),
    index('idx_permissions_entry').on(table.entryType, table.entryId),
    uniqueIndex('idx_permissions_unique').on(
      table.agentId,
      table.scopeType,
      table.scopeId,
      table.entryType,
      table.entryId,
      table.permission
    ),
  ]
);

// Type exports
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
