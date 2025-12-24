/**
 * Full-Text Search Service Interface
 *
 * Abstract interface for FTS implementations.
 * Allows swapping between SQLite FTS5 and PostgreSQL tsvector.
 */

import type { EntryType } from '../../db/schema/types.js';

/**
 * Result from a full-text search query.
 */
export interface FTSResult {
  /** Type of entry (tool, guideline, knowledge) */
  entryType: EntryType;
  /** ID of the matched entry */
  entryId: string;
  /** ID of the matched version */
  versionId: string;
  /** Relevance score (higher is better) */
  rank: number;
  /** Highlighted snippet with match context */
  snippet?: string;
}

/**
 * Options for full-text search queries.
 */
export interface FTSSearchOptions {
  /** Maximum number of results to return (default: 100) */
  limit?: number;
  /** Generate highlighted snippets (default: false) */
  highlight?: boolean;
  /** Enable prefix matching (default: false) */
  prefix?: boolean;
}

/**
 * Full-Text Search Service Interface
 *
 * Provides database-agnostic full-text search functionality.
 * Implementations exist for:
 * - SQLite FTS5
 * - PostgreSQL tsvector/tsquery
 */
export interface IFTSService {
  /**
   * Search for entries matching the query.
   *
   * @param query - Search query string
   * @param entryTypes - Types of entries to search
   * @param options - Search options
   * @returns Array of search results with ranking
   */
  search(
    query: string,
    entryTypes: EntryType[],
    options?: FTSSearchOptions
  ): Promise<FTSResult[]>;

  /**
   * Rebuild the FTS index for a specific entry type or all types.
   *
   * @param entryType - Optional entry type to rebuild, or undefined for all
   */
  rebuild(entryType?: EntryType): Promise<void>;

  /**
   * Sync the FTS index for a specific entry after update.
   * May be a no-op if triggers handle sync automatically.
   *
   * @param entryType - Entry type
   * @param entryId - Entry ID
   */
  syncEntry(entryType: EntryType, entryId: string): Promise<void>;

  /**
   * Escape a query string for safe use with this FTS implementation.
   *
   * @param query - Raw search query
   * @returns Escaped query safe for the FTS engine
   */
  escapeQuery(query: string): string;

  /**
   * Check if FTS is available and properly configured.
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Database type for FTS service selection.
 */
export type FTSDatabaseType = 'sqlite' | 'postgresql';
