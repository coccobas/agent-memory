/**
 * Librarian Service Types
 *
 * Type definitions for the Librarian Agent service.
 */

import type { ScopeType } from '../../db/schema.js';
import type { PatternGroup, PatternDetectionResult } from './pipeline/pattern-detector.js';
import type { QualityGateResult } from './pipeline/quality-gate.js';
import type { CollectionResult } from './pipeline/collector.js';
import type {
  RecommendationGenerationResult,
  GeneratedRecommendation,
} from './pipeline/recommender.js';

// Import maintenance types from dedicated module (must be before LibrarianConfig)
import type { MaintenanceConfig } from './maintenance/types.js';
import { DEFAULT_MAINTENANCE_CONFIG } from './maintenance/types.js';
export type { MaintenanceConfig, MaintenanceRequest, MaintenanceResult, MemoryHealth } from './maintenance/types.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Module toggle configuration - each module can be enabled/disabled
 */
export interface LibrarianModulesConfig {
  /** Experience capture module (LLM-based extraction) */
  capture: {
    enabled: boolean;
    /** Minimum messages required for extraction */
    minMessages?: number;
  };

  /** Pattern analysis module (detect patterns in experiences) */
  patternAnalysis: {
    enabled: boolean;
  };

  /** Latent memory module (cache warming for fast retrieval) */
  latentMemory: {
    enabled: boolean;
    /** Maximum entries to pre-warm per session */
    maxWarmEntries?: number;
    /** Minimum importance score for warming */
    minImportanceScore?: number;
    /** Include project-scope entries */
    warmProjectScope?: boolean;
    /** Include global-scope entries */
    warmGlobalScope?: boolean;
  };
}

/**
 * Default module configuration
 */
export const DEFAULT_MODULES_CONFIG: LibrarianModulesConfig = {
  capture: {
    enabled: true,
    minMessages: 3,
  },
  patternAnalysis: {
    enabled: true,
  },
  latentMemory: {
    enabled: true,
    maxWarmEntries: 100,
    minImportanceScore: 0.3,
    warmProjectScope: true,
    warmGlobalScope: true,
  },
};

/**
 * Librarian service configuration
 */
export interface LibrarianConfig {
  /** Enable the librarian service */
  enabled: boolean;

  /** Cron schedule for automatic analysis (e.g., "0 0 * * *" for midnight daily) */
  schedule?: string;

  /** Trigger analysis on session end */
  triggerOnSessionEnd: boolean;

  /** Module toggles */
  modules: LibrarianModulesConfig;

  /** Pattern detection settings */
  patternDetection: {
    /** Minimum embedding similarity for pattern grouping */
    embeddingSimilarityThreshold: number;
    /** Minimum trajectory similarity for validation */
    trajectorySimilarityThreshold: number;
    /** Minimum group size to form a pattern */
    minPatternSize: number;
  };

  /** Quality gate settings */
  qualityGate: {
    /** Confidence threshold for auto-promotion */
    autoPromoteThreshold: number;
    /** Confidence threshold for review queue */
    reviewThreshold: number;
    /** Minimum success rate for promotion */
    minSuccessRate: number;
  };

  /** Collection settings */
  collection: {
    /** Default lookback period in days */
    lookbackDays: number;
    /** Maximum experiences to collect per analysis */
    maxExperiences: number;
  };

  /** Recommendation settings */
  recommendations: {
    /** Days until recommendations expire */
    expirationDays: number;
  };

  /** Maintenance settings - consolidation, forgetting, graph backfill */
  maintenance: MaintenanceConfig;
}

/**
 * Default librarian configuration
 */
export const DEFAULT_LIBRARIAN_CONFIG: LibrarianConfig = {
  enabled: true,
  schedule: '0 5 * * *', // Daily at 5am
  triggerOnSessionEnd: true,
  modules: DEFAULT_MODULES_CONFIG,
  patternDetection: {
    embeddingSimilarityThreshold: 0.75,
    trajectorySimilarityThreshold: 0.7,
    minPatternSize: 2,
  },
  qualityGate: {
    autoPromoteThreshold: 0.9,
    reviewThreshold: 0.7,
    minSuccessRate: 0.6,
  },
  collection: {
    lookbackDays: 30,
    maxExperiences: 1000,
  },
  recommendations: {
    expirationDays: 30,
  },
  maintenance: DEFAULT_MAINTENANCE_CONFIG,
};

// =============================================================================
// ANALYSIS TYPES
// =============================================================================

/**
 * Analysis request parameters
 */
export interface AnalysisRequest {
  /** Target scope for analysis */
  scopeType: ScopeType;
  /** Target scope ID */
  scopeId?: string;
  /** Override default lookback days */
  lookbackDays?: number;
  /** Override default limits */
  maxExperiences?: number;
  /** Dry run (don't create recommendations) */
  dryRun?: boolean;
  /** Analysis run ID for tracking */
  runId?: string;
  /** Initiated by */
  initiatedBy?: string;
}

