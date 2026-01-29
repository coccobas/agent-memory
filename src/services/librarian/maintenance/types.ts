/**
 * Librarian Maintenance Types
 *
 * Type definitions for the unified maintenance system orchestrated by the Librarian.
 * This module consolidates all background maintenance tasks: consolidation, forgetting,
 * and graph backfill into a single coordinated system.
 */

import type { ScopeType } from '../../../db/schema.js';
import { DEFAULT_SEMANTIC_EDGE_CONFIG } from '../../graph/semantic-edge-inference.types.js';

// =============================================================================
// ENV VAR HELPERS
// =============================================================================

/**
 * Parse boolean from environment variable
 */
function parseEnvBoolean(envVar: string | undefined, defaultValue: boolean): boolean {
  if (envVar === undefined) return defaultValue;
  return envVar.toLowerCase() === 'true' || envVar === '1';
}

/**
 * Get toolTagAssignment.enabled from env var
 * AGENT_MEMORY_TOOL_TAG_ASSIGNMENT_ENABLED=true
 */
export function getToolTagAssignmentEnabled(): boolean {
  return parseEnvBoolean(process.env.AGENT_MEMORY_TOOL_TAG_ASSIGNMENT_ENABLED, false);
}

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
 * Embedding backfill task configuration
 */
