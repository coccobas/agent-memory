/**
 * Entry embeddings tracking table
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Entry embeddings - tracks which entries have embeddings generated
 */
export const entryEmbeddings = sqliteTable(
  'entry_embeddings',
  {
    id: text('id').primaryKey(),
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge'] }).notNull(),
    entryId: text('entry_id').notNull(),
    versionId: text('version_id').notNull(),
    hasEmbedding: integer('has_embedding', { mode: 'boolean' }).default(false).notNull(),
    embeddingModel: text('embedding_model'),
    embeddingProvider: text('embedding_provider', { enum: ['openai', 'local', 'disabled'] }),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_entry_embeddings_entry').on(table.entryType, table.entryId),
    index('idx_entry_embeddings_status').on(table.hasEmbedding),
    uniqueIndex('idx_entry_embeddings_version').on(table.entryType, table.entryId, table.versionId),
  ]
);

// Type exports
export type EntryEmbedding = typeof entryEmbeddings.$inferSelect;
export type NewEntryEmbedding = typeof entryEmbeddings.$inferInsert;
