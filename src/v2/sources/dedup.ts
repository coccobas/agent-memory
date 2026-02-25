/**
 * Generic metadata-field dedup for source imports.
 *
 * Queries v2_entries by a JSON metadata field (e.g., notionPageId)
 * to find an existing entry for the same source document.
 * Works for any source — Notion, Slack, GitHub, etc.
 */

import type Database from 'better-sqlite3';

/**
 * Find an existing active entry whose metadata contains a matching source ID.
 *
 * @param sqlite     - better-sqlite3 database handle
 * @param metadataField - JSON path to query (e.g., 'notionPageId')
 * @param sourceId   - Value to match against
 * @param scopeId    - Scope key to constrain the search (e.g., 'project:my-proj')
 * @returns Entry ID if found, null otherwise
 */
export function findEntryBySourceId(
  sqlite: Database.Database,
  metadataField: string,
  sourceId: string,
  scopeId: string
): string | null {
  const row = sqlite
    .prepare(
      `
      SELECT id
      FROM v2_entries
      WHERE json_extract(metadata, '$.' || ?) = ?
        AND scope_id = ?
        AND is_active = 1
      LIMIT 1
    `
    )
    .get(metadataField, sourceId, scopeId) as { id: string } | undefined;

  return row?.id ?? null;
}
