/**
 * FTS Stage
 *
 * Executes Full-Text Search (FTS5) if enabled.
 * Populates ftsMatchIds with entry IDs that match the search.
 */

import type { PipelineContext, QueryEntryType, QueryType } from '../pipeline.js';
import { executeFts5Search } from '../../query.service.js';

/**
 * Convert QueryType to QueryEntryType
 */
function typeToEntryType(type: QueryType): QueryEntryType {
  return type === 'tools' ? 'tool' : type === 'guidelines' ? 'guideline' : 'knowledge';
}

/**
 * FTS stage - executes FTS5 search if enabled
 */
export function ftsStage(ctx: PipelineContext): PipelineContext {
  const { params, search, types } = ctx;

  // Only run FTS5 if explicitly enabled and search query exists
  const useFts5 = params.useFts5 === true && !!search;

  if (!useFts5) {
    return ctx;
  }

  // Execute FTS5 search
  const fts5Results = executeFts5Search(search, [...types]);

  if (!fts5Results) {
    return ctx;
  }

  // Convert to ftsMatchIds format
  const ftsMatchIds: Record<QueryEntryType, Set<string>> = {
    tool: new Set<string>(),
    guideline: new Set<string>(),
    knowledge: new Set<string>(),
  };

  for (const type of types) {
    const entryType = typeToEntryType(type);
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
