/**
 * Cross-reference query handler
 */

import { executeQueryPipeline } from '../../services/query/index.js';
import { getContext } from '../../core/container.js';
import { logAction } from '../../services/audit.service.js';
import { autoLinkContextFromQuery } from '../../services/conversation.service.js';
import { checkPermission } from '../../services/permission.service.js';

import type { MemoryQueryParams } from '../types.js';
import {
  getRequiredParam,
  getOptionalParam,
  isScopeType,
  isString,
  isBoolean,
  isNumber,
  isObject,
  isEntryType,
  isRelationType,
  isArrayOfStrings,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { createPermissionError, createValidationError } from '../../core/errors.js';

const queryTypeToEntryType = {
  tools: 'tool',
  guidelines: 'guideline',
  knowledge: 'knowledge',
} as const;

function isQueryType(value: string): value is keyof typeof queryTypeToEntryType {
  return value === 'tools' || value === 'guidelines' || value === 'knowledge';
}

export const queryHandlers = {
  async query(params: Record<string, unknown>) {
    // Extract agent-specific params (agentId optional for read operations)
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

    // Helper to validate direction
    function isTraversalDirection(v: unknown): v is 'forward' | 'backward' | 'both' {
      return v === 'forward' || v === 'backward' || v === 'both';
    }

    // Build query params object (excluding agent-specific fields)
    const requestedTypesRaw = getOptionalParam(params, 'types', isArrayOfStrings);
    const requestedTypes = requestedTypesRaw ? requestedTypesRaw.filter(isQueryType) : undefined;
    if (
      requestedTypesRaw &&
      (!requestedTypes || requestedTypes.length !== requestedTypesRaw.length)
    ) {
      throw createValidationError(
        'types',
        'contains invalid values',
        'Use tools, guidelines, knowledge'
      );
    }

    const queryParamsWithoutAgent: MemoryQueryParams = {
      types: requestedTypes,
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
        // Graph traversal options
        const depth = getOptionalParam(relatedToParam, 'depth', isNumber);
        const direction = getOptionalParam(relatedToParam, 'direction', isTraversalDirection);
        const maxResults = getOptionalParam(relatedToParam, 'maxResults', isNumber);
        if (type && id) {
          return { type, id, relation, depth, direction, maxResults };
        }
        return undefined;
      })(),
      followRelations: getOptionalParam(params, 'followRelations', isBoolean),
      limit: getOptionalParam(params, 'limit', isNumber),
      compact: getOptionalParam(params, 'compact', isBoolean),
      semanticSearch: getOptionalParam(params, 'semanticSearch', isBoolean),
      semanticThreshold: getOptionalParam(params, 'semanticThreshold', isNumber),
    };

    // Permissions: deny by default, allow per requested type/scope
    const scopeType = queryParamsWithoutAgent.scope?.type ?? 'global';
    const scopeId = queryParamsWithoutAgent.scope?.id;

    const typesToCheck = requestedTypes ?? (['tools', 'guidelines', 'knowledge'] as const);
    const deniedTypes = typesToCheck.filter(
      (type) =>
        !checkPermission(
          agentId,
          'read',
          queryTypeToEntryType[type],
          null,
          scopeType,
          scopeId ?? null
        )
    );

    if (requestedTypes && deniedTypes.length > 0) {
      throw createPermissionError(
        'read',
        deniedTypes.map((t) => queryTypeToEntryType[t]).join(',')
      );
    }

    // If types omitted, filter to allowed ones
    if (!requestedTypes) {
      const allowedTypes = typesToCheck.filter((t) => !deniedTypes.includes(t));
      if (allowedTypes.length === 0) {
        throw createPermissionError('read', 'memory');
      }
      queryParamsWithoutAgent.types = [...allowedTypes];
    }

    // Execute query using the modular pipeline with context-injected dependencies
    const context = getContext();
    const result = await executeQueryPipeline(queryParamsWithoutAgent, context.queryDeps);

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
  async context(params: Record<string, unknown>) {
    const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const inherit = getOptionalParam(params, 'inherit', isBoolean) ?? true;
    const compact = getOptionalParam(params, 'compact', isBoolean) ?? false;
    const limitPerType = getOptionalParam(params, 'limitPerType', isNumber);
    // agentId optional for read operations
    const agentId = getOptionalParam(params, 'agentId', isString);
    const semanticSearch = getOptionalParam(params, 'semanticSearch', isBoolean);
    const search = getOptionalParam(params, 'search', isString);

    const allowedTypes = (['tools', 'guidelines', 'knowledge'] as const).filter((type) =>
      checkPermission(agentId, 'read', queryTypeToEntryType[type], null, scopeType, scopeId ?? null)
    );

    if (allowedTypes.length === 0) {
      throw createPermissionError('read', 'memory');
    }

    // Query parameters for context
    const queryParams: MemoryQueryParams = {
      types: [...allowedTypes],
      scope: {
        type: scopeType,
        id: scopeId,
        inherit,
      },
      compact,
      limit: limitPerType,
      search,
      semanticSearch,
    };

    // Execute query using the modular pipeline with context-injected dependencies
    const context = getContext();
    const result = await executeQueryPipeline(queryParams, context.queryDeps);

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
