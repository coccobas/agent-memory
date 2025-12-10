/**
 * MCP Type definitions for agent-memory
 */

import type { ScopeType, EntryType, RelationType } from '../db/schema.js';

// =============================================================================
// COMMON TYPES
// =============================================================================

export interface ScopeParams {
  scopeType: ScopeType;
  scopeId?: string;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface ResponseMeta {
  totalCount: number;
  returnedCount: number;
  truncated: boolean;
  hasMore: boolean;
  nextCursor?: string;
}

// =============================================================================
// ORGANIZATION PARAMS
// =============================================================================

export interface OrgCreateParams {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface OrgUpdateParams {
  id: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface OrgListParams extends PaginationParams {}

// =============================================================================
// PROJECT PARAMS
// =============================================================================

export interface ProjectCreateParams {
  orgId?: string;
  name: string;
  description?: string;
  rootPath?: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectUpdateParams {
  id: string;
  name?: string;
  description?: string;
  rootPath?: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectListParams extends PaginationParams {
  orgId?: string;
}

export interface ProjectGetParams {
  id?: string;
  name?: string;
  orgId?: string;
}

// =============================================================================
// SESSION PARAMS
// =============================================================================

export interface SessionStartParams {
  projectId?: string;
  name?: string;
  purpose?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionUpdateParams {
  id: string;
  name?: string;
  purpose?: string;
  status?: 'active' | 'paused' | 'completed' | 'discarded';
  metadata?: Record<string, unknown>;
}

export interface SessionEndParams {
  id: string;
  status?: 'completed' | 'discarded';
}

export interface SessionListParams extends PaginationParams {
  projectId?: string;
  status?: 'active' | 'paused' | 'completed' | 'discarded';
}

// =============================================================================
// TOOL PARAMS
// =============================================================================

export interface ToolAddParams extends ScopeParams {
  name: string;
  category?: 'mcp' | 'cli' | 'function' | 'api';
  description?: string;
  parameters?: Record<string, unknown>;
  examples?: Array<Record<string, unknown>>;
  constraints?: string;
  createdBy?: string;
}

export interface ToolUpdateParams {
  id: string;
  description?: string;
  parameters?: Record<string, unknown>;
  examples?: Array<Record<string, unknown>>;
  constraints?: string;
  changeReason?: string;
  updatedBy?: string;
}

export interface ToolGetParams {
  id?: string;
  name?: string;
  scopeType?: ScopeType;
  scopeId?: string;
  inherit?: boolean;
}

export interface ToolListParams extends PaginationParams {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: 'mcp' | 'cli' | 'function' | 'api';
  includeInactive?: boolean;
}

export interface ToolHistoryParams {
  id: string;
}

export interface ToolDeactivateParams {
  id: string;
}

// =============================================================================
// GUIDELINE PARAMS
// =============================================================================

export interface GuidelineAddParams extends ScopeParams {
  name: string;
  category?: string;
  priority?: number;
  content: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
  createdBy?: string;
}

export interface GuidelineUpdateParams {
  id: string;
  category?: string;
  priority?: number;
  content?: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
  changeReason?: string;
  updatedBy?: string;
}

export interface GuidelineGetParams {
  id?: string;
  name?: string;
  scopeType?: ScopeType;
  scopeId?: string;
  inherit?: boolean;
}

export interface GuidelineListParams extends PaginationParams {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: string;
  includeInactive?: boolean;
}

export interface GuidelineHistoryParams {
  id: string;
}

export interface GuidelineDeactivateParams {
  id: string;
}

// =============================================================================
// KNOWLEDGE PARAMS
// =============================================================================

export interface KnowledgeAddParams extends ScopeParams {
  title: string;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  content: string;
  source?: string;
  confidence?: number;
  validUntil?: string;
  createdBy?: string;
}

export interface KnowledgeUpdateParams {
  id: string;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  content?: string;
  source?: string;
  confidence?: number;
  validUntil?: string;
  changeReason?: string;
  updatedBy?: string;
}

export interface KnowledgeGetParams {
  id?: string;
  title?: string;
  scopeType?: ScopeType;
  scopeId?: string;
  inherit?: boolean;
}

export interface KnowledgeListParams extends PaginationParams {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  includeInactive?: boolean;
}

export interface KnowledgeHistoryParams {
  id: string;
}

export interface KnowledgeDeactivateParams {
  id: string;
}

// =============================================================================
// TAG PARAMS
// =============================================================================

export interface TagCreateParams {
  name: string;
  category?: 'language' | 'domain' | 'category' | 'meta' | 'custom';
  description?: string;
}

export interface TagListParams extends PaginationParams {
  category?: 'language' | 'domain' | 'category' | 'meta' | 'custom';
  isPredefined?: boolean;
}

export interface TagAttachParams {
  entryType: EntryType;
  entryId: string;
  tagId?: string;
  tagName?: string;
}

export interface TagDetachParams {
  entryType: EntryType;
  entryId: string;
  tagId: string;
}

export interface TagsForEntryParams {
  entryType: EntryType;
  entryId: string;
}

// =============================================================================
// RELATION PARAMS
// =============================================================================

export interface RelationCreateParams {
  sourceType: EntryType;
  sourceId: string;
  targetType: EntryType;
  targetId: string;
  relationType: RelationType;
  createdBy?: string;
}

export interface RelationListParams extends PaginationParams {
  sourceType?: EntryType;
  sourceId?: string;
  targetType?: EntryType;
  targetId?: string;
  relationType?: RelationType;
}

export interface RelationDeleteParams {
  id?: string;
  sourceType?: EntryType;
  sourceId?: string;
  targetType?: EntryType;
  targetId?: string;
  relationType?: RelationType;
}

// =============================================================================
// QUERY PARAMS (Advanced cross-reference search)
// =============================================================================

export interface MemoryQueryParams {
  types?: ('tools' | 'guidelines' | 'knowledge')[];
  scope?: {
    type: ScopeType;
    id?: string;
    inherit?: boolean;
  };
  tags?: {
    include?: string[];
    require?: string[];
    exclude?: string[];
  };
  search?: string;
  relatedTo?: {
    type: EntryType;
    id: string;
    relation?: RelationType;
  };
  limit?: number;
  includeVersions?: boolean;
  includeInactive?: boolean;
  compact?: boolean;
}

// =============================================================================
// CONTEXT PARAMS (Aggregated context for a scope)
// =============================================================================

export interface MemoryContextParams {
  scopeType: ScopeType;
  scopeId?: string;
  inherit?: boolean;
  compact?: boolean;
  limitPerType?: number;
}

// =============================================================================
// CONFLICT PARAMS
// =============================================================================

export interface ConflictListParams extends PaginationParams {
  entryType?: 'tool' | 'guideline' | 'knowledge';
  resolved?: boolean;
}

export interface ConflictResolveParams {
  id: string;
  resolution: string;
  resolvedBy?: string;
}

// =============================================================================
// FILE LOCK PARAMS
// =============================================================================

export interface FileCheckoutParams {
  file_path: string;
  agent_id: string;
  session_id?: string;
  project_id?: string;
  expires_in?: number; // seconds, default 3600
  metadata?: Record<string, unknown>;
}

export interface FileCheckinParams {
  file_path: string;
  agent_id: string;
}

export interface FileLockStatusParams {
  file_path: string;
}

export interface FileLockListParams {
  project_id?: string;
  session_id?: string;
  agent_id?: string;
}

export interface FileLockForceUnlockParams {
  file_path: string;
  agent_id: string;
  reason?: string;
}
