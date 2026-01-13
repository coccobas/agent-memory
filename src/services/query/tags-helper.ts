/**
 * Tags Helper for Query Results
 *
 * Provides efficient batch tag fetching for memory entries.
 */

import { and, eq, inArray, or } from 'drizzle-orm';
import type { DbClient } from '../../db/connection.js';
import { tags, entryTags, type Tag } from '../../db/schema.js';

export type QueryEntryType = 'tool' | 'guideline' | 'knowledge' | 'experience';

/**
 * Batch fetch tags for a list of entries
 * Returns a map of entry ID to array of tags
 *
 * @param entryType - The type of entries to fetch tags for
 * @param entryIds - Array of entry IDs
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function getTagsForEntries(
  entryType: QueryEntryType,
  entryIds: string[],
  db: DbClient
): Record<string, Tag[]> {
  if (entryIds.length === 0) return {};

  const entryTagRows = db
    .select()
    .from(entryTags)
    .where(and(eq(entryTags.entryType, entryType), inArray(entryTags.entryId, entryIds)))
    .all();

  if (entryTagRows.length === 0) return {};

  const tagIds = Array.from(new Set(entryTagRows.map((r) => r.tagId)));
  const tagRows = db.select().from(tags).where(inArray(tags.id, tagIds)).all();
  const tagById = new Map(tagRows.map((t) => [t.id, t]));

  const result: Record<string, Tag[]> = {};
  for (const row of entryTagRows) {
    const tag = tagById.get(row.tagId);
    if (!tag) continue;
    const list = result[row.entryId] ?? [];
    list.push(tag);
    result[row.entryId] = list;
  }

  return result;
}

/**
 * Task 28: Batch fetch tags for multiple entry types in a single DB call.
 * Combines all entry type queries into one for better performance.
 *
 * @param entriesByType - Map of entry type to entry IDs
 * @param db - Database client
 * @returns Map of entry ID to array of tags (combined across all types)
 */
export function getTagsForEntriesBatch(
  entriesByType: Map<QueryEntryType, string[]>,
  db: DbClient
): Record<string, Tag[]> {
  // Collect all entry IDs across all types
  const allEntryIds: string[] = [];
  const entryTypeMap = new Map<string, QueryEntryType>(); // entryId -> type

  for (const [entryType, entryIds] of entriesByType) {
    for (const id of entryIds) {
      allEntryIds.push(id);
      entryTypeMap.set(id, entryType);
    }
  }

  if (allEntryIds.length === 0) return {};

  // Bug #206 fix: Build OR conditions to push filtering into SQL
  // Instead of fetching all by entryId and filtering in JS, build proper WHERE clause
  // Each entry type gets its own (entryType = X AND entryId IN (...)) condition
  const typeConditions = [];
  for (const [entryType, entryIds] of entriesByType) {
    if (entryIds.length > 0) {
      typeConditions.push(and(eq(entryTags.entryType, entryType), inArray(entryTags.entryId, entryIds)));
    }
  }

  if (typeConditions.length === 0) return {};

  // Single query with proper OR conditions - only fetches matching rows
  const filteredRows = db
    .select()
    .from(entryTags)
    .where(typeConditions.length === 1 ? typeConditions[0] : or(...typeConditions))
    .all();

  if (filteredRows.length === 0) return {};

  // Fetch all tags in one query
  const tagIds = Array.from(new Set(filteredRows.map((r) => r.tagId)));
  const tagRows = db.select().from(tags).where(inArray(tags.id, tagIds)).all();
  const tagById = new Map(tagRows.map((t) => [t.id, t]));

  // Build result
  const result: Record<string, Tag[]> = {};
  for (const row of filteredRows) {
    const tag = tagById.get(row.tagId);
    if (!tag) continue;
    const list = result[row.entryId] ?? [];
    list.push(tag);
    result[row.entryId] = list;
  }

  return result;
}
