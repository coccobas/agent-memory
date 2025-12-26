/**
 * Entity Index Schema
 *
 * Database schema for the entity index table used for entity-aware retrieval.
 * Entities are extracted from memory entry content and indexed for fast lookup.
 *
 * Example entities:
 * - FILE_PATH: /src/services/query.ts
 * - FUNCTION_NAME: executeQuery, MyClass
 * - PACKAGE_NAME: @org/package
 * - URL: https://example.com/api
 * - ERROR_CODE: E1234, TypeError
 * - COMMAND: npm run build, git commit
 */

import { sqliteTable, text, index, primaryKey } from 'drizzle-orm/sqlite-core';

/**
 * Entity type enumeration
 */
export const ENTITY_TYPES = [
  'FILE_PATH',
  'FUNCTION_NAME',
  'PACKAGE_NAME',
  'URL',
  'ERROR_CODE',
  'COMMAND',
  'CUSTOM',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * Entity index table - maps entities to memory entries
 *
 * Uses a composite primary key of (entity_value, entry_id) for deduplication.
 * Indexed on entity_value for fast lookups.
 */
export const entityIndex = sqliteTable(
  'entity_index',
  {
    /** The normalized entity value (e.g., lowercase path, normalized function name) */
    entityValue: text('entity_value').notNull(),
    /** The type of entity (FILE_PATH, FUNCTION_NAME, etc.) */
    entityType: text('entity_type', { enum: ENTITY_TYPES }).notNull(),
    /** The type of memory entry (tool, guideline, knowledge, experience) */
    entryType: text('entry_type', {
      enum: ['tool', 'guideline', 'knowledge', 'experience'],
    }).notNull(),
    /** The ID of the memory entry */
    entryId: text('entry_id').notNull(),
  },
  (table) => [
    // Composite primary key for deduplication
    primaryKey({ columns: [table.entityValue, table.entryId] }),
    // Index for fast entity lookups
    index('idx_entity_lookup').on(table.entityValue),
    // Index for finding all entities for an entry (for cleanup on entry deletion)
    index('idx_entity_entry_lookup').on(table.entryId),
    // Index for type-filtered lookups
    index('idx_entity_type_value').on(table.entityType, table.entityValue),
  ]
);

// Type exports
export type EntityIndexRow = typeof entityIndex.$inferSelect;
export type NewEntityIndexRow = typeof entityIndex.$inferInsert;
