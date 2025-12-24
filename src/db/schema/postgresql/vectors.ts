/**
 * PostgreSQL Vector Embeddings Schema
 *
 * Schema for pgvector-based vector storage and similarity search.
 * Used when PostgreSQL is the main database backend.
 */

import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';

/**
 * Custom Drizzle type for pgvector's vector type
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns vectors in format: [0.1,0.2,0.3]
    const cleaned = value.replace(/^\[|\]$/g, '');
    return cleaned.split(',').map(Number);
  },
});

/**
 * Vector embeddings table - stores actual embedding vectors
 */
export const vectorEmbeddings = pgTable(
  'vector_embeddings',
  {
    id: text('id').primaryKey(),
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge', 'experience'] }).notNull(),
    entryId: text('entry_id').notNull(),
    versionId: text('version_id').notNull(),
    text: text('text').notNull(),
    embedding: vector('embedding').notNull(),
    model: text('model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_vector_embeddings_entry').on(table.entryType, table.entryId),
    index('idx_vector_embeddings_type').on(table.entryType),
    uniqueIndex('uq_vector_entry_version').on(table.entryType, table.entryId, table.versionId),
  ]
);

/**
 * Vector meta table - stores configuration like expected dimension
 */
export const vectorMeta = pgTable('_vector_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Type exports
export type VectorEmbedding = typeof vectorEmbeddings.$inferSelect;
export type NewVectorEmbedding = typeof vectorEmbeddings.$inferInsert;
export type VectorMeta = typeof vectorMeta.$inferSelect;
export type NewVectorMeta = typeof vectorMeta.$inferInsert;
