import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// SCOPE TABLES
// =============================================================================

/**
 * Organizations - top-level grouping for multi-user scenarios
 */
export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
});

/**
 * Projects - belong to organizations, contain sessions and scoped entries
 */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  orgId: text('org_id').references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  rootPath: text('root_path'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
}, (table) => [
  index('idx_projects_org').on(table.orgId),
  uniqueIndex('idx_projects_org_name').on(table.orgId, table.name),
]);

/**
 * Sessions - working periods or scratch spaces within projects
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  name: text('name'),
  purpose: text('purpose'),
  agentId: text('agent_id'),
  status: text('status', { enum: ['active', 'paused', 'completed', 'discarded'] }).default('active').notNull(),
  startedAt: text('started_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  endedAt: text('ended_at'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
}, (table) => [
  index('idx_sessions_project').on(table.projectId),
  index('idx_sessions_status').on(table.status),
]);

// =============================================================================
// MEMORY SECTION TABLES
// =============================================================================

/**
 * Scope type enum for memory entries
 */
export type ScopeType = 'global' | 'org' | 'project' | 'session';

/**
 * Tools - registry of tool definitions (MCP, CLI, functions, APIs)
 */
export const tools = sqliteTable('tools', {
  id: text('id').primaryKey(),
  scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
  scopeId: text('scope_id'),
  name: text('name').notNull(),
  category: text('category', { enum: ['mcp', 'cli', 'function', 'api'] }),
  currentVersionId: text('current_version_id'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: text('created_by'),
}, (table) => [
  index('idx_tools_scope').on(table.scopeType, table.scopeId),
  uniqueIndex('idx_tools_scope_name').on(table.scopeType, table.scopeId, table.name),
]);

/**
 * Tool versions - append-only history of tool definitions
 */
export const toolVersions = sqliteTable('tool_versions', {
  id: text('id').primaryKey(),
  toolId: text('tool_id').references(() => tools.id).notNull(),
  versionNum: integer('version_num').notNull(),
  description: text('description'),
  parameters: text('parameters', { mode: 'json' }).$type<Record<string, unknown>>(),
  examples: text('examples', { mode: 'json' }).$type<Array<Record<string, unknown>>>(),
  constraints: text('constraints'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: text('created_by'),
  changeReason: text('change_reason'),
  conflictFlag: integer('conflict_flag', { mode: 'boolean' }).default(false).notNull(),
}, (table) => [
  index('idx_tool_versions_tool').on(table.toolId),
  uniqueIndex('idx_tool_versions_unique').on(table.toolId, table.versionNum),
]);

/**
 * Guidelines - behavioral rules and preferences
 */
export const guidelines = sqliteTable('guidelines', {
  id: text('id').primaryKey(),
  scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
  scopeId: text('scope_id'),
  name: text('name').notNull(),
  category: text('category'),
  priority: integer('priority').default(50).notNull(),
  currentVersionId: text('current_version_id'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: text('created_by'),
}, (table) => [
  index('idx_guidelines_scope').on(table.scopeType, table.scopeId),
  uniqueIndex('idx_guidelines_scope_name').on(table.scopeType, table.scopeId, table.name),
]);

/**
 * Guideline versions - append-only history of guidelines
 */
export const guidelineVersions = sqliteTable('guideline_versions', {
  id: text('id').primaryKey(),
  guidelineId: text('guideline_id').references(() => guidelines.id).notNull(),
  versionNum: integer('version_num').notNull(),
  content: text('content').notNull(),
  rationale: text('rationale'),
  examples: text('examples', { mode: 'json' }).$type<{ bad?: string[]; good?: string[] }>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: text('created_by'),
  changeReason: text('change_reason'),
  conflictFlag: integer('conflict_flag', { mode: 'boolean' }).default(false).notNull(),
}, (table) => [
  index('idx_guideline_versions_guideline').on(table.guidelineId),
  uniqueIndex('idx_guideline_versions_unique').on(table.guidelineId, table.versionNum),
]);

/**
 * Knowledge - general facts, decisions, context
 */
export const knowledge = sqliteTable('knowledge', {
  id: text('id').primaryKey(),
  scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
  scopeId: text('scope_id'),
  title: text('title').notNull(),
  category: text('category', { enum: ['decision', 'fact', 'context', 'reference'] }),
  currentVersionId: text('current_version_id'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: text('created_by'),
}, (table) => [
  index('idx_knowledge_scope').on(table.scopeType, table.scopeId),
  uniqueIndex('idx_knowledge_scope_title').on(table.scopeType, table.scopeId, table.title),
]);

/**
 * Knowledge versions - append-only history of knowledge entries
 */
export const knowledgeVersions = sqliteTable('knowledge_versions', {
  id: text('id').primaryKey(),
  knowledgeId: text('knowledge_id').references(() => knowledge.id).notNull(),
  versionNum: integer('version_num').notNull(),
  content: text('content').notNull(),
  source: text('source'),
  confidence: real('confidence').default(1.0).notNull(),
  validUntil: text('valid_until'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: text('created_by'),
  changeReason: text('change_reason'),
  conflictFlag: integer('conflict_flag', { mode: 'boolean' }).default(false).notNull(),
}, (table) => [
  index('idx_knowledge_versions_knowledge').on(table.knowledgeId),
  uniqueIndex('idx_knowledge_versions_unique').on(table.knowledgeId, table.versionNum),
]);

// =============================================================================
// TAG & CROSS-REFERENCE TABLES
// =============================================================================

/**
 * Tags - controlled vocabulary plus free-form tags
 */
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category', { enum: ['language', 'domain', 'category', 'meta', 'custom'] }),
  isPredefined: integer('is_predefined', { mode: 'boolean' }).default(false).notNull(),
  description: text('description'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex('idx_tags_name').on(table.name),
]);

/**
 * Entry type enum for polymorphic associations
 */
export type EntryType = 'tool' | 'guideline' | 'knowledge' | 'project';

/**
 * Entry tags - polymorphic many-to-many between entries and tags
 */
export const entryTags = sqliteTable('entry_tags', {
  id: text('id').primaryKey(),
  entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge', 'project'] }).notNull(),
  entryId: text('entry_id').notNull(),
  tagId: text('tag_id').references(() => tags.id).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index('idx_entry_tags_entry').on(table.entryType, table.entryId),
  index('idx_entry_tags_tag').on(table.tagId),
  uniqueIndex('idx_entry_tags_unique').on(table.entryType, table.entryId, table.tagId),
]);

/**
 * Relation type enum for entry relations
 */
export type RelationType = 'applies_to' | 'depends_on' | 'conflicts_with' | 'related_to';

/**
 * Entry relations - explicit links between entries
 */
export const entryRelations = sqliteTable('entry_relations', {
  id: text('id').primaryKey(),
  sourceType: text('source_type', { enum: ['tool', 'guideline', 'knowledge', 'project'] }).notNull(),
  sourceId: text('source_id').notNull(),
  targetType: text('target_type', { enum: ['tool', 'guideline', 'knowledge', 'project'] }).notNull(),
  targetId: text('target_id').notNull(),
  relationType: text('relation_type', { enum: ['applies_to', 'depends_on', 'conflicts_with', 'related_to'] }).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: text('created_by'),
}, (table) => [
  index('idx_relations_source').on(table.sourceType, table.sourceId),
  index('idx_relations_target').on(table.targetType, table.targetId),
  uniqueIndex('idx_relations_unique').on(table.sourceType, table.sourceId, table.targetType, table.targetId, table.relationType),
]);

/**
 * Conflict log - tracks concurrent write conflicts for resolution
 */
export const conflictLog = sqliteTable('conflict_log', {
  id: text('id').primaryKey(),
  entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge'] }).notNull(),
  entryId: text('entry_id').notNull(),
  versionAId: text('version_a_id').notNull(),
  versionBId: text('version_b_id').notNull(),
  detectedAt: text('detected_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  resolved: integer('resolved', { mode: 'boolean' }).default(false).notNull(),
  resolution: text('resolution'),
  resolvedAt: text('resolved_at'),
  resolvedBy: text('resolved_by'),
}, (table) => [
  index('idx_conflicts_entry').on(table.entryType, table.entryId),
  index('idx_conflicts_unresolved').on(table.entryType, table.entryId).where(sql`resolved = 0`),
]);

// =============================================================================
// FILE LOCK TABLES
// =============================================================================

/**
 * File locks - tracks filesystem files checked out by agents
 */
export const fileLocks = sqliteTable('file_locks', {
  id: text('id').primaryKey(),
  filePath: text('file_path').notNull(),
  checkedOutBy: text('checked_out_by').notNull(),
  sessionId: text('session_id').references(() => sessions.id),
  projectId: text('project_id').references(() => projects.id),
  checkedOutAt: text('checked_out_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: text('expires_at'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
}, (table) => [
  uniqueIndex('idx_file_locks_path').on(table.filePath),
  index('idx_file_locks_agent').on(table.checkedOutBy),
  index('idx_file_locks_expires').on(table.expiresAt),
  index('idx_file_locks_project').on(table.projectId),
]);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

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

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type EntryTag = typeof entryTags.$inferSelect;
export type NewEntryTag = typeof entryTags.$inferInsert;

export type EntryRelation = typeof entryRelations.$inferSelect;
export type NewEntryRelation = typeof entryRelations.$inferInsert;

export type ConflictLog = typeof conflictLog.$inferSelect;
export type NewConflictLog = typeof conflictLog.$inferInsert;

export type FileLock = typeof fileLocks.$inferSelect;
export type NewFileLock = typeof fileLocks.$inferInsert;
