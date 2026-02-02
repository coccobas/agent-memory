/**
 * Topics Schema: Work context containers
 *
 * Topics represent ongoing work contexts that persist across sessions.
 * Unlike episodes (which complete), topics remain active/inactive.
 * Topics enable:
 * - Persistent work context across multiple sessions
 * - Embedding-based auto-resume via semantic similarity
 * - Grouping related episodes under a work context
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects } from './scopes.js';

/**
 * Topic status enum
 */
export type TopicStatus = 'active' | 'inactive';

/**
 * Topics - persistent work contexts
 */
export const topics = sqliteTable(
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
    embedding: text('embedding'), // JSON array of numbers

    // Metadata
    metadata: text('metadata'), // JSON

    // Lifecycle
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
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
