/**
 * Query Service Pipeline
 *
 * Provides the pipeline-based query execution for memory queries.
 * Decomposes the monolithic executeMemoryQuery into discrete stages.
 *
 * Includes:
 * - Dependency injection for testability
 * - Query result caching integration
 * - Performance logging
 *
 * DESIGN: No hidden globals
 * - No module-level caches or event subscriptions
 * - All dependencies are passed via `createDependencies()` or `executeQueryPipeline()`
 * - Event subscriptions are wired explicitly via `wireQueryCacheInvalidation()`
 */

export * from './pipeline.js';
export * from './stages/index.js';
export * from './entity-extractor.js';
export * from './entity-index.js';

import type { MemoryQueryParams } from '../../core/types.js';
import type { MemoryQueryResult, PipelineContext, PipelineDependencies } from './pipeline.js';
import { createPipelineContext, buildQueryResult } from './pipeline.js';
import { resolveStage } from './stages/resolve.js';
import { ftsStage } from './stages/fts.js';
import { relationsStage } from './stages/relations.js';
import { fetchStage, fetchStageAsync } from './stages/fetch.js';
import { tagsStage, postFilterTagsStage } from './stages/tags.js';
import { filterStage } from './stages/filter.js';
import { feedbackStage, feedbackStageAsync } from './stages/feedback.js';
import { scoreStage } from './stages/score.js';
import { formatStage } from './stages/format.js';
import { getFeedbackService } from '../feedback/index.js';
import { getFeedbackQueue } from '../feedback/queue.js';

// Import from modular submodules (avoids circular dependency with query.service.ts)
import { resolveScopeChain } from './scope-chain.js';
import { getTagsForEntries } from './tags-helper.js';
import { traverseRelationGraph } from './graph-traversal.js';
import { executeFts5Search, executeFts5Query } from './fts-search.js';
import type { DbClient } from '../../db/connection.js';
import type Database from 'better-sqlite3';
import type { ScopeType } from '../../db/schema.js';
import type { LRUCache } from '../../utils/lru-cache.js';
import type { Logger } from 'pino';
import type { EntryChangedEvent } from '../../utils/events.js';
import type { IEventAdapter } from '../../core/adapters/interfaces.js';

// =============================================================================
// CACHE KEY GENERATION
// =============================================================================

/**
 * FNV-1a hash function for fast cache key generation
 */
function fnv1aHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Generate a cache key from query parameters
 */
export function getQueryCacheKey(params: MemoryQueryParams): string | null {
  // Don't cache queries with relatedTo filter (too specific)
  if (params.relatedTo) {
    return null;
  }

  const scopeType = params.scope?.type ?? 'global';
  const scopeId = params.scope?.id ?? 'null';
  const scopePrefix = `${scopeType}:${scopeId}`;
  const sortedTypes = params.types?.slice().sort().join(',') ?? 'guidelines,knowledge,tools';

  const keyParts = [
    sortedTypes,
    params.search ?? '',
    params.compact ? '1' : '0',
    String(params.limit || 20),
    params.includeVersions ? '1' : '0',
    params.tags?.include?.slice().sort().join(',') ?? '',
    params.tags?.require?.slice().sort().join(',') ?? '',
    params.tags?.exclude?.slice().sort().join(',') ?? '',
  ];

  const paramHash = fnv1aHash(keyParts.join('|'));
  return `pipeline:${scopePrefix}:${paramHash}`;
}

// =============================================================================
// CACHE INVALIDATION
// =============================================================================

/**
 * Invalidate pipeline cache entries for a specific scope (and affected children due to inheritance)
 *
 * @param cache - The query cache to invalidate
 * @param scopeType - The scope type being modified
 * @param scopeId - The scope ID being modified
 * @param logger - Optional logger for debug output
 */
