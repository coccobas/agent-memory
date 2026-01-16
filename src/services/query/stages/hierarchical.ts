/**
 * Hierarchical Retrieval Stage
 *
 * Uses coarse-to-fine retrieval through summary hierarchies to efficiently
 * narrow down results for large memory stores.
 *
 * This stage is most effective when:
 * - Summaries have been built for the scope (via memory_summarize)
 * - The query is semantic (natural language)
 * - The memory store is large (1000+ entries)
 *
 * ## Integration Points
 *
 * This stage runs early in the pipeline and produces candidate entry IDs.
 * Later stages (fetch, filter) use these IDs to boost or filter results.
 *
 * ## Performance
 *
 * Coarse-to-fine retrieval reduces search space:
 * - Start at domain level (~10 summaries)
 * - Expand to topic level (~30 summaries)
 * - Expand to chunk level (~100 summaries)
 * - Return candidate entries (~200 entries)
 *
 * vs. searching all entries directly (~10,000+)
 */

import type { PipelineContext } from '../pipeline.js';
import type { ScopeType } from '../../../db/schema.js';

/**
 * Minimal retrieved entry type for pipeline integration
 */
interface RetrievedEntry {
  id: string;
  type: string;
  score: number;
}

/**
 * Hierarchical retrieval configuration
 */
export interface HierarchicalConfig {
  /** Enable hierarchical retrieval */
  enabled: boolean;
  /** Minimum entries in scope to use hierarchical retrieval (default: 100) */
  minEntriesThreshold: number;
  /** Maximum results from hierarchical retrieval (default: 100) */
  maxCandidates: number;
  /** Expansion factor at each level (default: 3) */
  expansionFactor: number;
  /** Minimum similarity threshold (default: 0.5) */
  minSimilarity: number;
  /** Only use for semantic queries */
  semanticQueriesOnly: boolean;
}

/**
 * Default hierarchical configuration
 */
export const DEFAULT_HIERARCHICAL_CONFIG: HierarchicalConfig = {
  enabled: false, // Opt-in feature
  minEntriesThreshold: 100,
  maxCandidates: 100,
  expansionFactor: 3,
  minSimilarity: 0.5,
  semanticQueriesOnly: true,
};

/**
 * Extended pipeline context with hierarchical retrieval metadata
 */
export interface HierarchicalPipelineContext extends PipelineContext {
  hierarchical?: {
    applied: boolean;
    candidateIds: Set<string>;
    /** Task 30: Preserve hierarchical scores for re-scoring in later stages */
    candidateScores: Map<string, number>;
    levelsTraversed: number;
    totalTimeMs: number;
  };
}

/**
 * Coarse-to-fine retrieval options
 */
interface RetrieveOptions {
  query: string;
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  maxResults?: number;
  expansionFactor?: number;
  minSimilarity?: number;
}

/**
 * Coarse-to-fine retrieval result
 */
interface RetrieveResult {
  entries: RetrievedEntry[];
  steps: Array<{
    level: number;
    summariesSearched: number;
    summariesMatched: number;
    timeMs: number;
  }>;
  totalTimeMs: number;
}

/**
 * Dependencies for the hierarchical stage
 */
export interface HierarchicalDependencies {
  retriever: {
    retrieve: (options: RetrieveOptions) => Promise<RetrieveResult>;
  };
  config?: Partial<HierarchicalConfig>;
  hasSummaries: (scopeType: ScopeType, scopeId?: string | null) => Promise<boolean>;
}

/**
 * Create a hierarchical retrieval stage with injected dependencies
 *
 * @param deps - Dependencies including retriever and config
 * @returns Pipeline stage function
 */
