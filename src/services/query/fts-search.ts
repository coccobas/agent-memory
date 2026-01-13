/**
 * Full-Text Search (FTS5)
 *
 * Provides FTS5-based search with LIKE fallback for memory entries.
 *
 * Supports two modes:
 * 1. Direct import (uses global getPreparedStatement from connection.js)
 * 2. Factory pattern (uses injected getPreparedStatement for DI/testing)
 */

import { getPreparedStatement as getGlobalPreparedStatement } from '../../db/connection.js';
import { escapeFts5QueryOr } from '../fts.service.js';
import { createComponentLogger } from '../../utils/logger.js';
import type { Statement } from 'better-sqlite3';

const logger = createComponentLogger('fts-search');

/**
 * Type for getPreparedStatement function
 */
export type GetPreparedStatementFn = (sql: string) => Statement;

export type QueryEntryType = 'tool' | 'guideline' | 'knowledge' | 'experience';

export interface FtsScoredHit {
  id: string;
  /** Normalized relevance score in [0, 1], higher is better */
  score: number;
}

// =============================================================================
// LIKE FALLBACK
// =============================================================================

/**
 * Fallback search using LIKE queries when FTS5 is unavailable
 * Returns a Set of rowids that match the search query
 */
function executeLikeSearch(
  entryType: QueryEntryType,
  searchQuery: string,
  fields?: string[]
): Set<number> {
  const matchingRowids = new Set<number>();

  // Escape special characters for LIKE (% and _)
  const escapedQuery = searchQuery.replace(/[%_]/g, '\\$&');
  const likePattern = `%${escapedQuery}%`;

  try {
    let tableName: string;
    let searchColumns: string[];

    // Only allow known columns to be interpolated into SQL identifiers.
    // Values remain parameterized, but column names must be allowlisted.
    const columnMap: Record<string, string> = {
      name: 'name',
      title: 'title',
      description: 'description',
      content: 'content',
      rationale: 'rationale',
      source: 'source',
    };

    if (entryType === 'tool') {
      tableName = 'tools';
      const allowed = new Set(['name'] as const);
      const mapped = (fields ?? []).map((f) => columnMap[f.toLowerCase()]).filter(Boolean);
      const filtered = mapped.filter((c): c is string => allowed.has(c as 'name'));
      searchColumns = filtered.length > 0 ? filtered : ['name'];
    } else if (entryType === 'guideline') {
      tableName = 'guidelines';
      const allowed = new Set(['name'] as const);
      const mapped = (fields ?? []).map((f) => columnMap[f.toLowerCase()]).filter(Boolean);
      const filtered = mapped.filter((c): c is string => allowed.has(c as 'name'));
      searchColumns = filtered.length > 0 ? filtered : ['name'];
    } else if (entryType === 'knowledge') {
      tableName = 'knowledge';
      const allowed = new Set(['title'] as const);
      const mapped = (fields ?? []).map((f) => columnMap[f.toLowerCase()]).filter(Boolean);
      const filtered = mapped.filter((c): c is string => allowed.has(c as 'title'));
      searchColumns = filtered.length > 0 ? filtered : ['title'];
    } else {
      // experience
      tableName = 'experiences';
      const allowed = new Set(['title'] as const);
      const mapped = (fields ?? []).map((f) => columnMap[f.toLowerCase()]).filter(Boolean);
      const filtered = mapped.filter((c): c is string => allowed.has(c as 'title'));
      searchColumns = filtered.length > 0 ? filtered : ['title'];
    }

    // Build LIKE query for each column
    const conditions = searchColumns.map((col) => `${col} LIKE ?`).join(' OR ');

    const query = getGlobalPreparedStatement(`
      SELECT rowid FROM ${tableName}
      WHERE ${conditions} AND is_active = 1
    `);

    const params: string[] = Array(searchColumns.length).fill(likePattern) as string[];
    const results = query.all(...params) as Array<{ rowid: number }>;

    for (const row of results) {
      matchingRowids.add(row.rowid);
    }
  } catch (error) {
    logger.error(
      { entryType, searchQuery, error },
      'LIKE search fallback failed - returning empty results'
    );
  }

  return matchingRowids;
}

