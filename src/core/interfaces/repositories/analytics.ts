/**
 * Analytics Repository Interfaces
 *
 * Analytics, Voting, and Verification
 */

import type { EntryType, AuditEntryType, ScopeType } from '../../../db/schema.js';

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
  /** Breakdown of audit log entries by type (uses AuditEntryType to include permission audits) */
  entryTypeBreakdown: Array<{ entryType: AuditEntryType | null; count: number }>;
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
   * Get usage statistics from audit log.
   * @param params - Query parameters (scope, date range)
   * @returns Usage statistics
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getUsageStats(params?: UsageStatsParams): Promise<UsageStats>;

  /**
   * Get trend data over time.
   * @param params - Query parameters (scope, date range)
   * @returns Array of daily trend data
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getTrends(params?: UsageStatsParams): Promise<TrendData[]>;

  /**
   * Get subtask execution analytics.
   * @param params - Query parameters (projectId, subtaskType, date range)
   * @returns Subtask statistics
   * @throws {AgentMemoryError} E4000 - Database operation failed
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
   * Record a vote from an agent for a task.
   * Uses upsert to handle duplicate votes from the same agent.
   * @param input - Vote parameters
   * @throws {AgentMemoryError} E1000 - Missing required field (taskId, agentId, voteValue)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  recordVote(input: RecordVoteInput): Promise<void>;

  /**
   * Get all votes for a task.
   * @param taskId - Task ID
   * @returns Array of vote records
   * @throws {AgentMemoryError} E4000 - Database operation failed
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
   * Create a guideline acknowledgment for a session.
   * @param input - Acknowledgment parameters
   * @returns Created acknowledgment record
   * @throws {AgentMemoryError} E1000 - Missing required field (sessionId, guidelineId)
   * @throws {AgentMemoryError} E2000 - Session or guideline not found
   * @throws {AgentMemoryError} E2001 - Acknowledgment already exists
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  createAcknowledgment(input: CreateAcknowledgmentInput): Promise<SessionGuidelineAcknowledgment>;

  /**
   * Get all acknowledged guideline IDs for a session.
   * @param sessionId - Session ID
   * @returns Array of guideline IDs
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getAcknowledgedGuidelineIds(sessionId: string): Promise<string[]>;

  /**
   * Log a verification action (pre_check, post_check, acknowledge).
   * @param input - Verification log parameters
   * @returns Created log entry
   * @throws {AgentMemoryError} E1000 - Missing required field (actionType, proposedAction, result)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  logVerification(input: LogVerificationInput): Promise<VerificationLogEntry>;

  /**
   * Get verification rules for a guideline.
   * @param guidelineId - Guideline ID
   * @returns Verification rules if defined, null otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getVerificationRules(guidelineId: string): Promise<VerificationRules | null>;

  /**
   * Get project ID for a session.
   * @param sessionId - Session ID
   * @returns Project ID if session has a project, null otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getProjectIdForSession(sessionId: string): Promise<string | null>;
}
