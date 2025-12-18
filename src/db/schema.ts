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
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
});

/**
 * Projects - belong to organizations, contain sessions and scoped entries
 */
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').references(() => organizations.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    rootPath: text('root_path'),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_projects_org').on(table.orgId),
    uniqueIndex('idx_projects_org_name').on(table.orgId, table.name),
  ]
);

/**
 * Sessions - working periods or scratch spaces within projects
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name'),
    purpose: text('purpose'),
    agentId: text('agent_id'),
    status: text('status', { enum: ['active', 'paused', 'completed', 'discarded'] })
      .default('active')
      .notNull(),
    startedAt: text('started_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    endedAt: text('ended_at'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_sessions_project').on(table.projectId),
    index('idx_sessions_status').on(table.status),
  ]
);

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
  },
  (table) => [
    index('idx_tools_scope').on(table.scopeType, table.scopeId),
    uniqueIndex('idx_tools_scope_name').on(table.scopeType, table.scopeId, table.name),
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
    examples: text('examples', { mode: 'json' }).$type<Array<Record<string, unknown>>>(),
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
  },
  (table) => [
    index('idx_guidelines_scope').on(table.scopeType, table.scopeId),
    uniqueIndex('idx_guidelines_scope_name').on(table.scopeType, table.scopeId, table.name),
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
  },
  (table) => [
    index('idx_knowledge_scope').on(table.scopeType, table.scopeId),
    uniqueIndex('idx_knowledge_scope_title').on(table.scopeType, table.scopeId, table.title),
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
    validUntil: text('valid_until'),
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

// =============================================================================
// TAG & CROSS-REFERENCE TABLES
// =============================================================================

/**
 * Tags - controlled vocabulary plus free-form tags
 */
export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category', { enum: ['language', 'domain', 'category', 'meta', 'custom'] }),
    isPredefined: integer('is_predefined', { mode: 'boolean' }).default(false).notNull(),
    description: text('description'),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [uniqueIndex('idx_tags_name').on(table.name)]
);

/**
 * Entry type enum for polymorphic associations
 */
export type EntryType = 'tool' | 'guideline' | 'knowledge' | 'project';

/**
 * Permission entry type (subset of EntryType - excludes 'project')
 */
export type PermissionEntryType = 'tool' | 'guideline' | 'knowledge';

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
 * Relation type enum for entry relations
 */
export type RelationType =
  | 'applies_to'
  | 'depends_on'
  | 'conflicts_with'
  | 'related_to'
  | 'parent_task' // NEW: for task decomposition
  | 'subtask_of'; // NEW: inverse of parent_task

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

// =============================================================================
// FILE LOCK TABLES
// =============================================================================

/**
 * File locks - tracks filesystem files checked out by agents
 */
export const fileLocks = sqliteTable(
  'file_locks',
  {
    id: text('id').primaryKey(),
    filePath: text('file_path').notNull(),
    checkedOutBy: text('checked_out_by').notNull(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    checkedOutAt: text('checked_out_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    expiresAt: text('expires_at'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (table) => [
    uniqueIndex('idx_file_locks_path').on(table.filePath),
    index('idx_file_locks_agent').on(table.checkedOutBy),
    index('idx_file_locks_expires').on(table.expiresAt),
    index('idx_file_locks_project').on(table.projectId),
  ]
);

// =============================================================================
// EMBEDDING TRACKING TABLES
// =============================================================================

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

// =============================================================================
// PERMISSIONS TABLES
// =============================================================================

/**
 * Permissions - fine-grained access control for agents/users
 */
export const permissions = sqliteTable(
  'permissions',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').notNull(), // or userId for multi-user
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }),
    scopeId: text('scope_id'), // NULL = all scopes of this type
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge'] }),
    entryId: text('entry_id'), // NULL = all entries in scope
    permission: text('permission', { enum: ['read', 'write', 'admin'] }).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_permissions_agent').on(table.agentId),
    index('idx_permissions_scope').on(table.scopeType, table.scopeId),
    index('idx_permissions_entry').on(table.entryType, table.entryId),
    uniqueIndex('idx_permissions_unique').on(
      table.agentId,
      table.scopeType,
      table.scopeId,
      table.entryType,
      table.entryId,
      table.permission
    ),
  ]
);

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

export type EntryEmbedding = typeof entryEmbeddings.$inferSelect;
export type NewEntryEmbedding = typeof entryEmbeddings.$inferInsert;

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;

// =============================================================================
// AUDIT LOG TABLES
// =============================================================================

/**
 * Audit log - tracks all actions for compliance and debugging
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id'),
    action: text('action').notNull(), // 'query', 'create', 'update', 'delete'
    entryType: text('entry_type', { enum: ['tool', 'guideline', 'knowledge'] }),
    entryId: text('entry_id'),
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }),
    scopeId: text('scope_id'),
    queryParams: text('query_params', { mode: 'json' }), // For queries
    resultCount: integer('result_count'), // For queries
    executionTime: integer('execution_time'), // milliseconds
    success: integer('success', { mode: 'boolean' }).default(true), // boolean
    errorMessage: text('error_message'),
    subtaskType: text('subtask_type'),
    parentTaskId: text('parent_task_id'), // References parent task
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_audit_agent').on(table.agentId),
    index('idx_audit_action').on(table.action),
    index('idx_audit_entry').on(table.entryType, table.entryId),
    index('idx_audit_created').on(table.createdAt),
    index('idx_audit_execution').on(table.success, table.subtaskType),
    index('idx_audit_parent_task').on(table.parentTaskId),
  ]
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

// =============================================================================
// MULTI-AGENT VOTING TABLES
// =============================================================================

/**
 * Agent votes - tracks votes from multiple agents for consensus
 */
