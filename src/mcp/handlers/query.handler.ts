/**
 * Cross-reference query handler
 */

import { executeMemoryQuery, executeMemoryQueryAsync } from '../../services/query.service.js';
import { logAction } from '../../services/audit.service.js';
import { autoLinkContextFromQuery } from '../../services/conversation.service.js';

import type { MemoryQueryParams, MemoryContextParams } from '../types.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export const queryHandlers = {
  async query(params: Record<string, unknown>) {
    const queryParams = cast<MemoryQueryParams & { agentId?: string }>(params);
    const { agentId, conversationId, messageId, autoLinkContext, ...queryParamsWithoutAgent } =
      queryParams;

    // Use async version if semantic search is requested (or default enabled)
    // Note: FTS5 and semantic search can work together - FTS5 for fast text filtering,
    // semantic search for similarity scoring
    const useAsync = queryParams.semanticSearch !== false && queryParams.search;

    const result = useAsync
      ? await executeMemoryQueryAsync(queryParamsWithoutAgent)
      : executeMemoryQuery(queryParamsWithoutAgent);

    // Auto-link results to conversation if conversationId provided
    if (conversationId && autoLinkContext !== false) {
      try {
        autoLinkContextFromQuery(conversationId, messageId, result);
      } catch (error) {
        // Silently ignore errors in auto-linking (fire-and-forget)
        // This shouldn't break the query response
      }
    }

    // Log audit
    logAction({
      agentId,
      action: 'query',
      queryParams: queryParamsWithoutAgent,
      resultCount: result.results.length,
    });

    return {
      results: result.results,
      meta: result.meta,
    };
  },

  /**
   * Convenience wrapper that returns aggregated context for a scope.
   * It queries tools, guidelines, and knowledge with inheritance enabled
   * and groups results by type.
   */
  context(params: Record<string, unknown>) {
    const {
      scopeType,
      scopeId,
      inherit = true,
      compact = false,
      limitPerType,
    }: MemoryContextParams = cast<MemoryContextParams>(params);

    if (!scopeType) {
      throw new Error('scopeType is required');
    }

    const result = executeMemoryQuery({
      types: ['tools', 'guidelines', 'knowledge'],
      scope: {
        type: scopeType,
        id: scopeId,
        inherit,
      },
      compact,
      limit: limitPerType,
    });

    const tools = result.results.filter((r) => r.type === 'tool');
    const guidelines = result.results.filter((r) => r.type === 'guideline');
    const knowledge = result.results.filter((r) => r.type === 'knowledge');

    return {
      scope: {
        type: scopeType,
        id: scopeId ?? null,
      },
      tools,
      guidelines,
      knowledge,
      meta: result.meta,
    };
  },
};