export function createHierarchicalStage(
  deps: HierarchicalDependencies
): (ctx: PipelineContext) => Promise<HierarchicalPipelineContext> {
  const effectiveConfig = {
    ...DEFAULT_HIERARCHICAL_CONFIG,
    ...deps.config,
  };

  return async function hierarchicalStage(
    ctx: PipelineContext
  ): Promise<HierarchicalPipelineContext> {
    const startMs = Date.now();
    const { search, params, scopeChain } = ctx;

    // Early return if disabled or no search
    if (!effectiveConfig.enabled || !search) {
      return ctx as HierarchicalPipelineContext;
    }

    // Skip if semantic-only mode and not a semantic search
    if (effectiveConfig.semanticQueriesOnly && !params.semanticSearch) {
      return ctx as HierarchicalPipelineContext;
    }

    // Get scope from chain (first entry is the target scope)
    const targetScope = scopeChain[0];
    if (!targetScope) {
      return ctx as HierarchicalPipelineContext;
    }

    // Check if summaries exist for this scope
    const hasSummaries = await deps.hasSummaries(targetScope.scopeType, targetScope.scopeId);
    if (!hasSummaries) {
      // Log and skip - summaries need to be built first
      if (ctx.deps.perfLog && ctx.deps.logger) {
        ctx.deps.logger.debug(
          { scopeType: targetScope.scopeType, scopeId: targetScope.scopeId },
          'hierarchical stage skipped: no summaries available'
        );
      }
      return ctx as HierarchicalPipelineContext;
    }

    try {
      // Perform coarse-to-fine retrieval
      const result = await deps.retriever.retrieve({
        query: search,
        scopeType: targetScope.scopeType,
        scopeId: targetScope.scopeId ?? undefined,
        maxResults: effectiveConfig.maxCandidates,
        expansionFactor: effectiveConfig.expansionFactor,
        minSimilarity: effectiveConfig.minSimilarity,
      });

      // Task 30: Extract candidate IDs and preserve scores for re-scoring
      const candidateIds = new Set<string>(result.entries.map((e: RetrievedEntry) => e.id));
      const candidateScores = new Map<string, number>(
        result.entries.map((e: RetrievedEntry) => [e.id, e.score])
      );

      // Log performance
      if (ctx.deps.perfLog && ctx.deps.logger) {
        ctx.deps.logger.debug(
          {
            candidateCount: candidateIds.size,
            levelsTraversed: result.steps.length,
            totalTimeMs: result.totalTimeMs,
          },
          'hierarchical retrieval completed'
        );
      }

      return {
        ...ctx,
        hierarchical: {
          applied: true,
          candidateIds,
          candidateScores,
          levelsTraversed: result.steps.length,
          totalTimeMs: Date.now() - startMs,
        },
      };
    } catch (error) {
      // Log error and fall back to standard retrieval
      if (ctx.deps.logger) {
        ctx.deps.logger.debug(
          { error: error instanceof Error ? error.message : String(error) },
          'hierarchical stage failed, using standard retrieval'
        );
      }
      return ctx as HierarchicalPipelineContext;
    }
  };
}

/**
 * Synchronous no-op hierarchical stage for pipelines without summarization
 *
 * Returns the context unchanged.
 */
export function hierarchicalStageNoop(ctx: PipelineContext): PipelineContext {
  return ctx;
}

/**
 * Check if hierarchical retrieval should be applied to a query
 *
 * @param ctx - Pipeline context
 * @param configOverride - Optional config override
 * @returns Whether hierarchical retrieval should be applied
 */
export function shouldApplyHierarchical(
  ctx: PipelineContext,
  configOverride?: Partial<HierarchicalConfig>
): boolean {
  const effectiveConfig = {
    ...DEFAULT_HIERARCHICAL_CONFIG,
    ...configOverride,
  };

  if (!effectiveConfig.enabled) return false;
  if (!ctx.search) return false;
  if (effectiveConfig.semanticQueriesOnly && !ctx.params.semanticSearch) return false;

  return true;
}

/**
 * Get hierarchical retrieval statistics from context
 */
export function getHierarchicalStats(ctx: PipelineContext): {
  applied: boolean;
  candidateCount: number;
  levelsTraversed: number;
  totalTimeMs: number;
} | null {
  const hCtx = ctx as HierarchicalPipelineContext;
  if (!hCtx.hierarchical) return null;

  return {
    applied: hCtx.hierarchical.applied,
    candidateCount: hCtx.hierarchical.candidateIds.size,
    levelsTraversed: hCtx.hierarchical.levelsTraversed,
    totalTimeMs: hCtx.hierarchical.totalTimeMs,
  };
}

/**
 * Filter entries using hierarchical candidates
 *
 * When hierarchical retrieval has run, use its candidate IDs to filter/boost results.
 * Task 30: Now also merges hierarchical scores into semanticScores for proper re-ranking.
 */
export function filterByHierarchicalCandidates(ctx: HierarchicalPipelineContext): PipelineContext {
  if (!ctx.hierarchical?.applied || ctx.hierarchical.candidateIds.size === 0) {
    return ctx;
  }

  const { candidateIds, candidateScores } = ctx.hierarchical;

  // Filter fetched entries to only include hierarchical candidates
  const filteredEntries = {
    tools: ctx.fetchedEntries.tools.filter((e) => candidateIds.has(e.entry.id)),
    guidelines: ctx.fetchedEntries.guidelines.filter((e) => candidateIds.has(e.entry.id)),
    knowledge: ctx.fetchedEntries.knowledge.filter((e) => candidateIds.has(e.entry.id)),
    experiences: ctx.fetchedEntries.experiences.filter((e) => candidateIds.has(e.entry.id)),
  };

  // Task 30: Merge hierarchical scores into semantic scores
  // Use existing semantic scores as base, add/update with hierarchical scores
  const mergedSemanticScores = new Map<string, number>(ctx.semanticScores ?? []);

  for (const [id, hierarchicalScore] of candidateScores) {
    const existingScore = mergedSemanticScores.get(id);
    if (existingScore !== undefined) {
      // Blend existing semantic score with hierarchical score
      // Use max to preserve the higher signal
      mergedSemanticScores.set(id, Math.max(existingScore, hierarchicalScore));
    } else {
      // Add hierarchical score as semantic score
      mergedSemanticScores.set(id, hierarchicalScore);
    }
  }

  return {
    ...ctx,
    fetchedEntries: filteredEntries,
    semanticScores: mergedSemanticScores,
  };
}
