/**
 * Resolve Stage
 *
 * Resolves query parameters into normalized values:
 * - types to query
 * - scope chain (using injected resolveScopeChain with DB lookups)
 * - limit
 * - offset (from cursor or direct param)
 * - search term
 */

import type { PipelineContext, QueryType } from '../pipeline.js';
import { PIPELINE_STAGES, markStageCompleted, validateStagePrerequisites } from '../pipeline.js';
import { config } from '../../../config/index.js';
import { PaginationCursor } from '../../../utils/pagination.js';

const DEFAULT_TYPES: readonly QueryType[] = ['tools', 'guidelines', 'knowledge', 'experiences'] as const;

/**
 * Resolve stage - normalizes query parameters
 *
 * Uses the injected resolveScopeChain dependency which performs proper
 * scope inheritance with DB lookups (session→project→org→global).
 */
export function resolveStage(ctx: PipelineContext): PipelineContext {
  // Task 42: Validate prerequisites (resolve has none)
  validateStagePrerequisites(ctx, PIPELINE_STAGES.RESOLVE);

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

  // Resolve offset (Task 7: Pagination cursor support)
  // Priority: cursor > offset param > 0
  let offset = 0;
  if (params.cursor) {
    try {
      const cursorData = PaginationCursor.decode(params.cursor);
      // Bug #261 fix: typeof 'number' doesn't catch NaN - use Number.isFinite instead
      // Convert to number first since cursorData.offset may be unknown type
      const parsedOffset = Number(cursorData.offset);
      offset = Number.isFinite(parsedOffset) ? Math.max(0, Math.floor(parsedOffset)) : 0;
    } catch (cursorError) {
      // Bug #201 fix: Include more context for debugging cursor issues
      // Invalid cursor - fall back to offset param or 0
      if (deps.logger) {
        deps.logger.debug(
          {
            cursor: params.cursor.substring(0, 50),
            cursorLength: params.cursor.length,
            error: cursorError instanceof Error ? cursorError.message : String(cursorError),
          },
          'Invalid pagination cursor, using offset 0'
        );
      }
    }
  } else if (params.offset !== undefined && params.offset > 0) {
    offset = Math.max(0, Math.floor(params.offset));
  }

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

  // Task 42: Mark stage completed
  return markStageCompleted({
    ...ctx,
    types,
    scopeChain,
    limit,
    offset,
    search,
  }, PIPELINE_STAGES.RESOLVE);
}
