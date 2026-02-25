/**
 * MCP handler for Notion page ingestion.
 *
 * Thin wrapper that validates MCP params, maps them to SourcePageInput[],
 * and delegates to the generic handleSourceIngest().
 */

import type { AppContext } from '../../core/context.js';
import { notionAdapter } from '../sources/notion/index.js';
import { handleSourceIngest } from '../sources/ingest-handler.js';
import type { SourceIngestResult, SourcePageInput } from '../sources/types.js';

interface NotionPageParam {
  pageId?: string;
  title?: string;
  content?: string;
  url?: string;
  entryType?: string;
  category?: string;
  tags?: string[];
}

/**
 * Handle a memory_notion_ingest MCP call.
 */
export async function handleV2MemoryNotionIngest(
  context: AppContext,
  params: Record<string, unknown>
): Promise<SourceIngestResult> {
  const rawPages = params.pages;
  if (!Array.isArray(rawPages) || rawPages.length === 0) {
    return {
      results: [],
      summary: { created: 0, updated: 0, skipped: 0, errors: 0 },
      _display: 'Error: pages array is required and must not be empty.',
    };
  }

  const pages: SourcePageInput[] = [];
  const errors: Array<{ sourceId: string; error: string }> = [];

  for (const raw of rawPages) {
    const page = raw as NotionPageParam;

    if (!page.pageId || !page.title || !page.content) {
      errors.push({
        sourceId: page.pageId ?? 'unknown',
        error: 'Each page requires pageId, title, and content',
      });
      continue;
    }

    const entryType = page.entryType;
    if (
      entryType !== undefined &&
      entryType !== 'guideline' &&
      entryType !== 'knowledge' &&
      entryType !== 'tool'
    ) {
      errors.push({
        sourceId: page.pageId,
        error: `Invalid entryType: ${entryType}. Must be guideline, knowledge, or tool.`,
      });
      continue;
    }

    pages.push({
      sourceId: page.pageId,
      title: page.title,
      content: page.content,
      url: page.url,
      entryType: entryType as SourcePageInput['entryType'],
      category: page.category,
      tags: page.tags,
    });
  }

  const projectId = params.projectId as string | undefined;
  const result = await handleSourceIngest(context, notionAdapter, pages, projectId);

  // Prepend validation errors to the results
  if (errors.length > 0) {
    const errorResults = errors.map((e) => ({
      sourceId: e.sourceId,
      entryId: '',
      action: 'error' as const,
      error: e.error,
    }));

    return {
      results: [...errorResults, ...result.results],
      summary: {
        ...result.summary,
        errors: result.summary.errors + errors.length,
      },
      _display: result._display,
    };
  }

  return result;
}
