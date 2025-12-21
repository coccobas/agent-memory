/**
 * Resolve Stage
 *
 * Resolves query parameters into normalized values:
 * - types to query
 * - scope chain
 * - limit
 * - search term
 */

import type { PipelineContext, QueryType, ScopeDescriptor } from '../pipeline.js';
import type { ScopeType } from '../../../db/schema.js';
import { config } from '../../../config/index.js';

const DEFAULT_TYPES: readonly QueryType[] = ['tools', 'guidelines', 'knowledge'] as const;

/**
 * Build the scope chain for inheritance
 */
export function resolveScopeChain(
  scope: { type?: ScopeType; id?: string; inherit?: boolean } | undefined
): ScopeDescriptor[] {
  if (!scope || !scope.type) {
    // No scope = global only
    return [{ scopeType: 'global', scopeId: null }];
  }

  const chain: ScopeDescriptor[] = [];
  const inherit = scope.inherit !== false; // Default true

  // Most specific scope first
  chain.push({
    scopeType: scope.type,
    scopeId: scope.id ?? null,
  });

  if (inherit) {
    // Add parent scopes
    if (scope.type === 'session' && scope.id) {
      // Session -> Project -> Org -> Global
      // Note: Would need session lookup for project/org chain
      // For now, just add global
      chain.push({ scopeType: 'global', scopeId: null });
    } else if (scope.type === 'project' && scope.id) {
      // Project -> Org -> Global
      // Note: Would need project lookup for org
      chain.push({ scopeType: 'global', scopeId: null });
    } else if (scope.type === 'org' && scope.id) {
      // Org -> Global
      chain.push({ scopeType: 'global', scopeId: null });
    }
    // Global has no parents
  }

  return chain;
}

/**
 * Resolve stage - normalizes query parameters
 */
export function resolveStage(ctx: PipelineContext): PipelineContext {
  const { params } = ctx;

  // Resolve types
  const types =
    params.types && params.types.length > 0
      ? (params.types as readonly QueryType[])
      : DEFAULT_TYPES;

  // Resolve scope chain
  const scopeChain = resolveScopeChain(params.scope);

  // Resolve limit
  const rawLimit =
    params.limit && params.limit > 0 ? params.limit : config.pagination.defaultLimit;
  const limit = Math.min(Math.floor(rawLimit), config.pagination.maxLimit);

  // Resolve search
  const search = params.search?.trim() || undefined;

  return {
    ...ctx,
    types,
    scopeChain,
    limit,
    search,
  };
}
