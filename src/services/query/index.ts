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

import type {
  MemoryQueryParams,
  DryRunResult,
  QueryEntryType as CoreQueryEntryType,
} from '../../core/types.js';
import type { MemoryQueryResult, PipelineContext, PipelineDependencies } from './pipeline.js';
import {
  createPipelineContext,
  buildQueryResult,
  initializeTelemetry,
  finalizeTelemetry,
  recordStageTelemetry,
  recordDecision,
} from './pipeline.js';
import { resolveStage } from './stages/resolve.js';
import { rewriteStageAsync } from './stages/rewrite.js';
import { ftsStage } from './stages/fts.js';
import { relationsStage } from './stages/relations.js';
import { fetchStage, fetchStageAsync } from './stages/fetch.js';
import { tagsStage, postFilterTagsStage } from './stages/tags.js';
import { filterStage } from './stages/filter.js';
import { feedbackStage, feedbackStageAsync } from './stages/feedback.js';
import { scoreStage } from './stages/score.js';
import { formatStage } from './stages/format.js';
import { createRerankStage } from './stages/rerank.js';
import {
  createCrossEncoderStage,
  createOpenAICrossEncoderService,
} from './stages/cross-encoder-rerank.js';
import {
  createHierarchicalStage,
  filterByHierarchicalCandidates,
  type HierarchicalPipelineContext,
} from './stages/hierarchical.js';
import { strategyStageAsync } from './stages/strategy.js';
import { semanticStageAsync } from './stages/semantic.js';
import { getEntityExtractor } from './entity-extractor.js';
import { config as appConfig } from '../../config/index.js';
import type { EntityFilterResult, EntityFilterPipelineContext } from './stages/entity-filter.js';

// Import from modular submodules (avoids circular dependency with query.service.ts)
import { resolveScopeChain } from './scope-chain.js';
import { getTagsForEntries, getTagsForEntriesBatch } from './tags-helper.js';
import type { traverseRelationGraph } from './graph-traversal.js';
import { createGraphTraversalFunctions } from './graph-traversal.js';
import { createFtsSearchFunctions } from './fts-search.js';
import type { DbClient } from '../../db/connection.js';
import type Database from 'better-sqlite3';
import type { ScopeType } from '../../db/schema.js';
import type { LRUCache } from '../../utils/lru-cache.js';
import type { Logger } from 'pino';
import type { EntryChangedEvent } from '../../utils/events.js';
import type { IEventAdapter } from '../../core/adapters/interfaces.js';

// =============================================================================
// TYPE GUARDS FOR SAFE TYPE CASTING
// =============================================================================

/**
 * Type guard to validate QueryType array can be safely cast to CoreQueryEntryType array.
 * Both types have the same string literal values, but this validates at runtime.
 */
function isQueryEntryTypeArray(types: unknown): types is CoreQueryEntryType[] {
  if (!Array.isArray(types)) return false;
  const validTypes: CoreQueryEntryType[] = ['tools', 'guidelines', 'knowledge', 'experiences'];
  return types.every((t) => typeof t === 'string' && validTypes.includes(t as CoreQueryEntryType));
}

/**
 * Type guard to check if an object has a valid semanticScore property.
 * semanticScore is added dynamically by the semantic stage and may not be present.
 */
function hasSemanticScore(r: unknown): r is { semanticScore?: number } {
  return (
    typeof r === 'object' &&
    r !== null &&
    ('semanticScore' in r ? typeof (r as Record<string, unknown>).semanticScore === 'number' : true)
  );
}

// =============================================================================
// TASK 43: DRY-RUN EXECUTION
// =============================================================================

/**
 * Execute query in dry-run mode - validate and return plan without executing.
 * Useful for query builders, debugging, and validation.
 *
 * @param params - Query parameters to validate
 * @param deps - Pipeline dependencies
 * @returns DryRunResult with validation status and query plan
 */
