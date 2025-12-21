/**
 * Query Service Pipeline
 *
 * Provides the pipeline-based query execution for memory queries.
 * Decomposes the monolithic executeMemoryQuery into discrete stages.
 */

export * from './pipeline.js';
export * from './stages/index.js';

import type { MemoryQueryParams } from '../../core/types.js';
import type { MemoryQueryResult, PipelineContext, PipelineStage } from './pipeline.js';
import { createPipelineContext, executePipeline, buildQueryResult } from './pipeline.js';
import { resolveStage } from './stages/resolve.js';
import { ftsStage } from './stages/fts.js';
import { relationsStage } from './stages/relations.js';
import { fetchStage } from './stages/fetch.js';
import { tagsStage } from './stages/tags.js';
import { filterStage } from './stages/filter.js';
import { scoreStage } from './stages/score.js';
import { formatStage } from './stages/format.js';

/**
 * Default query pipeline stages
 */
export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  resolveStage,
  ftsStage,
  relationsStage,
  fetchStage,
  tagsStage,
  // filterStage and scoreStage have special typing, handled below
];

/**
 * Execute a memory query using the pipeline
 */
export async function executeQueryPipeline(
  params: MemoryQueryParams
): Promise<MemoryQueryResult> {
  const initialCtx = createPipelineContext(params);

  // Run initial stages
  let ctx: PipelineContext = initialCtx;
  ctx = await executePipeline(ctx, [
    resolveStage,
    ftsStage,
    relationsStage,
    fetchStage,
    tagsStage,
  ]);

  // Run filter stage (adds filtered property)
  const filteredCtx = filterStage(ctx);

  // Run score stage (uses filtered property)
  const scoredCtx = scoreStage(filteredCtx);

  // Run format stage
  const formattedCtx = formatStage(scoredCtx);

  return buildQueryResult(formattedCtx);
}

/**
 * Synchronous query pipeline execution
 */
export function executeQueryPipelineSync(
  params: MemoryQueryParams
): MemoryQueryResult {
  const initialCtx = createPipelineContext(params);

  // Run initial stages (all sync)
  let ctx: PipelineContext = initialCtx;
  ctx = resolveStage(ctx);
  ctx = ftsStage(ctx);
  ctx = relationsStage(ctx);
  ctx = fetchStage(ctx);
  ctx = tagsStage(ctx);

  // Run filter stage (adds filtered property)
  const filteredCtx = filterStage(ctx);

  // Run score stage (uses filtered property)
  const scoredCtx = scoreStage(filteredCtx);

  // Run format stage
  const formattedCtx = formatStage(scoredCtx);

  return buildQueryResult(formattedCtx);
}
