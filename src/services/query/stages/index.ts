/**
 * Query Pipeline Stages
 *
 * Exports all pipeline stages for composing query pipelines.
 *
 * Note: Helper functions like resolveScopeChain, getTagsForEntries, and
 * traverseRelationGraph are now injected via PipelineDependencies rather
 * than being exported from stage modules. This enables testing with mocks.
 */

export { resolveStage } from './resolve.js';
export { rewriteStage, type RewriteStageContext } from './rewrite.js';
export { ftsStage } from './fts.js';
export { relationsStage } from './relations.js';
export { fetchStage, fetchStageAsync } from './fetch.js';
export { tagsStage, postFilterTagsStage, filterByTags } from './tags.js';
export { filterStage } from './filter.js';
// FilteredEntry and FilterStageResult are now exported from ../types.ts and ../pipeline.ts
export { scoreStage } from './score.js';
export { formatStage } from './format.js';
export {
  createEntityFilterStage,
  getEntityMatchBoost,
  hasEntityMatch,
  filterByEntityMatch,
  getEntityFilterStats,
  DEFAULT_ENTITY_FILTER_CONFIG,
  type EntityFilterConfig,
  type EntityFilterResult,
  type EntityFilterPipelineContext,
} from './entity-filter.js';
export {
  feedbackStage,
  feedbackStageAsync,
  prewarmFeedbackCache,
  type FeedbackPipelineContext,
} from './feedback.js';
