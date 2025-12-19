/**
 * Duplicate detection service
 *
 * Uses FTS5 for fast text search and Levenshtein distance for similarity calculation.
 * Helps prevent creating duplicate entries.
 */

import { getDb, getPreparedStatement } from '../db/connection.js';
import { tools, guidelines, knowledge } from '../db/schema.js';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { ScopeType, EntryType } from '../db/schema.js';

function escapeFts5Query(input: string): string {
  // Keep this conservative: remove characters that have special meaning in MATCH syntax.
  // This aligns with executeFts5Search() in query.service.ts.
  return (
    input
      .replace(/["*]/g, '')
      // Normalize kebab/snake/camel-ish identifiers into tokens.
      // FTS5 MATCH has its own query syntax; reducing to plain tokens avoids parse errors.
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
  );
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    const row0 = matrix[0];
    if (row0) {
      row0[j] = j;
    }
  }

  for (let i = 1; i <= len1; i++) {
    const row = matrix[i];
    if (!row) continue;
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        const prevRow = matrix[i - 1];
        const prevVal = prevRow?.[j - 1];
        if (prevVal !== undefined) {
          row[j] = prevVal;
        }
      } else {
        const prevRow = matrix[i - 1];
        const currentRow = matrix[i];
        const val1 = prevRow?.[j];
        const val2 = currentRow?.[j - 1];
        const val3 = prevRow?.[j - 1];
        if (val1 !== undefined && val2 !== undefined && val3 !== undefined) {
          row[j] = Math.min(
            val1 + 1, // deletion
            val2 + 1, // insertion
            val3 + 1 // substitution
          );
        }
      }
    }
  }

  const finalRow = matrix[len1];
  const finalVal = finalRow?.[len2];
  return finalVal ?? 0;
}

/**
 * Calculate similarity score (0-1) between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
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
 * @returns Array of similar entries with similarity scores
 */
export function findSimilarEntries(
  entryType: EntryType,
  name: string,
  scopeType: ScopeType,
  scopeId: string | null,
  threshold: number = 0.8
): SimilarEntry[] {
  const db = getDb();

  const ftsQuery = escapeFts5Query(name);
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
 * @returns Object with isDuplicate flag and list of similar entries
 */
export function checkForDuplicates(
  entryType: EntryType,
  name: string,
  scopeType: ScopeType,
  scopeId: string | null
): { isDuplicate: boolean; similarEntries: SimilarEntry[] } {
  const similar = findSimilarEntries(entryType, name, scopeType, scopeId, 0.8);

  // Consider it a duplicate if similarity >= 0.9
  const duplicates = similar.filter((e) => e.similarity >= 0.9);

  return {
    isDuplicate: duplicates.length > 0,
    similarEntries: similar,
  };
}
