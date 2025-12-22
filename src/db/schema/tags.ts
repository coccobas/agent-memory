/**
 * Tags table
 */

import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Tags - controlled vocabulary plus free-form tags
 */
export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category', { enum: ['language', 'domain', 'category', 'meta', 'custom'] }),
    isPredefined: integer('is_predefined', { mode: 'boolean' }).default(false).notNull(),
    description: text('description'),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [uniqueIndex('idx_tags_name').on(table.name)]
);

// Type exports
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
