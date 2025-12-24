/**
 * Feedback Service Types
 *
 * Types for the feedback service that collects RL training data:
 * - Retrieval tracking and outcomes
 * - Extraction decision feedback
 * - Consolidation decision evaluation
 */

import type {
  OutcomeType,
  OutcomeSignal,
  ExtractionDecisionType,
  ConsolidationAction,
  AttributionMethod,
  MemoryRetrieval,
  TaskOutcome,
  RetrievalOutcome,
  ExtractionDecision,
  ExtractionOutcome,
  ConsolidationDecision,
  ConsolidationOutcome,
} from '../../db/schema/feedback.js';
import type { EntryType as BaseEntryType, ScopeType } from '../../db/schema/types.js';

/**
 * Entry type for feedback/RL tracking - subset of base EntryType
 * Excludes 'project' which is not a trackable memory entry
 */
export type EntryType = Extract<BaseEntryType, 'tool' | 'guideline' | 'knowledge' | 'experience'>;

// Re-export feedback schema types
export type {
  OutcomeType,
  OutcomeSignal,
  ExtractionDecisionType,
  ConsolidationAction,
  AttributionMethod,
  ScopeType,
  MemoryRetrieval,
  TaskOutcome,
  RetrievalOutcome,
  ExtractionDecision,
  ExtractionOutcome,
  ConsolidationDecision,
  ConsolidationOutcome,
};

// =============================================================================
// INPUT PARAMETERS
// =============================================================================

/**
 * Parameters for recording a memory retrieval event
 */
export interface RecordRetrievalParams {
  sessionId: string;
  queryText?: string;
  queryEmbedding?: string; // Base64 encoded embedding
  entryType: EntryType;
  entryId: string;
  retrievalRank?: number;
  retrievalScore?: number;
}

/**
 * Parameters for recording a task outcome
 */
export interface RecordOutcomeParams {
  sessionId: string;
  conversationId?: string;
  outcomeType: OutcomeType;
  outcomeSignal?: OutcomeSignal;
  confidence?: number;
  metadata?: {
    errorMessages?: string[];
    userFeedback?: string;
    retryCount?: number;
    [key: string]: unknown;
  };
}

/**
 * Parameters for recording an extraction decision
 */
export interface RecordExtractionDecisionParams {
  sessionId: string;
  turnNumber?: number;
  decision: ExtractionDecisionType;
  entryType?: EntryType;
  entryId?: string; // If stored: the created entry ID
  contextHash?: string;
  confidence?: number;
}

/**
 * Parameters for recording a consolidation decision
 */
export interface RecordConsolidationDecisionParams {
  scopeType: ScopeType;
  scopeId?: string;
  action: ConsolidationAction;
  sourceEntryIds: string[]; // Array of entry IDs
  targetEntryId?: string; // If merged: result entry ID
  similarityScore?: number;
  decidedBy?: 'agent' | 'librarian' | 'user';
}

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result from evaluating an extraction decision
 */
export interface ExtractionOutcomeResult {
  decisionId: string;
  entryId: string;
  retrievalCount: number;
  successCount: number;
  lastRetrievedAt?: string;
  outcomeScore: number;
  evaluatedAt: string;
}

/**
 * Result from evaluating a consolidation decision
 */
export interface ConsolidationOutcomeResult {
  decisionId: string;
  preRetrievalRate: number;
  postRetrievalRate: number;
  preSuccessRate: number;
  postSuccessRate: number;
  evaluationWindowDays: number;
  outcomeScore: number;
  evaluatedAt: string;
}

/**
 * Contribution score for attribution
 */
export interface ContributionScore {
  retrievalId: string;
  score: number; // -1 to 1
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for the feedback service
 */
export interface FeedbackConfig {
  /**
   * Enable/disable feedback collection
   */
  enabled: boolean;

  /**
   * Attribution settings
   */
  attribution: {
    /**
     * Default attribution method
     */
    defaultMethod: AttributionMethod;

    /**
     * Enable attention-based attribution (requires model integration)
     */
    enableAttentionAttribution: boolean;
  };

  /**
   * Extraction reward computation settings
   */
  extraction: {
    /**
     * Reward for a retrieval that contributed to success
     */
    retrievalSuccessReward: number;

    /**
     * Penalty for a retrieval that contributed to failure
     */
    retrievalFailurePenalty: number;

    /**
     * Penalty for an entry that was never retrieved
     */
    neverRetrievedPenalty: number;

    /**
     * Minimum retrievals to consider entry useful
     */
    minRetrievalsForSuccess: number;

    /**
     * Evaluation window in days
     */
    evaluationWindowDays: number;
  };

