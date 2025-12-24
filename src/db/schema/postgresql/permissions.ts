/**
 * PostgreSQL Permissions table for fine-grained access control
 */

import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Permissions - fine-grained access control for agents/users
 */
export const permissions = pgTable(
  'permissions',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').notNull(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }),
    scopeId: text('scope_id'),
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge'] }),
    entryId: text('entry_id'),
    permission: text('permission', { enum: ['read', 'write', 'admin'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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
