/**
 * Generic source ingest handler.
 *
 * Orchestrates the import of pages from any external source:
 * 1. Dedup: find existing entry by source ID
 * 2. Map: convert source page to v2 UpsertEntryRequest
 * 3. Store: persist via write service (create or update)
 * 4. Project: run outbox projectors for indexing
 *
 * Continue-on-error: individual page failures are captured in
 * results, not thrown — the batch continues processing.
 */

import type { AppContext } from '../../core/context.js';
import { getRuntime } from '../mcp/handlers.js';
import { detectProjectFromCwd, ensureProjectScope } from '../mcp/context-detection.js';
import { findEntryBySourceId } from './dedup.js';
import { mapSourcePageToEntry } from './mapper.js';
import type {
  SourceAdapter,
  SourceIngestResult,
  SourcePageInput,
  SourcePageResult,
} from './types.js';

function requireSqlite(context: AppContext) {
  if (!context.sqlite) {
    throw new Error('memory_v2_requires_sqlite_backend');
  }
  return context.sqlite;
}

/**
 * Ingest pages from an external source into the v2 memory system.
 *
 * @param context   - App context with SQLite handle
 * @param adapter   - Source-specific adapter (normalization + metadata field)
 * @param pages     - Array of pages to import
 * @param projectId - Explicit project ID (auto-detected from cwd if omitted)
 */
export async function handleSourceIngest(
  context: AppContext,
  adapter: SourceAdapter,
  pages: readonly SourcePageInput[],
  projectId?: string
): Promise<SourceIngestResult> {
  if (pages.length === 0) {
    return {
      results: [],
      summary: { created: 0, updated: 0, skipped: 0, errors: 0 },
      _display: 'No pages to import.',
    };
  }

  const sqlite = requireSqlite(context);
  const runtime = getRuntime(context);

  // Resolve project scope
  let resolvedProjectId = projectId ?? null;
  if (!resolvedProjectId) {
    const detected = detectProjectFromCwd(sqlite, process.cwd());
    resolvedProjectId = detected.projectExternalId;
  }

  if (!resolvedProjectId) {
    return {
      results: [],
      summary: { created: 0, updated: 0, skipped: 0, errors: 0 },
      _display: 'Could not detect project. Please specify projectId.',
    };
  }

  // Ensure project scope exists
  const scopeKey = ensureProjectScope(sqlite, resolvedProjectId);

  const results: SourcePageResult[] = [];
  const summary = { created: 0, updated: 0, skipped: 0, errors: 0 };

  for (const page of pages) {
    try {
      // Validate required fields
      if (!page.sourceId || !page.title) {
        results.push({
          sourceId: page.sourceId ?? 'unknown',
          entryId: '',
          action: 'error',
          error: 'Missing required field: sourceId and title are required',
        });
        summary.errors++;
        continue;
      }

      // Dedup: check if this source page already exists
      const existingEntryId = findEntryBySourceId(
        sqlite,
        adapter.metadataIdField,
        page.sourceId,
        scopeKey
      );

      // Map source page to v2 entry request
      const request = mapSourcePageToEntry(adapter, page, resolvedProjectId);

      if (existingEntryId) {
        // Update existing entry
        const entry = await runtime.memory.write.upsertEntry({
          ...request,
          entryId: existingEntryId,
        });
        results.push({
          sourceId: page.sourceId,
          entryId: entry.ref.id,
          action: 'updated',
          entryType: entry.ref.type,
          title: page.title,
        });
        summary.updated++;
      } else {
        // Create new entry
        const entry = await runtime.memory.write.upsertEntry(request);
        results.push({
          sourceId: page.sourceId,
          entryId: entry.ref.id,
          action: 'created',
          entryType: entry.ref.type,
          title: page.title,
        });
        summary.created++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        sourceId: page.sourceId ?? 'unknown',
        entryId: '',
        action: 'error',
        error: message,
      });
      summary.errors++;
    }
  }

  // Run projector to index new/updated entries
  try {
    await runtime.projectorRunner.runBatch(pages.length * 2);
  } catch {
    // Projector errors are non-fatal — entries are stored, indexing will catch up
  }

  const parts: string[] = [];
  if (summary.created > 0) parts.push(`${summary.created} created`);
  if (summary.updated > 0) parts.push(`${summary.updated} updated`);
  if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`);
  if (summary.errors > 0) parts.push(`${summary.errors} errors`);

  return {
    results,
    summary,
    _display: `Imported from ${adapter.sourceName}: ${parts.join(', ')}`,
  };
}
