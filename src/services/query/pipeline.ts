/**
 * Query Pipeline
 *
 * Decomposes the monolithic executeMemoryQuery into discrete stages.
 * Each stage transforms the pipeline context and passes to the next.
 */

import type { MemoryQueryParams, ResponseMeta } from '../../core/types.js';
import type { ScopeType, Tool, Guideline, Knowledge, Tag } from '../../db/schema.js';

// =============================================================================
// PIPELINE TYPES
// =============================================================================

export type QueryEntryType = 'tool' | 'guideline' | 'knowledge';
export type QueryType = 'tools' | 'guidelines' | 'knowledge';

export interface ScopeDescriptor {
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface QueryResultItemBase {
  type: QueryEntryType;
  id: string;
  scopeType: ScopeType;
  scopeId: string | null;
  tags: Tag[];
  score: number;
  recencyScore?: number;
  ageDays?: number;
}

export interface ToolQueryResult extends QueryResultItemBase {
  type: 'tool';
  tool: Tool;
  version?: unknown;
  versions?: unknown[];
}

export interface GuidelineQueryResult extends QueryResultItemBase {
  type: 'guideline';
  guideline: Guideline;
  version?: unknown;
  versions?: unknown[];
}

export interface KnowledgeQueryResult extends QueryResultItemBase {
  type: 'knowledge';
  knowledge: Knowledge;
  version?: unknown;
  versions?: unknown[];
}

export type QueryResultItem = ToolQueryResult | GuidelineQueryResult | KnowledgeQueryResult;

export interface MemoryQueryResult {
  results: QueryResultItem[];
  meta: ResponseMeta;
}

/**
 * Pipeline context passed between stages
 */
export interface PipelineContext {
  // Input parameters
  params: MemoryQueryParams;

  // Resolved values
  types: readonly QueryType[];
  scopeChain: ScopeDescriptor[];
  limit: number;
  search?: string;

  // Filter results (entry IDs that pass filters)
  ftsMatchIds: Record<QueryEntryType, Set<string>> | null;
  relatedIds: Record<QueryEntryType, Set<string>>;
  semanticScores: Map<string, number> | null;

  // Fetched entries (before filtering)
  fetchedEntries: {
    tools: Array<{ entry: Tool; scopeIndex: number }>;
    guidelines: Array<{ entry: Guideline; scopeIndex: number }>;
    knowledge: Array<{ entry: Knowledge; scopeIndex: number }>;
  };

  // Tags by entry ID
  tagsByEntry: Record<string, Tag[]>;

  // Final results
  results: QueryResultItem[];

  // Performance tracking
  startMs: number;
  cacheKey: string | null;
  cacheHit: boolean;
}

/**
 * A pipeline stage that transforms context
 */
export type PipelineStage = (ctx: PipelineContext) => PipelineContext | Promise<PipelineContext>;

/**
 * Create initial pipeline context from params
 */
export function createPipelineContext(params: MemoryQueryParams): PipelineContext {
  return {
    params,
    types: [],
    scopeChain: [],
    limit: 20,
    search: undefined,
    ftsMatchIds: null,
    relatedIds: { tool: new Set(), guideline: new Set(), knowledge: new Set() },
    semanticScores: null,
    fetchedEntries: { tools: [], guidelines: [], knowledge: [] },
    tagsByEntry: {},
    results: [],
    startMs: Date.now(),
    cacheKey: null,
    cacheHit: false,
  };
}

/**
 * Execute a series of pipeline stages
 */
export async function executePipeline(
  ctx: PipelineContext,
  stages: PipelineStage[]
): Promise<PipelineContext> {
  let context = ctx;
  for (const stage of stages) {
    context = await stage(context);
  }
  return context;
}

/**
 * Build final result from context
 */
export function buildQueryResult(ctx: PipelineContext): MemoryQueryResult {
  const meta: ResponseMeta = {
    totalCount: ctx.results.length,
    returnedCount: Math.min(ctx.results.length, ctx.limit),
    truncated: ctx.results.length > ctx.limit,
    hasMore: ctx.results.length > ctx.limit,
    nextCursor: undefined,
  };

  return {
    results: ctx.results.slice(0, ctx.limit),
    meta,
  };
}
