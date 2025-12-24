/**
 * RL Service Types
 *
 * Types for the Reinforcement Learning policy service that learns to optimize:
 * - Extraction: what to store from conversations
 * - Retrieval: when to query memory vs generate directly
 * - Consolidation: how to merge, dedupe, and forget entries
 */

import type { ScopeType, EntryType } from '../../db/schema.js';

// =============================================================================
// POLICY DECISION TYPES
// =============================================================================

/**
 * Generic policy decision with action and confidence
 */
export interface PolicyDecision<TAction> {
  action: TAction;
  confidence: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// EXTRACTION POLICY TYPES
// =============================================================================

/**
 * Action to take for content extraction
 */
export interface ExtractionAction {
  decision: 'store' | 'skip' | 'defer';
  entryType?: EntryType;
  priority?: number;
}

/**
 * State features for extraction policy
 */
export interface ExtractionState {
  contextFeatures: {
    turnNumber: number;
    tokenCount: number;
    toolCallCount: number;
    hasError: boolean;
    userTurnCount: number;
    assistantTurnCount: number;
  };
  memoryState: {
    totalEntries: number;
    recentExtractions: number;
    similarEntryExists: boolean;
    sessionCaptureCount: number;
  };
  contentFeatures: {
    hasDecision: boolean;
    hasRule: boolean;
    hasFact: boolean;
    hasCommand: boolean;
    noveltyScore: number;
    complexity: number;
  };
}

// =============================================================================
// RETRIEVAL POLICY TYPES
// =============================================================================

/**
 * Action to take for memory retrieval
 */
export interface RetrievalAction {
  shouldRetrieve: boolean;
  scope?: ScopeType;
  types?: EntryType[];
  maxResults?: number;
}

/**
 * State features for retrieval policy
 */
export interface RetrievalState {
  queryFeatures: {
    queryLength: number;
    hasKeywords: boolean;
    queryComplexity: number;
    semanticCategory: string;
  };
  contextFeatures: {
    turnNumber: number;
    conversationDepth: number;
    recentToolCalls: number;
    hasErrors: boolean;
  };
  memoryStats: {
    totalEntries: number;
    recentRetrievals: number;
    avgRetrievalSuccess: number;
    lastRetrievalTime?: number;
  };
}

// =============================================================================
// CONSOLIDATION POLICY TYPES
// =============================================================================

/**
 * Action to take for entry consolidation
 */
export interface ConsolidationAction {
  action: 'merge' | 'dedupe' | 'archive' | 'abstract' | 'keep';
  targetEntries?: string[];
  mergeStrategy?: 'union' | 'intersection' | 'weighted';
}

/**
 * State features for consolidation policy
 */
export interface ConsolidationState {
  groupFeatures: {
    groupSize: number;
    avgSimilarity: number;
    minSimilarity: number;
    maxSimilarity: number;
    entryTypes: EntryType[];
  };
  usageStats: {
    totalRetrievals: number;
    avgRetrievalRank: number;
    successRate: number;
    lastAccessedDaysAgo: number;
  };
  scopeStats: {
    scopeType: ScopeType;
    totalEntriesInScope: number;
    duplicateRatio: number;
  };
}

// =============================================================================
// POLICY CONFIGURATION
// =============================================================================

/**
 * Configuration for a single policy
 */
export interface PolicyConfig {
  enabled: boolean;
  modelPath?: string;
}

/**
 * Configuration for RL service
 */
export interface RLServiceConfig {
  enabled: boolean;
  extraction: PolicyConfig;
  retrieval: PolicyConfig;
  consolidation: PolicyConfig;
}

// =============================================================================
// TRAINING DATA TYPES
// =============================================================================

/**
 * Training example for extraction policy
 */
export interface ExtractionTrainingExample {
  state: ExtractionState;
  action: ExtractionAction;
  reward: number;
  nextState?: ExtractionState;
  metadata?: {
    sessionId: string;
    turnNumber: number;
    outcomeType?: string;
  };
}

/**
 * Training example for retrieval policy
 */
export interface RetrievalTrainingExample {
  state: RetrievalState;
  action: RetrievalAction;
  reward: number;
  nextState?: RetrievalState;
  metadata?: {
    sessionId: string;
    queryText?: string;
    outcomeType?: string;
  };
}

/**
 * Training example for consolidation policy
 */
export interface ConsolidationTrainingExample {
  state: ConsolidationState;
  action: ConsolidationAction;
  reward: number;
  nextState?: ConsolidationState;
  metadata?: {
    decisionId: string;
    entryIds: string[];
  };
}
