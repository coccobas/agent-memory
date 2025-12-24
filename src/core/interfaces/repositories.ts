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
  ScopeType,
} from '../../db/schema.js';
import type { PaginationOptions } from '../../db/repositories/base.js';
import type { IConflictRepository, ListConflictsFilter } from '../../db/repositories/conflicts.js';

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
  list(filter?: ListProjectsFilter, options?: PaginationOptions): Promise<Project[]>;
  update(id: string, input: UpdateProjectInput): Promise<Project | undefined>;
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// SESSION REPOSITORY
// =============================================================================

export interface CreateSessionInput {
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
  validUntil?: string;
  createdBy?: string;
}

export interface UpdateKnowledgeInput {
  category?: 'decision' | 'fact' | 'context' | 'reference';
  content?: string;
  source?: string;
  confidence?: number;
  validUntil?: string;
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
}
