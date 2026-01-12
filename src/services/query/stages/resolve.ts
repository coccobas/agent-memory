/**
 * Resolve Stage
 *
 * Resolves query parameters into normalized values:
 * - types to query
 * - scope chain (using injected resolveScopeChain with DB lookups)
 * - limit
 * - search term
 */

import type { PipelineContext, QueryType } from '../pipeline.js';
import { config } from '../../../config/index.js';

const DEFAULT_TYPES: readonly QueryType[] = ['tools', 'guidelines', 'knowledge', 'experiences'] as const;

/**
 * Resolve stage - normalizes query parameters
 *
 * Uses the injected resolveScopeChain dependency which performs proper
 * scope inheritance with DB lookups (session→project→org→global).
 */
export function resolveStage(ctx: PipelineContext): PipelineContext {
  const { params, deps } = ctx;

  // Resolve types
  const types =
    params.types && params.types.length > 0
      ? (params.types as readonly QueryType[])
      : DEFAULT_TYPES;

  // Resolve scope chain using injected dependency
  // This uses the cached, DB-aware scope resolution from query.service.ts
  const scopeChain = deps.resolveScopeChain(params.scope);

  // Resolve limit
  const rawLimit = params.limit && params.limit > 0 ? params.limit : config.pagination.defaultLimit;
  const limit = Math.min(Math.floor(rawLimit), config.pagination.maxLimit);

  // Resolve search - normalize empty/whitespace-only to undefined (no search filter)
  // Empty search means "return entries without text filtering" rather than "return nothing"
  const rawSearch = params.search?.trim();
  const search = rawSearch || undefined;

  // Log if search was normalized (helps debug cases where users expect different behavior)
  if (params.search && !search && deps.logger) {
    deps.logger.debug(
      { originalSearch: params.search.substring(0, 20), normalized: 'undefined' },
      'empty/whitespace search normalized to undefined - no text filtering will be applied'
    );
  }

  return {
    ...ctx,
    types,
    scopeChain,
    limit,
    search,
  };
}
