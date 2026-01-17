/**
 * Librarian Maintenance Types
 *
 * Type definitions for the unified maintenance system orchestrated by the Librarian.
 * This module consolidates all background maintenance tasks: consolidation, forgetting,
 * and graph backfill into a single coordinated system.
 */

import type { ScopeType } from '../../../db/schema.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Consolidation task configuration
 */
export interface ConsolidationConfig {
  /** Enable consolidation during maintenance */
  enabled: boolean;
  /** Similarity threshold for finding duplicates (0-1) */
  similarityThreshold: number;
  /** Maximum groups to process per run */
  maxGroups: number;
  /** Entry types to consolidate */
  entryTypes: Array<'tool' | 'guideline' | 'knowledge'>;
}

/**
 * Forgetting/decay task configuration
 */
export interface ForgettingConfig {
  /** Enable forgetting during maintenance */
  enabled: boolean;
  /** Days of inactivity before considering entry stale */
  staleDays: number;
  /** Minimum access count threshold */
  minAccessCount: number;
  /** Importance score threshold (0-1) */
  importanceThreshold: number;
  /** Strategy for determining what to forget */
  strategy: 'recency' | 'frequency' | 'importance' | 'combined';
  /** Maximum entries to forget per run */
  maxEntries: number;
}

/**
 * Graph backfill task configuration
 */
export interface GraphBackfillConfig {
  /** Enable graph backfill during maintenance */
  enabled: boolean;
  /** Batch size for processing entries */
  batchSize: number;
  /** Maximum entries to backfill per run */
  maxEntries: number;
}

/**
 * Latent memory population task configuration
 */
export interface LatentPopulationConfig {
  /** Enable latent memory population during maintenance */
  enabled: boolean;
  /** Batch size for processing entries */
  batchSize: number;
  /** Maximum entries to process per run */
  maxEntries: number;
  /** Entry types to populate */
  entryTypes: Array<'tool' | 'guideline' | 'knowledge'>;
  /** Default importance score for new latent memories */
  defaultImportance: number;
}

/**
 * Tag refinement task configuration
 *
 * Uses semantic similarity to propagate tags from well-tagged entries
 * to under-tagged or untagged entries. This replaces the need for
 * manual tagging operations and makes tagging "invisible" to agents.
 */
export interface TagRefinementConfig {
  /** Enable tag refinement during maintenance */
  enabled: boolean;
  /** Minimum similarity threshold for tag propagation (0-1) */
  similarityThreshold: number;
  /** Maximum entries to process per run */
  maxEntries: number;
  /** Minimum tags an entry should have (entries below this are candidates) */
  minTagsThreshold: number;
  /** Maximum tags to add per entry */
  maxTagsPerEntry: number;
  /** Entry types to refine tags for */
  entryTypes: Array<'tool' | 'guideline' | 'knowledge'>;
  /** Minimum confidence for tag propagation (0-1) */
  minConfidence: number;
}

/**
 * Unified maintenance configuration
 */
export interface MaintenanceConfig {
  /** Overall enable/disable for maintenance */
  enabled: boolean;
  /** Run maintenance on session end */
  runOnSessionEnd: boolean;
  /** Consolidation settings */
  consolidation: ConsolidationConfig;
  /** Forgetting/decay settings */
  forgetting: ForgettingConfig;
  /** Graph backfill settings */
  graphBackfill: GraphBackfillConfig;
  /** Latent memory population settings */
  latentPopulation: LatentPopulationConfig;
  /** Tag refinement settings */
  tagRefinement: TagRefinementConfig;
}

/**
 * Default maintenance configuration
 */
export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  enabled: true,
  runOnSessionEnd: true,
  consolidation: {
    enabled: true,
    similarityThreshold: 0.85,
    maxGroups: 20,
    entryTypes: ['tool', 'guideline', 'knowledge'],
  },
  forgetting: {
    enabled: true,
    staleDays: 90,
    minAccessCount: 2,
    importanceThreshold: 0.4,
    strategy: 'combined',
    maxEntries: 100,
  },
  graphBackfill: {
    enabled: true,
    batchSize: 50,
    maxEntries: 100, // Lower for session-end, higher for scheduled
  },
  latentPopulation: {
    enabled: true,
    batchSize: 20,
    maxEntries: 100,
    entryTypes: ['tool', 'guideline', 'knowledge'],
    defaultImportance: 0.5,
  },
  tagRefinement: {
    enabled: true,
    similarityThreshold: 0.75,
    maxEntries: 100,
    minTagsThreshold: 1,
    maxTagsPerEntry: 3,
    entryTypes: ['tool', 'guideline', 'knowledge'],
    minConfidence: 0.7,
  },
};

