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
  create(input: CreateTagInput): Tag;
  getById(id: string): Tag | undefined;
  getByName(name: string): Tag | undefined;
  getOrCreate(
    name: string,
    category?: 'language' | 'domain' | 'category' | 'meta' | 'custom'
  ): Tag;
  list(filter?: ListTagsFilter, options?: PaginationOptions): Tag[];
  delete(id: string): boolean;
  seedPredefined(): void;
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
  attach(input: AttachTagInput): EntryTag;
  detach(entryType: EntryType, entryId: string, tagId: string): boolean;
  getTagsForEntry(entryType: EntryType, entryId: string): Tag[];
  getEntriesWithTag(tagId: string, entryType?: EntryType): EntryTag[];
  removeAllFromEntry(entryType: EntryType, entryId: string): number;
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
  create(input: CreateRelationInput): EntryRelation;
  getById(id: string): EntryRelation | undefined;
  list(filter?: ListRelationsFilter, options?: PaginationOptions): EntryRelation[];
  getFromEntry(entryType: EntryType, entryId: string): EntryRelation[];
  getToEntry(entryType: EntryType, entryId: string): EntryRelation[];
  delete(id: string): boolean;
  deleteByEntries(
    sourceType: EntryType,
    sourceId: string,
    targetType: EntryType,
    targetId: string,
    relationType: RelationType
  ): boolean;
  removeAllForEntry(entryType: EntryType, entryId: string): number;
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
  create(input: CreateOrganizationInput): Organization;
  getById(id: string): Organization | undefined;
  list(options?: PaginationOptions): Organization[];
  update(id: string, input: UpdateOrganizationInput): Organization | undefined;
  delete(id: string): boolean;
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
  create(input: CreateProjectInput): Project;
  getById(id: string): Project | undefined;
  getByName(name: string, orgId?: string): Project | undefined;
  list(filter?: ListProjectsFilter, options?: PaginationOptions): Project[];
  update(id: string, input: UpdateProjectInput): Project | undefined;
  delete(id: string): boolean;
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
  create(input: CreateSessionInput): Session;
  getById(id: string): Session | undefined;
  list(filter?: ListSessionsFilter, options?: PaginationOptions): Session[];
  update(id: string, input: UpdateSessionInput): Session | undefined;
  end(id: string, status?: 'completed' | 'discarded'): Session | undefined;
  delete(id: string): boolean;
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
  checkout(filePath: string, agentId: string, options?: CheckoutOptions): FileLock;
  checkin(filePath: string, agentId: string): void;
  forceUnlock(filePath: string, agentId: string, reason?: string): void;
  isLocked(filePath: string): boolean;
  getLock(filePath: string): FileLock | null;
  listLocks(filter?: ListLocksFilter): FileLock[];
  cleanupExpiredLocks(): number;
  cleanupStaleLocks(maxAgeHours?: number): number;
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
  create(input: CreateGuidelineInput): GuidelineWithVersion;
  getById(id: string): GuidelineWithVersion | undefined;
  getByName(
    name: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): GuidelineWithVersion | undefined;
  list(filter?: ListGuidelinesFilter, options?: PaginationOptions): GuidelineWithVersion[];
  update(id: string, input: UpdateGuidelineInput): GuidelineWithVersion | undefined;
  getHistory(guidelineId: string): GuidelineVersion[];
  deactivate(id: string): boolean;
  reactivate(id: string): boolean;
  delete(id: string): boolean;
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
  create(input: CreateKnowledgeInput): KnowledgeWithVersion;
  getById(id: string): KnowledgeWithVersion | undefined;
  getByTitle(
    title: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): KnowledgeWithVersion | undefined;
  list(filter?: ListKnowledgeFilter, options?: PaginationOptions): KnowledgeWithVersion[];
  update(id: string, input: UpdateKnowledgeInput): KnowledgeWithVersion | undefined;
  getHistory(knowledgeId: string): KnowledgeVersion[];
  deactivate(id: string): boolean;
  reactivate(id: string): boolean;
  delete(id: string): boolean;
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
  create(input: CreateToolInput): ToolWithVersion;
  getById(id: string): ToolWithVersion | undefined;
  getByName(
    name: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): ToolWithVersion | undefined;
  list(filter?: ListToolsFilter, options?: PaginationOptions): ToolWithVersion[];
  update(id: string, input: UpdateToolInput): ToolWithVersion | undefined;
  getHistory(toolId: string): ToolVersion[];
  deactivate(id: string): boolean;
  reactivate(id: string): boolean;
  delete(id: string): boolean;
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
  create(input: CreateConversationInput): ConversationWithMessages;
  getById(
    id: string,
    includeMessages?: boolean,
    includeContext?: boolean
  ): ConversationWithMessages | undefined;
  list(filter?: ListConversationsFilter, options?: PaginationOptions): ConversationWithMessages[];
  update(id: string, updates: UpdateConversationInput): ConversationWithMessages | undefined;
  addMessage(input: AddMessageInput): {
    id: string;
    conversationId: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    messageIndex: number;
    contextEntries: Array<{ type: EntryType; id: string }> | null;
    toolsUsed: string[] | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  };
  getMessages(
    conversationId: string,
    limit?: number,
    offset?: number
  ): Array<{
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
  linkContext(input: LinkContextInput): {
    id: string;
    conversationId: string;
    messageId: string | null;
    entryType: ContextEntryType;
    entryId: string;
    relevanceScore: number | null;
    createdAt: string;
  };
  getContextForEntry(
    entryType: ContextEntryType,
    entryId: string
  ): Array<{
    id: string;
    conversationId: string;
    messageId: string | null;
    entryType: ContextEntryType;
    entryId: string;
    relevanceScore: number | null;
    createdAt: string;
  }>;
  getContextForConversation(conversationId: string): Array<{
    id: string;
    conversationId: string;
    messageId: string | null;
    entryType: ContextEntryType;
    entryId: string;
    relevanceScore: number | null;
    createdAt: string;
  }>;
  search(searchQuery: string, filter?: ConversationSearchFilter): ConversationWithMessages[];
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
}
