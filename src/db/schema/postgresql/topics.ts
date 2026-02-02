/**
 * PostgreSQL Topics Schema: Work context containers
 *
 * Topics represent ongoing work contexts that persist across sessions.
 * Unlike episodes (which complete), topics remain active/inactive.
 * Topics enable:
 * - Persistent work context across multiple sessions
 * - Embedding-based auto-resume via semantic similarity
 * - Grouping related episodes under a work context
 */

import { pgTable, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { projects } from './scopes.js';

/**
 * Topic status enum
 */
export type TopicStatus = 'active' | 'inactive';

/**
 * Topics - persistent work contexts
 */
export const topics = pgTable(
  'topics',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    description: text('description'),

    // Status
    status: text('status', {
      enum: ['active', 'inactive'],
    })
      .notNull()
      .default('active'),

    // Embedding for semantic similarity search
    embedding: jsonb('embedding').$type<number[]>(),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Lifecycle
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    isActive: integer('is_active').default(1).notNull(),
  },
  (table) => [
    index('idx_topics_project').on(table.projectId),
    index('idx_topics_name').on(table.name),
    index('idx_topics_status').on(table.status),
  ]
);

// Type exports
export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