export function invalidatePipelineCacheScope(
  cache: LRUCache<MemoryQueryResult>,
  scopeType: ScopeType,
  scopeId?: string | null,
  logger?: Logger
): void {
  const prefixesToInvalidate = new Set<string>();

  // Pipeline keys look like: pipeline:${scopeType}:${scopeIdOrNull}:${hash}
  const scopePrefix = `pipeline:${scopeType}:${scopeId ?? 'null'}:`;
  prefixesToInvalidate.add(scopePrefix);

  // Due to inheritance, modifying a scope affects queries at that scope and child scopes
  switch (scopeType) {
    case 'global':
      prefixesToInvalidate.add('pipeline:global:');
      prefixesToInvalidate.add('pipeline:org:');
      prefixesToInvalidate.add('pipeline:project:');
      prefixesToInvalidate.add('pipeline:session:');
      break;
    case 'org':
      prefixesToInvalidate.add(`pipeline:org:${scopeId ?? 'null'}:`);
      prefixesToInvalidate.add('pipeline:project:');
      prefixesToInvalidate.add('pipeline:session:');
      break;
    case 'project':
      prefixesToInvalidate.add(`pipeline:project:${scopeId ?? 'null'}:`);
      prefixesToInvalidate.add('pipeline:session:');
      break;
    case 'session':
      prefixesToInvalidate.add(`pipeline:session:${scopeId ?? 'null'}:`);
      break;
  }

  const deletedCount = cache.deleteMatching((key) => {
    for (const prefix of prefixesToInvalidate) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  });

  if (deletedCount > 0 && logger) {
    logger.debug(
      { scopeType, scopeId: scopeId ?? null, prefixCount: prefixesToInvalidate.size, deletedCount },
      'Pipeline cache invalidated'
    );
  }
}

/**
 * Wire up query cache invalidation to the entry change event adapter.
 *
 * This should be called once during application startup (in factory.ts or cli.ts).
 * Returns an unsubscribe function that should be called during shutdown.
 *
 * @param eventAdapter - The event adapter to subscribe to
 * @param cache - The query cache to invalidate on entry changes
 * @param logger - Optional logger for debug output
 * @returns Unsubscribe function
 */
export function wireQueryCacheInvalidation(
  eventAdapter: IEventAdapter<EntryChangedEvent>,
  cache: LRUCache<MemoryQueryResult>,
  logger?: Logger
): () => void {
  const handler = (event: EntryChangedEvent): void => {
    invalidatePipelineCacheScope(cache, event.scopeType, event.scopeId, logger);
  };
  return eventAdapter.subscribe(handler);
}

// =============================================================================
// DEPENDENCIES FACTORY
// =============================================================================

/**
 * Options for creating pipeline dependencies
 */
export interface QueryPipelineOptions {
  /** Get the Drizzle database instance */
  getDb: () => DbClient;
  /** Get a prepared statement (cached) */
  getPreparedStatement: (sql: string) => Database.Statement;
  /** The query result cache (owned by Runtime) */
  cache: LRUCache<MemoryQueryResult>;
  /** Whether performance logging is enabled */
  perfLog: boolean;
  /** Logger instance */
  logger: Logger;
}

/**
 * Create pipeline dependencies from explicit options.
 *
 * This is the only way to create dependencies - all inputs are explicit,
 * no globals are accessed.
 *
 * @param options - The options containing db accessors, cache, and config
 * @returns PipelineDependencies for use with executeQueryPipeline
 */
export function createDependencies(options: QueryPipelineOptions): PipelineDependencies {
  const { getDb, getPreparedStatement, cache, perfLog, logger } = options;

  return {
    getDb,
    getPreparedStatement,
    executeFts5Search,
    executeFts5Query,
    // Wrap getTagsForEntries to pass db from deps
    getTagsForEntries: (entryType, entryIds) => getTagsForEntries(entryType, entryIds, getDb()),
    // Wrap traverseRelationGraph to handle type compatibility
    traverseRelationGraph: (startType, startId, graphOptions) => {
      return traverseRelationGraph(
        startType as 'tool' | 'guideline' | 'knowledge' | 'project',
        startId,
        graphOptions as Parameters<typeof traverseRelationGraph>[2]
      );
    },
    // Wrap resolveScopeChain to pass db from deps
    resolveScopeChain: (input) => resolveScopeChain(input, getDb()),
    cache: {
      get: (key: string) => cache.get(key),
      set: (key: string, value: MemoryQueryResult) => cache.set(key, value),
      getCacheKey: getQueryCacheKey,
    },
    perfLog,
    logger: {
      debug: (data, message) => logger.debug(data, message),
      info: (data, message) => logger.info(data, message),
    },
  };
}

// =============================================================================
// PIPELINE EXECUTION
// =============================================================================

/**
 * Record retrievals for RL feedback collection (fire-and-forget)
 *
 * This uses the feedback queue for backpressure-controlled processing.
 * Falls back to async recording if the queue is not available or full.
 * Failures are logged but do not affect query execution.
 */