export const agentVotes = sqliteTable(
  'agent_votes',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull(), // References knowledge/tool entry
    agentId: text('agent_id').notNull(),
    voteValue: text('vote_value').notNull(), // JSON string of agent's answer
    confidence: real('confidence').default(1.0).notNull(), // 0-1
    reasoning: text('reasoning'), // Why this vote
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_votes_task').on(table.taskId),
    index('idx_votes_agent').on(table.agentId),
    uniqueIndex('idx_votes_unique').on(table.taskId, table.agentId),
  ]
);

export type AgentVote = typeof agentVotes.$inferSelect;
export type NewAgentVote = typeof agentVotes.$inferInsert;

// =============================================================================
// CONVERSATION HISTORY TABLES
// =============================================================================

/**
 * Conversation status enum
 */
export type ConversationStatus = 'active' | 'completed' | 'archived';

/**
 * Message role enum
 */
export type MessageRole = 'user' | 'agent' | 'system';

/**
 * Conversations - tracks conversation threads between agents and users
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    agentId: text('agent_id'),
    title: text('title'),
    status: text('status', { enum: ['active', 'completed', 'archived'] })
      .default('active')
      .notNull(),
    startedAt: text('started_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    endedAt: text('ended_at'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_conversations_session').on(table.sessionId),
    index('idx_conversations_project').on(table.projectId),
    index('idx_conversations_agent').on(table.agentId),
    index('idx_conversations_status').on(table.status),
    index('idx_conversations_started').on(table.startedAt),
  ]
);

/**
 * Conversation messages - individual messages in conversations
 */
export const conversationMessages = sqliteTable(
  'conversation_messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role', { enum: ['user', 'agent', 'system'] }).notNull(),
    content: text('content').notNull(),
    messageIndex: integer('message_index').notNull(),
    contextEntries: text('context_entries', {
      mode: 'json',
    }).$type<Array<{ type: EntryType; id: string }>>(),
    toolsUsed: text('tools_used', { mode: 'json' }).$type<string[]>(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_messages_conversation').on(table.conversationId),
    index('idx_messages_index').on(table.conversationId, table.messageIndex),
    index('idx_messages_role').on(table.conversationId, table.role),
  ]
);

/**
 * Conversation context - links memory entries to conversations/messages
 */
export const conversationContext = sqliteTable(
  'conversation_context',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    messageId: text('message_id').references(() => conversationMessages.id, {
      onDelete: 'cascade',
    }),
    entryType: text('entry_type', {
      enum: ['tool', 'guideline', 'knowledge'],
    }).notNull(),
    entryId: text('entry_id').notNull(),
    relevanceScore: real('relevance_score'),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_context_conversation').on(table.conversationId),
    index('idx_context_message').on(table.messageId),
    index('idx_context_entry').on(table.entryType, table.entryId),
    uniqueIndex('idx_context_unique').on(
      table.conversationId,
      table.messageId,
      table.entryType,
      table.entryId
    ),
  ]
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;
export type ConversationContext = typeof conversationContext.$inferSelect;
export type NewConversationContext = typeof conversationContext.$inferInsert;

// =============================================================================
// VERIFICATION TABLES
// =============================================================================

/**
 * Verification action type enum
 */
export type VerificationActionType = 'pre_check' | 'post_check' | 'acknowledge';

/**
 * Session guideline acknowledgments - tracks which guidelines have been acknowledged per session
 */
export const sessionGuidelineAcknowledgments = sqliteTable(
  'session_guideline_acknowledgments',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .references(() => sessions.id, { onDelete: 'cascade' })
      .notNull(),
    guidelineId: text('guideline_id')
      .references(() => guidelines.id, { onDelete: 'cascade' })
      .notNull(),
    acknowledgedAt: text('acknowledged_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    acknowledgedBy: text('acknowledged_by'),
  },
  (table) => [
    index('idx_session_acknowledgments_session').on(table.sessionId),
    uniqueIndex('idx_session_acknowledgments_unique').on(table.sessionId, table.guidelineId),
  ]
);

/**
 * Verification log - tracks all verification checks
 */
export const verificationLog = sqliteTable(
  'verification_log',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    actionType: text('action_type', {
      enum: ['pre_check', 'post_check', 'acknowledge'],
    }).notNull(),
    proposedAction: text('proposed_action', { mode: 'json' }).$type<{
      type: string;
      description?: string;
      filePath?: string;
      content?: string;
      metadata?: Record<string, unknown>;
    }>(),
    result: text('result', { mode: 'json' })
      .$type<{
        allowed: boolean;
        blocked: boolean;
        violations: Array<{
          guidelineId: string;
          guidelineName: string;
          severity: string;
          message: string;
          suggestedAction?: string;
        }>;
        warnings: string[];
        requiresConfirmation: boolean;
      }>()
      .notNull(),
    guidelineIds: text('guideline_ids', { mode: 'json' }).$type<string[]>(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_verification_log_session').on(table.sessionId),
    index('idx_verification_log_action_type').on(table.actionType),
    index('idx_verification_log_created_at').on(table.createdAt),
  ]
);

export type SessionGuidelineAcknowledgment = typeof sessionGuidelineAcknowledgments.$inferSelect;
export type NewSessionGuidelineAcknowledgment = typeof sessionGuidelineAcknowledgments.$inferInsert;
export type VerificationLog = typeof verificationLog.$inferSelect;
export type NewVerificationLog = typeof verificationLog.$inferInsert;