export interface EmbeddingBackfillConfig {
  /** Enable embedding backfill during maintenance */
  enabled: boolean;
  /** Batch size for processing entries */
  batchSize: number;
  /** Delay between batches in milliseconds */
  delayMs: number;
  /** Maximum entries to backfill per run */
  maxEntries: number;
  /** Entry types to process */
  entryTypes: Array<'tool' | 'guideline' | 'knowledge'>;
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
 * Semantic edge inference task configuration
 *
 * Automatically creates `related_to` edges between semantically similar
 * entries based on embedding cosine similarity. This populates the
 * knowledge graph with meaningful relationships discovered from content.
 */
export interface SemanticEdgeInferenceConfig {
  /** Enable semantic edge inference during maintenance */
  enabled: boolean;
  /** Minimum cosine similarity threshold to create an edge (0-1) */
  similarityThreshold: number;
  /** Maximum edges to create per entry */
  maxEdgesPerEntry: number;
  /** Entry types to process */
  entryTypes: Array<'tool' | 'guideline' | 'knowledge' | 'experience'>;
  /** Maximum entries to process per run */
  maxEntries: number;
}

/**
 * Tool tag assignment task configuration
 *
 * Uses LLM to analyze guidelines/knowledge entries and assign `tool:*` tags
 * indicating which tools (Edit, Bash, Write, etc.) each entry is relevant to.
 * This enables tool-specific context injection.
 */
export interface ToolTagAssignmentConfig {
  /** Enable tool tag assignment during maintenance */
  enabled: boolean;
  /** Maximum entries to process per run */
  maxEntries: number;
  /** Entry types to process */
  entryTypes: Array<'guideline' | 'knowledge'>;
  /** Available tools to assign (will create tool:* tags) */
  availableTools: string[];
  /** Minimum confidence from LLM to assign a tool tag (0-1) */
  minConfidence: number;
  /** Skip entries that already have tool:* tags */
  skipAlreadyTagged: boolean;
}

/**
 * Embedding cleanup task configuration
 *
 * Removes orphaned embedding records for entries that have been
 * deactivated or deleted. Also cleans up vectors from LanceDB.
 */
export interface EmbeddingCleanupConfig {
  /** Enable embedding cleanup during maintenance */
  enabled: boolean;
  /** Maximum entries to clean up per run */
  maxEntries: number;
  /** Entry types to clean up */
  entryTypes: Array<'tool' | 'guideline' | 'knowledge' | 'experience'>;
  /** Also remove vectors from LanceDB (requires vector service) */
  cleanupVectors: boolean;
}

/**
 * Message insight extraction task configuration
 *
 * Uses LLM to analyze conversation messages linked to episodes and extract
 * actionable insights (decisions, problems, solutions, learnings) as
 * knowledge entries.
 */
export interface MessageInsightExtractionConfig {
  /** Enable message insight extraction during maintenance */
  enabled: boolean;
  /** Minimum messages in episode to process */
  minMessages: number;
  /** Minimum confidence from LLM to store insight (0-1) */
  confidenceThreshold: number;
  /** Maximum episodes to process per run */
  maxEntriesPerRun: number;
  /** Focus areas for extraction */
  focusAreas: Array<'decisions' | 'facts' | 'rules' | 'problems' | 'solutions'>;
}

/**
 * Message relevance scoring task configuration
 *
 * Uses LLM to score conversation messages by relevance to the episode outcome.
 * Enables filtering low-value messages from queries like whatHappened.
 */
export interface MessageRelevanceScoringConfig {
  /** Enable message relevance scoring during maintenance */
  enabled: boolean;
  /** Maximum messages to score per run */
  maxMessagesPerRun: number;
  /** Thresholds for categorizing relevance scores */
  thresholds: {
    /** Score >= this is 'high' relevance */
    high: number;
    /** Score >= this is 'medium' relevance */
    medium: number;
    /** Score >= this is 'low' relevance (below medium) */
    low: number;
  };
}

/**
 * Experience title improvement task configuration
 *
 * Uses LLM to generate better titles for experiences that have generic
 * auto-generated titles (e.g., "Episode: ..."). Preserves original title
 * in metadata.
 */
export interface ExperienceTitleImprovementConfig {
  /** Enable experience title improvement during maintenance */
  enabled: boolean;
  /** Maximum experiences to process per run */
  maxEntriesPerRun: number;
  /** Only process experiences with generic titles matching pattern */
  onlyGenericTitles: boolean;
  /** Regex pattern to identify generic titles */
  genericTitlePattern: string;
}

// =============================================================================
// ACCURACY IMPROVEMENT CONFIGURATIONS
// =============================================================================

/**
 * Extraction quality improvement task configuration
 *
 * Analyzes retrieval patterns to identify what types of content are valuable
 * and learns from implicit feedback (retrieved vs ignored entries).
 */
export interface ExtractionQualityConfig {
  /** Enable extraction quality improvement during maintenance */
  enabled: boolean;
  /** Minimum sessions to analyze before generating insights */
  minSessionsForAnalysis: number;
  /** Days to look back for retrieval patterns */
  lookbackDays: number;
  /** Minimum retrievals for entry to be considered "high value" */
  highValueRetrievalThreshold: number;
  /** Maximum days without retrieval before entry is considered "low value" */
  lowValueDaysThreshold: number;
  /** Store learned patterns as experiences */
  storeAsExperiences: boolean;
  /** Maximum patterns to store per run */
  maxPatternsPerRun: number;
}

/**
 * Duplicate detection refinement task configuration
 *
 * Improves duplicate detection by analyzing retrieval patterns of similar entries
 * and adjusting similarity thresholds based on actual usage.
 */
export interface DuplicateRefinementConfig {
  /** Enable duplicate refinement during maintenance */
  enabled: boolean;
  /** Base similarity threshold for finding candidate duplicates */
  baseSimilarityThreshold: number;
  /** Minimum retrievals to consider entry "active" (not a duplicate candidate) */
  minRetrievalsForActive: number;
  /** If one similar entry has N times more retrievals, other might be duplicate */
  dominanceRatio: number;
  /** Maximum duplicate candidates to analyze per run */
  maxCandidatesPerRun: number;
  /** Store threshold adjustments as knowledge */
  storeThresholdAdjustments: boolean;
}

/**
 * Category accuracy tracking task configuration
 *
 * Tracks how well auto-categorization matches actual usage patterns
 * and identifies systematic miscategorizations.
 */
export interface CategoryAccuracyConfig {
  /** Enable category accuracy tracking during maintenance */
  enabled: boolean;
  /** Minimum retrievals to include entry in analysis */
  minRetrievalsForAnalysis: number;
  /** Categories to track accuracy for */
  trackedCategories: string[];
  /** Store miscategorization patterns as knowledge */
  storeMiscategorizationPatterns: boolean;
  /** Maximum entries to analyze per run */
  maxEntriesPerRun: number;
  /** Trigger re-categorization if confidence below threshold */
  recategorizationThreshold: number;
}

/**
 * Relevance calibration task configuration
 *
 * Calibrates confidence/relevance scores based on actual utility
 * (retrieval patterns and success rates).
 */
export interface RelevanceCalibrationConfig {
  /** Enable relevance calibration during maintenance */
  enabled: boolean;
  /** Number of confidence buckets for calibration curve */
  confidenceBuckets: number;
  /** Minimum entries per bucket for reliable calibration */
  minEntriesPerBucket: number;
  /** Store calibration curve as knowledge */
  storeCalibrationCurve: boolean;
  /** Apply calibration adjustments to new extractions */
  applyToNewExtractions: boolean;
  /** Maximum calibration adjustment factor (e.g., 0.2 = +/- 20%) */
  maxAdjustmentFactor: number;
}

/**
 * Feedback loop executor task configuration
 *
 * Aggregates signals from other accuracy tasks and applies improvements
 * to extraction policies and configurations.
 */
export interface FeedbackLoopConfig {
  /** Enable feedback loop execution during maintenance */
  enabled: boolean;
  /** Minimum confidence to apply learned improvements */
  minConfidenceForApplication: number;
  /** Store improvement decisions as knowledge */
  storeImprovementDecisions: boolean;
  /** Apply policy weight updates */
  updatePolicyWeights: boolean;
  /** Apply threshold adjustments */
  updateThresholds: boolean;
  /** Maximum improvements to apply per run */
  maxImprovementsPerRun: number;
}

/**
 * Error analysis task configuration
 *
 * Analyzes cross-session error patterns and generates recommendations
 * for corrective knowledge/guidelines.
 */
export interface ErrorAnalysisConfig {
  /** Enable error analysis during maintenance */
  enabled: boolean;
  /** Days to look back for errors */
  lookbackDays: number;
  /** Minimum sessions an error must appear in to be considered a pattern */
  minSessionsForPattern: number;
  /** Maximum errors to analyze per run */
  maxErrors: number;
}

/**
 * Health calculation configuration
 */
export interface HealthConfig {
  /**
   * Connectivity scoring mode:
   * - 'inclusive': Count edges where at least one endpoint is in scope (default)
   * - 'strict': Count edges where both endpoints are in scope
   */
  connectivityMode: 'inclusive' | 'strict';
}

/**
 * Job queue configuration for auto-draining pending jobs
 *
 * Controls how the maintenance job queue behaves when jobs complete,
 * including automatic processing of pending jobs, deduplication, and merging.
 */
export interface QueueConfig {
  /** Maximum number of pending jobs allowed before rejecting new ones (default: 10) */
  maxQueueDepth: number;
  /** How long a pending job can wait before auto-expiring in milliseconds (default: 30 minutes) */
  pendingJobExpirationMs: number;
  /** Whether to skip pending jobs whose tasks were already covered by recent completions */
  enableDeduplication: boolean;
  /** Time window for considering a completed job as "recent" for deduplication in milliseconds (default: 5 minutes) */
  deduplicationWindowMs: number;
  /** Whether to merge multiple single-task pending jobs into one combined job */
  enableMerging: boolean;
}

/**
 * Default queue configuration
 */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxQueueDepth: 10,
  pendingJobExpirationMs: 30 * 60 * 1000, // 30 minutes
  enableDeduplication: true,
  deduplicationWindowMs: 5 * 60 * 1000, // 5 minutes
  enableMerging: true,
};

