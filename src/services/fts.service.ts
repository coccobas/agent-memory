/**
 * Full-Text Search (FTS5) Service
 *
 * Provides FTS5-based search functionality for tools, guidelines, and knowledge entries.
 * FTS5 provides better search capabilities than simple LIKE queries, including:
 * - Relevance ranking
 * - Phrase matching
 * - Prefix matching
 * - Boolean operators
 *
 * Security Note:
 * FTS5 supports operators (AND, OR, NOT, NEAR) that can be injected by users.
 * All user input is sanitized via sanitizeFts5Operators() to prevent operator injection
 * attacks while preserving search functionality. Operators are treated as literal text
 * by wrapping queries in quotes when detected.
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

  // Sanitize query to prevent operator injection, then escape for FTS5
  const sanitizedQuery = sanitizeFts5Operators(query);
  const escapedQuery = sanitizedQuery;

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
 * Escape query string for FTS5 - preserves structure
 *
 * FTS5 has special characters that need escaping:
 * - Double quotes are escaped to ""
 * - If query contains operators, wraps in quotes to treat as phrase
 *
 * Use this when you want to preserve the query structure for phrase matching.
 *
 * @param query - Raw search query
 * @returns Escaped query safe for FTS5 MATCH
 */
export function escapeFts5Query(query: string): string {
  // Replace double quotes with escaped version
  let escaped = query.replace(/"/g, '""');

  // If query contains operators, wrap in quotes to treat as phrase
  if (/[\s+\-|*()]/.test(escaped)) {
    escaped = `"${escaped}"`;
  }

  return escaped;
}

/**
 * Sanitize FTS5 query to prevent operator injection
 *
 * FTS5 supports operators like AND, OR, NOT, NEAR that can be injected
 * to manipulate search behavior. This function sanitizes user input by:
 * 1. Detecting FTS5 operators (case-insensitive)
 * 2. Wrapping the entire query in quotes if operators are found
 * 3. Escaping double quotes properly
 * 4. Handling NEAR/N syntax (e.g., NEAR/5)
 *
 * The function uses word boundary detection to avoid false positives:
 * - "landscape" -> "landscape" (not sanitized, "and" is part of word)
 * - "term AND term" -> '"term AND term"' (sanitized, standalone operator)
 * - "term NEAR/5 term" -> '"term NEAR/5 term"' (sanitized with distance)
 *
 * Examples:
 * ```typescript
 * sanitizeFts5Operators('hello world') // 'hello world' (no operators)
 * sanitizeFts5Operators('term1 AND term2') // '"term1 AND term2"' (operator detected)
 * sanitizeFts5Operators('term1 NEAR/5 term2') // '"term1 NEAR/5 term2"' (NEAR with distance)
 * sanitizeFts5Operators('"quoted" AND term') // '"""quoted"" AND term"' (quotes escaped)
 * sanitizeFts5Operators('android') // 'android' (not an operator)
 * ```
 *
 * @param query - Raw user search query
 * @returns Sanitized query safe from operator injection
 */
export function sanitizeFts5Operators(query: string): string {
  if (!query || query.trim().length === 0) {
    return query;
  }

  // First, escape any existing double quotes
  let sanitized = query.replace(/"/g, '""');

  // FTS5 operators that need sanitization (case-insensitive)
  // Matches: AND, OR, NOT, NEAR, NEAR/N (where N is a number)
  const operatorPattern = /\b(AND|OR|NOT|NEAR(?:\/\d+)?)\b/gi;

  // Check if the query contains any FTS5 operators
  if (operatorPattern.test(sanitized)) {
    // Wrap entire query in quotes to treat operators as literal text
    // This preserves user intent while preventing operator injection
    sanitized = `"${sanitized}"`;
  }

  return sanitized;
}

/**
 * Simple FTS5 quote escaping - just escapes double quotes
 *
 * Use this for simple escaping when you'll apply your own query logic.
 *
 * @param query - Raw search query
 * @returns Query with double quotes escaped
 */
export function escapeFts5Quotes(query: string): string {
  return query.replace(/"/g, '""');
}

// Export alias for backwards compatibility
export const escapeFTSQuery = escapeFts5Query;

/**
 * Escape query string for FTS5 MATCH - tokenized mode
 *
 * Converts input to plain tokens for similarity matching.
 * Use this when the goal is fuzzy/similarity matching rather than
 * preserving the exact query structure.
 *
 * @param input - Raw search input
 * @returns Cleaned string with only alphanumeric tokens separated by spaces
 */
export function escapeFts5QueryTokenized(input: string): string {
  return (
    input
      // Remove quotes and asterisks (FTS5 operators)
      .replace(/["*]/g, '')
      // Normalize kebab/snake/camel-ish identifiers into tokens
      // FTS5 MATCH has its own query syntax; reducing to plain tokens avoids parse errors
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
  );
}

/**
 * Convert query string to FTS5 OR query for better recall
 *
 * FTS5 uses implicit AND between terms. This function converts a query
 * to use explicit OR between terms, so matching ANY term returns results.
 * Useful for natural language questions where not all words need to match.
 *
 * Also filters out common stop words that add noise without improving recall.
 *
 * Prefix matching: Short tokens (< 6 chars) and non-dictionary words get a
 * trailing * for prefix matching. This helps match partial words like
 * "secur" -> "security", "auth" -> "authentication".
 *
 * @param input - Raw search input
 * @returns FTS5 query with OR between significant tokens
 */
export function escapeFts5QueryOr(input: string): string {
  // Common English stop words to filter out
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
    'dare',
    'ought',
    'used',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'and',
    'but',
    'or',
    'nor',
    'so',
    'yet',
    'both',
    'either',
    'neither',
    'not',
    'only',
    'own',
    'same',
    'than',
    'too',
    'very',
    'just',
    'i',
    'me',
    'my',
    'myself',
    'we',
    'our',
    'ours',
    'ourselves',
    'you',
    'your',
    'yours',
    'yourself',
    'yourselves',
    'he',
    'him',
    'his',
    'himself',
    'she',
    'her',
    'hers',
    'herself',
    'it',
    'its',
    'itself',
    'they',
    'them',
    'their',
    'theirs',
    'themselves',
    'what',
    'which',
    'who',
    'whom',
    'this',
    'that',
    'these',
    'those',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'every',
    'any',
    'some',
    'go',
    'went',
    'gone',
    'going',
    'get',
    'got',
    'getting',
  ]);

  // Common complete English words that shouldn't have prefix matching
  // This avoids matching "test*" when "test" is a complete word
  const completeWords = new Set([
    'test',
    'tests',
    'code',
    'file',
    'files',
    'data',
    'type',
    'types',
    'user',
    'users',
    'name',
    'names',
    'time',
    'date',
    'error',
    'errors',
    'list',
    'array',
    'object',
    'class',
    'function',
    'method',
    'string',
    'number',
    'boolean',
    'null',
    'undefined',
    'true',
    'false',
    'return',
    'async',
    'await',
    'import',
    'export',
    'default',
    'const',
    'let',
    'var',
    'docker',
    'build',
    'deploy',
    'api',
    'rest',
    'http',
    'json',
    'sql',
  ]);

  const tokens = input
    // Remove quotes and asterisks
    .replace(/["*]/g, '')
    // Normalize to tokens
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    // Filter stop words and short tokens
    .filter((token) => token.length >= 2 && !stopWords.has(token));

  if (tokens.length === 0) {
    return '';
  }

  // Apply prefix matching for short tokens that aren't complete words
  // This helps match partial words like "secur" -> "security"
  const processedTokens = tokens.map((token) => {
    // Add prefix wildcard for:
    // 1. Short tokens (< 6 chars) that aren't known complete words
    // 2. This helps match partial words while avoiding over-matching
    if (token.length < 6 && !completeWords.has(token)) {
      return `${token}*`;
    }
    return token;
  });

  // Join with OR for better recall
  return processedTokens.join(' OR ');
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
