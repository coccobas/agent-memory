/**
 * PostgreSQL Full-Text Search Service Implementation
 *
 * Provides tsvector/tsquery-based search functionality for PostgreSQL.
 * Features:
 * - Relevance ranking using ts_rank
 * - Weighted search (A > B > C > D)
 * - Phrase matching with tsquery
 * - Prefix matching with :*
 * - Highlighted snippets with ts_headline
 *
 * NOTE: PostgreSQL query results have dynamic row types.
 * ESLint unsafe warnings are suppressed for database query results.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

import type { Pool } from 'pg';
import type { EntryType } from '../../db/schema/types.js';
import type { IFTSService, FTSResult, FTSSearchOptions } from './interfaces.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('fts-postgresql');

/**
 * PostgreSQL tsvector implementation of IFTSService.
 */
export class PostgreSQLFTSService implements IFTSService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Search using PostgreSQL tsvector/tsquery.
   */
  async search(
    query: string,
    entryTypes: EntryType[],
    options: FTSSearchOptions = {}
  ): Promise<FTSResult[]> {
    const limit = options.limit ?? 100;
    const results: FTSResult[] = [];

    // Convert query to tsquery format
    const tsquery = this.buildTsquery(query, options.prefix);

    for (const entryType of entryTypes) {
      const config = this.getTableConfig(entryType);
      if (!config) continue;

      const { entryTable, versionTable, contentColumns } = config;

      // Build headline expression for snippets
      const headlineExpr = options.highlight
        ? `, ts_headline('english', COALESCE(v.${contentColumns[0]}, ''), query, 'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15') as snippet`
        : '';

      // Build search query using search_vector column
      const sql = `
        SELECT
          v.id as version_id,
          e.id as entry_id,
          ts_rank(e.search_vector, query) as rank_score
          ${headlineExpr}
        FROM ${entryTable} e
        JOIN ${versionTable} v ON v.id = e.current_version_id
        CROSS JOIN to_tsquery('english', $1) query
        WHERE e.search_vector @@ query
          AND e.is_active = true
        ORDER BY rank_score DESC
        LIMIT $2
      `;

      try {
        const result = await this.pool.query(sql, [tsquery, limit]);

        for (const row of result.rows) {
          results.push({
            entryType,
            entryId: row.entry_id,
            versionId: row.version_id,
            rank: row.rank_score,
            snippet: row.snippet,
          });
        }
      } catch (error) {
        logger.warn({ entryType, error, tsquery }, 'PostgreSQL FTS search failed');
      }
    }

    // Sort by rank (higher is better) and limit
    results.sort((a, b) => b.rank - a.rank);
    return results.slice(0, limit);
  }

  /**
   * Rebuild FTS index (update search_vector columns).
   * In PostgreSQL, this is typically handled by triggers, but we provide
   * manual rebuild for maintenance purposes.
   */
  async rebuild(entryType?: EntryType): Promise<void> {
    const types: EntryType[] = entryType
      ? [entryType]
      : (['tool', 'guideline', 'knowledge'] as EntryType[]);

    for (const type of types) {
      const config = this.getTableConfig(type);
      if (!config) continue;

      const { entryTable, versionTable, titleColumn, contentColumns } = config;

      try {
        // Build setweight expression for each content column
        const weightedParts = [
          `setweight(to_tsvector('english', COALESCE(e.${titleColumn}, '')), 'A')`,
          ...contentColumns.map(
            (col, i) =>
              `setweight(to_tsvector('english', COALESCE(v.${col}, '')), '${i === 0 ? 'B' : 'C'}')`
          ),
        ];

        const sql = `
          UPDATE ${entryTable} e
          SET search_vector = ${weightedParts.join(' || ')}
          FROM ${versionTable} v
          WHERE e.current_version_id = v.id
            AND e.is_active = true
        `;

        await this.pool.query(sql);
        logger.debug({ type }, 'Rebuilt PostgreSQL FTS index');
      } catch (error) {
        logger.warn({ type, error }, 'Failed to rebuild PostgreSQL FTS index');
      }
    }
  }

  /**
   * Sync FTS index for a specific entry.
   * PostgreSQL triggers handle automatic syncing, so this is typically a no-op.
   * Can be used for manual refresh if needed.
   */
  async syncEntry(entryType: EntryType, entryId: string): Promise<void> {
    const config = this.getTableConfig(entryType);
    if (!config) return;

    const { entryTable, versionTable, titleColumn, contentColumns } = config;

    try {
      const weightedParts = [
        `setweight(to_tsvector('english', COALESCE(e.${titleColumn}, '')), 'A')`,
        ...contentColumns.map(
          (col, i) =>
            `setweight(to_tsvector('english', COALESCE(v.${col}, '')), '${i === 0 ? 'B' : 'C'}')`
        ),
      ];

      const sql = `
        UPDATE ${entryTable} e
        SET search_vector = ${weightedParts.join(' || ')}
        FROM ${versionTable} v
        WHERE e.id = $1
          AND e.current_version_id = v.id
      `;

      await this.pool.query(sql, [entryId]);
    } catch (error) {
      logger.warn({ entryType, entryId, error }, 'Failed to sync PostgreSQL FTS entry');
    }
  }

  /**
   * Escape query string for PostgreSQL tsquery.
   * Converts plain text to a valid tsquery expression.
   */
  escapeQuery(query: string): string {
    // Remove special tsquery characters and normalize whitespace
    return query
      .replace(/[&|!():*<>]/g, ' ') // Remove operators
      .replace(/'/g, "''") // Escape single quotes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Check if PostgreSQL FTS is available (search_vector columns exist).
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'tools'
          AND column_name = 'search_vector'
      `);
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Build a tsquery from user input.
   */
  private buildTsquery(query: string, prefix: boolean = false): string {
    // Clean the query
    const cleaned = this.escapeQuery(query);
    if (!cleaned) return '';

    // Split into words and create tsquery
    const words = cleaned.split(/\s+/).filter(Boolean);

    if (words.length === 0) return '';

    // Build tsquery with AND between words
    // Use :* suffix for prefix matching
    const suffix = prefix ? ':*' : '';
    return words.map((word) => `${word}${suffix}`).join(' & ');
  }

  /**
   * Get table configuration for an entry type.
   */
  private getTableConfig(entryType: EntryType): {
    entryTable: string;
    versionTable: string;
    idColumn: string;
    titleColumn: string;
    contentColumns: string[];
  } | null {
    switch (entryType) {
      case 'tool':
        return {
          entryTable: 'tools',
          versionTable: 'tool_versions',
          idColumn: 'tool_id',
          titleColumn: 'name',
          contentColumns: ['description'],
        };
      case 'guideline':
        return {
          entryTable: 'guidelines',
          versionTable: 'guideline_versions',
          idColumn: 'guideline_id',
          titleColumn: 'name',
          contentColumns: ['content', 'rationale'],
        };
      case 'knowledge':
        return {
          entryTable: 'knowledge',
          versionTable: 'knowledge_versions',
          idColumn: 'knowledge_id',
          titleColumn: 'title',
          contentColumns: ['content', 'source'],
        };
      default:
        return null;
    }
  }
}

/**
 * Create a PostgreSQL FTS service.
 */
export function createPostgreSQLFTSService(pool: Pool): IFTSService {
  return new PostgreSQLFTSService(pool);
}
