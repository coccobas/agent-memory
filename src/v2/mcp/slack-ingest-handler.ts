/**
 * MCP handler for Slack thread/message ingestion.
 *
 * Thin wrapper that validates MCP params, maps them to SourcePageInput[],
 * and delegates to the generic handleSourceIngest().
 */

import type { AppContext } from '../../core/context.js';
import { slackAdapter } from '../sources/slack/index.js';
import { handleSourceIngest } from '../sources/ingest-handler.js';
import type { SourceIngestResult, SourcePageInput } from '../sources/types.js';

interface SlackThreadParam {
  threadId?: string;
  title?: string;
  content?: string;
  url?: string;
  channelName?: string;
  entryType?: string;
  category?: string;
  tags?: string[];
}

/**
 * Handle a memory_slack_ingest MCP call.
 */
export async function handleV2MemorySlackIngest(
  context: AppContext,
  params: Record<string, unknown>
): Promise<SourceIngestResult> {
  const rawThreads = params.threads;
  if (!Array.isArray(rawThreads) || rawThreads.length === 0) {
    return {
      results: [],
      summary: { created: 0, updated: 0, skipped: 0, errors: 0 },
      _display: 'Error: threads array is required and must not be empty.',
    };
  }

  const pages: SourcePageInput[] = [];
  const errors: Array<{ sourceId: string; error: string }> = [];

  for (const raw of rawThreads) {
    const thread = raw as SlackThreadParam;

    if (!thread.threadId || !thread.title || !thread.content) {
      errors.push({
        sourceId: thread.threadId ?? 'unknown',
        error: 'Each thread requires threadId, title, and content',
      });
      continue;
    }

    const entryType = thread.entryType;
    if (
      entryType !== undefined &&
      entryType !== 'guideline' &&
      entryType !== 'knowledge' &&
      entryType !== 'tool'
    ) {
      errors.push({
        sourceId: thread.threadId,
        error: `Invalid entryType: ${entryType}. Must be guideline, knowledge, or tool.`,
      });
      continue;
    }

    pages.push({
      sourceId: thread.threadId,
      title: thread.title,
      content: thread.content,
      url: thread.url,
      entryType: entryType as SourcePageInput['entryType'],
      category: thread.category,
      tags: thread.tags,
      metadata: thread.channelName ? { channelName: thread.channelName } : undefined,
    });
  }

  const projectId = params.projectId as string | undefined;
  const result = await handleSourceIngest(context, slackAdapter, pages, projectId);

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
