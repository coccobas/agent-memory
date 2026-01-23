import type { IExtractionService } from '../../core/context.js';

export interface SemanticEdgeInferenceConfig {
  enabled: boolean;
  similarityThreshold: number;
  maxEdgesPerEntry: number;
  entryTypes: Array<'tool' | 'guideline' | 'knowledge' | 'experience'>;
  batchSize: number;
  maxEntriesPerRun: number;
  minEmbeddingConfidence: number;
  extractionService?: IExtractionService;
  llmInferenceThreshold: number;
}

export const DEFAULT_SEMANTIC_EDGE_CONFIG: SemanticEdgeInferenceConfig = {
  enabled: true,
  similarityThreshold: 0.65,
  maxEdgesPerEntry: 5,
  entryTypes: ['tool', 'guideline', 'knowledge', 'experience'],
  batchSize: 50,
  maxEntriesPerRun: 500,
  minEmbeddingConfidence: 0.5,
  llmInferenceThreshold: 0.85,
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
