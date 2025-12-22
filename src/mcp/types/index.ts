/**
 * MCP Type definitions for agent-memory
 *
 * This module consolidates all MCP param types with generic base classes
 * to reduce duplication while maintaining backward compatibility.
 */

// Re-export query types from core
export type { MemoryContextParams, MemoryQueryParams, ResponseMeta } from '../../core/types.js';

// Re-export base types
export {
  type ScopeParams,
  type PaginationParams,
  type BaseAddParams,
  type BaseUpdateParams,
  type BaseGetParams,
  type BaseListParams,
  type EntryIdParam,
  type ScopeType,
  type EntryType,
  type PermissionEntryType,
  type RelationType,
} from './base.js';

// Re-export entry-specific types
export {
  type ToolCategory,
  type ToolAddParams,
  type ToolUpdateParams,
  type ToolGetParams,
  type ToolListParams,
  type ToolHistoryParams,
  type ToolDeactivateParams,
  type GuidelineCategory,
  type GuidelineAddParams,
  type GuidelineUpdateParams,
  type GuidelineGetParams,
  type GuidelineListParams,
  type GuidelineHistoryParams,
  type GuidelineDeactivateParams,
  type KnowledgeCategory,
  type KnowledgeAddParams,
  type KnowledgeUpdateParams,
  type KnowledgeGetParams,
  type KnowledgeListParams,
  type KnowledgeHistoryParams,
  type KnowledgeDeactivateParams,
} from './entry-params.js';

// =============================================================================
// ORGANIZATION PARAMS (Not duplicated, kept as-is)
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

import type { PaginationParams } from './base.js';

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

