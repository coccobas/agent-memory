/**
 * Strategy Stage
 *
 * Determines the search strategy to use based on configuration,
 * user overrides, and embedding availability.
 *
 * ## Strategy Selection Order
 *
 * 1. If no search query, use 'like' as neutral (no search needed)
 * 2. Fuzzy/regex search requires 'like' (FTS5 can't do these)
 * 3. Explicit user override via params.semanticSearch/useFts5
 * 4. Config-based default strategy
 * 5. Auto-detect based on embedding coverage
 * 6. Fallback to FTS5
 *
 * ## Strategies
 *
 * - 'hybrid': Combines FTS5 + semantic search for best results
 * - 'semantic': Pure vector similarity search
 * - 'fts5': Full-text search using SQLite FTS5
 * - 'like': Legacy LIKE-based search (fallback), used for fuzzy/regex
 */

import type { PipelineContext } from '../pipeline.js';
import { config } from '../../../config/index.js';
import {
  getEmbeddingCoverage,
  type ScopeChainElement,
  type EmbeddingEntryType,
} from '../../../services/embedding-coverage.service.js';

/**
 * Available search strategies (resolved, excludes 'auto')
 */
export type SearchStrategy = 'hybrid' | 'semantic' | 'fts5' | 'like';

/**
 * Extended pipeline context with search strategy
 */
export interface StrategyPipelineContext extends PipelineContext {
  /** Resolved search strategy for this query */
  searchStrategy: SearchStrategy;
}

/**
 * Resolve the search strategy based on params, config, and embedding availability
 *
 * @param ctx - Pipeline context with search params and scope info
 * @returns The resolved search strategy
 */
async function resolveSearchStrategy(ctx: PipelineContext): Promise<SearchStrategy> {
  const { params, scopeChain, types } = ctx;

  // 1. No search query = no strategy needed, use 'like' as neutral
  if (!ctx.search) return 'like';

  // 2. Fuzzy/regex search requires 'like' strategy (FTS5 can't do fuzzy matching)
  if (params.fuzzy === true || params.regex === true) return 'like';

  // 3. Explicit user override wins
  if (params.semanticSearch === true && params.useFts5 === true) return 'hybrid';
  if (params.semanticSearch === true) return 'semantic';
  if (params.useFts5 === true) return 'fts5';

  // 4. Config-based default
  // Access search config with type assertion since it may not be in interface yet
  const searchConfig = (
    config as { search?: { defaultStrategy?: string; autoSemanticThreshold?: number } }
  ).search;
  const configStrategy = searchConfig?.defaultStrategy ?? 'auto';
  if (configStrategy !== 'auto') return configStrategy as SearchStrategy;

  // 5. Auto-detect based on embedding coverage
  // Map ScopeDescriptor to ScopeChainElement format expected by coverage service
  const scopeElements: ScopeChainElement[] = scopeChain.map((sd) => ({
    type: sd.scopeType,
    id: sd.scopeId,
  }));

  // Map plural QueryType to singular EmbeddingEntryType
  const entryTypes: EmbeddingEntryType[] = types.map(
    (t) => t.replace(/s$/, '') as EmbeddingEntryType
  );

  const coverage = await getEmbeddingCoverage(ctx.deps.getSqlite(), scopeElements, entryTypes);

  const threshold = searchConfig?.autoSemanticThreshold ?? 0.8;
  if (coverage.ratio >= threshold) return 'hybrid';

  // 6. Fallback to FTS5
  return 'fts5';
}

/**
 * Strategy stage - determines which search strategy to use
 *
 * This async stage resolves the search strategy based on:
 * - User params (explicit override)
 * - Config defaults
 * - Embedding coverage (for auto mode)
 *
 * The resolved strategy is added to the context for downstream stages.
 */
export async function strategyStageAsync(ctx: PipelineContext): Promise<StrategyPipelineContext> {
  const startMs = Date.now();
  const strategy = await resolveSearchStrategy(ctx);

  // Log resolved strategy if perf logging is enabled
  if (ctx.deps.perfLog && ctx.deps.logger) {
    ctx.deps.logger.debug(
      {
        strategy,
        hasSearch: !!ctx.search,
        semanticSearchParam: ctx.params.semanticSearch,
        useFts5Param: ctx.params.useFts5,
        processingTimeMs: Date.now() - startMs,
      },
      'strategy_stage resolved search strategy'
    );
  }

  return {
    ...ctx,
    searchStrategy: strategy,
  };
}
