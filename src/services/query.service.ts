/**
 * Query Service
 *
 * Re-exports from modular query submodules for backward compatibility.
 * New code should import directly from the submodules in ./query/
 *
 * @module query.service
 */

// =============================================================================
// SCOPE CHAIN EXPORTS
// =============================================================================

export {
  type ScopeDescriptor,
  resolveScopeChain,
  invalidateScopeChainCache,
  clearScopeChainCache,
} from './query/scope-chain.js';

// =============================================================================
// GRAPH TRAVERSAL EXPORTS
// =============================================================================

export { traverseRelationGraph, traverseRelationGraphCTE } from './query/graph-traversal.js';

// =============================================================================
// FTS SEARCH EXPORTS
// =============================================================================

export { executeFts5Query, executeFts5Search } from './query/fts-search.js';

// =============================================================================
// DECAY FUNCTION EXPORTS
// =============================================================================

export {
  type DecayFunction,
  linearDecay,
  exponentialDecay,
  stepDecay,
  calculateAgeDays,
  computeRecencyScore,
} from './query/decay.js';

// =============================================================================
// TAGS HELPER EXPORTS
// =============================================================================

export { getTagsForEntries } from './query/tags-helper.js';

// =============================================================================
// PIPELINE EXPORTS (from query/index.ts)
// =============================================================================

export type {
  MemoryQueryResult,
  QueryResultItem,
  QueryResultItemBase,
  ToolQueryResult,
  GuidelineQueryResult,
  KnowledgeQueryResult,
  PipelineContext,
  PipelineDependencies,
} from './query/pipeline.js';

export { createPipelineContext, buildQueryResult, executePipeline } from './query/pipeline.js';

export {
  executeQueryPipeline,
  executeQueryPipelineSync,
  createDependencies,
  wireQueryCacheInvalidation,
  type QueryPipelineOptions,
} from './query/index.js';