/**
 * Analysis pipeline stage
 */
export type AnalysisStage =
  | 'collection'
  | 'pattern_detection'
  | 'quality_evaluation'
  | 'recommendation_generation'
  | 'storage'
  | 'complete';

/**
 * Analysis progress update
 */
export interface AnalysisProgress {
  stage: AnalysisStage;
  progress: number; // 0-100
  message: string;
  timestamp: string;
}

/**
 * Full analysis result
 */
export interface AnalysisResult {
  /** Unique analysis run ID */
  runId: string;
  /** Request parameters */
  request: AnalysisRequest;
  /** Collection results */
  collection: CollectionResult;
  /** Pattern detection results */
  patternDetection: PatternDetectionResult;
  /** Quality evaluations by pattern */
  qualityEvaluations: Array<{
    pattern: PatternGroup;
    result: QualityGateResult;
  }>;
  /** Recommendation generation results */
  recommendations: RecommendationGenerationResult;
  /** Generated recommendations (for review queue) */
  generatedRecommendations: GeneratedRecommendation[];
  /** Timing information */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  /** Summary statistics */
  stats: {
    experiencesCollected: number;
    patternsDetected: number;
    autoPromoted: number;
    queuedForReview: number;
    rejected: number;
  };
  /** Was this a dry run? */
  dryRun: boolean;
  /** Any errors encountered */
  errors?: string[];
}

// =============================================================================
// SERVICE STATUS
// =============================================================================

// =============================================================================
// SESSION END TYPES
// =============================================================================

/**
 * Session end request - unified learning pipeline
 */
export interface SessionEndRequest {
  /** Session ID */
  sessionId: string;
  /** Project ID (optional, for scoping) */
  projectId?: string;
  /** Agent ID for attribution */
  agentId?: string;
  /** Conversation messages for experience capture */
  messages?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt?: string;
    toolsUsed?: string[];
  }>;
  /** Skip experience capture (only run analysis + maintenance) */
  skipCapture?: boolean;
  /** Skip pattern analysis */
  skipAnalysis?: boolean;
  /** Skip maintenance tasks */
  skipMaintenance?: boolean;
  /** Dry run mode */
  dryRun?: boolean;
}

/**
 * Session end result - combined results from all stages
 */
export interface SessionEndResult {
  /** Session ID processed */
  sessionId: string;
  /** Experience capture results */
  capture?: {
    experiencesExtracted: number;
    knowledgeExtracted: number;
    guidelinesExtracted: number;
    toolsExtracted: number;
    skippedDuplicates: number;
    processingTimeMs: number;
  };
  /** Pattern analysis results */
  analysis?: {
    patternsDetected: number;
    queuedForReview: number;
    autoPromoted: number;
    processingTimeMs: number;
  };
  /** Maintenance results */
  maintenance?: {
    consolidationDeduped: number;
    forgettingArchived: number;
    graphNodesCreated: number;
    graphEdgesCreated: number;
    processingTimeMs: number;
  };
  /** Timing information */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  /** Errors encountered (non-fatal) */
  errors?: string[];
}

// =============================================================================
// SESSION START TYPES
// =============================================================================

/**
 * Session start request - cache warming pipeline
 */
export interface SessionStartRequest {
  /** Session ID */
  sessionId: string;
  /** Project ID (for scoping cache warming) */
  projectId?: string;
  /** Agent ID for attribution */
  agentId?: string;
  /** Skip latent memory warming */
  skipWarmup?: boolean;
  /** Override max entries to warm */
  maxWarmEntries?: number;
}

/**
 * Session start result - cache warming results
 */
export interface SessionStartResult {
  /** Session ID processed */
  sessionId: string;
  /** Latent memory warming results */
  warmup?: {
    /** Entries pre-warmed into cache */
    entriesWarmed: number;
    /** Cache hit rate after warming */
    cacheHitRate: number;
    /** Processing time */
    processingTimeMs: number;
  };
  /** Timing information */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  /** Errors encountered (non-fatal) */
  errors?: string[];
}

// =============================================================================
// SERVICE STATUS
// =============================================================================

/**
 * Librarian service status
 */
export interface LibrarianStatus {
  /** Is the service enabled */
  enabled: boolean;
  /** Is the scheduler running */
  schedulerRunning: boolean;
  /** Current schedule (cron expression) */
  schedule?: string;
  /** Next scheduled run */
  nextRun?: string;
  /** Last analysis result summary */
  lastAnalysis?: {
    runId: string;
    completedAt: string;
    stats: AnalysisResult['stats'];
  };
  /** Current configuration */
  config: LibrarianConfig;
  /** Pending recommendations count */
  pendingRecommendations: number;
}
