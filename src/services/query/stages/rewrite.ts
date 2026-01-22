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
import { parseExclusions } from '../exclusion-parser.js';

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

  if (params.disableRewrite === true || !search) {
    return {
      ...ctx,
      searchQueries: search ? [{ text: search, weight: 1.0, source: 'original' }] : [],
    };
  }

  const { cleanedQuery, exclusions } = parseExclusions(search);

  const classifier = new IntentClassifier();
  const classification = classifier.classify(cleanedQuery || search);

  const queryText = cleanedQuery || search;

  return {
    ...ctx,
    search: cleanedQuery || search,
    exclusions: exclusions.length > 0 ? exclusions : undefined,
    searchQueries: queryText ? [{ text: queryText, weight: 1.0, source: 'original' }] : [],
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

  if (params.disableRewrite === true) {
    return {
      ...ctx,
      searchQueries: search ? [{ text: search, weight: 1.0, source: 'original' }] : [],
    };
  }

  if (!search) {
    return {
      ...ctx,
      searchQueries: [],
    };
  }

  const { cleanedQuery, exclusions } = parseExclusions(search);
  const queryToProcess = cleanedQuery || search;

  const service = deps.queryRewriteService;
  const anyRewriteEnabled =
    params.enableHyDE === true ||
    params.enableExpansion === true ||
    params.enableDecomposition === true;

  if (!service || !service.isAvailable() || !anyRewriteEnabled) {
    return rewriteStage(ctx);
  }

  try {
    const result = await service.rewrite({
      originalQuery: queryToProcess,
      options: {
        enableHyDE: params.enableHyDE === true,
        enableExpansion: params.enableExpansion === true,
        enableDecomposition: params.enableDecomposition === true,
        maxExpansions: params.maxExpansions,
      },
    });

    if (deps.perfLog && deps.logger && result.rewrittenQueries.length > 1) {
      deps.logger.debug(
        {
          originalQuery: queryToProcess,
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
      search: queryToProcess,
      exclusions: exclusions.length > 0 ? exclusions : undefined,
      searchQueries: result.rewrittenQueries.map((rq) => ({
        text: rq.text,
        embedding: rq.embedding,
        weight: rq.weight,
        source: rq.source,
      })),
      rewriteIntent: result.intent,
      rewriteStrategy: result.strategy,
    };
  } catch (error) {
    if (deps.logger) {
      const isProduction = process.env.NODE_ENV === 'production';
      const errorDetails =
        error instanceof Error
          ? {
              message: error.message,
              name: error.name,
              ...(isProduction ? {} : { stack: error.stack?.split('\n').slice(0, 5).join('\n') }),
            }
          : { message: String(error), type: typeof error };

      deps.logger.warn(
        {
          ...errorDetails,
          query: queryToProcess?.substring(0, 100),
        },
        'query_rewrite failed, using original query'
      );
    }
    return rewriteStage(ctx);
  }
}
