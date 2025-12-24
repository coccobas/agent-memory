/**
 * PostgreSQL Scope tables: Organizations, Projects, Sessions
 */

import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Organizations - top-level grouping for multi-user scenarios
 */
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

/**
 * Projects - belong to organizations, contain sessions and scoped entries
 */
export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').references(() => organizations.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    rootPath: text('root_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_projects_org').on(table.orgId),
    uniqueIndex('idx_projects_org_name').on(table.orgId, table.name),
  ]
);

/**
 * Sessions - working periods or scratch spaces within projects
 */
export const sessions = pgTable(
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
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
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