  /**
   * Consolidation reward computation settings
   */
  consolidation: {
    /**
     * Weight for retrieval rate change
     */
    retrievalRateWeight: number;

    /**
     * Weight for success rate change
     */
    successRateWeight: number;

    /**
     * Weight for storage reduction
     */
    storageReductionWeight: number;

    /**
     * Penalty for reduced retrieval rate
     */
    retrievalLossPenalty: number;

    /**
     * Default evaluation window in days
     */
    evaluationWindowDays: number;
  };

  /**
   * Fire-and-forget settings
   */
  async: {
    /**
     * Enable fire-and-forget for non-critical feedback operations
     */
    enabled: boolean;

    /**
     * Operations that should run asynchronously
     */
    asyncOperations: ('retrieval' | 'outcome' | 'attribution')[];
  };
}

/**
 * Default feedback configuration
 */
export const DEFAULT_FEEDBACK_CONFIG: FeedbackConfig = {
  enabled: true,
  attribution: {
    defaultMethod: 'linear',
    enableAttentionAttribution: false,
  },
  extraction: {
    retrievalSuccessReward: 1.0,
    retrievalFailurePenalty: -0.5,
    neverRetrievedPenalty: -1.0,
    minRetrievalsForSuccess: 1,
    evaluationWindowDays: 30,
  },
  consolidation: {
    retrievalRateWeight: 0.5,
    successRateWeight: 0.3,
    storageReductionWeight: 0.2,
    retrievalLossPenalty: -2.0,
    evaluationWindowDays: 14,
  },
  async: {
    enabled: true,
    asyncOperations: ['retrieval', 'attribution'],
  },
};

// =============================================================================
// TRAINING DATA EXPORT
// =============================================================================

/**
 * Parameters for exporting training data
 */
export interface ExportParams {
  /**
   * Start date for data window
   */
  startDate?: string;

  /**
   * End date for data window
   */
  endDate?: string;

  /**
   * Scope filter
   */
  scopeType?: ScopeType;
  scopeId?: string;

  /**
   * Outcome filter
   */
  outcomeTypes?: OutcomeType[];

  /**
   * Entry type filter
   */
  entryTypes?: EntryType[];

  /**
   * Include only decisions with outcomes
   */
  onlyWithOutcomes?: boolean;

  /**
   * Limit number of records
   */
  limit?: number;
}

/**
 * Training data sample for retrieval policy
 */
export interface RetrievalTrainingSample {
  retrievalId: string;
  sessionId: string;
  queryText?: string;
  queryEmbedding?: string;
  entryType: EntryType;
  entryId: string;
  retrievalRank?: number;
  retrievalScore?: number;
  retrievedAt: string;
  outcomeType?: OutcomeType;
  contributionScore?: number;
  attributionMethod?: AttributionMethod;
}

/**
 * Training data sample for extraction policy
 */
export interface ExtractionTrainingSample {
  decisionId: string;
  sessionId: string;
  turnNumber?: number;
  decision: ExtractionDecisionType;
  entryType?: EntryType;
  entryId?: string;
  contextHash?: string;
  confidence?: number;
  decidedAt: string;
  retrievalCount?: number;
  successCount?: number;
  outcomeScore?: number;
}

/**
 * Training data sample for consolidation policy
 */
export interface ConsolidationTrainingSample {
  decisionId: string;
  scopeType: ScopeType;
  scopeId?: string;
  action: ConsolidationAction;
  sourceEntryIds: string[];
  targetEntryId?: string;
  similarityScore?: number;
  decidedAt: string;
  decidedBy?: string;
  preRetrievalRate?: number;
  postRetrievalRate?: number;
  preSuccessRate?: number;
  postSuccessRate?: number;
  outcomeScore?: number;
}

/**
 * Complete training dataset export
 */
export interface TrainingDataset {
  metadata: {
    exportedAt: string;
    startDate?: string;
    endDate?: string;
    filters: ExportParams;
  };
  retrieval: {
    samples: RetrievalTrainingSample[];
    count: number;
  };
  extraction: {
    samples: ExtractionTrainingSample[];
    count: number;
  };
  consolidation: {
    samples: ConsolidationTrainingSample[];
    count: number;
  };
  stats: {
    totalRetrievals: number;
    totalExtractions: number;
    totalConsolidations: number;
    successRate: number;
    averageContributionScore: number;
  };
}
