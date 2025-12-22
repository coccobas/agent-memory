/**
 * Tags Helper for Query Results
 *
 * Provides efficient batch tag fetching for memory entries.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { getDb, type DbClient } from '../../db/connection.js';
import { tags, entryTags, type Tag } from '../../db/schema.js';

export type QueryEntryType = 'tool' | 'guideline' | 'knowledge';

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
  dbClient?: DbClient
): Record<string, Tag[]> {
  if (entryIds.length === 0) return {};
  const db = dbClient ?? getDb();

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