export function executeDryRun(params: MemoryQueryParams, deps: PipelineDependencies): DryRunResult {
  const errors: string[] = [];

  // Run resolve stage to normalize parameters
  let ctx: PipelineContext;
  try {
    ctx = createPipelineContext(params, deps);
    ctx = resolveStage(ctx);
  } catch (error) {
    return {
      valid: false,
      errors: [`Resolution failed: ${error instanceof Error ? error.message : String(error)}`],
      plan: {
        types: params.types ?? ['tools', 'guidelines', 'knowledge', 'experiences'],
        scopeChain: [],
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
        search: params.search,
        semanticSearch: params.semanticSearch ?? false,
        useFts5: params.useFts5 ?? false,
      },
      complexity: 'low',
      dryRun: true,
    };
  }

  // Validate parameters
  if (params.limit !== undefined && (params.limit < 1 || params.limit > 1000)) {
    errors.push(`Invalid limit: ${params.limit}. Must be between 1 and 1000.`);
  }

  if (
    params.semanticThreshold !== undefined &&
    (params.semanticThreshold < 0 || params.semanticThreshold > 1)
  ) {
    errors.push(`Invalid semanticThreshold: ${params.semanticThreshold}. Must be between 0 and 1.`);
  }

  if (params.relatedTo?.depth !== undefined && params.relatedTo.depth > 10) {
    errors.push(`Relation depth ${params.relatedTo.depth} exceeds maximum of 10.`);
  }

  // Determine strategy
  let strategy = 'scan';
  if (params.semanticSearch && params.search) {
    strategy = 'semantic';
  } else if (params.search) {
    strategy = params.useFts5 ? 'fts5' : 'like';
  } else if (params.relatedTo) {
    strategy = 'relation';
  } else if (params.tags?.require?.length || params.tags?.include?.length) {
    strategy = 'tag';
  }

  // Estimate complexity
  let complexity: 'low' | 'medium' | 'high' = 'low';
  if (params.semanticSearch) {
    complexity = 'high'; // Requires embeddings
  } else if (params.relatedTo || (params.tags?.require?.length ?? 0) > 2) {
    complexity = 'medium';
  }

  // Build plan - validate types before casting
  if (!isQueryEntryTypeArray(ctx.types)) {
    errors.push(`Invalid query entry types: ${JSON.stringify(ctx.types)}`);
    return {
      valid: false,
      errors,
      plan: {
        types: ['tools', 'guidelines', 'knowledge'] as CoreQueryEntryType[],
        scopeChain: [],
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
        search: params.search,
        semanticSearch: params.semanticSearch ?? false,
        useFts5: params.useFts5 ?? false,
      },
      complexity: 'low',
      dryRun: true,
    };
  }

  const plan = {
    types: ctx.types,
    scopeChain: ctx.scopeChain.map((s) => ({ scopeType: s.scopeType, scopeId: s.scopeId })),
    limit: ctx.limit,
    offset: ctx.offset,
    search: ctx.search,
    strategy,
    semanticSearch: params.semanticSearch ?? false,
    useFts5: params.useFts5 ?? false,
    tagFilters: params.tags
      ? {
          include: params.tags.include,
          require: params.tags.require,
          exclude: params.tags.exclude,
        }
      : undefined,
    relationConfig: params.relatedTo
      ? {
          type: params.relatedTo.type,
          id: params.relatedTo.id,
          depth: params.relatedTo.depth,
        }
      : undefined,
  };

  return {
    valid: errors.length === 0,
    errors,
    plan,
    complexity,
    dryRun: true,
  };
}

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