// =============================================================================
// FTS5 SEARCH
// =============================================================================

/**
 * Execute FTS5 query for a specific entry type
 * Returns a Set of rowids that match the search query
 * Falls back to LIKE search if FTS5 is unavailable
 */
export function executeFts5Query(
  entryType: QueryEntryType,
  searchQuery: string,
  fields?: string[]
): Set<number> {
  const matchingRowids = new Set<number>();
  let ftsQuery = searchQuery; // Declare outside try block for error logging

  try {
    // Use escapeFts5QueryOr for proper tokenization and special char handling
    // This converts "What is X?" to "OR" query like "what OR x" (filtering stopwords)
    const escapedQuery = escapeFts5QueryOr(searchQuery);
    if (!escapedQuery) {
      // All tokens were stopwords, fall back to LIKE
      logger.debug(
        {
          entryType,
          searchQuery: searchQuery.substring(0, 50), // Truncate for privacy
          reason: 'all_stopwords',
        },
        'FTS5 query empty after escaping - falling back to LIKE search'
      );
      return executeLikeSearch(entryType, searchQuery, fields);
    }

    let ftsTable: string;
    let ftsColumns: string[];

    if (entryType === 'tool') {
      ftsTable = 'tools_fts';
      ftsColumns = ['name', 'description'];
    } else if (entryType === 'guideline') {
      ftsTable = 'guidelines_fts';
      ftsColumns = ['name', 'content', 'rationale'];
    } else if (entryType === 'knowledge') {
      ftsTable = 'knowledge_fts';
      ftsColumns = ['title', 'content', 'source'];
    } else {
      // experience
      ftsTable = 'experiences_fts';
      ftsColumns = ['title', 'content', 'scenario', 'outcome', 'pattern', 'applicability'];
    }

    // Build FTS5 query - if fields specified, search only those columns
    ftsQuery = escapedQuery;
    if (fields && fields.length > 0) {
      // FTS5 column-specific search: column:term
      const columnMap: Record<string, string> = {
        name: 'name',
        title: 'title',
        description: 'description',
        content: 'content',
        rationale: 'rationale',
        source: 'source',
      };

      const validFields = fields
        .map((f) => columnMap[f.toLowerCase()])
        .filter((f): f is string => !!f && ftsColumns.includes(f));

      if (validFields.length > 0) {
        // Search in specific columns
        const columnQueries = validFields.map((col) => `${col}:${escapedQuery}`);
        ftsQuery = columnQueries.join(' OR ');
      }
    }

    // Query FTS5 table
    const query = getGlobalPreparedStatement(`
      SELECT rowid FROM ${ftsTable}
      WHERE ${ftsTable} MATCH ?
    `);

    const results = query.all(ftsQuery) as Array<{ rowid: number }>;
    for (const row of results) {
      matchingRowids.add(row.rowid);
    }

    return matchingRowids;
  } catch (error) {
    // If FTS5 fails (e.g., table doesn't exist), fall back to LIKE search
    // Bug #191 fix: Don't log ftsQuery as it may contain PII/sensitive search terms
    logger.warn(
      { entryType, queryLength: ftsQuery?.length ?? 0, error: error instanceof Error ? error.message : String(error) },
      'FTS5 query failed, falling back to LIKE search'
    );
    return executeLikeSearch(entryType, searchQuery, fields);
  }
}

/**
 * Execute FTS5 full-text search for better performance
 * Returns entry IDs that match the search query
 */
