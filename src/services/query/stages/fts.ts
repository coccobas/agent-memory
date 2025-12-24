/**
 * FTS Stage
 *
 * Executes Full-Text Search (FTS5) if enabled.
 * Populates ftsMatchIds with entry IDs that match the search.
 *
 * Uses injected dependencies for FTS5 execution to support testing with mocks.
 */

import type { PipelineContext, QueryEntryType } from '../pipeline.js';
import { queryTypeToEntryType } from '../type-maps.js';

/**
 * FTS stage - executes FTS5 search if enabled
 *
 * Uses ctx.deps.executeFts5Search() instead of calling the global function directly.
 */
export function ftsStage(ctx: PipelineContext): PipelineContext {
  const { params, search, types, deps } = ctx;

  // Only run FTS5 if explicitly enabled and search query exists
  const useFts5 = params.useFts5 === true && !!search;

  if (!useFts5) {
    return ctx;
  }

  // Execute FTS5 search using injected dependency
  const fts5Results = deps.executeFts5Search(search, [...types]);

  if (!fts5Results) {
    return ctx;
  }

  // Convert to ftsMatchIds format
  const ftsMatchIds: Record<QueryEntryType, Set<string>> = {
    tool: new Set<string>(),
    guideline: new Set<string>(),
    knowledge: new Set<string>(),
    experience: new Set<string>(),
  };

  for (const type of types) {
    const entryType = queryTypeToEntryType(type);
    const resultSet = fts5Results[entryType];
    if (resultSet) {
      ftsMatchIds[entryType] = resultSet;
    }
  }

  return {
    ...ctx,
    ftsMatchIds,
  };
}