export function getQueryCacheKey(params: MemoryQueryParams): string | null {
  if (params.relatedTo) {
    return null;
  }

  if (params.explain) {
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
    String(params.offset || 0),
    params.includeVersions ? '1' : '0',
    params.tags?.include?.slice().sort().join(',') ?? '',
    params.tags?.require?.slice().sort().join(',') ?? '',
    params.tags?.exclude?.slice().sort().join(',') ?? '',
    params.priority?.min?.toString() ?? '',
    params.priority?.max?.toString() ?? '',
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
 * Task 17: On delete actions, invalidate ALL caches because relations can cross
 * scopes - an entry in scope A might be related to entries in scope B, and those
 * queries would return stale results if we only invalidate scope A.
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
    // Task 17: On delete, invalidate ALL caches due to cross-scope relations
    if (event.action === 'delete') {
      // Treat as global scope change to invalidate everything
      invalidatePipelineCacheScope(cache, 'global', null, logger);
    } else {
      invalidatePipelineCacheScope(cache, event.scopeType, event.scopeId, logger);
    }
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
  /** Get the raw SQLite database instance (better-sqlite3) */
  getSqlite: () => Database.Database;
  /** Get a prepared statement (cached) */
  getPreparedStatement: (sql: string) => Database.Statement;
  /** The query result cache (owned by Runtime) */
  cache: LRUCache<MemoryQueryResult>;
  /** Whether performance logging is enabled */
  perfLog: boolean;
  /** Logger instance */
  logger: Logger;
  /** Feedback queue interface for RL training (optional) */
  feedback?: PipelineDependencies['feedback'];
  /** Query rewrite service for HyDE and expansion (optional) */
  queryRewriteService?: PipelineDependencies['queryRewriteService'];
  /** Entity index for entity-aware retrieval (optional) */
  entityIndex?: PipelineDependencies['entityIndex'];
  /** Embedding service for neural re-ranking (optional) */
  embeddingService?: PipelineDependencies['embeddingService'];
  /** Hierarchical retriever for coarse-to-fine search (optional) */
  hierarchicalRetriever?: PipelineDependencies['hierarchicalRetriever'];
  /** Vector service for semantic similarity search (optional) */
  vectorService?: PipelineDependencies['vectorService'];
}

/**
 * Optional dependencies that can be updated at runtime (Task 22: Late Binding)
 */
export interface UpdatableDependencies {
  feedback?: PipelineDependencies['feedback'];
  queryRewriteService?: PipelineDependencies['queryRewriteService'];
  entityIndex?: PipelineDependencies['entityIndex'];
  embeddingService?: PipelineDependencies['embeddingService'];
  hierarchicalRetriever?: PipelineDependencies['hierarchicalRetriever'];
  vectorService?: PipelineDependencies['vectorService'];
}

/**
 * Extended dependencies with update capability for runtime configuration changes
 */
export interface MutablePipelineDependencies extends PipelineDependencies {
  /**
   * Update optional dependencies at runtime without recreating the pipeline.
   * Task 22: Enables hot-swapping of services like embedding providers.
   */
  updateDependencies: (updates: Partial<UpdatableDependencies>) => void;
}

/**
 * Create pipeline dependencies from explicit options.
 *
 * This is the only way to create dependencies - all inputs are explicit,
 * no globals are accessed.
 *
 * Task 22: Returns MutablePipelineDependencies with updateDependencies() method
 * for runtime service swapping.
 *
 * @param options - The options containing db accessors, cache, and config
 * @returns MutablePipelineDependencies for use with executeQueryPipeline
 */
export function createDependencies(options: QueryPipelineOptions): MutablePipelineDependencies {
  const { getDb, getSqlite, getPreparedStatement, cache, perfLog, logger } = options;

  // Task 22: Store mutable dependencies in a closure for late binding
  const mutableDeps: UpdatableDependencies = {
    feedback: options.feedback,
    queryRewriteService: options.queryRewriteService,
    entityIndex: options.entityIndex,
    embeddingService: options.embeddingService,
    hierarchicalRetriever: options.hierarchicalRetriever,
    vectorService: options.vectorService,
  };

  // Use factory-created FTS functions when custom getPreparedStatement is provided
  // This enables proper DI for benchmarks and tests
  const ftsFunctions = createFtsSearchFunctions(getPreparedStatement);

  // Use factory-created graph traversal functions for DI
  const graphFunctions = createGraphTraversalFunctions(getPreparedStatement);

  // Task 22: Return object with getters for mutable deps and update function
  return {
    getDb,
    getSqlite,
    getPreparedStatement,
    executeFts5Search: ftsFunctions.executeFts5Search,
    executeFts5SearchWithScores: ftsFunctions.executeFts5SearchWithScores,
    executeFts5Query: ftsFunctions.executeFts5Query,
    // Wrap getTagsForEntries to pass db from deps
    getTagsForEntries: (entryType, entryIds) => getTagsForEntries(entryType, entryIds, getDb()),
    // Task 28: Batched version for better performance (single DB call for all types)
    getTagsForEntriesBatch: (entriesByType) => getTagsForEntriesBatch(entriesByType, getDb()),
    // Wrap traverseRelationGraph with injected db (uses factory-created function)
    traverseRelationGraph: (startType, startId, graphOptions) => {
      return graphFunctions.traverseRelationGraph(
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
      warn: (data, message) => logger.warn(data, message),
    },
    // Task 22: Use getters for mutable deps to enable late binding
    get feedback() {
      return mutableDeps.feedback;
    },
    get queryRewriteService() {
      return mutableDeps.queryRewriteService;
    },
    get entityIndex() {
      return mutableDeps.entityIndex;
    },
    get embeddingService() {
      return mutableDeps.embeddingService;
    },
    get hierarchicalRetriever() {
      return mutableDeps.hierarchicalRetriever;
    },
    get vectorService() {
      return mutableDeps.vectorService;
    },
    // Task 22: Update function for runtime dependency swapping
    updateDependencies(updates: Partial<UpdatableDependencies>) {
      if (updates.feedback !== undefined) mutableDeps.feedback = updates.feedback;
      if (updates.queryRewriteService !== undefined)
        mutableDeps.queryRewriteService = updates.queryRewriteService;
      if (updates.entityIndex !== undefined) mutableDeps.entityIndex = updates.entityIndex;
      if (updates.embeddingService !== undefined)
        mutableDeps.embeddingService = updates.embeddingService;
      if (updates.hierarchicalRetriever !== undefined)
        mutableDeps.hierarchicalRetriever = updates.hierarchicalRetriever;
      if (updates.vectorService !== undefined) mutableDeps.vectorService = updates.vectorService;
      logger.debug({ updated: Object.keys(updates) }, 'Pipeline dependencies updated at runtime');
    },
  };
}

// =============================================================================
// ENTITY FILTER STAGE
// =============================================================================

/**
 * Entity filter stage - extracts entities from search and looks up matching entries.
 *
 * Uses deps.entityIndex if available, otherwise skips.
 * Populates ctx.entityFilter for use by the score stage.
 */
function entityFilterStage(ctx: PipelineContext): PipelineContext {
  const { search, deps } = ctx;

  // Skip if entity index not available or entity scoring disabled
  if (!deps.entityIndex || !appConfig.scoring.entityScoring.enabled || !search) {
    return ctx;
  }

  const extractor = getEntityExtractor();
  const extractedEntities = extractor.extract(search);

  // If no entities extracted, skip filtering
  if (extractedEntities.length === 0) {
    return ctx;
  }

  // Look up matching entry IDs - wrap in try-catch for missing table graceful handling
  let matchCountByEntry: Map<string, number>;
  try {
    matchCountByEntry = deps.entityIndex.lookupMultiple(extractedEntities);
  } catch (error) {
    // Entity index table may not exist yet - gracefully skip entity filtering
    if (deps.logger) {
      deps.logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          extractedEntityCount: extractedEntities.length,
          entityTypes: [...new Set(extractedEntities.map((e) => e.type))],
        },
        'entity_index lookup failed - skipping entity filtering'
      );
    }
    return ctx;
  }

  // Build the matched entry IDs set
  const matchedEntryIds = new Set<string>(matchCountByEntry.keys());

  // Create the entity filter result
  const entityFilter: EntityFilterResult = {
    extractedEntities,
    matchedEntryIds,
    matchCountByEntry,
    entityCount: extractedEntities.length,
    filterApplied: matchedEntryIds.size > 0,
  };

  // Log entity extraction results if perf logging enabled
  if (deps.perfLog && deps.logger && extractedEntities.length > 0) {
    deps.logger.debug(
      {
        entityCount: extractedEntities.length,
        matchedEntries: matchedEntryIds.size,
        entityTypes: [...new Set(extractedEntities.map((e) => e.type))],
      },
      'entity_filter completed'
    );
  }

  return {
    ...ctx,
    entityFilter,
  } as EntityFilterPipelineContext;
}