/**
 * Unified maintenance configuration
 */
export interface MaintenanceConfig {
  /** Overall enable/disable for maintenance */
  enabled: boolean;
  /** Run maintenance on session end */
  runOnSessionEnd: boolean;
  /** Health calculation settings */
  health: HealthConfig;
  /** Consolidation settings */
  consolidation: ConsolidationConfig;
  /** Forgetting/decay settings */
  forgetting: ForgettingConfig;
  /** Graph backfill settings */
  graphBackfill: GraphBackfillConfig;
  /** Embedding backfill settings */
  embeddingBackfill: EmbeddingBackfillConfig;
  /** Latent memory population settings */
  latentPopulation: LatentPopulationConfig;
  /** Tag refinement settings */
  tagRefinement: TagRefinementConfig;
  /** Semantic edge inference settings */
  semanticEdgeInference: SemanticEdgeInferenceConfig;
  /** Tool tag assignment settings */
  toolTagAssignment: ToolTagAssignmentConfig;
  /** Embedding cleanup settings */
  embeddingCleanup: EmbeddingCleanupConfig;
  /** Message insight extraction settings */
  messageInsightExtraction: MessageInsightExtractionConfig;
  /** Message relevance scoring settings */
  messageRelevanceScoring: MessageRelevanceScoringConfig;
  /** Experience title improvement settings */
  experienceTitleImprovement: ExperienceTitleImprovementConfig;
  /** Extraction quality improvement settings */
  extractionQuality: ExtractionQualityConfig;
  /** Duplicate refinement settings */
  duplicateRefinement: DuplicateRefinementConfig;
  /** Category accuracy tracking settings */
  categoryAccuracy: CategoryAccuracyConfig;
  /** Relevance calibration settings */
  relevanceCalibration: RelevanceCalibrationConfig;
  /** Feedback loop execution settings */
  feedbackLoop: FeedbackLoopConfig;
  /** Error analysis settings */
  errorAnalysis: ErrorAnalysisConfig;
}

