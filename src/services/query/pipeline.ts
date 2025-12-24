/**
 * Query Pipeline
 *
 * Decomposes the monolithic executeMemoryQuery into discrete stages.
 * Each stage transforms the pipeline context and passes to the next.
 */

import type { MemoryQueryParams, ResponseMeta } from '../../core/types.js';
import type { ScopeType, Tool, Guideline, Knowledge, Experience, Tag } from '../../db/schema.js';
import type { DbClient } from '../../db/connection.js';
import type Database from 'better-sqlite3';

// Import shared types from types.ts to break circular dependency
import type { QueryEntryType, QueryType, ScopeDescriptor, FilterStageResult } from './types.js';

// Re-export types for backward compatibility
export type {
  QueryEntryType,
  QueryType,
  ScopeDescriptor,
  ParentScopeInfo,
  EntryUnion,
  FilteredEntry,
  FilterStageResult,
} from './types.js';

/**
 * Database type - matches Drizzle's configured instance
 */
export type DbInstance = DbClient;

/**
 * Dependencies that can be injected for testing
 */
export interface PipelineDependencies {
  /**
   * Get the Drizzle database instance
   */
  getDb: () => DbInstance;

  /**
   * Get a prepared statement (cached)
   */
  getPreparedStatement: (sql: string) => Database.Statement;

  /**
   * Execute FTS5 search query
   */
  executeFts5Search: (
    search: string,
    types: QueryType[]
  ) => Record<QueryEntryType, Set<string>>;

  /**
   * Execute FTS5 query for a specific entry type
   */
  executeFts5Query: (
    entryType: QueryEntryType,
    searchQuery: string,
    fields?: string[]
  ) => Set<number>;

  /**
   * Get tags for entries (batched)
   */
  getTagsForEntries: (entryType: QueryEntryType, entryIds: string[]) => Record<string, Tag[]>;

  /**
   * Traverse relation graph
   */
  traverseRelationGraph: (
    startType: QueryEntryType | 'project',
    startId: string,
    options?: {
      depth?: number;
      direction?: 'forward' | 'backward' | 'both';
      relationType?: string;
      maxResults?: number;
    }
  ) => Record<QueryEntryType, Set<string>>;

  /**
   * Resolve scope chain with inheritance (includes DB lookups)
   */
  resolveScopeChain: (scope?: {
    type: ScopeType;
    id?: string;
    inherit?: boolean;
  }) => ScopeDescriptor[];

  /**
   * Cache operations
   */
  cache?: {
    get: (key: string) => MemoryQueryResult | undefined;
    set: (key: string, value: MemoryQueryResult) => void;
    getCacheKey: (params: MemoryQueryParams) => string | null;
  };

  /**
   * Performance logging enabled
   */
  perfLog?: boolean;

  /**
   * Logger instance
   */
  logger?: {
    debug: (data: Record<string, unknown>, message: string) => void;
    info: (data: Record<string, unknown>, message: string) => void;
  };
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

export interface ExperienceQueryResult extends QueryResultItemBase {
  type: 'experience';
  experience: Experience;
  version?: unknown;
  versions?: unknown[];
}

export type QueryResultItem = ToolQueryResult | GuidelineQueryResult | KnowledgeQueryResult | ExperienceQueryResult;

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

  // Injected dependencies
  deps: PipelineDependencies;

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
    experiences: Array<{ entry: Experience; scopeIndex: number }>;
  };

  // Tags by entry ID
  tagsByEntry: Record<string, Tag[]>;

  // Filtered entries (populated by filter stage, consumed by score stage)
  filtered?: FilterStageResult;

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
export function createPipelineContext(
  params: MemoryQueryParams,
  deps: PipelineDependencies
): PipelineContext {
  return {
    params,
    deps,
    types: [],
    scopeChain: [],
    limit: 20,
    search: undefined,
    ftsMatchIds: null,
    relatedIds: { tool: new Set(), guideline: new Set(), knowledge: new Set(), experience: new Set() },
    semanticScores: null,
    fetchedEntries: { tools: [], guidelines: [], knowledge: [], experiences: [] },
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
