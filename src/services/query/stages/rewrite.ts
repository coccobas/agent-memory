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
import { IntentClassifier } from '../../query-rewrite/classifier.js';

/**
 * Extended pipeline context with rewrite results
 */
export interface RewriteStageContext extends PipelineContext {
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
 * Synchronous rewrite stage (fallback when service not available)
 *
 * Only performs intent classification, returns original query.
 * Use rewriteStageAsync for full expansion/HyDE support.
 */
export function rewriteStage(ctx: PipelineContext): RewriteStageContext {
  const { params, search } = ctx;

  // Early return if rewriting is disabled or no search
  if (params.disableRewrite === true || !search) {
    return {
      ...ctx,
      searchQueries: search ? [{ text: search, weight: 1.0, source: 'original' }] : [],
    };
  }

  // Classify intent (synchronous)
  const classifier = new IntentClassifier();
  const classification = classifier.classify(search);

  return {
    ...ctx,
    searchQueries: [{ text: search, weight: 1.0, source: 'original' }],
    rewriteIntent: classification.intent,
    rewriteStrategy: 'direct',
  };
}

/**
 * Async rewrite stage - transforms queries using HyDE, expansion, or decomposition
 *
 * Uses the QueryRewriteService from dependencies if available.
 * Falls back to synchronous stage if service not provided.
 *
 * Strategy selection:
 * 1. If params.disableRewrite is true → pass through with original query only
 * 2. If no search query → pass through with empty searchQueries
 * 3. If service available and enabled → use full rewrite service
 * 4. Fallback → use synchronous stage (original query only)
 */
export async function rewriteStageAsync(ctx: PipelineContext): Promise<RewriteStageContext> {
  const { params, search, deps } = ctx;

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

  // Check if rewrite service is available and any rewrite feature is enabled
  const service = deps.queryRewriteService;
  const anyRewriteEnabled =
    params.enableHyDE === true ||
    params.enableExpansion === true ||
    params.enableDecomposition === true;

  if (!service || !service.isAvailable() || !anyRewriteEnabled) {
    // Fall back to synchronous stage
    return rewriteStage(ctx);
  }

  // Call the async rewrite service
  try {
    const result = await service.rewrite({
      originalQuery: search,
      options: {
        enableHyDE: params.enableHyDE === true,
        enableExpansion: params.enableExpansion === true,
        enableDecomposition: params.enableDecomposition === true,
        maxExpansions: params.maxExpansions as number | undefined,
      },
    });

    // Log rewrite results if perf logging is enabled
    if (deps.perfLog && deps.logger && result.rewrittenQueries.length > 1) {
      deps.logger.debug(
        {
          originalQuery: search,
          expandedCount: result.rewrittenQueries.length - 1,
          intent: result.intent,
          strategy: result.strategy,
          processingTimeMs: result.processingTimeMs,
        },
        'query_rewrite completed'
      );
    }

    return {
      ...ctx,
      searchQueries: result.rewrittenQueries.map(rq => ({
        text: rq.text,
        embedding: rq.embedding,
        weight: rq.weight,
        source: rq.source,
      })),
      rewriteIntent: result.intent,
      rewriteStrategy: result.strategy,
    };
  } catch (error) {
    // Log error and fall back to original query
    if (deps.logger) {
      deps.logger.debug(
        { error: String(error), query: search },
        'query_rewrite failed, using original query'
      );
    }
    return rewriteStage(ctx);
  }
}
