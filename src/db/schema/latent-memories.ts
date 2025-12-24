/**
 * Latent Memories - Compressed embedding representations for efficient semantic search
 *
 * Latent memories store pre-computed embeddings (both full and compressed) for memory entries,
 * enabling fast semantic search without recomputing embeddings. Supports dimensionality reduction
 * techniques like PCA, random projection, and quantization.
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Latent Memories - Embedding storage for semantic search
 *
 * Stores full and reduced-dimension embeddings for memory entries to support
 * efficient semantic similarity search and retrieval.
 */
export const latentMemories = sqliteTable(
  'latent_memories',
  {
    id: text('id').primaryKey(),

    // Source reference
    sourceType: text('source_type', {
      enum: ['tool', 'guideline', 'knowledge', 'experience', 'conversation']
    }).notNull(),
    sourceId: text('source_id').notNull(),
    sourceVersionId: text('source_version_id'),

    // Embeddings (stored as JSON arrays)
    fullEmbedding: text('full_embedding', { mode: 'json' })
      .$type<number[]>()
      .notNull(),
    reducedEmbedding: text('reduced_embedding', { mode: 'json' })
      .$type<number[]>(),

    // Embedding dimensions
    fullDimension: integer('full_dimension').notNull(),
    reducedDimension: integer('reduced_dimension'),

    // Compression method used
    compressionMethod: text('compression_method', {
      enum: ['pca', 'random_projection', 'quantized', 'none']
    }).default('none').notNull(),

    // Text preview for debugging and display
    textPreview: text('text_preview'),

    // Importance/relevance scoring
    importanceScore: real('importance_score').default(0.5).notNull(),

    // Optional session scoping for temporary embeddings
    sessionId: text('session_id'),

    // TTL support for ephemeral embeddings
    expiresAt: text('expires_at'),

    // Audit and access tracking
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    lastAccessedAt: text('last_accessed_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    accessCount: integer('access_count').default(0).notNull(),

    // Active flag for soft deletion
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  },
  (table) => [
    // Source lookup - find embeddings for a specific memory entry
    index('idx_latent_memories_source').on(table.sourceType, table.sourceId),

    // Session scoping - retrieve session-specific embeddings
    index('idx_latent_memories_session').on(table.sessionId),

    // Importance-based retrieval - prioritize high-importance memories
    index('idx_latent_memories_importance').on(table.importanceScore),

    // Access tracking - identify frequently/recently accessed embeddings
    index('idx_latent_memories_accessed').on(table.lastAccessedAt),

    // Active status filtering
    index('idx_latent_memories_active').on(table.isActive),

    // TTL cleanup - efficiently find expired embeddings
    index('idx_latent_memories_expires').on(table.expiresAt),

    // Uniqueness constraint - one embedding per source version
    uniqueIndex('idx_latent_memories_unique').on(
      table.sourceType,
      table.sourceId,
      table.sourceVersionId
    ),
  ]
);

// Type exports
export type LatentMemory = typeof latentMemories.$inferSelect;
export type NewLatentMemory = typeof latentMemories.$inferInsert;