// =============================================================================
// REQUEST TYPES
// =============================================================================

/**
 * Request to run maintenance tasks
 */
export interface MaintenanceRequest {
  /** Target scope for maintenance */
  scopeType: ScopeType;
  /** Target scope ID */
  scopeId?: string;
  /** Which tasks to run (defaults to all enabled) */
  tasks?: Array<
    'consolidation' | 'forgetting' | 'graphBackfill' | 'latentPopulation' | 'tagRefinement'
  >;
  /** Dry run - analyze without making changes */
  dryRun?: boolean;
  /** Override config for this run */
  configOverrides?: Partial<MaintenanceConfig>;
  /** Who initiated this maintenance run */
  initiatedBy?: string;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result from consolidation task
 */
export interface ConsolidationResult {
  /** Task was executed */
  executed: boolean;
  /** Groups of similar entries found */
  groupsFound: number;
  /** Entries deduplicated */
  entriesDeduped: number;
  /** Entries merged */
  entriesMerged: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Result from forgetting task
 */
export interface ForgettingResult {
  /** Task was executed */
  executed: boolean;
  /** Candidates identified for forgetting */
  candidatesFound: number;
  /** Entries actually forgotten/archived */
  entriesForgotten: number;
  /** Breakdown by entry type */
  byType: Record<string, number>;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Result from graph backfill task
 */
export interface GraphBackfillResult {
  /** Task was executed */
  executed: boolean;
  /** Entries processed */
  entriesProcessed: number;
  /** Nodes created */
  nodesCreated: number;
  /** Edges created */
  edgesCreated: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Result from latent memory population task
 */
export interface LatentPopulationResult {
  /** Task was executed */
  executed: boolean;
  /** Entries scanned for missing latent memories */
  entriesScanned: number;
  /** Latent memories created */
  latentMemoriesCreated: number;
  /** Entries already having latent memories (skipped) */
  alreadyPopulated: number;
  /** Breakdown by entry type */
  byType: Record<string, { scanned: number; created: number }>;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Result from tag refinement task
 */
export interface TagRefinementResult {
  /** Task was executed */
  executed: boolean;
  /** Entries scanned for under-tagging */
  entriesScanned: number;
  /** Entries that received new tags */
  entriesTagged: number;
  /** Total tags added across all entries */
  tagsAdded: number;
  /** Entries skipped (already well-tagged) */
  alreadyTagged: number;
  /** Breakdown by entry type */
  byType: Record<string, { scanned: number; tagged: number; tagsAdded: number }>;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Unified maintenance result
 */
export interface MaintenanceResult {
  /** Unique run ID */
  runId: string;
  /** Request that triggered this run */
  request: MaintenanceRequest;
  /** Was this a dry run? */
  dryRun: boolean;
  /** Consolidation results */
  consolidation?: ConsolidationResult;
  /** Forgetting results */
  forgetting?: ForgettingResult;
  /** Graph backfill results */
  graphBackfill?: GraphBackfillResult;
  /** Latent memory population results */
  latentPopulation?: LatentPopulationResult;
  /** Tag refinement results */
  tagRefinement?: TagRefinementResult;
  /** Overall timing */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  /** Computed memory health after maintenance */
  healthAfter?: MemoryHealth;
}

// =============================================================================
// MEMORY HEALTH
// =============================================================================

/**
 * Memory health metrics
 */
export interface MemoryHealth {
  /** Overall health score (0-100) */
  score: number;
  /** Health grade */
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  /** Component scores */
  components: {
    /** Freshness - how recently entries have been accessed */
    freshness: number;
    /** Diversity - variety of entry types and categories */
    diversity: number;
    /** Connectivity - graph edge coverage */
    connectivity: number;
    /** Quality - confidence and validation scores */
    quality: number;
  };
  /** Recommendations for improvement */
  recommendations: string[];
  /** When this health check was computed */
  computedAt: string;
}

/**
 * Health thresholds for grading
 */
export const HEALTH_THRESHOLDS = {
  excellent: 85,
  good: 70,
  fair: 50,
  poor: 0,
} as const;

/**
 * Compute health grade from score
 */
export function computeHealthGrade(score: number): MemoryHealth['grade'] {
  if (score >= HEALTH_THRESHOLDS.excellent) return 'excellent';
  if (score >= HEALTH_THRESHOLDS.good) return 'good';
  if (score >= HEALTH_THRESHOLDS.fair) return 'fair';
  return 'poor';
}
