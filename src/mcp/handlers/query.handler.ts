/**
 * Cross-reference query handler
 */

import { executeMemoryQuery, executeMemoryQueryAsync } from '../../services/query.service.js';
import { logAction } from '../../services/audit.service.js';
import { autoLinkContextFromQuery } from '../../services/conversation.service.js';

import type { MemoryQueryParams } from '../types.js';
import {
  getRequiredParam,
  getOptionalParam,
  isScopeType,
  isString,
  isBoolean,
  isNumber,
  isArray,
  isObject,
  isEntryType,
  isRelationType,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';

export const queryHandlers = {
  async query(params: Record<string, unknown>) {
    // Extract agent-specific params
    const agentId = getOptionalParam(params, 'agentId', isString);
    const conversationId = getOptionalParam(params, 'conversationId', isString);
    const messageId = getOptionalParam(params, 'messageId', isString);
    const autoLinkContext = getOptionalParam(params, 'autoLinkContext', isBoolean);

    // Helper to validate scope object
    function isValidScope(
      v: unknown
    ): v is { type: 'global' | 'org' | 'project' | 'session'; id?: string; inherit?: boolean } {
      if (!isObject(v)) return false;
      const obj = v;
      return (
        isScopeType(obj.type) &&
        (obj.id === undefined || isString(obj.id)) &&
        (obj.inherit === undefined || isBoolean(obj.inherit))
      );
    }

    // Build query params object (excluding agent-specific fields)
    const queryParamsWithoutAgent: MemoryQueryParams = {
      types: getOptionalParam(params, 'types', isArray) as
        | Array<'tools' | 'guidelines' | 'knowledge'>
        | undefined,
      scope: getOptionalParam(params, 'scope', isValidScope),
      search: getOptionalParam(params, 'search', isString),
      tags: getOptionalParam(params, 'tags', isObject),
      relatedTo: (() => {
        const relatedToParam = getOptionalParam(params, 'relatedTo', isObject);
        if (!relatedToParam) return undefined;
        // Validate relatedTo structure
        const type = getOptionalParam(relatedToParam, 'type', isEntryType);
        const id = getOptionalParam(relatedToParam, 'id', isString);
        const relation = getOptionalParam(relatedToParam, 'relation', isRelationType);
        if (type && id) {
          return { type, id, relation };
        }
        return undefined;
      })(),
      limit: getOptionalParam(params, 'limit', isNumber),
      compact: getOptionalParam(params, 'compact', isBoolean),
      semanticSearch: getOptionalParam(params, 'semanticSearch', isBoolean),
      semanticThreshold: getOptionalParam(params, 'semanticThreshold', isNumber),
    };

    // Use async version if semantic search is requested (or default enabled)
    // Note: FTS5 and semantic search can work together - FTS5 for fast text filtering,
    // semantic search for similarity scoring
    const useAsync =
      queryParamsWithoutAgent.semanticSearch !== false && queryParamsWithoutAgent.search;

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

    return formatTimestamps({
      results: result.results,
      meta: result.meta,
    });
  },

  /**
   * Convenience wrapper that returns aggregated context for a scope.
   * It queries tools, guidelines, and knowledge with inheritance enabled
   * and groups results by type.
   */
  context(params: Record<string, unknown>) {
    const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const inherit = getOptionalParam(params, 'inherit', isBoolean) ?? true;
    const compact = getOptionalParam(params, 'compact', isBoolean) ?? false;
    const limitPerType = getOptionalParam(params, 'limitPerType', isNumber);

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

    return formatTimestamps({
      scope: {
        type: scopeType,
        id: scopeId ?? null,
      },
      tools,
      guidelines,
      knowledge,
      meta: result.meta,
    });
  },
};