// =============================================================================
// PIPELINE EXECUTION
// =============================================================================

/**
 * Record retrievals for RL feedback collection (fire-and-forget)
 *
 * Uses the feedback queue (via deps) for backpressure-controlled processing.
 * Silently skips if feedback deps are not provided.
 * Failures are logged but do not affect query execution.
 */
function recordRetrievalsForFeedback(
  params: MemoryQueryParams,
  result: MemoryQueryResult,
  deps: PipelineDependencies
): void {
  // Skip if feedback is not configured via DI
  if (!deps.feedback) return;

  // Skip if no results or no session context
  if (result.results.length === 0) return;

  // Get sessionId from params - may be passed for context tracking
  const sessionId = (params as Record<string, unknown>).sessionId as string | undefined;
  if (!sessionId) return;

  // Skip if queue is not accepting (backpressure)
  if (!deps.feedback.isAccepting()) return;

  // Build the batch of retrieval params
  const batch = result.results.map((r, idx) => ({
    sessionId,
    queryText: params.search,
    entryType: r.type as 'tool' | 'guideline' | 'knowledge' | 'experience',
    entryId: r.id,
    retrievalRank: idx + 1,
    retrievalScore: r.score ?? 0,
    semanticScore: hasSemanticScore(r) ? r.semanticScore : undefined,
  }));

  // Enqueue batch for processing (fire-and-forget)
  deps.feedback.enqueue(batch);
}

