/**
 * Cross-reference query handler
 *
 * Context-aware handlers that receive AppContext for dependency injection.
 */

import { executeQueryPipeline } from '../../services/query/index.js';
import { logAction } from '../../services/audit.service.js';
import { createConversationService } from '../../services/conversation.service.js';
import { createComponentLogger } from '../../utils/logger.js';
import { formatHierarchicalContext } from '../../services/context/hierarchical-formatter.js';
import { enrichResultsWithVersionContent } from '../../services/context/version-enricher.js';

import type { MemoryQueryParams } from '../types.js';

const logger = createComponentLogger('query-handler');
import type { AppContext } from '../../core/context.js';
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
import { getCorrelationId } from '../../utils/correlation.js';

const queryTypeToEntryType = {
  tools: 'tool',
  guidelines: 'guideline',
  knowledge: 'knowledge',
  experiences: 'experience',
} as const;

function isQueryType(value: string): value is keyof typeof queryTypeToEntryType {
  return (
    value === 'tools' || value === 'guidelines' || value === 'knowledge' || value === 'experiences'
  );
}

export const queryHandlers = {
  async query(context: AppContext, params: Record<string, unknown>) {
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

    // Helper to validate temporal validDuring object
    function isValidDuringPeriod(v: unknown): v is { start: string; end: string } {
      if (!isObject(v)) return false;
      const obj = v;
      return isString(obj.start) && isString(obj.end);
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
        'Use tools, guidelines, knowledge, experiences'
      );
    }

    // Get scope - support both object format and separate scopeType/scopeId params
    let scope = getOptionalParam(params, 'scope', isValidScope);

    // If scope object not provided, build from scopeType/scopeId params
    if (!scope) {
      const scopeTypeParam = getOptionalParam(params, 'scopeType', isScopeType);
      const scopeIdParam = getOptionalParam(params, 'scopeId', isString);
      const inheritParam = getOptionalParam(params, 'inherit', isBoolean);

      if (scopeTypeParam) {
        scope = {
          type: scopeTypeParam,
          id: scopeIdParam,
          inherit: inheritParam,
        };
      }
    }

    // Auto-detect project if scope type is project but no id provided
    if (scope?.type === 'project' && !scope.id) {
      const cwd = process.cwd();
      const project = await context.repos.projects.findByPath(cwd);
      if (project) {
        scope = { ...scope, id: project.id };
        logger.debug(
          { cwd, projectId: project.id, projectName: project.name },
          'Auto-detected project from cwd'
        );
      }
    }

    const queryParamsWithoutAgent: MemoryQueryParams = {
      types: requestedTypes,
      scope,
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
      // FTS5 and search mode parameters
      useFts5: getOptionalParam(params, 'useFts5', isBoolean),
      fuzzy: getOptionalParam(params, 'fuzzy', isBoolean),
      regex: getOptionalParam(params, 'regex', isBoolean),
      // Temporal filtering (knowledge entries only)
      atTime: getOptionalParam(params, 'atTime', isString),
      validDuring: getOptionalParam(params, 'validDuring', isValidDuringPeriod),
      // Priority filtering (guidelines only)
      priority: getOptionalParam(params, 'priority', isObject),
    };

    // Permissions: deny by default, allow per requested type/scope
    const scopeType = queryParamsWithoutAgent.scope?.type ?? 'global';
    const scopeId = queryParamsWithoutAgent.scope?.id;

    const typesToCheck =
      requestedTypes ?? (['tools', 'guidelines', 'knowledge', 'experiences'] as const);
    const deniedTypes = typesToCheck.filter(
      (type) =>
        !context.services.permission.check(
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
    const result = await executeQueryPipeline(queryParamsWithoutAgent, context.queryDeps);

    // Auto-link results to conversation if conversationId provided (fire-and-forget)
    if (conversationId && autoLinkContext !== false) {
      const conversationService = createConversationService(context.repos.conversations);
      // Bug #182 fix: Capture correlation ID for async error tracing
      const correlationId = getCorrelationId();
      // Use void + .catch() pattern to properly handle async errors without blocking
      void conversationService
        .autoLinkContextFromQuery(conversationId, messageId, result)
        .catch((error: unknown) => {
          // Log error but don't break the query response (non-critical operation)
          // Bug #182 fix: Include correlation ID for distributed tracing
          logger.debug(
            { error, conversationId, correlationId },
            'Auto-link context failed (non-critical)'
          );
        });
    }

    // Log audit
    logAction(
      {
        agentId,
        action: 'query',
        queryParams: queryParamsWithoutAgent,
        resultCount: result.results.length,
      },
      context.db
    );

    return formatTimestamps({
      results: result.results,
      meta: result.meta,
    });
  },

  /**
   * Convenience wrapper that returns aggregated context for a scope.
   * It queries tools, guidelines, and knowledge with inheritance enabled
   * and groups results by type.
   *
   * When scopeType is 'project' and scopeId is not provided, automatically
   * detects the project by matching process.cwd() against project rootPath values.
   */
  async context(context: AppContext, params: Record<string, unknown>) {
    const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
    let scopeId = getOptionalParam(params, 'scopeId', isString);
    const inherit = getOptionalParam(params, 'inherit', isBoolean) ?? true;
    const compact = getOptionalParam(params, 'compact', isBoolean) ?? false;
    const hierarchical = getOptionalParam(params, 'hierarchical', isBoolean) ?? false;
    const limitPerType = getOptionalParam(params, 'limitPerType', isNumber);
    // agentId optional for read operations
    const agentId = getOptionalParam(params, 'agentId', isString);
    const semanticSearch = getOptionalParam(params, 'semanticSearch', isBoolean);
    const search = getOptionalParam(params, 'search', isString);

    // Auto-detect project from cwd if scopeType is 'project' and scopeId not provided
    if (scopeType === 'project' && !scopeId) {
      const cwd = process.cwd();
      const project = await context.repos.projects.findByPath(cwd);
      if (project) {
        scopeId = project.id;
        logger.debug(
          { cwd, projectId: project.id, projectName: project.name },
          'Auto-detected project from cwd'
        );
      }
    }

    const allowedTypes = (['tools', 'guidelines', 'knowledge', 'experiences'] as const).filter(
      (type) =>
        context.services.permission.check(
          agentId,
          'read',
          queryTypeToEntryType[type],
          null,
          scopeType,
          scopeId ?? null
        )
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
    const result = await executeQueryPipeline(queryParams, context.queryDeps);

    // Collect budget/staleness info from UnifiedContextService if available
    let contextBudget:
      | {
          tokensUsed: number;
          tokenBudget: number;
          stalenessWarnings: Array<{
            entryId: string;
            entryType: string;
            reason: string;
            recommendation: string;
          }>;
        }
      | undefined;

    if (context.services.unifiedContext && scopeId) {
      try {
        const unifiedResult = await context.services.unifiedContext.getContext({
          purpose: { type: 'query', query: search },
          scopeType,
          scopeId,
          format: 'markdown',
        });
        if (unifiedResult.success) {
          contextBudget = {
            tokensUsed: unifiedResult.stats.tokensUsed,
            tokenBudget: unifiedResult.stats.tokenBudget,
            stalenessWarnings: unifiedResult.stalenessWarnings,
          };
        }
      } catch (error) {
        // Non-fatal - budget info is optional enhancement
        logger.debug({ error }, 'UnifiedContextService call failed (non-critical)');
      }
    }

    // Return hierarchical format if requested (~1.5k tokens vs ~15k tokens)
    if (hierarchical) {
      // Enrich results with version content for snippet extraction
      const enrichedResults = enrichResultsWithVersionContent(result.results, context.db);
      // Pass totalCounts from meta for accurate counts (not limited by pagination)
      const hierarchicalResult = formatHierarchicalContext(
        enrichedResults,
        scopeType,
        scopeId ?? null,
        result.meta.totalCounts
      );
      return formatTimestamps({
        ...hierarchicalResult,
        ...(contextBudget && { contextBudget }),
      });
    }

    // Standard full response format
    const tools = result.results.filter((r) => r.type === 'tool');
    const guidelines = result.results.filter((r) => r.type === 'guideline');
    const knowledge = result.results.filter((r) => r.type === 'knowledge');
    const experiences = result.results.filter((r) => r.type === 'experience');

    return formatTimestamps({
      scope: {
        type: scopeType,
        id: scopeId ?? null,
      },
      tools,
      guidelines,
      knowledge,
      experiences,
      meta: result.meta,
      ...(contextBudget && { contextBudget }),
    });
  },
};