/**
 * Default maintenance configuration
 */
export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  enabled: true,
  runOnSessionEnd: true,
  health: {
    connectivityMode: 'inclusive', // Count edges where at least one endpoint is in scope
  },
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
    maxEntries: 100,
  },
  embeddingBackfill: {
    enabled: true,
    batchSize: 50,
    delayMs: 1000,
    maxEntries: 100,
    entryTypes: ['tool', 'guideline', 'knowledge'],
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
  semanticEdgeInference: {
    enabled: DEFAULT_SEMANTIC_EDGE_CONFIG.enabled,
    similarityThreshold: DEFAULT_SEMANTIC_EDGE_CONFIG.similarityThreshold,
    maxEdgesPerEntry: DEFAULT_SEMANTIC_EDGE_CONFIG.maxEdgesPerEntry,
    entryTypes: DEFAULT_SEMANTIC_EDGE_CONFIG.entryTypes,
    maxEntries: DEFAULT_SEMANTIC_EDGE_CONFIG.maxEntriesPerRun,
  },
  toolTagAssignment: {
    enabled: getToolTagAssignmentEnabled(),
    maxEntries: 50,
    entryTypes: ['guideline', 'knowledge'],
    availableTools: ['Edit', 'Write', 'Bash', 'Read', 'Grep', 'Glob', 'git', 'TodoWrite', 'Task'],
    minConfidence: 0.7,
    skipAlreadyTagged: true,
  },
  embeddingCleanup: {
    enabled: true,
    maxEntries: 100,
    entryTypes: ['tool', 'guideline', 'knowledge', 'experience'],
    cleanupVectors: true,
  },
  messageInsightExtraction: {
    enabled: true,
    minMessages: 3,
    confidenceThreshold: 0.7,
    maxEntriesPerRun: 50,
    focusAreas: ['decisions', 'facts', 'rules'],
  },
  messageRelevanceScoring: {
    enabled: true,
    maxMessagesPerRun: 200,
    thresholds: { high: 0.8, medium: 0.5, low: 0 },
  },
  experienceTitleImprovement: {
    enabled: true,
    maxEntriesPerRun: 100,
    onlyGenericTitles: true,
    genericTitlePattern: '^Episode:\\s',
  },
  extractionQuality: {
    enabled: true,
    minSessionsForAnalysis: 3,
    lookbackDays: 30,
    highValueRetrievalThreshold: 3,
    lowValueDaysThreshold: 14,
    storeAsExperiences: true,
    maxPatternsPerRun: 10,
  },
  duplicateRefinement: {
    enabled: true,
    baseSimilarityThreshold: 0.85,
    minRetrievalsForActive: 2,
    dominanceRatio: 3,
    maxCandidatesPerRun: 50,
    storeThresholdAdjustments: true,
  },
  categoryAccuracy: {
    enabled: true,
    minRetrievalsForAnalysis: 2,
    trackedCategories: ['decision', 'fact', 'context', 'reference', 'bug'],
    storeMiscategorizationPatterns: true,
    maxEntriesPerRun: 100,
    recategorizationThreshold: 0.5,
  },
  relevanceCalibration: {
    enabled: true,
    confidenceBuckets: 5,
    minEntriesPerBucket: 10,
    storeCalibrationCurve: true,
    applyToNewExtractions: false,
    maxAdjustmentFactor: 0.2,
  },
  feedbackLoop: {
    enabled: true,
    minConfidenceForApplication: 0.7,
    storeImprovementDecisions: true,
    updatePolicyWeights: false,
    updateThresholds: true,
    maxImprovementsPerRun: 5,
  },
  errorAnalysis: {
    enabled: false,
    lookbackDays: 7,
    minSessionsForPattern: 2,
    maxErrors: 50,
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
    | 'consolidation'
    | 'forgetting'
    | 'graphBackfill'
    | 'embeddingBackfill'
    | 'latentPopulation'
    | 'tagRefinement'
    | 'semanticEdgeInference'
    | 'toolTagAssignment'
    | 'embeddingCleanup'
    | 'messageInsightExtraction'
    | 'messageRelevanceScoring'
    | 'experienceTitleImprovement'
    | 'extractionQuality'
    | 'duplicateRefinement'
    | 'categoryAccuracy'
    | 'relevanceCalibration'
    | 'feedbackLoop'
    | 'errorAnalysis'
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
 * Result from embedding backfill task
 */
export interface EmbeddingBackfillResult {
  /** Task was executed */
  executed: boolean;
  /** Total entries processed */
  entriesProcessed: number;
  /** Embeddings created */
  embeddingsCreated: number;
  /** Entries that already had embeddings (skipped) */
  alreadyHadEmbeddings: number;
  /** Failures */
  failed: number;
  /** Breakdown by entry type */
  byType: Record<string, { processed: number; created: number; failed: number }>;
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
 * Result from semantic edge inference task
 */
export interface SemanticEdgeInferenceResult {
  /** Task was executed */
  executed: boolean;
  /** Entries with embeddings processed */
  entriesProcessed: number;
  /** Similarity comparisons computed */
  comparisonsComputed: number;
  /** Pairs found above similarity threshold */
  pairsAboveThreshold: number;
  /** Edges created */
  edgesCreated: number;
  /** Edges that already existed (skipped) */
  edgesExisting: number;
  /** Edges skipped due to maxEdgesPerEntry limit */
  edgesSkipped: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Result from tool tag assignment task
 */
export interface ToolTagAssignmentResult {
  /** Task was executed */
  executed: boolean;
  /** Entries scanned */
  entriesScanned: number;
  /** Entries that received new tool tags */
  entriesTagged: number;
  /** Total tool tags added across all entries */
  tagsAdded: number;
  /** Entries skipped (already tagged or no applicable tools) */
  entriesSkipped: number;
  /** Breakdown by entry type */
  byType: Record<string, { scanned: number; tagged: number; tagsAdded: number }>;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Result from embedding cleanup task
 */
export interface EmbeddingCleanupResult {
  /** Task was executed */
  executed: boolean;
  /** Orphaned embedding records found */
  orphansFound: number;
  /** Embedding records deleted */
  recordsDeleted: number;
  /** Vectors removed from LanceDB */
  vectorsRemoved: number;
  /** Breakdown by entry type */
  byType: Record<string, { found: number; deleted: number }>;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Result from message insight extraction task
 */
export interface MessageInsightExtractionResult {
  executed: boolean;
  episodesProcessed: number;
  messagesAnalyzed: number;
  insightsExtracted: number;
  knowledgeEntriesCreated: number;
  relationsCreated: number;
  durationMs: number;
  errors?: string[];
}

/**
 * Result from message relevance scoring task
 */
export interface MessageRelevanceScoringResult {
  executed: boolean;
  messagesScored: number;
  byCategory: { high: number; medium: number; low: number };
  durationMs: number;
  errors?: string[];
}

/**
 * Result from experience title improvement task
 */
export interface ExperienceTitleImprovementResult {
  executed: boolean;
  experiencesScanned: number;
  titlesImproved: number;
  skipped: number;
  durationMs: number;
  errors?: string[];
}

export interface ExtractionQualityResult {
  executed: boolean;
  sessionsAnalyzed: number;
  highValuePatternsFound: number;
  lowValuePatternsFound: number;
  experiencesCreated: number;
  durationMs: number;
  errors?: string[];
}

export interface DuplicateRefinementResult {
  executed: boolean;
  candidatesAnalyzed: number;
  duplicatesIdentified: number;
  thresholdAdjustments: number;
  knowledgeEntriesCreated: number;
  durationMs: number;
  errors?: string[];
}

export interface CategoryAccuracyResult {
  executed: boolean;
  entriesAnalyzed: number;
  miscategorizationsFound: number;
  recategorizationsApplied: number;
  patternsStored: number;
  durationMs: number;
  errors?: string[];
}

export interface RelevanceCalibrationResult {
  executed: boolean;
  entriesAnalyzed: number;
  bucketsComputed: number;
  calibrationCurveStored: boolean;
  averageAdjustment: number;
  durationMs: number;
  errors?: string[];
}

export interface FeedbackLoopResult {
  executed: boolean;
  signalsProcessed: number;
  improvementsApplied: number;
  policyUpdates: number;
  thresholdUpdates: number;
  decisionsStored: number;
  durationMs: number;
  errors?: string[];
}

export interface ErrorAnalysisResult {
  executed: boolean;
  errorsAnalyzed: number;
  patternsDetected: number;
  recommendationsCreated: number;
  durationMs: number;
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
  /** Embedding backfill results */
  embeddingBackfill?: EmbeddingBackfillResult;
  /** Latent memory population results */
  latentPopulation?: LatentPopulationResult;
  /** Tag refinement results */
  tagRefinement?: TagRefinementResult;
  /** Semantic edge inference results */
  semanticEdgeInference?: SemanticEdgeInferenceResult;
  /** Tool tag assignment results */
  toolTagAssignment?: ToolTagAssignmentResult;
  /** Embedding cleanup results */
  embeddingCleanup?: EmbeddingCleanupResult;
  /** Message insight extraction results */
  messageInsightExtraction?: MessageInsightExtractionResult;
  /** Message relevance scoring results */
  messageRelevanceScoring?: MessageRelevanceScoringResult;
  /** Experience title improvement results */
  experienceTitleImprovement?: ExperienceTitleImprovementResult;
  /** Extraction quality improvement results */
  extractionQuality?: ExtractionQualityResult;
  /** Duplicate refinement results */
  duplicateRefinement?: DuplicateRefinementResult;
  /** Category accuracy tracking results */
  categoryAccuracy?: CategoryAccuracyResult;
  /** Relevance calibration results */
  relevanceCalibration?: RelevanceCalibrationResult;
  /** Feedback loop execution results */
  feedbackLoop?: FeedbackLoopResult;
  /** Error analysis results */
  errorAnalysis?: ErrorAnalysisResult;
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
