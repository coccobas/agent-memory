/**
 * Cross-reference query handler
 */

import { executeMemoryQuery } from '../../services/query.service.js';

import type { MemoryQueryParams, MemoryContextParams } from '../types.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export const queryHandlers = {
  query(params: Record<string, unknown>) {
    const queryParams = cast<MemoryQueryParams>(params);

    const result = executeMemoryQuery(queryParams);

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