function recordRetrievalsForFeedback(
  params: MemoryQueryParams,
  result: MemoryQueryResult
): void {
  // Skip if no results or no session context
  if (result.results.length === 0) return;

  // Get sessionId from params - may be passed for context tracking
  const sessionId = (params as Record<string, unknown>).sessionId as string | undefined;
  if (!sessionId) return;

  // Build the batch of retrieval params
  const batch = result.results.map((r, idx) => ({
    sessionId,
    queryText: params.search,
    entryType: r.type as 'tool' | 'guideline' | 'knowledge' | 'experience',
    entryId: r.id,
    retrievalRank: idx + 1,
    retrievalScore: r.score ?? 0,
    semanticScore: (r as unknown as Record<string, unknown>).semanticScore as number | undefined,
  }));

  // Try to use the feedback queue (preferred - has backpressure)
  const queue = getFeedbackQueue();
  if (queue && queue.isAccepting()) {
    const enqueued = queue.enqueue(batch);
    if (enqueued) {
      return; // Successfully queued
    }
    // Queue rejected (full) - fall through to fallback
  }

  // Fallback: use feedback service directly if queue unavailable or full
  const feedbackService = getFeedbackService();
  if (!feedbackService) return;

  // Fire-and-forget async recording (graceful degradation)
  setImmediate(async () => {
    try {
      await feedbackService.recordRetrievalBatch(batch);
    } catch (error) {
      // Feedback collection should never break queries - log for debugging only
      // Using process.env check to avoid import cycle with logger
      if (process.env.AGENT_MEMORY_LOG_LEVEL === 'debug' || process.env.AGENT_MEMORY_DEBUG === 'true') {
        console.debug('[query] Feedback recording failed (non-fatal):', error instanceof Error ? error.message : error);
      }
    }
  });
}

/**
 * Synchronous query pipeline execution (core implementation)
 *
 * Features:
 * - Query result caching (respects cache from deps)
 * - Performance logging (when deps.perfLog is true)
 * - Dependency injection for testability
 *
 * @param params - Query parameters
 * @param deps - Dependencies (use createDependencies() to create)
 */
export function executeQueryPipelineSync(
  params: MemoryQueryParams,
  deps: PipelineDependencies
): MemoryQueryResult {
  const startMs = deps.perfLog ? Date.now() : 0;

  // Check cache first
  const cacheKey = deps.cache?.getCacheKey(params) ?? null;
  if (cacheKey && deps.cache) {
    const cached = deps.cache.get(cacheKey);
    if (cached) {
      if (deps.perfLog && deps.logger) {
        deps.logger.debug(
          {
            scopeType: params.scope?.type ?? 'none',
            resultsCount: cached.results.length,
          },
          'pipeline_query CACHE_HIT'
        );
      }
      return cached;
    }
  }

  const initialCtx = createPipelineContext(params, deps);

  // Determine if tag filtering is required
  const needsTagFiltering = !!(
    params.tags?.require?.length ||
    params.tags?.exclude?.length ||
    params.tags?.include?.length
  );

  // Run pipeline stages (all stages are synchronous)
  let ctx: PipelineContext = initialCtx;
  ctx = resolveStage(ctx);
  ctx = ftsStage(ctx);
  ctx = relationsStage(ctx);
  ctx = fetchStage(ctx);

  // Conditional stage ordering for tag loading optimization:
  // - If tag filtering is needed: load tags BEFORE filtering (current behavior)
  // - Otherwise: filter first, then load tags only for filtered entries (optimization)
  let filteredCtx: PipelineContext;
  if (needsTagFiltering) {
    // Load all tags, then filter (tags needed for filtering)
    ctx = tagsStage(ctx);
    filteredCtx = filterStage(ctx);
  } else {
    // Filter first, then load tags only for filtered entries (memory optimization)
    filteredCtx = filterStage(ctx);
    filteredCtx = postFilterTagsStage(filteredCtx);
  }

  // Load feedback scores for filtered entries (for feedback-based scoring)
  const feedbackCtx = feedbackStage(filteredCtx);

  // Run score stage (uses filtered property and feedbackScores)
  const scoredCtx = scoreStage(feedbackCtx);

  // Run format stage
  const formattedCtx = formatStage(scoredCtx);

  const result = buildQueryResult(formattedCtx);

  // Record retrievals for RL feedback (fire-and-forget, non-blocking)
  recordRetrievalsForFeedback(params, result);

  // Cache the result
  if (cacheKey && deps.cache) {
    deps.cache.set(cacheKey, result);
  }

  // Performance logging
  if (deps.perfLog && deps.logger) {
    const durationMs = Date.now() - startMs;
    deps.logger.info(
      {
        scopeType: params.scope?.type ?? 'none',
        types: (params.types ?? ['tools', 'guidelines', 'knowledge']).join(','),
        resultsCount: result.results.length,
        totalCount: result.meta.totalCount,
        durationMs,
        cached: false,
      },
      'pipeline_query performance'
    );
  }

  return result;
}

