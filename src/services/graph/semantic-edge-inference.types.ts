/**
 * Semantic Edge Inference Types
 *
 * Types for automatically inferring `related_to` edges between
 * semantically similar entries based on embedding similarity.
 */

/**
 * Configuration for semantic edge inference
 */
export interface SemanticEdgeInferenceConfig {
  /** Whether semantic edge inference is enabled */
  enabled: boolean;

  /** Minimum cosine similarity threshold to create an edge (0-1) */
  similarityThreshold: number;

  /** Maximum number of edges to create per entry */
  maxEdgesPerEntry: number;

  /** Entry types to include in inference */
  entryTypes: Array<'tool' | 'guideline' | 'knowledge' | 'experience'>;

  /** Batch size for processing entries */
  batchSize: number;

  /** Maximum entries to process per run (0 = unlimited) */
  maxEntriesPerRun: number;

  /** Minimum confidence to consider an embedding valid */
  minEmbeddingConfidence: number;
}

/**
 * Default configuration
 */
export const DEFAULT_SEMANTIC_EDGE_CONFIG: SemanticEdgeInferenceConfig = {
  enabled: true,
  similarityThreshold: 0.65, // Moderate threshold for semantic connections
  maxEdgesPerEntry: 5, // Limit edge explosion
  entryTypes: ['tool', 'guideline', 'knowledge', 'experience'],
  batchSize: 50,
  maxEntriesPerRun: 500,
  minEmbeddingConfidence: 0.5,
};

/**
 * Request parameters for inference
 */
export interface SemanticEdgeInferenceRequest {
  /** Scope type to process */
  scopeType: 'global' | 'org' | 'project' | 'session';

  /** Scope ID (required for non-global scopes) */
  scopeId?: string;

  /** Override configuration */
  configOverrides?: Partial<SemanticEdgeInferenceConfig>;

  /** Run ID for tracking */
  runId?: string;

  /** Dry run mode - calculate but don't create edges */
  dryRun?: boolean;

  /** Who initiated this run */
  initiatedBy?: string;
}

/**
 * Statistics for inference run
 */
export interface SemanticEdgeInferenceStats {
  /** Total entries with embeddings processed */
  entriesProcessed: number;

  /** Number of similarity comparisons made */
  comparisonsComputed: number;

  /** Number of pairs above threshold */
  pairsAboveThreshold: number;

  /** Edges created */
  edgesCreated: number;

  /** Edges that already existed */
  edgesExisting: number;

  /** Edges skipped (max per entry limit) */
  edgesSkipped: number;

  /** Failures */
  edgesFailed: number;
}

/**
 * Result of inference run
 */
export interface SemanticEdgeInferenceResult {
  /** Unique run identifier */
  runId: string;

  /** Whether this was a dry run */
  dryRun: boolean;

  /** Statistics */
  stats: SemanticEdgeInferenceStats;

  /** Timing information */
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };

  /** Errors encountered (non-fatal) */
  errors: string[];

  /** Sample of created edges (for debugging) */
  sampleEdges?: Array<{
    sourceId: string;
    sourceType: string;
    targetId: string;
    targetType: string;
    similarity: number;
  }>;
}

/**
 * Entry with embedding for processing
 */
export interface EntryWithEmbedding {
  entryId: string;
  entryType: 'tool' | 'guideline' | 'knowledge' | 'experience';
  scopeType: string;
  scopeId: string | null;
  embedding: number[];
  name: string;
}

/**
 * Similarity pair candidate
 */
export interface SimilarityPair {
  sourceId: string;
  sourceType: string;
  targetId: string;
  targetType: string;
  similarity: number;
}
