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
export { fetchStage } from './fetch.js';
export { tagsStage, filterByTags } from './tags.js';
export { filterStage } from './filter.js';
// FilteredEntry and FilterStageResult are now exported from ../types.ts and ../pipeline.ts
export { scoreStage } from './score.js';
export { formatStage } from './format.js';
