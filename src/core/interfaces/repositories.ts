/**
 * Repository Interfaces
 *
 * Defines contracts for all repository implementations.
 * Used for dependency injection and testing.
 */

import type {
  Tag,
  EntryTag,
  EntryRelation,
  EntryType,
  RelationType,
  Organization,
  Project,
  Session,
  FileLock,
  Guideline,
  GuidelineVersion,
  Knowledge,
  KnowledgeVersion,
  Tool,
  ToolVersion,
  Experience,
  ExperienceVersion,
  ExperienceTrajectoryStep,
  ExperienceLevel,
  ExperienceSource,
  ScopeType,
  // Graph types
  NodeType,
  EdgeType,
  GraphNode,
  NodeVersion,
  GraphEdge,
  GraphTraversalOptions,
  GraphPath,
  // Episode types
  Episode,
  EpisodeEvent,
  EpisodeStatus,
  EpisodeOutcomeType,
} from '../../db/schema.js';
import type { PaginationOptions } from '../../db/repositories/base.js';
import type { IConflictRepository, ListConflictsFilter } from '../../db/repositories/conflicts.js';
import type { ITaskRepository } from '../../db/repositories/tasks.js';
import type { IEvidenceRepository } from '../../db/repositories/evidence.js';

// Narrower type for conversation context entry types (excludes 'project')
export type ContextEntryType = 'tool' | 'guideline' | 'knowledge';

// =============================================================================
// TAG REPOSITORY
// =============================================================================

export interface CreateTagInput {
  name: string;
  category?: 'language' | 'domain' | 'category' | 'meta' | 'custom';
  isPredefined?: boolean;
  description?: string;
}

export interface ListTagsFilter {
  category?: 'language' | 'domain' | 'category' | 'meta' | 'custom';
  isPredefined?: boolean;
}

export interface ITagRepository {
  create(input: CreateTagInput): Promise<Tag>;
  getById(id: string): Promise<Tag | undefined>;
  getByName(name: string): Promise<Tag | undefined>;
  getOrCreate(
    name: string,
    category?: 'language' | 'domain' | 'category' | 'meta' | 'custom'
  ): Promise<Tag>;
  list(filter?: ListTagsFilter, options?: PaginationOptions): Promise<Tag[]>;
  delete(id: string): Promise<boolean>;
  seedPredefined(): Promise<void>;
}

// =============================================================================
// ENTRY TAG REPOSITORY
// =============================================================================

export interface AttachTagInput {
  entryType: EntryType;
  entryId: string;
  tagId?: string;
  tagName?: string;
}

export interface IEntryTagRepository {
  attach(input: AttachTagInput): Promise<EntryTag>;
  detach(entryType: EntryType, entryId: string, tagId: string): Promise<boolean>;
  getTagsForEntry(entryType: EntryType, entryId: string): Promise<Tag[]>;
  getEntriesWithTag(tagId: string, entryType?: EntryType): Promise<EntryTag[]>;
  removeAllFromEntry(entryType: EntryType, entryId: string): Promise<number>;
}

// =============================================================================
// ENTRY RELATION REPOSITORY
// =============================================================================

export interface CreateRelationInput {
  sourceType: EntryType;
  sourceId: string;
  targetType: EntryType;
  targetId: string;
  relationType: RelationType;
  createdBy?: string;
}

export interface ListRelationsFilter {
  sourceType?: EntryType;
  sourceId?: string;
  targetType?: EntryType;
  targetId?: string;
  relationType?: RelationType;
}

export interface IEntryRelationRepository {
  create(input: CreateRelationInput): Promise<EntryRelation>;
  getById(id: string): Promise<EntryRelation | undefined>;
  list(filter?: ListRelationsFilter, options?: PaginationOptions): Promise<EntryRelation[]>;
  getFromEntry(entryType: EntryType, entryId: string): Promise<EntryRelation[]>;
  getToEntry(entryType: EntryType, entryId: string): Promise<EntryRelation[]>;
  delete(id: string): Promise<boolean>;
  deleteByEntries(
    sourceType: EntryType,
    sourceId: string,
    targetType: EntryType,
    targetId: string,
    relationType: RelationType
  ): Promise<boolean>;
  removeAllForEntry(entryType: EntryType, entryId: string): Promise<number>;
}

// =============================================================================
// ORGANIZATION REPOSITORY
// =============================================================================

