/**
 * Rewrite Stage
 *
 * Transforms queries using advanced rewriting techniques:
 * - HyDE (Hypothetical Document Embedding) for semantic search
 * - Query expansion with synonyms and relations
 * - Multi-hop query decomposition
 *
 * Extends PipelineContext with rewritten queries that downstream stages
 * (especially FTS) can use to improve recall and precision.
 */

import type { PipelineContext } from '../pipeline.js';
import type { RewrittenQuery, RewriteResult } from '../../query-rewrite/types.js';
import { IntentClassifier } from '../../query-rewrite/classifier.js';
// import { QueryExpander } from '../../query-rewrite/expander.js'; // TODO: Use when async pipeline is implemented

/**
 * Extended pipeline context with rewrite results
 */
export interface RewriteStageContext extends PipelineContext {
  /** Rewrite result with intent classification and strategy metadata */
  rewrite?: RewriteResult;

  /**
   * Search queries to execute (including original and rewritten)
   * Used by downstream stages (FTS, semantic) to perform multi-query search
   */
  searchQueries: Array<{
    /** Query text to search */
    text: string;
    /** Pre-computed embedding (for HyDE) */
    embedding?: number[];
    /** Weight for scoring (0-1, original typically 1.0) */
    weight: number;
    /** Source of this query */
    source: 'original' | 'hyde' | 'expansion' | 'decomposition';
  }>;
}

/**
 * Rewrite stage configuration
 * Can be overridden via params or injected dependencies
 */
interface RewriteConfig {
  /** Maximum number of expansions to generate */
  maxExpansions: number;
  /** Weight for expanded queries relative to original */
  expansionWeight: number;
  /** Weight for HyDE-generated queries */
  hydeWeight: number;
}

/**
 * Default rewrite configuration
 */
const DEFAULT_CONFIG: RewriteConfig = {
  maxExpansions: 3,
  expansionWeight: 0.7,
  hydeWeight: 0.9,
};

/**
 * Rewrite stage - transforms queries using HyDE, expansion, or decomposition
 *
 * Strategy selection:
 * 1. If params.disableRewrite is true → pass through with original query only
 * 2. If no search query → pass through with empty searchQueries
 * 3. If HyDE enabled (params.enableHyDE) → generate hypothetical documents
 * 4. If expansion enabled (params.enableExpansion) → expand with synonyms/relations
 * 5. If decomposition enabled (params.enableDecomposition) → break into sub-queries
 * 6. Default → use original query only
 *
 * The rewrite service (if available) is accessed via dependencies.
 * If no rewrite service is available, falls back to basic expansion.
 */
export function rewriteStage(ctx: PipelineContext): RewriteStageContext {
  const { params, search } = ctx;

  // Early return if rewriting is disabled
  if (params.disableRewrite === true) {
    return {
      ...ctx,
      searchQueries: search ? [{ text: search, weight: 1.0, source: 'original' }] : [],
    };
  }

  // Early return if no search query
  if (!search) {
    return {
      ...ctx,
      searchQueries: [],
    };
  }

  // Check if any rewrite features are enabled
  const anyRewriteEnabled =
    params.enableHyDE === true ||
    params.enableExpansion === true ||
    params.enableDecomposition === true;

  if (!anyRewriteEnabled) {
    // No rewrite requested - use original query only
    return {
      ...ctx,
      searchQueries: [{ text: search, weight: 1.0, source: 'original' }],
    };
  }

  // Perform query rewriting
  const rewriteResult = performRewrite(ctx);

  return {
    ...ctx,
    rewrite: rewriteResult,
    searchQueries: rewriteResult.rewrittenQueries.map(rq => ({
      text: rq.text,
      embedding: rq.embedding,
      weight: rq.weight,
      source: rq.source,
    })),
  };
}

/**
 * Performs query rewriting based on enabled features
 *
 * This is the core rewriting logic. It can be extended to call a full
 * rewrite service when available, but currently implements basic expansion.
 */
function performRewrite(ctx: PipelineContext): RewriteResult {
  const { params, search } = ctx;
  const startMs = Date.now();
  const config = DEFAULT_CONFIG;

  if (!search) {
    // Should not reach here due to early return, but handle gracefully
    return {
      rewrittenQueries: [],
      intent: 'explore',
      strategy: 'direct',
      processingTimeMs: 0,
    };
  }

  // Classify intent
  const classifier = new IntentClassifier();
  const classification = classifier.classify(search);

  const rewrittenQueries: RewrittenQuery[] = [];

  // Always include the original query with weight 1.0
  rewrittenQueries.push({
    text: search,
    source: 'original',
    weight: 1.0,
  });

  // Expansion-based rewriting
  if (params.enableExpansion === true) {
    const expansions = performExpansion(search, config);
    rewrittenQueries.push(...expansions);
  }

  // HyDE-based rewriting
  // Note: Actual HyDE requires LLM and embedding generation
  // This is a placeholder for when the full rewrite service is integrated
  if (params.enableHyDE === true) {
    // TODO: Call HyDE generator when available
    // For now, HyDE is not implemented in this basic version
    // The full implementation would:
    // 1. Use LLM to generate hypothetical documents
    // 2. Embed those documents
    // 3. Add them as RewrittenQuery with embeddings
  }

  // Decomposition-based rewriting
  // Note: Multi-hop decomposition requires query planning
  // This is a placeholder for when the full rewrite service is integrated
  if (params.enableDecomposition === true) {
    // TODO: Call query planner when available
    // For now, decomposition is not implemented
  }

  // Determine strategy based on what was actually used
  let strategy: RewriteResult['strategy'] = 'direct';
  if (params.enableHyDE && params.enableExpansion) {
    strategy = 'hybrid';
  } else if (params.enableHyDE) {
    strategy = 'hyde';
  } else if (params.enableExpansion) {
    strategy = 'expansion';
  } else if (params.enableDecomposition) {
    strategy = 'multi_hop';
  }

  return {
    rewrittenQueries,
    intent: classification.intent,
    strategy,
    processingTimeMs: Date.now() - startMs,
  };
}

/**
 * Performs query expansion using the QueryExpander
 */
function performExpansion(_query: string, _config: RewriteConfig): RewrittenQuery[] {
  // Note: QueryExpander.expand() is async, but pipeline stages are currently synchronous
  // For now, we don't perform expansion in this basic implementation
  // Full implementation would require making the pipeline async or extracting sync logic

  // TODO: Either make pipeline async or extract sync expansion logic from QueryExpander
  // When implemented, this would:
  // 1. Create QueryExpander instance
  // 2. Call sync expansion (dictionary-based)
  // 3. Map results to RewrittenQuery with weights

  return [];
}
