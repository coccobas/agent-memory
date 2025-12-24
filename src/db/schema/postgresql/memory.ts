/**
 * PostgreSQL Memory entry tables: Tools, Guidelines, Knowledge (and their versions)
 *
 * Note: tsvector columns for FTS are created via migrations and updated via triggers.
 * They are not defined in the Drizzle schema to keep schema generation simple.
 */

import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Tools - registry of tool definitions (MCP, CLI, functions, APIs)
 */
export const tools = pgTable(
  'tools',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),
    name: text('name').notNull(),
    category: text('category', { enum: ['mcp', 'cli', 'function', 'api'] }),
    currentVersionId: text('current_version_id'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    // Note: search_vector tsvector column added via migration
  },
  (table) => [
    index('idx_tools_scope').on(table.scopeType, table.scopeId),
    uniqueIndex('idx_tools_scope_name').on(table.scopeType, table.scopeId, table.name),
    // Note: GIN index on search_vector added via migration
  ]
);

/**
 * Tool versions - append-only history of tool definitions
 */
export const toolVersions = pgTable(
  'tool_versions',
  {
    id: text('id').primaryKey(),
    toolId: text('tool_id')
      .references(() => tools.id, { onDelete: 'cascade' })
      .notNull(),
    versionNum: integer('version_num').notNull(),
    description: text('description'),
    parameters: jsonb('parameters').$type<Record<string, unknown>>(),
    examples: jsonb('examples').$type<unknown[]>(),
    constraints: text('constraints'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    changeReason: text('change_reason'),
    conflictFlag: boolean('conflict_flag').default(false).notNull(),
  },
  (table) => [
    index('idx_tool_versions_tool').on(table.toolId),
    uniqueIndex('idx_tool_versions_unique').on(table.toolId, table.versionNum),
  ]
);

/**
 * Guidelines - behavioral rules and preferences
 */
export const guidelines = pgTable(
  'guidelines',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),
    name: text('name').notNull(),
    category: text('category'),
    priority: integer('priority').default(50).notNull(),
    currentVersionId: text('current_version_id'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    // Note: search_vector tsvector column added via migration
  },
  (table) => [
    index('idx_guidelines_scope').on(table.scopeType, table.scopeId),
    uniqueIndex('idx_guidelines_scope_name').on(table.scopeType, table.scopeId, table.name),
    // Note: GIN index on search_vector added via migration
  ]
);

/**
 * Guideline versions - append-only history of guidelines
 */
export const guidelineVersions = pgTable(
  'guideline_versions',
  {
    id: text('id').primaryKey(),
    guidelineId: text('guideline_id')
      .references(() => guidelines.id, { onDelete: 'cascade' })
      .notNull(),
    versionNum: integer('version_num').notNull(),
    content: text('content').notNull(),
    rationale: text('rationale'),
    examples: jsonb('examples').$type<{ bad?: string[]; good?: string[] }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    changeReason: text('change_reason'),
    conflictFlag: boolean('conflict_flag').default(false).notNull(),
    // Machine-readable verification rules for automated compliance checking
    verificationRules: jsonb('verification_rules').$type<{
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
export const knowledge = pgTable(
  'knowledge',
  {
    id: text('id').primaryKey(),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    scopeId: text('scope_id'),
    title: text('title').notNull(),
    category: text('category', { enum: ['decision', 'fact', 'context', 'reference'] }),
    currentVersionId: text('current_version_id'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    // Note: search_vector tsvector column added via migration
  },
  (table) => [
    index('idx_knowledge_scope').on(table.scopeType, table.scopeId),
    uniqueIndex('idx_knowledge_scope_title').on(table.scopeType, table.scopeId, table.title),
    // Note: GIN index on search_vector added via migration
  ]
);

/**
 * Knowledge versions - append-only history of knowledge entries
 */
export const knowledgeVersions = pgTable(
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
    validUntil: timestamp('valid_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    changeReason: text('change_reason'),
    conflictFlag: boolean('conflict_flag').default(false).notNull(),
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
