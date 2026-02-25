/**
 * MCP handler for Open WebUI pipeline content ingestion.
 *
 * Thin wrapper that validates MCP params, maps them to SourcePageInput[],
 * and delegates to the generic handleSourceIngest().
 */

import type { AppContext } from '../../core/context.js';
import { openwebuiAdapter } from '../sources/openwebui/index.js';
import { handleSourceIngest } from '../sources/ingest-handler.js';
import type { SourceIngestResult, SourcePageInput } from '../sources/types.js';

interface OpenWebUIDocParam {
  docId?: string;
  title?: string;
  content?: string;
  url?: string;
  pipelineName?: string;
  modelId?: string;
  entryType?: string;
  category?: string;
  tags?: string[];
}

/**
 * Handle a memory_openwebui_ingest MCP call.
 */
export async function handleV2MemoryOpenWebUIIngest(
  context: AppContext,
  params: Record<string, unknown>
): Promise<SourceIngestResult> {
  const rawDocs = params.documents;
  if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
    return {
      results: [],
      summary: { created: 0, updated: 0, skipped: 0, errors: 0 },
      _display: 'Error: documents array is required and must not be empty.',
    };
  }

  const pages: SourcePageInput[] = [];
  const errors: Array<{ sourceId: string; error: string }> = [];

  for (const raw of rawDocs) {
    const doc = raw as OpenWebUIDocParam;

    if (!doc.docId || !doc.title || !doc.content) {
      errors.push({
        sourceId: doc.docId ?? 'unknown',
        error: 'Each document requires docId, title, and content',
      });
      continue;
    }

    const entryType = doc.entryType;
    if (
      entryType !== undefined &&
      entryType !== 'guideline' &&
      entryType !== 'knowledge' &&
      entryType !== 'tool'
    ) {
      errors.push({
        sourceId: doc.docId,
        error: `Invalid entryType: ${entryType}. Must be guideline, knowledge, or tool.`,
      });
      continue;
    }

    const extraMeta: Record<string, unknown> = {};
    if (doc.pipelineName) extraMeta.pipelineName = doc.pipelineName;
    if (doc.modelId) extraMeta.modelId = doc.modelId;

    pages.push({
      sourceId: doc.docId,
      title: doc.title,
      content: doc.content,
      url: doc.url,
      entryType: entryType as SourcePageInput['entryType'],
      category: doc.category,
      tags: doc.tags,
      metadata: Object.keys(extraMeta).length > 0 ? extraMeta : undefined,
    });
  }

  const projectId = params.projectId as string | undefined;
  const result = await handleSourceIngest(context, openwebuiAdapter, pages, projectId);

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
