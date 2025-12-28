/**
 * Embedding coverage service
 *
 * Checks what percentage of entries in a given scope have embeddings.
 * Useful for health checks and backfill progress monitoring.
 */

import type Database from 'better-sqlite3';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('embedding-coverage');

/**
 * Entry types that support embeddings
 */
export type EmbeddingEntryType = 'tool' | 'guideline' | 'knowledge' | 'experience';

/**
 * Scope chain element for filtering entries
 */
export interface ScopeChainElement {
  type: string;
  id: string | null;
}

/**
 * Result of embedding coverage check
 */
export interface CoverageResult {
  /** Total number of active entries in scope */
  total: number;
  /** Number of entries with embeddings */
  withEmbeddings: number;
  /** Coverage ratio (0-1), calculated as withEmbeddings / total (or 0 if total is 0) */
  ratio: number;
}

/**
 * Table name mapping for each entry type
 */
const TABLE_NAMES: Record<EmbeddingEntryType, string> = {
  tool: 'tools',
  guideline: 'guidelines',
  knowledge: 'knowledge',
  experience: 'experiences',
};

/**
 * Build SQL query for a specific entry type
 *
 * Uses LEFT JOIN to count both total active entries and those with embeddings
 * in a single query per type.
 */
function buildCoverageQuery(entryType: EmbeddingEntryType, scopeCount: number): string {
  const tableName = TABLE_NAMES[entryType];
  const placeholders = Array(scopeCount).fill('?').join(', ');

  return `
    SELECT
      COUNT(DISTINCT t.id) as total,
      COUNT(DISTINCT CASE WHEN ee.has_embedding = 1 THEN t.id END) as with_emb
    FROM ${tableName} t
    LEFT JOIN entry_embeddings ee
      ON ee.entry_type = ? AND ee.entry_id = t.id
    WHERE t.is_active = 1
      AND t.scope_type IN (${placeholders})
  `;
}

/**
 * Get embedding coverage statistics for entries in a given scope
 *
 * @param sqlite - The better-sqlite3 database instance
 * @param scopeChain - Array of scope elements to filter by (uses scope types)
 * @param types - Entry types to include in the coverage check
 * @returns Coverage statistics with total, withEmbeddings, and ratio
 */
export async function getEmbeddingCoverage(
  sqlite: Database.Database,
  scopeChain: ScopeChainElement[],
  types: EmbeddingEntryType[]
): Promise<CoverageResult> {
  // Extract unique scope types from the chain
  const scopeTypes = [...new Set(scopeChain.map((s) => s.type))];

  if (scopeTypes.length === 0 || types.length === 0) {
    logger.debug({ scopeTypes, types }, 'Empty scope chain or types, returning zero coverage');
    return { total: 0, withEmbeddings: 0, ratio: 0 };
  }

  let totalCount = 0;
  let withEmbeddingsCount = 0;

  // Process each entry type
  for (const entryType of types) {
    try {
      const query = buildCoverageQuery(entryType, scopeTypes.length);
      const stmt = sqlite.prepare(query);

      // Parameters: entry_type for the JOIN, then scope_types for the IN clause
      const params = [entryType, ...scopeTypes];
      const row = stmt.get(...params) as { total: number; with_emb: number } | undefined;

      if (row) {
        totalCount += row.total;
        withEmbeddingsCount += row.with_emb;
      }

      logger.debug(
        {
          entryType,
          total: row?.total ?? 0,
          withEmbeddings: row?.with_emb ?? 0,
        },
        'Coverage for entry type'
      );
    } catch (error) {
      logger.error(
        {
          entryType,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to get coverage for entry type'
      );
      // Continue with other types even if one fails
    }
  }

  const ratio = totalCount > 0 ? withEmbeddingsCount / totalCount : 0;

  logger.debug(
    {
      total: totalCount,
      withEmbeddings: withEmbeddingsCount,
      ratio,
      scopeTypes,
      types,
    },
    'Embedding coverage calculated'
  );

  return {
    total: totalCount,
    withEmbeddings: withEmbeddingsCount,
    ratio,
  };
}
