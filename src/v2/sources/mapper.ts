/**
 * Generic source page → v2 entry mapper.
 *
 * Converts a SourcePageInput into an UpsertEntryRequest using:
 * - The adapter's normalizeContent() for content cleaning
 * - detectEntryType() / inferCategory() from remember-handler (or explicit overrides)
 * - source='import' to mark the ingestion lane
 */

import type { UpsertEntryRequest } from '../contracts/index.js';
import { detectEntryType, inferCategory } from '../mcp/remember-handler.js';
import type { SourceAdapter, SourcePageInput } from './types.js';

/**
 * Map a source page to a v2 UpsertEntryRequest.
 *
 * @param adapter    - Source adapter (provides normalizeContent and metadataIdField)
 * @param page       - Raw input from the caller
 * @param projectId  - External project ID for scope resolution
 * @returns UpsertEntryRequest ready for write service
 */
export function mapSourcePageToEntry(
  adapter: SourceAdapter,
  page: SourcePageInput,
  projectId: string
): UpsertEntryRequest {
  const normalizedContent = adapter.normalizeContent(page.content);

  const entryType = page.entryType ?? detectEntryType(normalizedContent) ?? 'knowledge';
  const inferableType = entryType === 'experience' ? 'knowledge' : entryType;
  const category = page.category ?? inferCategory(inferableType, normalizedContent);

  const tags = page.tags ? page.tags.map((t) => t.trim().toLowerCase()) : undefined;

  const metadata: Record<string, unknown> = {
    [adapter.metadataIdField]: page.sourceId,
    syncedAt: new Date().toISOString(),
    ...(page.url ? { sourceUrl: page.url } : {}),
    ...(page.metadata ?? {}),
  };

  return {
    actorId: `${adapter.sourceName}-import`,
    data: {
      type: entryType,
      title: page.title,
      content: normalizedContent,
      source: 'import',
      scope: { type: 'project', id: projectId },
      category,
      tags,
      metadata,
    },
  };
}