/**
 * Async query pipeline execution (core implementation)
 * Note: Previously synchronous, now async due to async sorting optimization in scoreStage.
 *
 * Features:
 * - Query result caching (respects cache from deps)
 * - Performance logging (when deps.perfLog is true)
 * - Dependency injection for testability
 * - Async sorting in scoreStage prevents event loop blocking
 *
 * @param params - Query parameters
 * @param deps - Dependencies (use createDependencies() to create)
 */
export async function executeQueryPipelineSync(
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

  // Run pipeline stages (all stages are synchronous)
  let ctx: PipelineContext = initialCtx;
  ctx = resolveStage(ctx);
  ctx = ftsStage(ctx);
  ctx = relationsStage(ctx);
  ctx = fetchStage(ctx);
  ctx = entityFilterStage(ctx);

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

  // Run score stage (uses filtered property and feedbackScores) - async for non-blocking sort
  const scoredCtx = await scoreStage(feedbackCtx);

  // Run format stage
  const formattedCtx = formatStage(scoredCtx);

  const result = buildQueryResult(formattedCtx);

  // Record retrievals for RL feedback (fire-and-forget, non-blocking)
  recordRetrievalsForFeedback(params, result, deps);

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
): Promise<MemoryQueryResult | DryRunResult> {
  // Task 43: Handle dry-run mode - return plan without executing
  if (params.dryRun) {
    return executeDryRun(params, deps);
  }

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

  let initialCtx = createPipelineContext(params, deps);

  if (params.explain) {
    initialCtx = initializeTelemetry(initialCtx);
  }

  const needsTagFiltering = !!(
    params.tags?.require?.length ||
    params.tags?.exclude?.length ||
    params.tags?.include?.length
  );

  let ctx: PipelineContext = initialCtx;

  const trackStageWithTime = <T extends PipelineContext>(
    stageName: string,
    startMs: number,
    stageResult: T
  ): T => {
    if (!params.explain || !stageResult.telemetry) return stageResult;
    return recordStageTelemetry(stageResult, stageName, startMs) as T;
  };

  let stageStart = Date.now();
  ctx = resolveStage(ctx);
  ctx = trackStageWithTime('resolve', stageStart, ctx);

  stageStart = Date.now();
  ctx = await strategyStageAsync(ctx);
  ctx = trackStageWithTime('strategy', stageStart, ctx);

  stageStart = Date.now();
  ctx = await rewriteStageAsync(ctx);
  ctx = trackStageWithTime('rewrite', stageStart, ctx);

  if (deps.hierarchicalRetriever && appConfig.hierarchical?.enabled) {
    stageStart = Date.now();
    const hierarchicalStage = createHierarchicalStage({
      retriever: deps.hierarchicalRetriever,
      hasSummaries: deps.hierarchicalRetriever.hasSummaries,
      config: appConfig.hierarchical,
    });
    ctx = await hierarchicalStage(ctx);
    ctx = trackStageWithTime('hierarchical', stageStart, ctx);
  }

  stageStart = Date.now();
  ctx = await semanticStageAsync(ctx);
  ctx = trackStageWithTime('semantic', stageStart, ctx);

  stageStart = Date.now();
  ctx = ftsStage(ctx);
  ctx = trackStageWithTime('fts', stageStart, ctx);

  stageStart = Date.now();
  ctx = relationsStage(ctx);
  ctx = trackStageWithTime('relations', stageStart, ctx);

  stageStart = Date.now();
  ctx = await fetchStageAsync(ctx);
  ctx = trackStageWithTime('fetch', stageStart, ctx);

  ctx = filterByHierarchicalCandidates(ctx as HierarchicalPipelineContext);

  stageStart = Date.now();
  ctx = entityFilterStage(ctx);
  ctx = trackStageWithTime('entity_filter', stageStart, ctx);

  let filteredCtx: PipelineContext;
  if (needsTagFiltering) {
    stageStart = Date.now();
    ctx = tagsStage(ctx);
    ctx = trackStageWithTime('tags', stageStart, ctx);
    stageStart = Date.now();
    filteredCtx = filterStage(ctx);
    filteredCtx = trackStageWithTime('filter', stageStart, filteredCtx);
  } else {
    stageStart = Date.now();
    filteredCtx = filterStage(ctx);
    filteredCtx = trackStageWithTime('filter', stageStart, filteredCtx);
    stageStart = Date.now();
    filteredCtx = postFilterTagsStage(filteredCtx);
    filteredCtx = trackStageWithTime('tags', stageStart, filteredCtx);
  }

  stageStart = Date.now();
  let feedbackCtx = await feedbackStageAsync(filteredCtx);
  feedbackCtx = trackStageWithTime('feedback', stageStart, feedbackCtx);

  stageStart = Date.now();
  let scoredCtx = await scoreStage(feedbackCtx);
  scoredCtx = trackStageWithTime('score', stageStart, scoredCtx);

  let rerankedCtx = scoredCtx;
  if (deps.embeddingService && appConfig.rerank?.enabled) {
    stageStart = Date.now();
    const rerankStage = createRerankStage({
      embeddingService: deps.embeddingService,
      config: appConfig.rerank,
    });
    rerankedCtx = await rerankStage(scoredCtx);
    rerankedCtx = trackStageWithTime('rerank', stageStart, rerankedCtx);
  }

  let crossEncoderCtx = rerankedCtx;
  const crossEncoderBaseUrl =
    appConfig.crossEncoder?.baseUrl ?? appConfig.extraction?.openaiBaseUrl;
  if (appConfig.crossEncoder?.enabled && crossEncoderBaseUrl) {
    const crossEncoderModel = appConfig.crossEncoder.model ?? appConfig.extraction?.openaiModel;

    if (deps.logger) {
      deps.logger.debug(
        {
          topK: appConfig.crossEncoder.topK,
          alpha: appConfig.crossEncoder.alpha,
          model: crossEncoderModel,
        },
        'cross-encoder stage starting'
      );
    }

    const crossEncoderService = createOpenAICrossEncoderService({
      baseUrl: crossEncoderBaseUrl,
      model: crossEncoderModel,
      apiKey: appConfig.extraction?.openaiApiKey,
      temperature: appConfig.crossEncoder.temperature,
      timeoutMs: appConfig.crossEncoder.timeoutMs,
      reasoningEffort: appConfig.extraction?.openaiReasoningEffort,
    });

    if (crossEncoderService.isAvailable()) {
      stageStart = Date.now();
      const crossEncoderStage = createCrossEncoderStage({
        llmService: crossEncoderService,
        config: appConfig.crossEncoder,
      });
      crossEncoderCtx = await crossEncoderStage(rerankedCtx);
      crossEncoderCtx = trackStageWithTime('cross_encoder', stageStart, crossEncoderCtx);

      const ceCtx = crossEncoderCtx as {
        crossEncoder?: { applied: boolean; candidatesScored: number };
      };
      if (ceCtx.crossEncoder?.applied && deps.logger) {
        deps.logger.debug(
          { candidatesScored: ceCtx.crossEncoder.candidatesScored },
          'cross-encoder stage completed'
        );
      }
    }
  }

  stageStart = Date.now();
  let formattedCtx = formatStage(crossEncoderCtx);
  formattedCtx = trackStageWithTime('format', stageStart, formattedCtx);

  if (params.explain && formattedCtx.telemetry) {
    formattedCtx = recordDecision(
      formattedCtx,
      'searchStrategy',
      formattedCtx.searchStrategy ?? 'unknown'
    );
    formattedCtx = recordDecision(
      formattedCtx,
      'usedSemanticSearch',
      !!formattedCtx.semanticScores?.size
    );
    formattedCtx = recordDecision(formattedCtx, 'usedFts5', !!formattedCtx.ftsMatchIds);
    formattedCtx = recordDecision(formattedCtx, 'cacheHit', formattedCtx.cacheHit);
    formattedCtx = finalizeTelemetry(formattedCtx);
  }

  const result = buildQueryResult(formattedCtx);

  // Record retrievals for RL feedback (fire-and-forget, non-blocking)
  recordRetrievalsForFeedback(params, result, deps);

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
  // For dry-run mode, use executeDryRun directly
  if (params.dryRun) {
    throw new Error('Use executeDryRun() for dry-run mode instead of executeQueryPipeline()');
  }
  const result = await executeQueryPipelineAsync(params, deps);
  // Type assertion safe since we've excluded dryRun case above
  return result as MemoryQueryResult;
}
