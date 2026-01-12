/**
 * PostgreSQL Entry embeddings tracking table
 */

import { pgTable, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Entry embeddings - tracks which entries have embeddings generated
 */
export const entryEmbeddings = pgTable(
  'entry_embeddings',
  {
    id: text('id').primaryKey(),
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge'] }).notNull(),
    entryId: text('entry_id').notNull(),
    versionId: text('version_id').notNull(),
    hasEmbedding: boolean('has_embedding').default(false).notNull(),
    embeddingModel: text('embedding_model'),
    embeddingProvider: text('embedding_provider', { enum: ['openai', 'lmstudio', 'local', 'disabled'] }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
