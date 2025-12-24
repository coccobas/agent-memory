/**
 * SQLite FTS5 Service Implementation
 *
 * Provides FTS5-based search functionality for SQLite databases.
 * Features:
 * - Relevance ranking using BM25 algorithm
 * - Phrase matching
 * - Prefix matching
 * - Boolean operators
 */

import type Database from 'better-sqlite3';
import type { EntryType } from '../../db/schema/types.js';
import type { IFTSService, FTSResult, FTSSearchOptions } from './interfaces.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('fts-sqlite');

/**
 * SQLite FTS5 implementation of IFTSService.
 */
export class SQLiteFTSService implements IFTSService {
  private sqlite: Database.Database;

  constructor(sqlite: Database.Database) {
    this.sqlite = sqlite;
  }

  /**
   * Search FTS5 tables for matching entries.
   */
  async search(
    query: string,
    entryTypes: EntryType[],
    options: FTSSearchOptions = {}
  ): Promise<FTSResult[]> {
    const limit = options.limit ?? 100;
    const results: FTSResult[] = [];

    // Escape query for FTS5
    const escapedQuery = this.escapeQuery(query);

    for (const entryType of entryTypes) {
      const config = this.getTableConfig(entryType);
      if (!config) continue;

      const { ftsTable, versionTable, entryTable, idColumn, versionIdColumn } = config;

      // Build FTS5 query with ranking
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
        const rows = this.sqlite.prepare(sql).all(ftsQuery, limit) as Array<{
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
        logger.warn({ entryType, error }, 'FTS search failed');
      }
    }

    // Sort by rank (higher is better) and limit
    results.sort((a, b) => b.rank - a.rank);
    return results.slice(0, limit);
  }

  /**
   * Rebuild FTS index for a specific entry type or all types.
   */
  async rebuild(entryType?: EntryType): Promise<void> {
    const types: EntryType[] = entryType
      ? [entryType]
      : (['tool', 'guideline', 'knowledge'] as EntryType[]);

    for (const type of types) {
      const config = this.getTableConfig(type);
      if (!config) continue;

      const { ftsTable, versionTable, entryTable, idColumn, nameColumn, contentColumns } = config;

      try {
        // Delete all entries
        this.sqlite.prepare(`DELETE FROM ${ftsTable}`).run();

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

        this.sqlite.prepare(insertSQL).run();
        logger.debug({ type }, 'Rebuilt FTS index');
      } catch (error) {
        logger.warn({ type, error }, 'Failed to rebuild FTS index');
      }
    }
  }

  /**
   * Sync FTS index for a specific entry.
   * FTS5 triggers handle automatic syncing, so this is a no-op.
   */
  async syncEntry(_entryType: EntryType, _entryId: string): Promise<void> {
    // FTS5 triggers handle automatic syncing
  }

  /**
   * Escape query string for FTS5 MATCH.
   */
  escapeQuery(query: string): string {
    // Replace double quotes with escaped version
    let escaped = query.replace(/"/g, '""');

    // If query contains operators, wrap in quotes to treat as phrase
    if (/[\s+\-|*()]/.test(escaped)) {
      escaped = `"${escaped}"`;
    }

    return escaped;
  }

  /**
   * Check if FTS5 is available and tables exist.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = this.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'")
        .get() as { name: string } | undefined;
      return !!result;
    } catch {
      return false;
    }
  }

  /**
   * Get table configuration for an entry type.
   */
  private getTableConfig(entryType: EntryType): {
    ftsTable: string;
    versionTable: string;
    entryTable: string;
    idColumn: string;
    versionIdColumn: string;
    nameColumn: string;
    contentColumns: string[];
  } | null {
    switch (entryType) {
      case 'tool':
        return {
          ftsTable: 'tools_fts',
          versionTable: 'tool_versions',
          entryTable: 'tools',
          idColumn: 'tool_id',
          versionIdColumn: 'id',
          nameColumn: 'name',
          contentColumns: ['description'],
        };
      case 'guideline':
        return {
          ftsTable: 'guidelines_fts',
          versionTable: 'guideline_versions',
          entryTable: 'guidelines',
          idColumn: 'guideline_id',
          versionIdColumn: 'id',
          nameColumn: 'name',
          contentColumns: ['content', 'rationale'],
        };
      case 'knowledge':
        return {
          ftsTable: 'knowledge_fts',
          versionTable: 'knowledge_versions',
          entryTable: 'knowledge',
          idColumn: 'knowledge_id',
          versionIdColumn: 'id',
          nameColumn: 'title',
          contentColumns: ['content', 'source'],
        };
      default:
        return null;
    }
  }
}

/**
 * Create a SQLite FTS service.
 */
export function createSQLiteFTSService(sqlite: Database.Database): IFTSService {
  return new SQLiteFTSService(sqlite);
}