export function executeFts5Search(
  search: string,
  types: ('tools' | 'guidelines' | 'knowledge' | 'experiences')[]
): Record<QueryEntryType, Set<string>> {
  const result: Record<QueryEntryType, Set<string>> = {
    tool: new Set(),
    guideline: new Set(),
    knowledge: new Set(),
    experience: new Set(),
  };

  // Use OR matching for better recall - matches ANY token instead of requiring ALL
  const escapedSearch = escapeFts5QueryOr(search);
  if (!escapedSearch) return result;

  // Build a combined UNION query for all requested types
  // This reduces database round-trips from 3 to 1
  const queryParts: string[] = [];
  const params: string[] = [];

  if (types.includes('tools')) {
    queryParts.push(`SELECT 'tool' as type, tool_id as id FROM tools_fts WHERE tools_fts MATCH ?`);
    params.push(escapedSearch);
  }

  if (types.includes('guidelines')) {
    queryParts.push(
      `SELECT 'guideline' as type, guideline_id as id FROM guidelines_fts WHERE guidelines_fts MATCH ?`
    );
    params.push(escapedSearch);
  }

  if (types.includes('knowledge')) {
    queryParts.push(
      `SELECT 'knowledge' as type, knowledge_id as id FROM knowledge_fts WHERE knowledge_fts MATCH ?`
    );
    params.push(escapedSearch);
  }

  if (types.includes('experiences')) {
    queryParts.push(
      `SELECT 'experience' as type, experience_id as id FROM experiences_fts WHERE experiences_fts MATCH ?`
    );
    params.push(escapedSearch);
  }

  if (queryParts.length === 0) return result;

  // Execute combined query
  const combinedQuery = queryParts.join(' UNION ALL ');
  const stmt = getGlobalPreparedStatement(combinedQuery);
  const rows = stmt.all(...params) as Array<{ type: string; id: string }>;

  // Distribute results by type
  for (const row of rows) {
    if (row.type === 'tool') {
      result.tool.add(row.id);
    } else if (row.type === 'guideline') {
      result.guideline.add(row.id);
    } else if (row.type === 'knowledge') {
      result.knowledge.add(row.id);
    } else if (row.type === 'experience') {
      result.experience.add(row.id);
    }
  }

  return result;
}

// =============================================================================
// FTS5 SEARCH (SCORED)
// =============================================================================

/**
 * Normalize BM25 score to [0, 1] range where higher is better.
 *
 * SQLite FTS5 bm25() returns NEGATIVE values for relevance (more negative = better match).
 * However, in practice we often see values >= 0 after the query optimizer processes them.
 *
 * Formula: score = 1 / (1 + max(0, bm25))
 * - If bm25 = 0 (perfect match): score = 1.0
 * - If bm25 = 1: score = 0.5
 * - If bm25 = 9: score = 0.1
 * - As bm25 → ∞: score → 0
 *
 * This logistic-style normalization ensures bounded output [0, 1]
 * and provides good score spread for typical BM25 values.
 */
function normalizeBm25ToScore(bm25: number): number {
  const safe = Number.isFinite(bm25) ? bm25 : 0;
  const clamped = Math.max(0, safe);
  return 1 / (1 + clamped);
}

/**
 * Execute FTS5 full-text search and return scored hits per entry type.
 *
 * Uses bm25() to rank results and returns a normalized score in [0, 1].
 * Falls back to boolean-only search if FTS5 isn't available.
 */