export interface CreateOrganizationInput {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateOrganizationInput {
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface IOrganizationRepository {
  create(input: CreateOrganizationInput): Promise<Organization>;
  getById(id: string): Promise<Organization | undefined>;
  list(options?: PaginationOptions): Promise<Organization[]>;
  update(id: string, input: UpdateOrganizationInput): Promise<Organization | undefined>;
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// PROJECT REPOSITORY
// =============================================================================

export interface CreateProjectInput {
  orgId?: string;
  name: string;
  description?: string;
  rootPath?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  rootPath?: string;
  metadata?: Record<string, unknown>;
}

export interface ListProjectsFilter {
  orgId?: string;
}

export interface IProjectRepository {
  create(input: CreateProjectInput): Promise<Project>;
  getById(id: string): Promise<Project | undefined>;
  getByName(name: string, orgId?: string): Promise<Project | undefined>;
  /**
   * Find a project by filesystem path.
   * Returns the project whose rootPath matches or is a parent of the given path.
   * If multiple projects match, returns the most specific one (longest rootPath).
   */
  findByPath(path: string): Promise<Project | undefined>;
  list(filter?: ListProjectsFilter, options?: PaginationOptions): Promise<Project[]>;
  update(id: string, input: UpdateProjectInput): Promise<Project | undefined>;
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// SESSION REPOSITORY
// =============================================================================

export interface CreateSessionInput {
  /** Optional custom ID. If not provided, a new ID is generated. */
  id?: string;
  projectId?: string;
  name?: string;
  purpose?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateSessionInput {
  status?: 'active' | 'completed' | 'discarded' | 'paused';
  name?: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
}

export interface ListSessionsFilter {
  projectId?: string;
  status?: 'active' | 'completed' | 'discarded' | 'paused';
  agentId?: string;
}

export interface ISessionRepository {
  create(input: CreateSessionInput): Promise<Session>;
  getById(id: string): Promise<Session | undefined>;
  list(filter?: ListSessionsFilter, options?: PaginationOptions): Promise<Session[]>;
  update(id: string, input: UpdateSessionInput): Promise<Session | undefined>;
  end(id: string, status?: 'completed' | 'discarded'): Promise<Session | undefined>;
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// FILE LOCK REPOSITORY
// =============================================================================

export interface CheckoutOptions {
  sessionId?: string;
  projectId?: string;
  expiresIn?: number;
  metadata?: Record<string, unknown>;
}

export interface ListLocksFilter {
  projectId?: string;
  sessionId?: string;
  agentId?: string;
}

export interface IFileLockRepository {
  checkout(filePath: string, agentId: string, options?: CheckoutOptions): Promise<FileLock>;
  checkin(filePath: string, agentId: string): Promise<void>;
  forceUnlock(filePath: string, agentId: string, reason?: string): Promise<void>;
  isLocked(filePath: string): Promise<boolean>;
  getLock(filePath: string): Promise<FileLock | null>;
  listLocks(filter?: ListLocksFilter): Promise<FileLock[]>;
  cleanupExpiredLocks(): Promise<number>;
  cleanupStaleLocks(maxAgeHours?: number): Promise<number>;
}

// =============================================================================
// GUIDELINE REPOSITORY
// =============================================================================

export interface CreateGuidelineInput {
  scopeType: ScopeType;
  scopeId?: string;
  name: string;
  category?: string;
  priority?: number;
  content: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
  createdBy?: string;
}

export interface UpdateGuidelineInput {
  scopeType?: ScopeType;
  scopeId?: string | null;
  category?: string;
  priority?: number;
  content?: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
  changeReason?: string;
  updatedBy?: string;
}

export interface ListGuidelinesFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: string;
  includeInactive?: boolean;
  inherit?: boolean;
}

export interface GuidelineWithVersion extends Guideline {
  currentVersion?: GuidelineVersion;
}

export interface IGuidelineRepository {
  create(input: CreateGuidelineInput): Promise<GuidelineWithVersion>;
  getById(id: string): Promise<GuidelineWithVersion | undefined>;
  /** Batch fetch by IDs using SQL IN clause for efficiency */
  getByIds(ids: string[]): Promise<GuidelineWithVersion[]>;
  getByName(
    name: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<GuidelineWithVersion | undefined>;
  list(filter?: ListGuidelinesFilter, options?: PaginationOptions): Promise<GuidelineWithVersion[]>;
  update(id: string, input: UpdateGuidelineInput): Promise<GuidelineWithVersion | undefined>;
  getHistory(guidelineId: string): Promise<GuidelineVersion[]>;
  deactivate(id: string): Promise<boolean>;
  reactivate(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// KNOWLEDGE REPOSITORY
// =============================================================================

export interface CreateKnowledgeInput {
  scopeType: ScopeType;
  scopeId?: string;
  title: string;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  content: string;
  source?: string;
  confidence?: number;
  /** When this knowledge becomes valid (ISO timestamp). For temporal KG. */
  validFrom?: string;
  /** When this knowledge expires (ISO timestamp). For temporal KG. */
  validUntil?: string;
  createdBy?: string;
}

export interface UpdateKnowledgeInput {
  scopeType?: ScopeType;
  scopeId?: string | null;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  content?: string;
  source?: string;
  confidence?: number;
  /** When this knowledge becomes valid (ISO timestamp). For temporal KG. */
  validFrom?: string;
  /** When this knowledge expires (ISO timestamp). For temporal KG. */
  validUntil?: string;
  /** ID of entry that supersedes/invalidates this knowledge. For temporal KG. */
  invalidatedBy?: string;
  changeReason?: string;
  updatedBy?: string;
}

export interface ListKnowledgeFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  includeInactive?: boolean;
  inherit?: boolean;
}

export interface KnowledgeWithVersion extends Knowledge {
  currentVersion?: KnowledgeVersion;
}

export interface IKnowledgeRepository {
  create(input: CreateKnowledgeInput): Promise<KnowledgeWithVersion>;
  getById(id: string): Promise<KnowledgeWithVersion | undefined>;
  /** Batch fetch by IDs using SQL IN clause for efficiency */
  getByIds(ids: string[]): Promise<KnowledgeWithVersion[]>;
  getByTitle(
    title: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<KnowledgeWithVersion | undefined>;
  list(filter?: ListKnowledgeFilter, options?: PaginationOptions): Promise<KnowledgeWithVersion[]>;
  update(id: string, input: UpdateKnowledgeInput): Promise<KnowledgeWithVersion | undefined>;
  getHistory(knowledgeId: string): Promise<KnowledgeVersion[]>;
  deactivate(id: string): Promise<boolean>;
  reactivate(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// TOOL REPOSITORY
// =============================================================================

export interface CreateToolInput {
  scopeType: ScopeType;
  scopeId?: string;
  name: string;
  category?: 'mcp' | 'cli' | 'function' | 'api';
  description?: string;
  parameters?: Record<string, unknown>;
  examples?: unknown[]; // Allow strings or objects
  constraints?: string;
  createdBy?: string;
}

export interface UpdateToolInput {
  category?: 'mcp' | 'cli' | 'function' | 'api';
  description?: string;
  parameters?: Record<string, unknown>;
  examples?: unknown[]; // Allow strings or objects
  constraints?: string;
  changeReason?: string;
  updatedBy?: string;
}

export interface ListToolsFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: 'mcp' | 'cli' | 'function' | 'api';
  includeInactive?: boolean;
  inherit?: boolean;
}

export interface ToolWithVersion extends Tool {
  currentVersion?: ToolVersion;
}

export interface IToolRepository {
  create(input: CreateToolInput): Promise<ToolWithVersion>;
  getById(id: string): Promise<ToolWithVersion | undefined>;
  /** Batch fetch by IDs using SQL IN clause for efficiency */
  getByIds(ids: string[]): Promise<ToolWithVersion[]>;
  getByName(
    name: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<ToolWithVersion | undefined>;
  list(filter?: ListToolsFilter, options?: PaginationOptions): Promise<ToolWithVersion[]>;
  update(id: string, input: UpdateToolInput): Promise<ToolWithVersion | undefined>;
  getHistory(toolId: string): Promise<ToolVersion[]>;
  deactivate(id: string): Promise<boolean>;
  reactivate(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// CONVERSATION REPOSITORY
// =============================================================================

export interface CreateConversationInput {
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateConversationInput {
  title?: string;
  status?: 'active' | 'completed' | 'archived';
  metadata?: Record<string, unknown>;
}

export interface ListConversationsFilter {
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  status?: 'active' | 'completed' | 'archived';
  startedAfter?: string;
  startedBefore?: string;
}

export interface AddMessageInput {
  conversationId: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  contextEntries?: Array<{ type: EntryType; id: string }>;
  toolsUsed?: string[];
  metadata?: Record<string, unknown>;
}

export interface LinkContextInput {
  conversationId: string;
  messageId?: string;
  entryType: ContextEntryType;
  entryId: string;
  relevanceScore?: number;
}

export interface ConversationSearchFilter {
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}

export interface ConversationWithMessages {
  id: string;
  sessionId: string | null;
  projectId: string | null;
  agentId: string | null;
  title: string | null;
  status: 'active' | 'completed' | 'archived';
  startedAt: string;
  endedAt: string | null;
  metadata: Record<string, unknown> | null;
  messages?: Array<{
    id: string;
    conversationId: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    messageIndex: number;
    contextEntries: Array<{ type: EntryType; id: string }> | null;
    toolsUsed: string[] | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
  context?: Array<{
    id: string;
    conversationId: string;
    messageId: string | null;
    entryType: ContextEntryType;
    entryId: string;
    relevanceScore: number | null;
    createdAt: string;
  }>;
}

export interface IConversationRepository {
  create(input: CreateConversationInput): Promise<ConversationWithMessages>;
  getById(
    id: string,
    includeMessages?: boolean,
    includeContext?: boolean
  ): Promise<ConversationWithMessages | undefined>;
  list(
    filter?: ListConversationsFilter,
    options?: PaginationOptions
  ): Promise<ConversationWithMessages[]>;
  update(
    id: string,
    updates: UpdateConversationInput
  ): Promise<ConversationWithMessages | undefined>;
  addMessage(input: AddMessageInput): Promise<{
    id: string;
    conversationId: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    messageIndex: number;
    contextEntries: Array<{ type: EntryType; id: string }> | null;
    toolsUsed: string[] | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
  getMessages(
    conversationId: string,
    limit?: number,
    offset?: number
  ): Promise<
    Array<{
      id: string;
      conversationId: string;
      role: 'user' | 'agent' | 'system';
      content: string;
      messageIndex: number;
      contextEntries: Array<{ type: EntryType; id: string }> | null;
      toolsUsed: string[] | null;
      metadata: Record<string, unknown> | null;
      createdAt: string;
    }>
  >;
  linkContext(input: LinkContextInput): Promise<{
    id: string;
    conversationId: string;
    messageId: string | null;
    entryType: ContextEntryType;
    entryId: string;
    relevanceScore: number | null;
    createdAt: string;
  }>;
  getContextForEntry(
    entryType: ContextEntryType,
    entryId: string
  ): Promise<
    Array<{
      id: string;
      conversationId: string;
      messageId: string | null;
      entryType: ContextEntryType;
      entryId: string;
      relevanceScore: number | null;
      createdAt: string;
    }>
  >;
  getContextForConversation(conversationId: string): Promise<
    Array<{
      id: string;
      conversationId: string;
      messageId: string | null;
      entryType: ContextEntryType;
      entryId: string;
      relevanceScore: number | null;
      createdAt: string;
    }>
  >;
  search(
    searchQuery: string,
    filter?: ConversationSearchFilter
  ): Promise<ConversationWithMessages[]>;
}

// =============================================================================
// CONFLICT REPOSITORY
// =============================================================================

// IConflictRepository and ListConflictsFilter are imported from conflicts.ts
// and re-exported here for centralized access
export type { IConflictRepository, ListConflictsFilter };

// =============================================================================
// EXPERIENCE REPOSITORY (Experiential Memory)
// =============================================================================

/** Input for creating a trajectory step */
export interface TrajectoryStepInput {
  action: string;
  observation?: string;
  reasoning?: string;
  toolUsed?: string;
  success?: boolean;
  timestamp?: string;
  durationMs?: number;
}

/** Input for creating a new experience */
export interface CreateExperienceInput {
  scopeType: ScopeType;
  scopeId?: string;
  title: string;
  level?: ExperienceLevel;
  category?: string;
  content: string;
  scenario?: string;
  outcome?: string;
  pattern?: string;
  applicability?: string;
  contraindications?: string;
  confidence?: number;
  source?: ExperienceSource;
  steps?: TrajectoryStepInput[];
  createdBy?: string;
}

/** Input for updating an experience */
export interface UpdateExperienceInput {
  category?: string;
  content?: string;
  scenario?: string;
  outcome?: string;
  pattern?: string;
  applicability?: string;
  contraindications?: string;
  confidence?: number;
  changeReason?: string;
  updatedBy?: string;
}

/** Input for promoting an experience to a higher level */
export interface PromoteExperienceInput {
  toLevel: 'strategy' | 'skill';
  // For strategy promotion
  pattern?: string;
  applicability?: string;
  contraindications?: string;
  // For skill promotion (creates linked memory_tool)
  toolName?: string;
  toolDescription?: string;
  toolCategory?: 'mcp' | 'cli' | 'function' | 'api';
  toolParameters?: Record<string, unknown>;
  reason?: string;
  promotedBy?: string;
}

/** Input for recording an outcome */
export interface RecordOutcomeInput {
  success: boolean;
  feedback?: string;
}

/** List filter for experiences */
export interface ListExperiencesFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  level?: ExperienceLevel;
  category?: string;
  includeInactive?: boolean;
  inherit?: boolean;
}

/** Experience with current version and optional trajectory */
export interface ExperienceWithVersion extends Experience {
  currentVersion?: ExperienceVersion;
  trajectorySteps?: ExperienceTrajectoryStep[];
}

/** Result of promoting to skill (includes created tool) */
export interface PromoteToSkillResult {
  experience: ExperienceWithVersion;
  createdTool?: {
    id: string;
    name: string;
    scopeType: ScopeType;
    scopeId: string | null;
  };
}

export interface IExperienceRepository {
  // Standard CRUD
  create(input: CreateExperienceInput): Promise<ExperienceWithVersion>;
  getById(id: string, includeTrajectory?: boolean): Promise<ExperienceWithVersion | undefined>;
  getByTitle(
    title: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<ExperienceWithVersion | undefined>;
  list(
    filter?: ListExperiencesFilter,
    options?: PaginationOptions
  ): Promise<ExperienceWithVersion[]>;
  update(id: string, input: UpdateExperienceInput): Promise<ExperienceWithVersion | undefined>;
  getHistory(experienceId: string): Promise<ExperienceVersion[]>;
  deactivate(id: string): Promise<boolean>;
  reactivate(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;

  // Experience-specific operations
  addStep(experienceId: string, step: TrajectoryStepInput): Promise<ExperienceTrajectoryStep>;
  getTrajectory(experienceId: string): Promise<ExperienceTrajectoryStep[]>;
  promote(id: string, input: PromoteExperienceInput): Promise<PromoteToSkillResult>;
  recordOutcome(id: string, input: RecordOutcomeInput): Promise<ExperienceWithVersion | undefined>;
}

// =============================================================================
// ANALYTICS REPOSITORY
// =============================================================================

/**
 * Parameters for usage statistics queries
 */
export interface UsageStatsParams {
  scopeType?: ScopeType;
  scopeId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Usage statistics result
 */
export interface UsageStats {
  mostQueriedEntries: Array<{ entryId: string; entryType: EntryType; queryCount: number }>;
  queryFrequency: Array<{ date: string; count: number }>;
  tagPopularity: Array<{ tagId: string; tagName: string; usageCount: number }>;
  scopeUsage: Record<ScopeType, number>;
  searchQueries: Array<{ query: string; count: number }>;
  actionBreakdown: Array<{ action: string; count: number }>;
  entryTypeBreakdown: Array<{ entryType: EntryType | null; count: number }>;
}

/**
 * Trend data for a single day
 */
export interface TrendData {
  date: string;
  queries: number;
  creates: number;
  updates: number;
  deletes: number;
  total: number;
}

/**
 * Parameters for subtask statistics queries
 */
export interface SubtaskStatsParams {
  projectId?: string;
  subtaskType?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Subtask statistics result
 */
export interface SubtaskStats {
  subtasks: Array<{
    subtaskType: string;
    total: number;
    completed: number;
    failed: number;
    successRate: number;
  }>;
  totalSubtasks: number;
  completedSubtasks: number;
  failedSubtasks: number;
}

export interface IAnalyticsRepository {
  /**
   * Get usage statistics from audit log
   */
  getUsageStats(params?: UsageStatsParams): Promise<UsageStats>;

  /**
   * Get trend data over time
   */
  getTrends(params?: UsageStatsParams): Promise<TrendData[]>;

  /**
   * Get subtask execution analytics
   */
  getSubtaskStats(params?: SubtaskStatsParams): Promise<SubtaskStats>;
}

// =============================================================================
// VOTING REPOSITORY
// =============================================================================

/**
 * Input for recording a vote
 */
export interface RecordVoteInput {
  taskId: string;
  agentId: string;
  voteValue: unknown;
  confidence?: number;
  reasoning?: string;
}

/**
 * Vote record
 */
export interface VoteRecord {
  id: string;
  taskId: string;
  agentId: string;
  voteValue: unknown;
  confidence: number;
  reasoning: string | null;
  createdAt: string;
}

export interface IVotingRepository {
  /**
   * Record a vote from an agent for a task
   * Uses upsert to handle duplicate votes from the same agent
   */
  recordVote(input: RecordVoteInput): Promise<void>;

  /**
   * Get all votes for a task
   */
  getVotesForTask(taskId: string): Promise<VoteRecord[]>;
}

// =============================================================================
// VERIFICATION REPOSITORY
// =============================================================================

/**
 * Verification rules stored in guideline versions
 */
export interface VerificationRules {
  filePatterns?: string[];
  contentPatterns?: string[];
  forbiddenActions?: string[];
  requiredPatterns?: string[];
}

/**
 * Input for creating a guideline acknowledgment
 */
export interface CreateAcknowledgmentInput {
  sessionId: string;
  guidelineId: string;
  acknowledgedBy?: string;
}

/**
 * Guideline acknowledgment record
 */
export interface SessionGuidelineAcknowledgment {
  id: string;
  sessionId: string;
  guidelineId: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string;
}

/**
 * Input for logging a verification action
 */
export interface LogVerificationInput {
  sessionId: string | null;
  actionType: 'pre_check' | 'post_check' | 'acknowledge';
  proposedAction: {
    type: string;
    description?: string;
    filePath?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  };
  result: {
    allowed: boolean;
    blocked: boolean;
    violations: Array<{
      guidelineId: string;
      guidelineName: string;
      severity: 'critical' | 'warning';
      message: string;
      suggestedAction?: string;
    }>;
    warnings: string[];
    requiresConfirmation: boolean;
    confirmationPrompt?: string;
  };
  guidelineIds: string[];
  createdBy?: string;
}

/**
 * Verification log record
 */
export interface VerificationLogEntry {
  id: string;
  sessionId: string | null;
  actionType: 'pre_check' | 'post_check' | 'acknowledge';
  proposedAction: Record<string, unknown>;
  result: Record<string, unknown>;
  guidelineIds: string[];
  createdBy: string | null;
  createdAt: string;
}

export interface IVerificationRepository {
  /**
   * Create a guideline acknowledgment for a session
   */
  createAcknowledgment(input: CreateAcknowledgmentInput): Promise<SessionGuidelineAcknowledgment>;

  /**
   * Get all acknowledged guideline IDs for a session
   */
  getAcknowledgedGuidelineIds(sessionId: string): Promise<string[]>;

  /**
   * Log a verification action (pre_check, post_check, acknowledge)
   */
  logVerification(input: LogVerificationInput): Promise<VerificationLogEntry>;

  /**
   * Get verification rules for a guideline
   */
  getVerificationRules(guidelineId: string): Promise<VerificationRules | null>;

  /**
   * Get project ID for a session
   */
  getProjectIdForSession(sessionId: string): Promise<string | null>;
}

// =============================================================================
// TYPE REGISTRY (Flexible Knowledge Graph)
// =============================================================================

/** Input for registering a new node type */
export interface RegisterNodeTypeInput {
  name: string;
  /** JSON Schema for validating node properties */
  schema: Record<string, unknown>;
  description?: string;
  parentTypeName?: string;
  createdBy?: string;
}

/** Input for registering a new edge type */
export interface RegisterEdgeTypeInput {
  name: string;
  /** JSON Schema for validating edge properties */
  schema?: Record<string, unknown>;
  description?: string;
  isDirected?: boolean;
  inverseName?: string;
  /** Allowed source node type names */
  sourceConstraints?: string[];
  /** Allowed target node type names */
  targetConstraints?: string[];
  createdBy?: string;
}

/** Validation result from type registry */
export interface TypeValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ITypeRegistry {
  // Node types
  registerNodeType(input: RegisterNodeTypeInput): Promise<NodeType>;
  getNodeType(name: string): Promise<NodeType | undefined>;
  getNodeTypeById(id: string): Promise<NodeType | undefined>;
  listNodeTypes(options?: { includeBuiltin?: boolean }): Promise<NodeType[]>;
  validateNodeProperties(typeName: string, properties: unknown): Promise<TypeValidationResult>;
  deleteNodeType(name: string): Promise<boolean>;

  // Edge types
  registerEdgeType(input: RegisterEdgeTypeInput): Promise<EdgeType>;
  getEdgeType(name: string): Promise<EdgeType | undefined>;
  getEdgeTypeById(id: string): Promise<EdgeType | undefined>;
  listEdgeTypes(options?: { includeBuiltin?: boolean }): Promise<EdgeType[]>;
  validateEdgeProperties(typeName: string, properties: unknown): Promise<TypeValidationResult>;
  deleteEdgeType(name: string): Promise<boolean>;

  // Seed built-in types
  seedBuiltinTypes(): Promise<void>;
}

// =============================================================================
// NODE REPOSITORY (Graph Nodes)
// =============================================================================

/** Input for creating a graph node */
export interface CreateGraphNodeInput {
  nodeTypeName: string;
  scopeType: ScopeType;
  scopeId?: string;
  name: string;
  properties?: Record<string, unknown>;
  validFrom?: string;
  validUntil?: string;
  /** Link to original entry (for bidirectional mapping) */
  entryId?: string;
  /** Type of the linked entry */
  entryType?: 'knowledge' | 'guideline' | 'tool' | 'experience' | 'task' | 'episode';
  createdBy?: string;
}

/** Input for updating a graph node */
export interface UpdateGraphNodeInput {
  name?: string;
  properties?: Record<string, unknown>;
  validFrom?: string;
  validUntil?: string;
  changeReason?: string;
  updatedBy?: string;
}

/** Filter for listing graph nodes */
export interface ListGraphNodesFilter {
  nodeTypeName?: string;
  nodeTypeId?: string;
  scopeType?: ScopeType;
  scopeId?: string;
  isActive?: boolean;
  includeInactive?: boolean;
  inherit?: boolean;
}

/** Node with current version */
export interface GraphNodeWithVersion extends GraphNode {
  nodeTypeName: string;
  currentVersion?: NodeVersion;
}

export interface INodeRepository {
  create(input: CreateGraphNodeInput): Promise<GraphNodeWithVersion>;
  getById(id: string): Promise<GraphNodeWithVersion | undefined>;
  getByName(
    name: string,
    nodeTypeName: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<GraphNodeWithVersion | undefined>;
  /** Find a node by its linked entry ID and type (for bidirectional mapping) */
  getByEntry(
    entryType: 'knowledge' | 'guideline' | 'tool' | 'experience' | 'task' | 'episode',
    entryId: string
  ): Promise<GraphNodeWithVersion | undefined>;
  list(filter?: ListGraphNodesFilter, options?: PaginationOptions): Promise<GraphNodeWithVersion[]>;
  update(id: string, input: UpdateGraphNodeInput): Promise<GraphNodeWithVersion | undefined>;
  getHistory(nodeId: string): Promise<NodeVersion[]>;
  deactivate(id: string): Promise<boolean>;
  reactivate(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  updateAccessMetrics(id: string): Promise<void>;
}

// =============================================================================
// EDGE REPOSITORY (Graph Edges)
// =============================================================================

/** Input for creating a graph edge */
export interface CreateGraphEdgeInput {
  edgeTypeName: string;
  sourceId: string;
  targetId: string;
  properties?: Record<string, unknown>;
  weight?: number;
  createdBy?: string;
}

/** Input for updating a graph edge */
export interface UpdateGraphEdgeInput {
  properties?: Record<string, unknown>;
  weight?: number;
}

/** Filter for listing graph edges */
export interface ListGraphEdgesFilter {
  edgeTypeName?: string;
  edgeTypeId?: string;
  sourceId?: string;
  targetId?: string;
}

/** Edge with type name resolved */
export interface GraphEdgeWithType extends GraphEdge {
  edgeTypeName: string;
  isDirected: boolean;
  inverseName: string | null;
}

export interface IEdgeRepository {
  create(input: CreateGraphEdgeInput): Promise<GraphEdgeWithType>;
  getById(id: string): Promise<GraphEdgeWithType | undefined>;
  list(filter?: ListGraphEdgesFilter, options?: PaginationOptions): Promise<GraphEdgeWithType[]>;
  update(id: string, input: UpdateGraphEdgeInput): Promise<GraphEdgeWithType | undefined>;
  delete(id: string): Promise<boolean>;

  // Graph traversal
  getOutgoingEdges(nodeId: string, edgeTypeName?: string): Promise<GraphEdgeWithType[]>;
  getIncomingEdges(nodeId: string, edgeTypeName?: string): Promise<GraphEdgeWithType[]>;
  getNeighbors(nodeId: string, options?: GraphTraversalOptions): Promise<GraphNodeWithVersion[]>;
  traverse(startNodeId: string, options?: GraphTraversalOptions): Promise<GraphNodeWithVersion[]>;
  findPaths(startNodeId: string, endNodeId: string, maxDepth?: number): Promise<GraphPath[]>;
}

// =============================================================================
// EPISODE REPOSITORY (Temporal Activity Grouping)
// =============================================================================

/** Input for creating an episode */
export interface CreateEpisodeInput {
  scopeType: ScopeType;
  scopeId?: string;
  sessionId?: string;
  name: string;
  description?: string;
  parentEpisodeId?: string;
  triggerType?: string;
  triggerRef?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

/** Input for updating an episode */
export interface UpdateEpisodeInput {
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Filter for listing episodes */
export interface ListEpisodesFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  sessionId?: string;
  status?: EpisodeStatus;
  parentEpisodeId?: string;
  includeInactive?: boolean;
}

/** Input for adding an event to an episode */
export interface AddEpisodeEventInput {
  episodeId: string;
  eventType: string;
  name: string;
  description?: string;
  entryType?: string;
  entryId?: string;
  data?: Record<string, unknown>;
}

/** Episode with its events */
export interface EpisodeWithEvents extends Episode {
  events?: EpisodeEvent[];
}

/** Linked entity reference */
export interface LinkedEntity {
  entryType: string;
  entryId: string;
  role?: string;
}

export interface IEpisodeRepository {
  // Standard CRUD
  create(input: CreateEpisodeInput): Promise<EpisodeWithEvents>;
  getById(id: string, includeEvents?: boolean): Promise<EpisodeWithEvents | undefined>;
  list(filter?: ListEpisodesFilter, options?: PaginationOptions): Promise<EpisodeWithEvents[]>;
  update(id: string, input: UpdateEpisodeInput): Promise<EpisodeWithEvents | undefined>;
  deactivate(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;

  // Lifecycle management
  start(id: string): Promise<EpisodeWithEvents>;
  complete(id: string, outcome: string, outcomeType: EpisodeOutcomeType): Promise<EpisodeWithEvents>;
  fail(id: string, outcome: string): Promise<EpisodeWithEvents>;
  cancel(id: string, reason?: string): Promise<EpisodeWithEvents>;

  // Event tracking
  addEvent(input: AddEpisodeEventInput): Promise<EpisodeEvent>;
  getEvents(episodeId: string): Promise<EpisodeEvent[]>;

  // Entity linking (via graph)
  linkEntity(episodeId: string, entryType: string, entryId: string, role?: string): Promise<void>;
  getLinkedEntities(episodeId: string): Promise<LinkedEntity[]>;

  // Temporal queries
  getActiveEpisode(sessionId: string): Promise<EpisodeWithEvents | undefined>;
  getEpisodesInRange(
    start: string,
    end: string,
    scopeType?: ScopeType,
    scopeId?: string
  ): Promise<EpisodeWithEvents[]>;

  // Hierarchy queries
  getChildren(parentId: string): Promise<EpisodeWithEvents[]>;
  getAncestors(episodeId: string): Promise<Episode[]>;
}

// =============================================================================
// AGGREGATED REPOSITORIES TYPE
// =============================================================================

/**
 * All repository instances, used in AppContext
 */
export interface Repositories {
  tags: ITagRepository;
  entryTags: IEntryTagRepository;
  entryRelations: IEntryRelationRepository;
  organizations: IOrganizationRepository;
  projects: IProjectRepository;
  sessions: ISessionRepository;
  fileLocks: IFileLockRepository;
  guidelines: IGuidelineRepository;
  knowledge: IKnowledgeRepository;
  tools: IToolRepository;
  conversations: IConversationRepository;
  conflicts: IConflictRepository;
  experiences: IExperienceRepository;
  verification?: IVerificationRepository;
  voting?: IVotingRepository;
  analytics?: IAnalyticsRepository;
  // Graph repositories (Flexible Knowledge Graph)
  typeRegistry?: ITypeRegistry;
  graphNodes?: INodeRepository;
  graphEdges?: IEdgeRepository;
  // Task and Evidence repositories
  tasks?: ITaskRepository;
  evidence?: IEvidenceRepository;
  // Episode repository (Temporal Activity Grouping)
  episodes?: IEpisodeRepository;
}
