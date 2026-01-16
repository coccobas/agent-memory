/**
 * FTS Stage
 *
 * Executes Full-Text Search (FTS5) if enabled.
 * Populates ftsMatchIds with entry IDs that match the search.
 *
 * Supports expanded queries from the rewrite stage:
 * - If ctx.searchQueries exists, runs FTS for each query and merges results
 * - Falls back to ctx.search if no expanded queries
 *
 * Uses injected dependencies for FTS5 execution to support testing with mocks.
 */

import type { PipelineContext, QueryEntryType } from '../pipeline.js';
import { queryTypeToEntryType } from '../type-maps.js';

/**
 * FTS stage - executes FTS5 search if enabled
 *
 * Uses expanded queries from rewrite stage if available,
 * otherwise falls back to original search query.
 */
export function ftsStage(ctx: PipelineContext): PipelineContext {
  const { params, search, searchQueries, types, deps, searchStrategy } = ctx;

  // Use FTS5 only if strategy is 'fts5' or 'hybrid' (strategy stage already considered params)
  const useFts5 = (searchStrategy === 'fts5' || searchStrategy === 'hybrid') && !!search;

  if (deps.logger && deps.perfLog) {
    deps.logger.debug({ searchStrategy, useFts5, hasSearch: !!search }, 'fts_stage_strategy_check');
  }

  // Debug FTS stage activation
  if (deps.logger && deps.perfLog) {
    deps.logger.debug(
      { useFts5, hasSearch: !!search, paramsUseFts5: params.useFts5, types: [...types] },
      'fts_stage_check'
    );
  }

  if (!useFts5) {
    return ctx;
  }

  // Determine which queries to run
  // Use expanded queries if available, otherwise just the original
  const queriesToRun =
    searchQueries && searchQueries.length > 0
      ? searchQueries
      : [{ text: search, weight: 1.0, source: 'original' as const }];

  // Initialize merged results
  const ftsMatchIds: Record<QueryEntryType, Set<string>> = {
    tool: new Set<string>(),
    guideline: new Set<string>(),
    knowledge: new Set<string>(),
    experience: new Set<string>(),
  };

  // Optional FTS relevance scores (higher is better) keyed by entry ID.
  // Populated only when deps.executeFts5SearchWithScores is available.
  const ftsScores = deps.executeFts5SearchWithScores ? new Map<string, number>() : null;

  // Track match weights for scoring boost (entry ID -> max weight)
  const matchWeights = new Map<string, number>();

  // Run FTS for each query and merge results
  for (const query of queriesToRun) {
    if (!query.text) continue;

    const scoredResults = deps.executeFts5SearchWithScores
      ? deps.executeFts5SearchWithScores(query.text, [...types], { limit: ctx.limit * 5 })
      : null;

    const fts5Results = scoredResults
      ? (Object.fromEntries(
          (Object.keys(scoredResults) as QueryEntryType[]).map((k) => [
            k,
            new Set(scoredResults[k].map((h) => h.id)),
          ])
        ) as Record<QueryEntryType, Set<string>>)
      : deps.executeFts5Search(query.text, [...types]);

    // Debug FTS results
    if (deps.logger && deps.perfLog) {
      const counts = fts5Results
        ? Object.entries(fts5Results)
            .map(([t, s]) => `${t}:${s.size}`)
            .join(',')
        : 'null';
      deps.logger.debug({ query: query.text.substring(0, 50), counts }, 'fts_query_result');
    }

    if (!fts5Results) continue;

    // Merge results into combined set
    for (const type of types) {
      const entryType = queryTypeToEntryType(type);
      const resultSet = fts5Results[entryType];
      if (resultSet) {
        for (const id of resultSet) {
          ftsMatchIds[entryType].add(id);
          // Track the max weight for this entry (for potential score boosting)
          const currentWeight = matchWeights.get(id) ?? 0;
          if (query.weight > currentWeight) {
            matchWeights.set(id, query.weight);
          }
        }
      }
    }

    // Merge scored results into ftsScores
    // Bug #15 note: Using MAX when same entry matches multiple queries.
    // This treats expanded queries as alternatives (best match wins).
    // Using ADD would treat them as conjunctive (more matches = better).
    // MAX is preferred to avoid score inflation from redundant matches.
    if (scoredResults && ftsScores) {
      for (const [entryType, hits] of Object.entries(scoredResults) as Array<
        [QueryEntryType, Array<{ id: string; score: number }>]
      >) {
        for (const hit of hits) {
          const weighted = hit.score * query.weight;
          const existing = ftsScores.get(hit.id) ?? 0;
          ftsScores.set(hit.id, Math.max(existing, weighted));
          ftsMatchIds[entryType].add(hit.id);
        }
      }
    }
  }

  // Log expanded query results if perf logging enabled
  if (deps.perfLog && deps.logger && queriesToRun.length > 1) {
    const totalMatches = Object.values(ftsMatchIds).reduce((sum, set) => sum + set.size, 0);
    deps.logger.debug(
      {
        queryCount: queriesToRun.length,
        totalMatches,
        queries: queriesToRun.map((q) => q.text.substring(0, 50)),
      },
      'fts_expanded_queries completed'
    );
  }

  return {
    ...ctx,
    ftsMatchIds,
    ftsScores,
  };
}
