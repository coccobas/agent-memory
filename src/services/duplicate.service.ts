/**
 * Duplicate detection service
 *
 * Uses FTS5 for fast text search and Levenshtein distance for similarity calculation.
 * Helps prevent creating duplicate entries.
 */

import { getPreparedStatement, type DbClient } from '../db/connection.js';
import { tools, guidelines, knowledge } from '../db/schema.js';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { ScopeType, EntryType } from '../db/schema.js';
import { escapeFts5QueryTokenized } from './fts.service.js';

/**
 * Calculate Levenshtein distance with early termination optimization
 *
 * When maxDistance is provided, the algorithm exits early if the minimum
 * possible distance in the current row exceeds the threshold. This reduces
 * time complexity from O(n×m) to O(n×k) where k is the distance threshold.
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @param maxDistance - Optional maximum distance threshold for early termination
 * @returns The Levenshtein distance, or maxDistance+1 if threshold exceeded
 */
function levenshteinDistance(str1: string, str2: string, maxDistance?: number): number {
  // Iterative swap to ensure str1 is shorter (avoids tail recursion)
  let s1 = str1;
  let s2 = str2;
  if (s1.length > s2.length) {
    [s1, s2] = [s2, s1];
  }

  const len1 = s1.length;
  const len2 = s2.length;

  // Early termination: if length difference exceeds maxDistance, no need to compute
  if (maxDistance !== undefined && len2 - len1 > maxDistance) {
    return maxDistance + 1;
  }

  // Use single row optimization (O(min(m,n)) space instead of O(m×n))
  let prevRow: number[] = Array(len1 + 1)
    .fill(0)
    .map((_, i) => i);
  let currRow: number[] = Array(len1 + 1).fill(0);

  for (let j = 1; j <= len2; j++) {
    currRow[0] = j;
    let rowMin = j; // Track minimum value in current row for early termination

    for (let i = 1; i <= len1; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;

      currRow[i] = Math.min(
        (prevRow[i] ?? 0) + 1, // deletion
        (currRow[i - 1] ?? 0) + 1, // insertion
        (prevRow[i - 1] ?? 0) + cost // substitution
      );

      if (currRow[i]! < rowMin) {
        rowMin = currRow[i]!;
      }
    }

    // Early termination: if minimum possible distance exceeds threshold, abort
    if (maxDistance !== undefined && rowMin > maxDistance) {
      return maxDistance + 1;
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[len1] ?? 0;
}

/**
 * Calculate similarity score (0-1) between two strings
 * Uses early termination for efficiency when checking against a threshold
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @param minSimilarity - Optional minimum similarity for early termination (default: 0.8)
 */
function calculateSimilarity(str1: string, str2: string, minSimilarity: number = 0.8): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;

  // Calculate max allowed distance for early termination
  const maxAllowedDistance = Math.floor(maxLen * (1 - minSimilarity));

  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase(), maxAllowedDistance);

  // If distance exceeded threshold, return low similarity
  if (distance > maxAllowedDistance) {
    return 1 - distance / maxLen;
  }

  return 1 - distance / maxLen;
}

export interface SimilarEntry {
  id: string;
  name: string;
  similarity: number;
}

/**
 * Find similar entries using FTS5 and similarity scoring
 *
 * @param entryType - Type of entry to search for
 * @param name - Name/title to search for
 * @param scopeType - Scope type
 * @param scopeId - Scope ID (optional)
 * @param threshold - Minimum similarity score (0-1, default: 0.8)
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 * @returns Array of similar entries with similarity scores
 */
export function findSimilarEntries(
  entryType: EntryType,
  name: string,
  scopeType: ScopeType,
  scopeId: string | null,
  threshold: number = 0.8,
  db: DbClient
): SimilarEntry[] {

  const ftsQuery = escapeFts5QueryTokenized(name);
  if (!ftsQuery) return [];

  if (entryType === 'tool') {
    const idQuery = getPreparedStatement(
      `SELECT tool_id AS id FROM tools_fts WHERE tools_fts MATCH ?`
    );
    const idRows = idQuery.all(ftsQuery) as Array<{ id: string }>;
    const ids = idRows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return [];

    const entries = db
      .select({ id: tools.id, name: tools.name })
      .from(tools)
      .where(
        and(
          eq(tools.scopeType, scopeType),
          scopeId === null ? isNull(tools.scopeId) : eq(tools.scopeId, scopeId),
          eq(tools.isActive, true),
          inArray(tools.id, ids)
        )
      )
      .all();

    return entries
      .map((entry) => ({ ...entry, similarity: calculateSimilarity(name, entry.name) }))
      .filter((e) => e.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .map(({ id, name: entryName, similarity }) => ({ id, name: entryName, similarity }));
  } else if (entryType === 'guideline') {
    const idQuery = getPreparedStatement(
      `SELECT guideline_id AS id FROM guidelines_fts WHERE guidelines_fts MATCH ?`
    );
    const idRows = idQuery.all(ftsQuery) as Array<{ id: string }>;
    const ids = idRows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return [];

    const entries = db
      .select({ id: guidelines.id, name: guidelines.name })
      .from(guidelines)
      .where(
        and(
          eq(guidelines.scopeType, scopeType),
          scopeId === null ? isNull(guidelines.scopeId) : eq(guidelines.scopeId, scopeId),
          eq(guidelines.isActive, true),
          inArray(guidelines.id, ids)
        )
      )
      .all();

    return entries
      .map((entry) => ({ ...entry, similarity: calculateSimilarity(name, entry.name) }))
      .filter((e) => e.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .map(({ id, name: entryName, similarity }) => ({ id, name: entryName, similarity }));
  } else {
    const idQuery = getPreparedStatement(
      `SELECT knowledge_id AS id FROM knowledge_fts WHERE knowledge_fts MATCH ?`
    );
    const idRows = idQuery.all(ftsQuery) as Array<{ id: string }>;
    const ids = idRows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return [];

    const entries = db
      .select({ id: knowledge.id, name: knowledge.title })
      .from(knowledge)
      .where(
        and(
          eq(knowledge.scopeType, scopeType),
          scopeId === null ? isNull(knowledge.scopeId) : eq(knowledge.scopeId, scopeId),
          eq(knowledge.isActive, true),
          inArray(knowledge.id, ids)
        )
      )
      .all();

    return entries
      .map((entry) => ({ ...entry, similarity: calculateSimilarity(name, entry.name) }))
      .filter((e) => e.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .map(({ id, name: entryName, similarity }) => ({ id, name: entryName, similarity }));
  }
}

/**
 * Check for duplicates before creating an entry
 *
 * @param entryType - Type of entry
 * @param name - Name/title of the entry
 * @param scopeType - Scope type
 * @param scopeId - Scope ID (optional)
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 * @returns Object with isDuplicate flag and list of similar entries
 */
export function checkForDuplicates(
  entryType: EntryType,
  name: string,
  scopeType: ScopeType,
  scopeId: string | null,
  db: DbClient
): { isDuplicate: boolean; similarEntries: SimilarEntry[] } {
  const similar = findSimilarEntries(entryType, name, scopeType, scopeId, 0.8, db);

  // Consider it a duplicate if similarity >= 0.9
  const duplicates = similar.filter((e) => e.similarity >= 0.9);

  return {
    isDuplicate: duplicates.length > 0,
    similarEntries: similar,
  };
}


