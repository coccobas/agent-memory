/**
 * Librarian Service Types
 *
 * Type definitions for the Librarian Agent service.
 */

import type { ScopeType } from '../../db/schema.js';
import type { PatternGroup, PatternDetectionResult } from './pipeline/pattern-detector.js';
import type { QualityGateResult } from './pipeline/quality-gate.js';
import type { CollectionResult } from './pipeline/collector.js';
import type { RecommendationGenerationResult, GeneratedRecommendation } from './pipeline/recommender.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

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
}

/**
 * Default librarian configuration
 */
export const DEFAULT_LIBRARIAN_CONFIG: LibrarianConfig = {
  enabled: true,
  schedule: '0 0 * * *', // Daily at midnight
  triggerOnSessionEnd: false,
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
