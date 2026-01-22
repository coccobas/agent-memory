/**
 * Nested Explain Types
 *
 * Types for nested-by-stage retrieval explainability output.
 * Provides component-level score breakdowns, timing, and reasoning.
 */

import type { PipelineTelemetry, PipelineContext, QueryResultItem } from '../query/pipeline.js';

/**
 * Score component breakdown for a single result entry
 */
export interface ScoreComponents {
  /** Full-text search BM25 score (0-1 normalized) */
  fts?: number;
  /** Semantic/vector similarity score (0-1) */
  semantic?: number;
  /** Feedback-based score multiplier */
  feedback?: number;
  /** Priority score (for guidelines) */
  priority?: number;
  /** Recency decay score (0-1) */
  recency?: number;
  /** Entity match score (0-1) */
  entity?: number;
  /** Cross-encoder rerank score (if applied) */
  rerank?: number;
  /** Final composite score */
  final: number;
}

/**
 * Explain output for the resolve stage
 */
export interface ResolveStageExplain {
  /** Resolved scope chain */
  scopeChain: Array<{ scopeType: string; scopeId: string | null }>;
  /** Resolved entry types */
  types: string[];
  /** Resolved limit */
  limit: number;
  /** Resolved offset */
  offset: number;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Explain output for the strategy stage
 */
export interface StrategyStageExplain {
  /** Selected search strategy */
  strategy: 'hybrid' | 'semantic' | 'fts5' | 'like';
  /** Reason for strategy selection */
  reason: string;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Explain output for the rewrite stage
 */
export interface RewriteStageExplain {
  /** Original query */
  originalQuery: string;
  /** Rewritten queries with sources */
  rewrittenQueries: Array<{
    text: string;
    source: 'original' | 'hyde' | 'expansion' | 'decomposition';
    weight: number;
  }>;
  /** Detected intent */
  intent?: string;
  /** Exclusions parsed from query (negative examples) */
  exclusions?: string[];
  /** Duration in ms */
  durationMs: number;
}

/**
 * Explain output for the FTS stage
 */
export interface FtsStageExplain {
  /** Whether FTS was used */
  used: boolean;
  /** Number of FTS matches */
  matchCount: number;
  /** Top FTS scores (up to 10) */
  topScores: number[];
  /** Exclusions applied */
  exclusionsApplied?: string[];
  /** Duration in ms */
  durationMs: number;
}

/**
 * Explain output for the semantic stage
 */
export interface SemanticStageExplain {
  /** Whether semantic search was used */
  used: boolean;
  /** Embedding model used */
  model?: string;
  /** Number of semantic matches */
  matchCount: number;
  /** Similarity threshold applied */
  threshold?: number;
  /** Top semantic scores (up to 10) */
  topScores: number[];
  /** Exclusions applied (post-filter) */
  exclusionsApplied?: string[];
  /** Duration in ms */
  durationMs: number;
}

/**
 * Explain output for the hierarchical stage
 */
export interface HierarchicalStageExplain {
  /** Whether hierarchical retrieval was used */
  used: boolean;
  /** Levels traversed */
  levelsTraversed?: number;
  /** Summaries searched */
  summariesSearched?: number;
  /** Candidate entries found */
  candidatesFound?: number;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Explain output for the fetch stage
 */
export interface FetchStageExplain {
  /** Entries fetched per type */
  fetchedByType: Record<string, number>;
  /** Total entries fetched */
  totalFetched: number;
  /** Headroom factor applied */
  headroomFactor?: number;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Explain output for the filter stage
 */
export interface FilterStageExplain {
  /** Entries before filtering */
  beforeCount: number;
  /** Entries after filtering */
  afterCount: number;
  /** Filters applied */
  filtersApplied: string[];
  /** Duration in ms */
  durationMs: number;
}

/**
 * Explain output for the score stage
 */
export interface ScoreStageExplain {
  /** Scoring factors used */
  factors: string[];
  /** Score range (min-max) */
  scoreRange: { min: number; max: number };
  /** Top N entries with score breakdowns */
  topEntries: Array<{
    id: string;
    type: string;
    components: ScoreComponents;
  }>;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Explain output for the rerank stage
 */
export interface RerankStageExplain {
  /** Whether reranking was applied */
  used: boolean;
  /** Reranking method */
  method?: 'embedding' | 'cross-encoder';
  /** Entries reranked */
  entriesReranked?: number;
  /** Score changes (top 5) */
  scoreChanges?: Array<{
    id: string;
    before: number;
    after: number;
  }>;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Fusion method explanation
 */
export interface FusionExplain {
  /** Fusion method used */
  method: 'rrf' | 'max' | 'sum' | 'weighted';
  /** RRF k parameter (if RRF) */
  rrfK?: number;
  /** Weights per source (if weighted) */
  weights?: Record<string, number>;
}

/**
 * Nested explain result - organized by pipeline stage
 */
export interface NestedExplainResult {
  /** Summary text */
  summary: string;

  /** Stage-by-stage explanations */
  stages: {
    resolve?: ResolveStageExplain;
    strategy?: StrategyStageExplain;
    rewrite?: RewriteStageExplain;
    hierarchical?: HierarchicalStageExplain;
    fts?: FtsStageExplain;
    semantic?: SemanticStageExplain;
    fetch?: FetchStageExplain;
    filter?: FilterStageExplain;
    score?: ScoreStageExplain;
    rerank?: RerankStageExplain;
  };

  /** Fusion method details */
  fusion?: FusionExplain;

  /** Overall timing */
  timing: {
    totalMs: number;
    breakdown: Array<{ stage: string; durationMs: number; percent: number }>;
    bottleneck: string | null;
  };

  /** Cache status */
  cacheHit: boolean;
}

/**
 * Request for nested explain generation
 */
export interface NestedExplainRequest {
  /** Pipeline telemetry */
  telemetry: PipelineTelemetry;
  /** Pipeline context (for detailed breakdowns) */
  context: PipelineContext;
  /** Query results */
  results: QueryResultItem[];
  /** Original query string */
  query?: string;
}
