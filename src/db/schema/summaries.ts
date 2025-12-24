/**
 * Hierarchical Summaries - Multi-level memory consolidation
 *
 * Summaries enable hierarchical organization of memory entries through three levels:
 * - Level 0 (Chunk): Small groups of related entries (5-10 items)
 * - Level 1 (Topic): Collections of related chunks (3-5 chunks)
 * - Level 2 (Domain): High-level domain summaries (entire categories)
 *
 * Each summary can reference multiple members (entries or other summaries) and
 * optionally have a parent summary for hierarchical navigation.
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Hierarchy level enum
 */
export type HierarchyLevel = 0 | 1 | 2;

/**
 * Member type enum - what kind of entries can be summarized
 */
export type SummaryMemberType = 'tool' | 'guideline' | 'knowledge' | 'experience' | 'summary';

/**
 * Summaries - hierarchical memory consolidation
 *
 * Summaries aggregate and synthesize multiple memory entries into progressively
 * higher-level abstractions. They support semantic search, efficient retrieval,
 * and contextual understanding at scale.
 */
export const summaries = sqliteTable(
  'summaries',
  {
    id: text('id').primaryKey(),

    // Scope - where this summary belongs
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),

    // Hierarchy
    hierarchyLevel: integer('hierarchy_level').notNull(), // 0=chunk, 1=topic, 2=domain
    parentSummaryId: text('parent_summary_id'), // Self-reference to parent summary

    // Identity
    title: text('title').notNull(),
    content: text('content').notNull(), // The actual summary text

    // Metrics
    memberCount: integer('member_count').default(0).notNull(), // Number of direct members

    // Embeddings (stored as JSON array for semantic search)
    embedding: text('embedding', { mode: 'json' }).$type<number[]>(),
    embeddingDimension: integer('embedding_dimension'),

    // Quality metrics
    coherenceScore: real('coherence_score'), // How well members relate (0.0-1.0)
    compressionRatio: real('compression_ratio'), // Summary length / total member content length

    // Lifecycle
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    needsRegeneration: integer('needs_regeneration', { mode: 'boolean' }).default(false).notNull(),

    // Audit
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),

    // Access tracking
    lastAccessedAt: text('last_accessed_at'),
    accessCount: integer('access_count').default(0).notNull(),
  },
  (table) => [
    // Scope lookup - find summaries in a specific scope
    index('idx_summaries_scope').on(table.scopeType, table.scopeId),

    // Hierarchy navigation - find summaries by level
    index('idx_summaries_level').on(table.hierarchyLevel),

    // Parent-child relationships - find children of a summary
    index('idx_summaries_parent').on(table.parentSummaryId),

    // Active status filtering
    index('idx_summaries_active').on(table.isActive),

    // Regeneration queue - find summaries that need updating
    index('idx_summaries_needs_regen').on(table.needsRegeneration),

    // Access tracking - identify frequently accessed summaries
    index('idx_summaries_accessed').on(table.lastAccessedAt),

    // Composite index for scope + level queries
    index('idx_summaries_scope_level').on(table.scopeType, table.scopeId, table.hierarchyLevel),
  ]
);

/**
 * Summary Members - many-to-many relationship between summaries and their members
 *
 * A summary can have multiple members, and a member (entry or summary) can belong
 * to multiple summaries. This enables flexible hierarchical organization and
 * cross-cutting views of the memory space.
 */
export const summaryMembers = sqliteTable(
  'summary_members',
  {
    id: text('id').primaryKey(),

    // References
    summaryId: text('summary_id')
      .references(() => summaries.id, { onDelete: 'cascade' })
      .notNull(),
    memberType: text('member_type', {
      enum: ['tool', 'guideline', 'knowledge', 'experience', 'summary']
    }).notNull(),
    memberId: text('member_id').notNull(),

    // Metrics
    contributionScore: real('contribution_score'), // How important this member is to the summary (0.0-1.0)

    // Ordering (for maintaining stable presentation order)
    displayOrder: integer('display_order'),

    // Audit
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    // Summary lookup - find all members of a summary
    index('idx_summary_members_summary').on(table.summaryId),

    // Member lookup - find all summaries containing a specific member
    index('idx_summary_members_member').on(table.memberType, table.memberId),

    // Display order - maintain sorted retrieval
    index('idx_summary_members_order').on(table.summaryId, table.displayOrder),

    // Uniqueness constraint - a member can only appear once per summary
    uniqueIndex('idx_summary_members_unique').on(
      table.summaryId,
      table.memberType,
      table.memberId
    ),
  ]
);

// Type exports
export type Summary = typeof summaries.$inferSelect;
export type NewSummary = typeof summaries.$inferInsert;

export type SummaryMember = typeof summaryMembers.$inferSelect;
export type NewSummaryMember = typeof summaryMembers.$inferInsert;
