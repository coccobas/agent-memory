/**
 * Hierarchical Summarization Types
 *
 * Core types for the hierarchical summarization service that orchestrates
 * multi-level summarization of memory entries using community detection
 * and LLM-based summarization.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * LLM provider for summarization
 */
export type SummarizerProvider = 'openai' | 'anthropic' | 'ollama' | 'disabled';

/**
 * Configuration for hierarchical summarization service
 */
export interface HierarchicalSummarizationConfig {
  /**
   * Maximum hierarchy depth (levels)
   * Level 0: Original entries
   * Level 1: First-level summaries
   * Level 2: Second-level summaries (summaries of summaries)
   * etc.
   * Default: 3
   */
  maxLevels: number;

  /**
   * Minimum number of entries required to create a community/summary
   * Communities smaller than this are merged or left unsummarized
   * Default: 3
   */
  minGroupSize: number;

  /**
   * Similarity threshold for considering entries related (0-1)
   * Higher values require more similarity to group together
   * Default: 0.75
   */
  similarityThreshold: number;

  /**
   * Resolution parameter for Leiden community detection
   * Higher values create more, smaller communities
   * Default: 1.0
   */
  communityResolution: number;

  /**
   * LLM provider for generating summaries
   */
  provider: SummarizerProvider;

  /**
   * Model name override (optional)
   * If not provided, uses default from extraction service config
   */
  model?: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_HIERARCHICAL_SUMMARIZATION_CONFIG: HierarchicalSummarizationConfig = {
  maxLevels: 3,
  minGroupSize: 3,
  similarityThreshold: 0.75,
  communityResolution: 1.0,
  provider: 'disabled',
};

// =============================================================================
// SUMMARY ENTRY
// =============================================================================

/**
 * Hierarchy level for summaries
 * 0: Original entries (not a summary)
 * 1-3: Summary levels (1 = first-level summary, 2 = summary of summaries, etc.)
 */
export type HierarchyLevel = 0 | 1 | 2 | 3;

/**
 * A hierarchical summary entry
 *
 * Represents a summary of a group of related memory entries or lower-level summaries.
 * Stored in the knowledge table with special metadata.
 */
export interface SummaryEntry {
  /** Unique identifier */
  id: string;

  /** Hierarchy level (1-3) */
  hierarchyLevel: HierarchyLevel;

  /** Summary title */
  title: string;

  /** Summary content (LLM-generated) */
  content: string;

  /** Parent summary ID (if this is a higher-level summary) */
  parentSummaryId?: string;

  /** IDs of members that were summarized (entry IDs or summary IDs) */
  memberIds: string[];

  /** Number of original entries represented (includes transitive members) */
  memberCount: number;

  /** Embedding vector for the summary (optional) */
  embedding?: number[];

  /** Scope information */
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;

  /** Timestamps */
  createdAt: string;
  updatedAt?: string;

  /** Metadata about summary quality */
  metadata?: {
    /** Cohesion score of the community (0-1) */
    cohesion?: number;
    /** Processing time in milliseconds */
    processingTimeMs?: number;
    /** Model used for summarization */
    model?: string;
    /** Provider used for summarization */
    provider?: string;
  };
}

// =============================================================================
// BUILD OPTIONS & RESULTS
// =============================================================================

/**
 * Options for building hierarchical summaries
 */
export interface BuildSummariesOptions {
  /** Scope to build summaries for */
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;

  /**
   * Entry types to include in summarization
   * Default: ['tool', 'guideline', 'knowledge', 'experience']
   */
  entryTypes?: Array<'tool' | 'guideline' | 'knowledge' | 'experience'>;

  /**
   * Force rebuild even if summaries already exist
   * Default: false
   */
  forceRebuild?: boolean;

  /**
   * Maximum hierarchy levels for this build
   * Overrides config.maxLevels if provided
   */
  maxLevels?: number;

  /**
   * Minimum group size for this build
   * Overrides config.minGroupSize if provided
   */
  minGroupSize?: number;
}

/**
 * Result of building hierarchical summaries
 */
export interface BuildSummariesResult {
  /** Number of summaries created */
  summariesCreated: number;

  /** Number of hierarchy levels built (1-3) */
  levelsBuilt: number;

  /** Total processing time in milliseconds */
  processingTimeMs: number;

  /** Top-level summary (if a single root was reached) */
  topLevelSummary?: SummaryEntry;

  /** Summaries created at each level */
  summariesByLevel: {
    level1: number;
    level2: number;
    level3: number;
  };

  /** Statistics about the build */
  stats: {
    /** Total entries processed at level 0 */
    entriesProcessed: number;
    /** Number of communities detected at each level */
    communitiesByLevel: number[];
    /** Average cohesion by level */
    avgCohesionByLevel: number[];
  };
}

// =============================================================================
// SEARCH & QUERY
// =============================================================================

/**
 * Options for searching summaries
 */
export interface SearchSummariesOptions {
  /** Filter by hierarchy level */
  level?: HierarchyLevel;

  /** Filter by scope */
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;

  /** Search query (semantic or text) */
  query?: string;

  /** Maximum number of results */
  limit?: number;

  /** Include member IDs in results */
  includeMemberIds?: boolean;
}

/**
 * Status information about summary build
 */
export interface SummaryBuildStatus {
  /** When summaries were last built (ISO timestamp) */
  lastBuilt?: string;

  /** Total number of summaries in the scope */
  summaryCount: number;

  /** Count by hierarchy level */
  countByLevel: {
    level1: number;
    level2: number;
    level3: number;
  };

  /** Total entries covered by summaries */
  entriesCovered: number;
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

/**
 * Internal representation of an entry for summarization
 */
export interface SummarizableEntry {
  /** Entry or summary ID */
  id: string;

  /** Entry type */
  type: 'tool' | 'guideline' | 'knowledge' | 'experience' | 'summary';

  /** Text content to summarize */
  text: string;

  /** Embedding vector (required for community detection) */
  embedding: number[];

  /** Hierarchy level (0 for original entries, 1+ for summaries) */
  hierarchyLevel: HierarchyLevel;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Request to summarize a group of entries
 */
export interface SummarizationRequest {
  /** Entries to summarize */
  entries: SummarizableEntry[];

  /** Target hierarchy level for the summary */
  targetLevel: HierarchyLevel;

  /** Scope information */
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;

  /** Parent summary ID (if creating a higher-level summary) */
  parentSummaryId?: string;
}

/**
 * Result of a single summarization operation
 */
export interface SummarizationResult {
  /** Generated summary */
  summary: SummaryEntry;

  /** Processing time in milliseconds */
  processingTimeMs: number;

  /** Tokens used (if available) */
  tokensUsed?: number;
}
