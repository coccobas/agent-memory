/**
 * Duplicate detection service
 *
 * Uses FTS5 for fast text search and Levenshtein distance for similarity calculation.
 * Helps prevent creating duplicate entries.
 */

import { getDb, getPreparedStatement } from '../db/connection.js';
import { tools, guidelines, knowledge } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import type { ScopeType, EntryType } from '../db/schema.js';
import { executeFts5Query } from './query.service.js';

// Map EntryType to QueryEntryType for FTS5
type QueryEntryType = 'tool' | 'guideline' | 'knowledge';

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

  // Use FTS5 for fast text search
  const queryEntryType: QueryEntryType =
    entryType === 'tool' ? 'tool' : entryType === 'guideline' ? 'guideline' : 'knowledge';
  const fts5Rowids = executeFts5Query(queryEntryType, name, ['name', 'title']);

  if (fts5Rowids.size === 0) {
    return [];
  }

  // Get entries matching the rowids and scope
  const entries: Array<{ id: string; name: string }> = [];

  if (entryType === 'tool') {
    const allTools = db
      .select()
      .from(tools)
      .where(
        and(
          eq(tools.scopeType, scopeType),
          scopeId === null ? isNull(tools.scopeId) : eq(tools.scopeId, scopeId),
          eq(tools.isActive, true)
        )
      )
      .all();

    // Filter by rowids from FTS5
    for (const tool of allTools) {
      const rowidQuery = getPreparedStatement('SELECT rowid FROM tools WHERE id = ?');
      const rowidResult = rowidQuery.get(tool.id) as { rowid: number } | undefined;
      if (rowidResult && fts5Rowids.has(rowidResult.rowid)) {
        entries.push({ id: tool.id, name: tool.name });
      }
    }
  } else if (entryType === 'guideline') {
    const allGuidelines = db
      .select()
      .from(guidelines)
      .where(
        and(
          eq(guidelines.scopeType, scopeType),
          scopeId === null ? isNull(guidelines.scopeId) : eq(guidelines.scopeId, scopeId),
          eq(guidelines.isActive, true)
        )
      )
      .all();

    for (const guideline of allGuidelines) {
      const rowidQuery = getPreparedStatement('SELECT rowid FROM guidelines WHERE id = ?');
      const rowidResult = rowidQuery.get(guideline.id) as { rowid: number } | undefined;
      if (rowidResult && fts5Rowids.has(rowidResult.rowid)) {
        entries.push({ id: guideline.id, name: guideline.name });
      }
    }
  } else {
    const allKnowledge = db
      .select()
      .from(knowledge)
      .where(
        and(
          eq(knowledge.scopeType, scopeType),
          scopeId === null ? isNull(knowledge.scopeId) : eq(knowledge.scopeId, scopeId),
          eq(knowledge.isActive, true)
        )
      )
      .all();

    for (const k of allKnowledge) {
      const rowidQuery = getPreparedStatement('SELECT rowid FROM knowledge WHERE id = ?');
      const rowidResult = rowidQuery.get(k.id) as { rowid: number } | undefined;
      if (rowidResult && fts5Rowids.has(rowidResult.rowid)) {
        entries.push({ id: k.id, name: k.title });
      }
    }
  }

  // Calculate similarity scores
  const similar: SimilarEntry[] = [];
  for (const entry of entries) {
    const similarity = calculateSimilarity(name, entry.name);
    if (similarity >= threshold) {
      similar.push({
        id: entry.id,
        name: entry.name,
        similarity,
      });
    }
  }

  // Sort by similarity (highest first)
  similar.sort((a, b) => b.similarity - a.similarity);

  return similar;
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


