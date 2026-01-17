/**
 * Memory entry tables: Tools, Guidelines, Knowledge (and their versions)
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Tools - registry of tool definitions (MCP, CLI, functions, APIs)
 */
export const tools = sqliteTable(
  'tools',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),
    name: text('name').notNull(),
    category: text('category', { enum: ['mcp', 'cli', 'function', 'api'] }),
    currentVersionId: text('current_version_id'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    // Access tracking for forgetting
    lastAccessedAt: text('last_accessed_at'),
    accessCount: integer('access_count').default(0),
  },
  (table) => [
    index('idx_tools_scope').on(table.scopeType, table.scopeId),
    uniqueIndex('idx_tools_scope_name').on(table.scopeType, table.scopeId, table.name),
    index('idx_tools_active').on(table.isActive),
    index('idx_tools_created').on(table.createdAt),
    // Composite index for common query pattern: active entries within a scope
    index('idx_tools_scope_active').on(table.scopeType, table.scopeId, table.isActive),
  ]
);

/**
 * Tool versions - append-only history of tool definitions
 */
export const toolVersions = sqliteTable(
  'tool_versions',
  {
    id: text('id').primaryKey(),
    toolId: text('tool_id')
      .references(() => tools.id, { onDelete: 'cascade' })
      .notNull(),
    versionNum: integer('version_num').notNull(),
    description: text('description'),
    parameters: text('parameters', { mode: 'json' }).$type<Record<string, unknown>>(),
    examples: text('examples', { mode: 'json' }).$type<unknown[]>(),
    constraints: text('constraints'),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    changeReason: text('change_reason'),
    conflictFlag: integer('conflict_flag', { mode: 'boolean' }).default(false).notNull(),
  },
  (table) => [
    index('idx_tool_versions_tool').on(table.toolId),
    uniqueIndex('idx_tool_versions_unique').on(table.toolId, table.versionNum),
  ]
);

/**
 * Guidelines - behavioral rules and preferences
 */
export const guidelines = sqliteTable(
  'guidelines',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),
    name: text('name').notNull(),
    category: text('category'),
    priority: integer('priority').default(50).notNull(),
    currentVersionId: text('current_version_id'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    // Access tracking for forgetting
    lastAccessedAt: text('last_accessed_at'),
    accessCount: integer('access_count').default(0),
  },
  (table) => [
    index('idx_guidelines_scope').on(table.scopeType, table.scopeId),
    uniqueIndex('idx_guidelines_scope_name').on(table.scopeType, table.scopeId, table.name),
    index('idx_guidelines_active').on(table.isActive),
    index('idx_guidelines_created').on(table.createdAt),
    // Composite index for common query pattern: active entries within a scope
    index('idx_guidelines_scope_active').on(table.scopeType, table.scopeId, table.isActive),
  ]
);

/**
 * Guideline versions - append-only history of guidelines
 */
export const guidelineVersions = sqliteTable(
  'guideline_versions',
  {
    id: text('id').primaryKey(),
    guidelineId: text('guideline_id')
      .references(() => guidelines.id, { onDelete: 'cascade' })
      .notNull(),
    versionNum: integer('version_num').notNull(),
    content: text('content').notNull(),
    rationale: text('rationale'),
    examples: text('examples', { mode: 'json' }).$type<{ bad?: string[]; good?: string[] }>(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    changeReason: text('change_reason'),
    conflictFlag: integer('conflict_flag', { mode: 'boolean' }).default(false).notNull(),
    // Machine-readable verification rules for automated compliance checking
    verificationRules: text('verification_rules', { mode: 'json' }).$type<{
      filePatterns?: string[];
      contentPatterns?: string[];
      forbiddenActions?: string[];
      requiredPatterns?: string[];
    }>(),
  },
  (table) => [
    index('idx_guideline_versions_guideline').on(table.guidelineId),
    uniqueIndex('idx_guideline_versions_unique').on(table.guidelineId, table.versionNum),
  ]
);

/**
 * Knowledge - general facts, decisions, context
 */
export const knowledge = sqliteTable(
  'knowledge',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),
    title: text('title').notNull(),
    category: text('category', { enum: ['decision', 'fact', 'context', 'reference'] }),
    currentVersionId: text('current_version_id'),
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    // Access tracking for forgetting
    lastAccessedAt: text('last_accessed_at'),
    accessCount: integer('access_count').default(0),
  },
  (table) => [
    index('idx_knowledge_scope').on(table.scopeType, table.scopeId),
    uniqueIndex('idx_knowledge_scope_title').on(table.scopeType, table.scopeId, table.title),
    index('idx_knowledge_active').on(table.isActive),
    index('idx_knowledge_created').on(table.createdAt),
    // Composite index for common query pattern: active entries within a scope
    index('idx_knowledge_scope_active').on(table.scopeType, table.scopeId, table.isActive),
  ]
);

/**
 * Knowledge versions - append-only history of knowledge entries
 */
export const knowledgeVersions = sqliteTable(
  'knowledge_versions',
  {
    id: text('id').primaryKey(),
    knowledgeId: text('knowledge_id')
      .references(() => knowledge.id, { onDelete: 'cascade' })
      .notNull(),
    versionNum: integer('version_num').notNull(),
    content: text('content').notNull(),
    source: text('source'),
    confidence: real('confidence').default(1.0).notNull(),
    // Temporal validity for knowledge graphs
    validFrom: text('valid_from'), // When this knowledge becomes valid
    validUntil: text('valid_until'), // When this knowledge expires
    invalidatedBy: text('invalidated_by'), // ID of entry that supersedes this
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    changeReason: text('change_reason'),
    conflictFlag: integer('conflict_flag', { mode: 'boolean' }).default(false).notNull(),
  },
  (table) => [
    index('idx_knowledge_versions_knowledge').on(table.knowledgeId),
    uniqueIndex('idx_knowledge_versions_unique').on(table.knowledgeId, table.versionNum),
  ]
);

// Type exports
export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;

export type ToolVersion = typeof toolVersions.$inferSelect;
export type NewToolVersion = typeof toolVersions.$inferInsert;

export type Guideline = typeof guidelines.$inferSelect;
export type NewGuideline = typeof guidelines.$inferInsert;

export type GuidelineVersion = typeof guidelineVersions.$inferSelect;
export type NewGuidelineVersion = typeof guidelineVersions.$inferInsert;

export type Knowledge = typeof knowledge.$inferSelect;
export type NewKnowledge = typeof knowledge.$inferInsert;

export type KnowledgeVersion = typeof knowledgeVersions.$inferSelect;
export type NewKnowledgeVersion = typeof knowledgeVersions.$inferInsert;