export function executeFts5SearchWithScores(
  search: string,
  types: ('tools' | 'guidelines' | 'knowledge' | 'experiences')[],
  options: { limit?: number } = {}
): Record<QueryEntryType, FtsScoredHit[]> {
  const limit = options.limit ?? 200;
  const result: Record<QueryEntryType, FtsScoredHit[]> = {
    tool: [],
    guideline: [],
    knowledge: [],
    experience: [],
  };

  const escapedSearch = escapeFts5QueryOr(search);
  if (!escapedSearch) return result;

  const queryParts: string[] = [];
  const params: Array<string | number> = [];

  // Each UNION part is a subquery so ORDER BY/LIMIT applies per type.
  if (types.includes('tools')) {
    queryParts.push(
      `SELECT 'tool' AS type, id, bm25 FROM (SELECT tool_id AS id, bm25(tools_fts) AS bm25 FROM tools_fts WHERE tools_fts MATCH ? ORDER BY bm25 LIMIT ?)`
    );
    params.push(escapedSearch, limit);
  }

  if (types.includes('guidelines')) {
    queryParts.push(
      `SELECT 'guideline' AS type, id, bm25 FROM (SELECT guideline_id AS id, bm25(guidelines_fts) AS bm25 FROM guidelines_fts WHERE guidelines_fts MATCH ? ORDER BY bm25 LIMIT ?)`
    );
    params.push(escapedSearch, limit);
  }

  if (types.includes('knowledge')) {
    queryParts.push(
      `SELECT 'knowledge' AS type, id, bm25 FROM (SELECT knowledge_id AS id, bm25(knowledge_fts) AS bm25 FROM knowledge_fts WHERE knowledge_fts MATCH ? ORDER BY bm25 LIMIT ?)`
    );
    params.push(escapedSearch, limit);
  }

  if (types.includes('experiences')) {
    queryParts.push(
      `SELECT 'experience' AS type, id, bm25 FROM (SELECT experience_id AS id, bm25(experiences_fts) AS bm25 FROM experiences_fts WHERE experiences_fts MATCH ? ORDER BY bm25 LIMIT ?)`
    );
    params.push(escapedSearch, limit);
  }

  if (queryParts.length === 0) return result;

  try {
    const combinedQuery = queryParts.join(' UNION ALL ');
    const stmt = getGlobalPreparedStatement(combinedQuery);
    const rows = stmt.all(...params) as Array<{ type: string; id: string; bm25: number }>;

    for (const row of rows) {
      const score = normalizeBm25ToScore(row.bm25);
      if (row.type === 'tool') result.tool.push({ id: row.id, score });
      else if (row.type === 'guideline') result.guideline.push({ id: row.id, score });
      else if (row.type === 'knowledge') result.knowledge.push({ id: row.id, score });
      else if (row.type === 'experience') result.experience.push({ id: row.id, score });
    }
  } catch (error) {
    logger.warn({ error }, 'FTS5 scored search failed, falling back to boolean-only search');
    const matches = executeFts5Search(search, types);
    // Apply limit to fallback results to match scored behavior
    const toolIds = [...matches.tool].slice(0, limit);
    const guidelineIds = [...matches.guideline].slice(0, limit);
    const knowledgeIds = [...matches.knowledge].slice(0, limit);
    const experienceIds = [...matches.experience].slice(0, limit);
    for (const id of toolIds) result.tool.push({ id, score: 1.0 });
    for (const id of guidelineIds) result.guideline.push({ id, score: 1.0 });
    for (const id of knowledgeIds) result.knowledge.push({ id, score: 1.0 });
    for (const id of experienceIds) result.experience.push({ id, score: 1.0 });
  }

  // Ensure best-first ordering
  for (const type of Object.keys(result) as QueryEntryType[]) {
    result[type].sort((a, b) => b.score - a.score);
  }

  return result;
}

// =============================================================================
// FACTORY FOR DEPENDENCY INJECTION
// =============================================================================

/**
 * FTS search functions interface
 */
export interface FtsSearchFunctions {
  executeFts5Search: typeof executeFts5Search;
  executeFts5SearchWithScores: typeof executeFts5SearchWithScores;
  executeFts5Query: typeof executeFts5Query;
}

/**
 * Create FTS search functions with injected getPreparedStatement.
 *
 * This factory enables dependency injection for testing and custom db contexts.
 * The returned functions have the same signature as the exported ones but use
 * the provided getPreparedStatement instead of the global connection.
 *
 * @param getPreparedStatement - Function to get prepared statements from a db
 * @returns Object with executeFts5Search and executeFts5Query bound to the db
 */
