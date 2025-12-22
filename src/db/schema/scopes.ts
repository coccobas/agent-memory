/**
 * Scope tables: Organizations, Projects, Sessions
 */

import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Organizations - top-level grouping for multi-user scenarios
 */
export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
});

/**
 * Projects - belong to organizations, contain sessions and scoped entries
 */
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').references(() => organizations.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    rootPath: text('root_path'),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_projects_org').on(table.orgId),
    uniqueIndex('idx_projects_org_name').on(table.orgId, table.name),
  ]
);

/**
 * Sessions - working periods or scratch spaces within projects
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name'),
    purpose: text('purpose'),
    agentId: text('agent_id'),
    status: text('status', { enum: ['active', 'paused', 'completed', 'discarded'] })
      .default('active')
      .notNull(),
    startedAt: text('started_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    endedAt: text('ended_at'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_sessions_project').on(table.projectId),
    index('idx_sessions_status').on(table.status),
  ]
);

// Type exports
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
