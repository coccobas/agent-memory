/**
 * Meta tables: Tags, Entry Tags, Relations, Conflicts
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { tags } from './tags.js';

/**
 * Entry tags - polymorphic many-to-many between entries and tags
 */
export const entryTags = sqliteTable(
  'entry_tags',
  {
    id: text('id').primaryKey(),
    entryType: text('entry_type', {
      enum: ['tool', 'guideline', 'knowledge', 'project'],
    }).notNull(),
    entryId: text('entry_id').notNull(),
    tagId: text('tag_id')
      .references(() => tags.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_entry_tags_entry').on(table.entryType, table.entryId),
    index('idx_entry_tags_tag').on(table.tagId),
    uniqueIndex('idx_entry_tags_unique').on(table.entryType, table.entryId, table.tagId),
  ]
);

/**
 * Entry relations - explicit links between entries
 */
export const entryRelations = sqliteTable(
  'entry_relations',
  {
    id: text('id').primaryKey(),
    sourceType: text('source_type', {
      enum: ['tool', 'guideline', 'knowledge', 'project'],
    }).notNull(),
    sourceId: text('source_id').notNull(),
    targetType: text('target_type', {
      enum: ['tool', 'guideline', 'knowledge', 'project'],
    }).notNull(),
    targetId: text('target_id').notNull(),
    relationType: text('relation_type', {
      enum: [
        'applies_to',
        'depends_on',
        'conflicts_with',
        'related_to',
        'parent_task',
        'subtask_of',
      ],
    }).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_relations_source').on(table.sourceType, table.sourceId),
    index('idx_relations_target').on(table.targetType, table.targetId),
    uniqueIndex('idx_relations_unique').on(
      table.sourceType,
      table.sourceId,
      table.targetType,
      table.targetId,
      table.relationType
    ),
  ]
);

/**
 * Conflict log - tracks concurrent write conflicts for resolution
 */
export const conflictLog = sqliteTable(
  'conflict_log',
  {
    id: text('id').primaryKey(),
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge'] }).notNull(),
    entryId: text('entry_id').notNull(),
    versionAId: text('version_a_id').notNull(),
    versionBId: text('version_b_id').notNull(),
    detectedAt: text('detected_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    resolved: integer('resolved', { mode: 'boolean' }).default(false).notNull(),
    resolution: text('resolution'),
    resolvedAt: text('resolved_at'),
    resolvedBy: text('resolved_by'),
  },
  (table) => [
    index('idx_conflicts_entry').on(table.entryType, table.entryId),
    index('idx_conflicts_unresolved')
      .on(table.entryType, table.entryId)
      .where(sql`resolved = 0`),
  ]
);

// Type exports
export type EntryTag = typeof entryTags.$inferSelect;
export type NewEntryTag = typeof entryTags.$inferInsert;

export type EntryRelation = typeof entryRelations.$inferSelect;
export type NewEntryRelation = typeof entryRelations.$inferInsert;

export type ConflictLog = typeof conflictLog.$inferSelect;
export type NewConflictLog = typeof conflictLog.$inferInsert;