/**
 * Async query pipeline execution (core implementation)
 *
 * Features:
 * - Query result caching (respects cache from deps)
 * - Performance logging (when deps.perfLog is true)
 * - Dependency injection for testability
 * - Parallel database fetches via async stages
 * - Async feedback loading with DB fallback
 *
 * @param params - Query parameters
 * @param deps - Dependencies (use createDependencies() to create)
 */
export async function executeQueryPipelineAsync(
  params: MemoryQueryParams,
  deps: PipelineDependencies
): Promise<MemoryQueryResult> {
  const startMs = deps.perfLog ? Date.now() : 0;

  // Check cache first
  const cacheKey = deps.cache?.getCacheKey(params) ?? null;
  if (cacheKey && deps.cache) {
    const cached = deps.cache.get(cacheKey);
    if (cached) {
      if (deps.perfLog && deps.logger) {
        deps.logger.debug(
          {
            scopeType: params.scope?.type ?? 'none',
            resultsCount: cached.results.length,
          },
          'pipeline_query CACHE_HIT'
        );
      }
      return cached;
    }
  }

  const initialCtx = createPipelineContext(params, deps);

  // Determine if tag filtering is required
  const needsTagFiltering = !!(
    params.tags?.require?.length ||
    params.tags?.exclude?.length ||
    params.tags?.include?.length
  );

  // Run pipeline stages with async support
  let ctx: PipelineContext = initialCtx;

  // Synchronous stages (pure computation or already optimized)
  ctx = resolveStage(ctx);
  ctx = ftsStage(ctx);
  ctx = relationsStage(ctx);

  // Async fetch stage - parallel per-type fetching
  ctx = await fetchStageAsync(ctx);

  // Conditional stage ordering for tag loading optimization:
  // - If tag filtering is needed: load tags BEFORE filtering (current behavior)
  // - Otherwise: filter first, then load tags only for filtered entries (optimization)
  let filteredCtx: PipelineContext;
  if (needsTagFiltering) {
    // Load all tags, then filter (tags needed for filtering)
    ctx = tagsStage(ctx);
    filteredCtx = filterStage(ctx);
  } else {
    // Filter first, then load tags only for filtered entries (memory optimization)
    filteredCtx = filterStage(ctx);
    filteredCtx = postFilterTagsStage(filteredCtx);
  }

  // Async feedback stage - DB fallback for cache misses
  const feedbackCtx = await feedbackStageAsync(filteredCtx);

  // Run score stage (uses filtered property and feedbackScores)
  const scoredCtx = scoreStage(feedbackCtx);

  // Run format stage
  const formattedCtx = formatStage(scoredCtx);

  const result = buildQueryResult(formattedCtx);

  // Record retrievals for RL feedback (fire-and-forget, non-blocking)
  recordRetrievalsForFeedback(params, result);

  // Cache the result
  if (cacheKey && deps.cache) {
    deps.cache.set(cacheKey, result);
  }

  // Performance logging
  if (deps.perfLog && deps.logger) {
    const durationMs = Date.now() - startMs;
    deps.logger.info(
      {
        scopeType: params.scope?.type ?? 'none',
        types: (params.types ?? ['tools', 'guidelines', 'knowledge']).join(','),
        resultsCount: result.results.length,
        totalCount: result.meta.totalCount,
        durationMs,
        cached: false,
        async: true, // Mark as async execution for monitoring
      },
      'pipeline_query performance'
    );
  }

  return result;
}

/**
 * Async query pipeline execution (primary entry point)
 *
 * Uses async stages for improved performance via parallel fetching
 * and async feedback loading.
 *
 * @param params - Query parameters
 * @param deps - Dependencies (use createDependencies() to create)
 */
export async function executeQueryPipeline(
  params: MemoryQueryParams,
  deps: PipelineDependencies
): Promise<MemoryQueryResult> {
  return executeQueryPipelineAsync(params, deps);
}
