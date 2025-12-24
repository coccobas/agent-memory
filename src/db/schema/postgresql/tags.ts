/**
 * PostgreSQL Tags table
 */

import { pgTable, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Tags - controlled vocabulary plus free-form tags
 */
export const tags = pgTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category', { enum: ['language', 'domain', 'category', 'meta', 'custom'] }),
    isPredefined: boolean('is_predefined').default(false).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('idx_tags_name').on(table.name)]
);

// Type exports
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