export interface ProjectDeleteParams {
  id: string;
  confirm?: boolean;
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
// TAG PARAMS
// =============================================================================

import type { EntryType } from './base.js';

export interface TagCreateParams {
  agentId: string;
  name: string;
  category?: 'language' | 'domain' | 'category' | 'meta' | 'custom';
  description?: string;
}

export interface TagListParams extends PaginationParams {
  agentId: string;
  category?: 'language' | 'domain' | 'category' | 'meta' | 'custom';
  isPredefined?: boolean;
}

export interface TagAttachParams {
  agentId: string;
  entryType: EntryType;
  entryId: string;
  tagId?: string;
  tagName?: string;
}

export interface TagDetachParams {
  agentId: string;
  entryType: EntryType;
  entryId: string;
  tagId: string;
}

export interface TagsForEntryParams {
  agentId: string;
  entryType: EntryType;
  entryId: string;
}

// =============================================================================
// RELATION PARAMS
// =============================================================================

import type { RelationType } from './base.js';

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
  expires_in?: number;
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

// =============================================================================
// EXPORT/IMPORT PARAMS
// =============================================================================

import type { ScopeType } from './base.js';

export interface ExportParams {
  types?: ('tools' | 'guidelines' | 'knowledge')[];
  scopeType?: ScopeType;
  scopeId?: string;
  tags?: string[];
  format?: 'json' | 'markdown' | 'yaml' | 'openapi';
  includeVersions?: boolean;
  includeInactive?: boolean;
}

export interface ImportParams {
  content: string;
  format?: 'json' | 'yaml' | 'markdown' | 'openapi';
  conflictStrategy?: 'skip' | 'update' | 'replace' | 'error';
  scopeMapping?: Record<string, { type: ScopeType; id?: string }>;
  generateNewIds?: boolean;
  importedBy?: string;
}

// =============================================================================
// CONVERSATION PARAMS
// =============================================================================

import type { PermissionEntryType } from './base.js';

export interface ConversationStartParams {
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationAddMessageParams {
  conversationId: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  contextEntries?: Array<{ type: PermissionEntryType; id: string }>;
  toolsUsed?: string[];
  metadata?: Record<string, unknown>;
  agentId?: string;
}

export interface ConversationGetParams {
  id: string;
  includeMessages?: boolean;
  includeContext?: boolean;
  agentId?: string;
}

export interface ConversationListParams extends PaginationParams {
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  status?: 'active' | 'completed' | 'archived';
}

export interface ConversationUpdateParams {
  id: string;
  title?: string;
  status?: 'active' | 'completed' | 'archived';
  metadata?: Record<string, unknown>;
  agentId?: string;
}

export interface ConversationLinkContextParams {
  conversationId: string;
  messageId?: string;
  entryType: PermissionEntryType;
  entryId: string;
  relevanceScore?: number;
  agentId?: string;
}

export interface ConversationGetContextParams {
  conversationId?: string;
  entryType?: PermissionEntryType;
  entryId?: string;
  agentId?: string;
}

export interface ConversationSearchParams extends PaginationParams {
  search: string;
  sessionId?: string;
  projectId?: string;
  agentId?: string;
}

export interface ConversationEndParams {
  id: string;
  generateSummary?: boolean;
  agentId?: string;
}

export interface ConversationArchiveParams {
  id: string;
  agentId?: string;
}

// =============================================================================
// OBSERVE PARAMS
// =============================================================================

export interface ObserveExtractParams {
  context: string;
  contextType?: 'conversation' | 'code' | 'mixed';
  scopeType?: ScopeType;
  scopeId?: string;
  autoStore?: boolean;
  confidenceThreshold?: number;
  focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools')[];
  agentId?: string;
}

export interface ObserveStatusParams {
  // No params needed
}

export interface ObserveDraftParams {
  sessionId: string;
  projectId?: string;
}

export interface ObserveCommitParams {
  sessionId: string;
  projectId?: string;
  entries: Array<{
    type: 'guideline' | 'knowledge' | 'tool';
    content: string;
    confidence: number;
    name?: string;
    title?: string;
    category?: string;
    priority?: number;
    rationale?: string;
    suggestedTags?: string[];
  }>;
  autoPromote?: boolean;
  autoPromoteThreshold?: number;
  agentId?: string;
}

// =============================================================================
// CONSOLIDATION PARAMS
// =============================================================================

export type ConsolidationAction =
  | 'find_similar'
  | 'dedupe'
  | 'merge'
  | 'abstract'
  | 'archive_stale';

export interface ConsolidationParams {
  action: ConsolidationAction;
  scopeType: ScopeType;
  scopeId?: string;
  entryTypes?: EntryType[];
  threshold?: number;
  staleDays?: number;
  minRecencyScore?: number;
  limit?: number;
  dryRun?: boolean;
  consolidatedBy?: string;
}

// =============================================================================
// HOOK PARAMS
// =============================================================================

export type HookIde = 'claude' | 'cursor' | 'vscode';

export interface HookGenerateParams {
  ide: HookIde;
  projectPath: string;
  projectId?: string;
  sessionId?: string;
}

export interface HookInstallParams {
  ide: HookIde;
  projectPath: string;
  projectId?: string;
  sessionId?: string;
}

export interface HookStatusParams {
  ide: HookIde;
  projectPath: string;
}

export interface HookUninstallParams {
  ide: HookIde;
  projectPath: string;
}

// =============================================================================
// VERIFICATION PARAMS
// =============================================================================

export interface VerificationPreCheckParams {
  sessionId: string;
  agentId: string;
  projectId?: string;
  proposedAction: {
    type: 'file_write' | 'code_generate' | 'api_call' | 'command' | 'other';
    description?: string;
    filePath?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface VerificationPostCheckParams {
  sessionId: string;
  agentId: string;
  projectId?: string;
  completedAction?: {
    type: string;
    description?: string;
    filePath?: string;
    success: boolean;
    metadata?: Record<string, unknown>;
  };
  content?: string;
}

export interface VerificationAcknowledgeParams {
  sessionId: string;
  agentId: string;
  projectId?: string;
  guidelineIds: string[];
}

export interface VerificationStatusParams {
  sessionId: string;
  agentId?: string;
  projectId?: string;
}

// =============================================================================
// ANALYTICS PARAMS
// =============================================================================

export interface AnalyticsGetStatsParams {
  scopeType?: ScopeType;
  scopeId?: string;
  startDate?: string;
  endDate?: string;
}

export interface AnalyticsGetTrendsParams {
  scopeType?: ScopeType;
  scopeId?: string;
  startDate?: string;
  endDate?: string;
}

export interface AnalyticsGetSubtaskStatsParams {
  projectId: string;
  subtaskType?: string;
}

export interface AnalyticsGetErrorCorrelationParams {
  agentA: string;
  agentB: string;
  timeWindow?: {
    start: string;
    end: string;
  };
}

export interface AnalyticsGetLowDiversityParams {
  scopeType?: ScopeType;
  scopeId?: string;
}

// =============================================================================
// VOTING PARAMS
// =============================================================================

export interface VotingRecordVoteParams {
  taskId: string;
  agentId: string;
  voteValue: unknown;
  confidence?: number;
  reasoning?: string;
}

export interface VotingGetConsensusParams {
  taskId: string;
  k?: number;
}

export interface VotingListVotesParams extends PaginationParams {
  taskId: string;
}

export interface VotingGetStatsParams {
  taskId: string;
}

// =============================================================================
// BACKUP PARAMS
// =============================================================================

export interface BackupCreateParams {
  name?: string;
}

export interface BackupListParams {
  limit?: number;
}

export interface BackupCleanupParams {
  keepCount?: number;
}

export interface BackupRestoreParams {
  filename: string;
}
