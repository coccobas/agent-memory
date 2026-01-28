/**
 * Query Rewriting Types
 *
 * Type definitions for HyDE, query expansion, intent classification,
 * and multi-hop query decomposition.
 */

import type { QueryEntryType } from '../../core/query-types.js';

// =============================================================================
// INTENT CLASSIFICATION
// =============================================================================

/**
 * Query intent types for classification
 * @deprecated Use UnifiedIntent from '../intent-detection/unified-intents.js' instead.
 * Will be removed in next major version. See ADR-001.
 */
export type QueryIntent = 'lookup' | 'how_to' | 'debug' | 'explore' | 'compare' | 'configure';

/**
 * Classification method used
 */
export type ClassificationMethod = 'pattern' | 'llm' | 'hybrid' | 'default';

/**
 * Result of intent classification
 */
export interface ClassificationResult {
  intent: QueryIntent;
  confidence: number;
  method: ClassificationMethod;
}

// =============================================================================
// REWRITE STRATEGY
// =============================================================================

/**
 * Strategy used for query rewriting
 */
export type RewriteStrategy =
  | 'direct' // Use query as-is (no rewriting)
  | 'hyde' // HyDE only
  | 'expansion' // Expansion only
  | 'hybrid' // HyDE + expansion
  | 'multi_hop'; // Decomposed queries

/**
 * Source of a rewritten query
 */
export type RewriteSource = 'original' | 'hyde' | 'expansion' | 'decomposition';

// =============================================================================
// REWRITTEN QUERIES
// =============================================================================

/**
 * A rewritten query with metadata
 */
export interface RewrittenQuery {
  /** The query text */
  text: string;
  /** Pre-computed embedding (optional, for HyDE) */
  embedding?: number[];
  /** Where this query came from */
  source: RewriteSource;
  /** Weight for scoring (0-1, original typically 1.0) */
  weight: number;
  /** For multi-hop: which sub-query this belongs to */
  subQueryIndex?: number;
}

// =============================================================================
// REWRITE INPUT/OUTPUT
// =============================================================================

/**
 * Options for query rewriting
 */
export interface RewriteOptions {
  /** Enable HyDE (Hypothetical Document Embedding) */
  enableHyDE?: boolean;
  /** Enable query expansion with synonyms/relations */
  enableExpansion?: boolean;
  /** Enable multi-hop query decomposition */
  enableDecomposition?: boolean;
  /** Maximum number of expansions to generate */
  maxExpansions?: number;
  /** Number of HyDE documents to generate */
  hydeDocumentCount?: number;
  /** Entry types to target (affects HyDE prompt) */
  targetTypes?: QueryEntryType[];
}

/**
 * Input to the query rewrite service
 */
export interface RewriteInput {
  /** Original query text */
  originalQuery: string;
  /** Optional pre-classified intent */
  queryType?: QueryIntent;
  /** Context hints for better rewriting */
  contextHints?: {
    projectName?: string;
    recentTopics?: string[];
    conversationDepth?: number;
  };
  /** Rewrite options */
  options?: RewriteOptions;
}

/**
 * Result of query rewriting
 */
export interface RewriteResult {
  /** All rewritten queries (including original) */
  rewrittenQueries: RewrittenQuery[];
  /** Classified intent */
  intent: QueryIntent;
  /** Strategy used */
  strategy: RewriteStrategy;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

// =============================================================================
// HYDE
// =============================================================================

/**
 * Configuration for HyDE generator
 */
export interface HyDEConfig {
  /** LLM provider */
  provider: 'openai' | 'anthropic' | 'ollama' | 'disabled';
  /** Model override (optional) */
  model?: string;
  /** Generation temperature */
  temperature: number;
  /** Number of documents to generate */
  documentCount: number;
  /** Max tokens per document */
  maxTokensPerDoc: number;
}

/**
 * Result from HyDE generation
 */
export interface HyDEResult {
  /** Generated hypothetical documents */
  documents: string[];
  /** Embeddings for each document */
  embeddings: number[][];
  /** Model used */
  model: string;
  /** Processing time */
  processingTimeMs: number;
}

// =============================================================================
// QUERY EXPANSION
// =============================================================================

/**
 * Configuration for query expansion
 */
export interface ExpansionConfig {
  /** Use built-in synonym dictionary */
  useDictionary: boolean;
  /** Use relation graph for expansion */
  useRelations: boolean;
  /** Use LLM for semantic expansion */
  useLLM: boolean;
  /** Maximum expansions to generate */
  maxExpansions: number;
  /** Weight for expanded queries (0-1) */
  expansionWeight: number;
}

/**
 * An expanded query
 */
export interface ExpandedQuery {
  /** Expanded query text */
  text: string;
  /** Source of expansion */
  source: 'dictionary' | 'relation' | 'llm';
  /** Confidence/relevance score */
  confidence: number;
}

// =============================================================================
// MULTI-HOP QUERY PLANNING
// =============================================================================

/**
 * A sub-query in a multi-hop plan
 */
export interface SubQuery {
  /** Index in the plan */
  index: number;
  /** Query text */
  query: string;
  /** Purpose/description */
  purpose: string;
  /** Dependencies on other sub-queries */
  dependsOn?: number[];
}

/**
 * Execution order for sub-queries
 */
export type ExecutionOrder = 'parallel' | 'sequential' | 'dependency';

/**
 * A query plan for multi-hop queries
 */
export interface QueryPlan {
  /** Sub-queries to execute */
  subQueries: SubQuery[];
  /** How to execute them */
  executionOrder: ExecutionOrder;
  /** Dependency graph (if executionOrder is 'dependency') */
  dependencies?: Map<number, number[]>;
}

// =============================================================================
// SERVICE INTERFACE
// =============================================================================

/**
 * Query Rewrite Service interface
 */
export interface IQueryRewriteService {
  /**
   * Rewrite a query using configured strategies
   */
  rewrite(input: RewriteInput): Promise<RewriteResult>;

  /**
   * Classify query intent
   */
  classifyIntent(query: string): Promise<ClassificationResult>;

  /**
   * Check if rewriting is available/enabled
   */
  isAvailable(): boolean;
}
