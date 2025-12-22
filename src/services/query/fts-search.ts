/**
 * Full-Text Search (FTS5)
 *
 * Provides FTS5-based search with LIKE fallback for memory entries.
 */

import { getPreparedStatement } from '../../db/connection.js';
import { escapeFts5Quotes, escapeFts5QueryTokenized } from '../fts.service.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('fts-search');

export type QueryEntryType = 'tool' | 'guideline' | 'knowledge';

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
    } else {
      tableName = 'knowledge';
      const allowed = new Set(['title'] as const);
      const mapped = (fields ?? []).map((f) => columnMap[f.toLowerCase()]).filter(Boolean);
      const filtered = mapped.filter((c): c is string => allowed.has(c as 'title'));
      searchColumns = filtered.length > 0 ? filtered : ['title'];
    }

    // Build LIKE query for each column
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
    // Escape special FTS5 characters and build query
    // FTS5 uses a simple syntax: "term1 term2" for AND, "term1 OR term2" for OR
    const escapedQuery = escapeFts5Quotes(searchQuery);

    let ftsTable: string;
    let ftsColumns: string[];

    if (entryType === 'tool') {
      ftsTable = 'tools_fts';
      ftsColumns = ['name', 'description'];
    } else if (entryType === 'guideline') {
      ftsTable = 'guidelines_fts';
      ftsColumns = ['name', 'content', 'rationale'];
    } else {
      ftsTable = 'knowledge_fts';
      ftsColumns = ['title', 'content', 'source'];
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
    // If FTS5 fails (e.g., table doesn't exist), fall back to LIKE search
    logger.warn({ entryType, ftsQuery, error }, 'FTS5 query failed, falling back to LIKE search');
    return executeLikeSearch(entryType, searchQuery, fields);
  }
}

/**
 * Execute FTS5 full-text search for better performance
 * Returns entry IDs that match the search query
 */
export function executeFts5Search(
  search: string,
  types: ('tools' | 'guidelines' | 'knowledge')[]
): Record<QueryEntryType, Set<string>> {
  const result: Record<QueryEntryType, Set<string>> = {
    tool: new Set(),
    guideline: new Set(),
    knowledge: new Set(),
  };

  // Escape special FTS5 characters using shared utility
  const escapedSearch = escapeFts5QueryTokenized(search);
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

  if (queryParts.length === 0) return result;

  // Execute combined query
  const combinedQuery = queryParts.join(' UNION ALL ');
  const stmt = getPreparedStatement(combinedQuery);
  const rows = stmt.all(...params) as Array<{ type: string; id: string }>;

  // Distribute results by type
  for (const row of rows) {
    if (row.type === 'tool') {
      result.tool.add(row.id);
    } else if (row.type === 'guideline') {
      result.guideline.add(row.id);
    } else if (row.type === 'knowledge') {
      result.knowledge.add(row.id);
    }
  }

  return result;
}
