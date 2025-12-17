/**
 * Full-Text Search (FTS5) Service
 *
 * Provides FTS5-based search functionality for tools, guidelines, and knowledge entries.
 * FTS5 provides better search capabilities than simple LIKE queries, including:
 * - Relevance ranking
 * - Phrase matching
 * - Prefix matching
 * - Boolean operators
 */

import { getSqlite } from '../db/connection.js';
import type { EntryType } from '../db/schema.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('fts');

export interface FTSResult {
  entryType: EntryType;
  entryId: string;
  versionId: string;
  rank: number; // FTS5 rank (bm25)
  snippet?: string; // Highlighted snippet
}

export interface FTSSearchOptions {
  limit?: number;
  highlight?: boolean; // Generate snippets
  prefix?: boolean; // Enable prefix matching
}

/**
 * Search FTS5 tables for matching entries
 *
 * @param query - Search query string
 * @param entryTypes - Types of entries to search ('tool', 'guideline', 'knowledge')
 * @param options - Search options
 * @returns Array of FTS results with ranking
 */
export function searchFTS(
  query: string,
  entryTypes: EntryType[],
  options: FTSSearchOptions = {}
): FTSResult[] {
  const sqlite = getSqlite();
  const limit = options.limit ?? 100;
  const results: FTSResult[] = [];

  // Escape query for FTS5 (handle special characters)
  const escapedQuery = escapeFTSQuery(query);

  for (const entryType of entryTypes) {
    let ftsTable: string;
    let versionTable: string;
    let entryTable: string;
    let idColumn: string;
    let versionIdColumn: string;

    switch (entryType) {
      case 'tool':
        ftsTable = 'tools_fts';
        versionTable = 'tool_versions';
        entryTable = 'tools';
        idColumn = 'tool_id';
        versionIdColumn = 'id';
        break;
      case 'guideline':
        ftsTable = 'guidelines_fts';
        versionTable = 'guideline_versions';
        entryTable = 'guidelines';
        idColumn = 'guideline_id';
        versionIdColumn = 'id';
        break;
      case 'knowledge':
        ftsTable = 'knowledge_fts';
        versionTable = 'knowledge_versions';
        entryTable = 'knowledge';
        idColumn = 'knowledge_id';
        versionIdColumn = 'id';
        break;
      default:
        continue;
    }

    // Build FTS5 query with ranking
    // FTS5 rank is calculated using bm25 algorithm (lower is better, so we negate it)
    const ftsQuery = options.prefix ? `${escapedQuery}*` : escapedQuery;

    const sql = `
      SELECT 
        v.${versionIdColumn} as version_id,
        e.id as entry_id,
        -rank as rank_score
        ${options.highlight ? `, snippet(${ftsTable}, 2, '<mark>', '</mark>', '...', 32) as snippet` : ''}
      FROM ${ftsTable} fts
      JOIN ${versionTable} v ON v.rowid = fts.rowid
      JOIN ${entryTable} e ON e.id = v.${idColumn}
      WHERE ${ftsTable} MATCH ?
        AND e.is_active = 1
      ORDER BY rank
      LIMIT ?
    `;

    try {
      const rows = sqlite.prepare(sql).all(ftsQuery, limit) as Array<{
        version_id: string;
        entry_id: string;
        rank_score: number;
        snippet?: string;
      }>;

      for (const row of rows) {
        results.push({
          entryType,
          entryId: row.entry_id,
          versionId: row.version_id,
          rank: row.rank_score,
          snippet: row.snippet,
        });
      }
    } catch (error) {
      // If FTS table doesn't exist or query fails, skip this type
      // This allows graceful degradation if FTS5 is not available
      logger.warn({ entryType, error }, 'FTS search failed');
    }
  }

  // Sort by rank (higher is better) and limit
  results.sort((a, b) => b.rank - a.rank);
  return results.slice(0, limit);
}

/**
 * Rebuild FTS index for a specific entry type or all types
 *
 * @param entryType - Optional entry type to rebuild, or undefined for all types
 */
export function rebuildFTSIndex(entryType?: EntryType): void {
  const sqlite = getSqlite();

  const types: EntryType[] = entryType
    ? [entryType]
    : (['tool', 'guideline', 'knowledge'] as EntryType[]);

  for (const type of types) {
    let ftsTable: string;
    let versionTable: string;
    let entryTable: string;
    let idColumn: string;
    let nameColumn: string;
    let contentColumns: string[];

    switch (type) {
      case 'tool':
        ftsTable = 'tools_fts';
        versionTable = 'tool_versions';
        entryTable = 'tools';
        idColumn = 'tool_id';
        nameColumn = 'name';
        contentColumns = ['description'];
        break;
      case 'guideline':
        ftsTable = 'guidelines_fts';
        versionTable = 'guideline_versions';
        entryTable = 'guidelines';
        idColumn = 'guideline_id';
        nameColumn = 'name';
        contentColumns = ['content', 'rationale'];
        break;
      case 'knowledge':
        ftsTable = 'knowledge_fts';
        versionTable = 'knowledge_versions';
        entryTable = 'knowledge';
        idColumn = 'knowledge_id';
        nameColumn = 'title';
        contentColumns = ['content', 'source'];
        break;
      default:
        continue;
    }

    try {
      // Delete all entries
      sqlite.prepare(`DELETE FROM ${ftsTable}`).run();

      // Re-insert all current versions
      const insertSQL = `
        INSERT INTO ${ftsTable}(rowid, ${nameColumn}, ${contentColumns.join(', ')})
        SELECT 
          v.rowid,
          e.${nameColumn},
          ${contentColumns.map((col) => `COALESCE(v.${col}, '')`).join(', ')}
        FROM ${versionTable} v
        JOIN ${entryTable} e ON e.id = v.${idColumn}
        WHERE e.is_active = 1
      `;

      sqlite.prepare(insertSQL).run();
    } catch (error) {
      logger.warn({ type, error }, 'Failed to rebuild index');
    }
  }
}

/**
 * Sync FTS index for a specific entry after update
 *
 * @param entryType - Entry type
 * @param entryId - Entry ID
 */
export function syncFTSForEntry(_entryType: EntryType, _entryId: string): void {
  // FTS5 triggers handle automatic syncing, but we can manually trigger a rebuild
  // for the specific entry if needed. For now, we rely on triggers.
  // This function is kept for API compatibility and future enhancements.
  // In practice, triggers handle this automatically.
}

/**
 * Escape query string for FTS5
 *
 * FTS5 has special characters that need escaping:
 * - Double quotes need to be escaped
 * - Some operators need special handling
 */
function escapeFTSQuery(query: string): string {
  // Replace double quotes with escaped version
  let escaped = query.replace(/"/g, '""');

  // If query contains operators, wrap in quotes to treat as phrase
  if (/[\s+\-|*()]/.test(escaped)) {
    escaped = `"${escaped}"`;
  }

  return escaped;
}

/**
 * Check if FTS5 is available and tables exist
 */
export function isFTSAvailable(): boolean {
  const sqlite = getSqlite();
  try {
    // Check if at least one FTS table exists
    const result = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'")
      .get() as { name: string } | undefined;
    return !!result;
  } catch {
    return false;
  }
}