export function createFtsSearchFunctions(
  getPreparedStatement: GetPreparedStatementFn
): FtsSearchFunctions {
  /**
   * LIKE fallback using injected db
   */
  function executeLikeSearchWithDb(
    entryType: QueryEntryType,
    searchQuery: string,
    fields?: string[]
  ): Set<number> {
    const matchingRowids = new Set<number>();
    const escapedQuery = searchQuery.replace(/[%_]/g, '\\$&');
    const likePattern = `%${escapedQuery}%`;

    try {
      let tableName: string;
      let searchColumns: string[];

      const columnMap: Record<string, string> = {
        name: 'name',
        title: 'title',
        description: 'description',
        content: 'content',
        rationale: 'rationale',
        source: 'source',
      };

      if (entryType === 'tool') {
        tableName = 'tools';
        const allowed = new Set(['name'] as const);
        const mapped = (fields ?? []).map((f) => columnMap[f.toLowerCase()]).filter(Boolean);
        const filtered = mapped.filter((c): c is string => allowed.has(c as 'name'));
        searchColumns = filtered.length > 0 ? filtered : ['name'];
      } else if (entryType === 'guideline') {
        tableName = 'guidelines';
        const allowed = new Set(['name'] as const);
        const mapped = (fields ?? []).map((f) => columnMap[f.toLowerCase()]).filter(Boolean);
        const filtered = mapped.filter((c): c is string => allowed.has(c as 'name'));
        searchColumns = filtered.length > 0 ? filtered : ['name'];
      } else if (entryType === 'knowledge') {
        tableName = 'knowledge';
        const allowed = new Set(['title'] as const);
        const mapped = (fields ?? []).map((f) => columnMap[f.toLowerCase()]).filter(Boolean);
        const filtered = mapped.filter((c): c is string => allowed.has(c as 'title'));
        searchColumns = filtered.length > 0 ? filtered : ['title'];
      } else {
        tableName = 'experiences';
        const allowed = new Set(['title'] as const);
        const mapped = (fields ?? []).map((f) => columnMap[f.toLowerCase()]).filter(Boolean);
        const filtered = mapped.filter((c): c is string => allowed.has(c as 'title'));
        searchColumns = filtered.length > 0 ? filtered : ['title'];
      }

      const conditions = searchColumns.map((col) => `${col} LIKE ?`).join(' OR ');
      const query = getPreparedStatement(`
        SELECT rowid FROM ${tableName}
        WHERE ${conditions} AND is_active = 1
      `);

      const params: string[] = Array(searchColumns.length).fill(likePattern) as string[];
      const results = query.all(...params) as Array<{ rowid: number }>;

      for (const row of results) {
        matchingRowids.add(row.rowid);
      }
    } catch (error) {
      logger.error(
        { entryType, searchQuery, error },
        'LIKE search fallback failed - returning empty results'
      );
    }

    return matchingRowids;
  }

  /**
   * FTS5 query using injected db
   */
  function executeFts5QueryWithDb(
    entryType: QueryEntryType,
    searchQuery: string,
    fields?: string[]
  ): Set<number> {
    const matchingRowids = new Set<number>();
    let ftsQuery = searchQuery;

    try {
      // Use escapeFts5QueryOr for proper tokenization and special char handling
      // This converts "What is X?" to "OR" query like "what OR x" (filtering stopwords)
      const escapedQuery = escapeFts5QueryOr(searchQuery);
      if (!escapedQuery) {
        // All tokens were stopwords, fall back to LIKE
        logger.debug(
          {
            entryType,
            searchQuery: searchQuery.substring(0, 50), // Truncate for privacy
            reason: 'all_stopwords',
          },
          'FTS5 query empty after escaping - falling back to LIKE search'
        );
        return executeLikeSearchWithDb(entryType, searchQuery, fields);
      }

      let ftsTable: string;
      let ftsColumns: string[];

      if (entryType === 'tool') {
        ftsTable = 'tools_fts';
        ftsColumns = ['name', 'description'];
      } else if (entryType === 'guideline') {
        ftsTable = 'guidelines_fts';
        ftsColumns = ['name', 'content', 'rationale'];
      } else if (entryType === 'knowledge') {
        ftsTable = 'knowledge_fts';
        ftsColumns = ['title', 'content', 'source'];
      } else {
        ftsTable = 'experiences_fts';
        ftsColumns = ['title', 'content', 'scenario', 'outcome', 'pattern', 'applicability'];
      }

      ftsQuery = escapedQuery;
      if (fields && fields.length > 0) {
        const columnMap: Record<string, string> = {
          name: 'name',
          title: 'title',
          description: 'description',
          content: 'content',
          rationale: 'rationale',
          source: 'source',
        };

        const validFields = fields
          .map((f) => columnMap[f.toLowerCase()])
          .filter((f): f is string => !!f && ftsColumns.includes(f));

        if (validFields.length > 0) {
          const columnQueries = validFields.map((col) => `${col}:${escapedQuery}`);
          ftsQuery = columnQueries.join(' OR ');
        }
      }

      const query = getPreparedStatement(`
        SELECT rowid FROM ${ftsTable}
        WHERE ${ftsTable} MATCH ?
      `);

      const results = query.all(ftsQuery) as Array<{ rowid: number }>;
      for (const row of results) {
        matchingRowids.add(row.rowid);
      }

      return matchingRowids;
    } catch (error) {
      logger.warn({ entryType, ftsQuery, error }, 'FTS5 query failed, falling back to LIKE search');
      return executeLikeSearchWithDb(entryType, searchQuery, fields);
    }
  }

  function executeFts5SearchWithScoresWithDb(
    search: string,
    types: ('tools' | 'guidelines' | 'knowledge' | 'experiences')[],
    options: { limit?: number } = {}
  ): Record<QueryEntryType, FtsScoredHit[]> {
    const limit = options.limit ?? 200;
    const result: Record<QueryEntryType, FtsScoredHit[]> = {
      tool: [],
      guideline: [],
      knowledge: [],
      experience: [],
    };

    const escapedSearch = escapeFts5QueryOr(search);
    if (!escapedSearch) return result;

    const queryParts: string[] = [];
    const params: Array<string | number> = [];

    if (types.includes('tools')) {
      queryParts.push(
        `SELECT 'tool' AS type, id, bm25 FROM (SELECT tool_id AS id, bm25(tools_fts) AS bm25 FROM tools_fts WHERE tools_fts MATCH ? ORDER BY bm25 LIMIT ?)`
      );
      params.push(escapedSearch, limit);
    }

    if (types.includes('guidelines')) {
      queryParts.push(
        `SELECT 'guideline' AS type, id, bm25 FROM (SELECT guideline_id AS id, bm25(guidelines_fts) AS bm25 FROM guidelines_fts WHERE guidelines_fts MATCH ? ORDER BY bm25 LIMIT ?)`
      );
      params.push(escapedSearch, limit);
    }

    if (types.includes('knowledge')) {
      queryParts.push(
        `SELECT 'knowledge' AS type, id, bm25 FROM (SELECT knowledge_id AS id, bm25(knowledge_fts) AS bm25 FROM knowledge_fts WHERE knowledge_fts MATCH ? ORDER BY bm25 LIMIT ?)`
      );
      params.push(escapedSearch, limit);
    }

    if (types.includes('experiences')) {
      queryParts.push(
        `SELECT 'experience' AS type, id, bm25 FROM (SELECT experience_id AS id, bm25(experiences_fts) AS bm25 FROM experiences_fts WHERE experiences_fts MATCH ? ORDER BY bm25 LIMIT ?)`
      );
      params.push(escapedSearch, limit);
    }

    if (queryParts.length === 0) return result;

    try {
      const combinedQuery = queryParts.join(' UNION ALL ');
      const stmt = getPreparedStatement(combinedQuery);
      const rows = stmt.all(...params) as Array<{ type: string; id: string; bm25: number }>;

      for (const row of rows) {
        const score = normalizeBm25ToScore(row.bm25);
        if (row.type === 'tool') result.tool.push({ id: row.id, score });
        else if (row.type === 'guideline') result.guideline.push({ id: row.id, score });
        else if (row.type === 'knowledge') result.knowledge.push({ id: row.id, score });
        else if (row.type === 'experience') result.experience.push({ id: row.id, score });
      }
    } catch (error) {
      logger.warn({ error }, 'FTS5 scored search failed, falling back to boolean-only search');
      const matches = executeFts5SearchWithDb(search, types);
      // Apply limit to fallback results to match scored behavior
      const toolIds = [...matches.tool].slice(0, limit);
      const guidelineIds = [...matches.guideline].slice(0, limit);
      const knowledgeIds = [...matches.knowledge].slice(0, limit);
      const experienceIds = [...matches.experience].slice(0, limit);
      for (const id of toolIds) result.tool.push({ id, score: 1.0 });
      for (const id of guidelineIds) result.guideline.push({ id, score: 1.0 });
      for (const id of knowledgeIds) result.knowledge.push({ id, score: 1.0 });
      for (const id of experienceIds) result.experience.push({ id, score: 1.0 });
    }

    for (const type of Object.keys(result) as QueryEntryType[]) {
      result[type].sort((a, b) => b.score - a.score);
    }

    return result;
  }

  /**
   * FTS5 search using injected db
   */
  function executeFts5SearchWithDb(
    search: string,
    types: ('tools' | 'guidelines' | 'knowledge' | 'experiences')[]
  ): Record<QueryEntryType, Set<string>> {
    const result: Record<QueryEntryType, Set<string>> = {
      tool: new Set(),
      guideline: new Set(),
      knowledge: new Set(),
      experience: new Set(),
    };

    const escapedSearch = escapeFts5QueryOr(search);
    if (!escapedSearch) return result;

    const queryParts: string[] = [];
    const params: string[] = [];

    if (types.includes('tools')) {
      queryParts.push(`SELECT 'tool' as type, tool_id as id FROM tools_fts WHERE tools_fts MATCH ?`);
      params.push(escapedSearch);
    }

    if (types.includes('guidelines')) {
      queryParts.push(
        `SELECT 'guideline' as type, guideline_id as id FROM guidelines_fts WHERE guidelines_fts MATCH ?`
      );
      params.push(escapedSearch);
    }

    if (types.includes('knowledge')) {
      queryParts.push(
        `SELECT 'knowledge' as type, knowledge_id as id FROM knowledge_fts WHERE knowledge_fts MATCH ?`
      );
      params.push(escapedSearch);
    }

    if (types.includes('experiences')) {
      queryParts.push(
        `SELECT 'experience' as type, experience_id as id FROM experiences_fts WHERE experiences_fts MATCH ?`
      );
      params.push(escapedSearch);
    }

    if (queryParts.length === 0) return result;

    const combinedQuery = queryParts.join(' UNION ALL ');
    const stmt = getPreparedStatement(combinedQuery);
    const rows = stmt.all(...params) as Array<{ type: string; id: string }>;

    for (const row of rows) {
      if (row.type === 'tool') {
        result.tool.add(row.id);
      } else if (row.type === 'guideline') {
        result.guideline.add(row.id);
      } else if (row.type === 'knowledge') {
        result.knowledge.add(row.id);
      } else if (row.type === 'experience') {
        result.experience.add(row.id);
      }
    }

    return result;
  }

  return {
    executeFts5Search: executeFts5SearchWithDb,
    executeFts5SearchWithScores: executeFts5SearchWithScoresWithDb,
    executeFts5Query: executeFts5QueryWithDb,
  };
}
