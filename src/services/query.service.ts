/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, getPreparedStatement } from '../db/connection.js';
import {
  tools,
  toolVersions,
  guidelines,
  guidelineVersions,
  knowledge,
  knowledgeVersions,
  tags,
  entryTags,
  entryRelations,
  projects,
  sessions,
  type ScopeType,
  type Tool,
  type Guideline,
  type Knowledge,
  type Tag,
  type ToolVersion,
  type GuidelineVersion,
  type KnowledgeVersion,
} from '../db/schema.js';
import type { MemoryQueryParams, ResponseMeta } from '../mcp/types.js';
import { getEmbeddingService } from './embedding.service.js';
import { getVectorService } from './vector.service.js';
import { createComponentLogger } from '../utils/logger.js';
import { LRUCache } from '../utils/lru-cache.js';

const logger = createComponentLogger('query');

type QueryEntryType = 'tool' | 'guideline' | 'knowledge';

// =============================================================================
// TYPE DEFINITIONS FOR TYPE SAFETY
// =============================================================================

/**
 * Union type for all entry types
 */
type EntryUnion = Tool | Guideline | Knowledge;

/**
 * Union type for all entry version types
 */
// type EntryVersionUnion = ToolVersion | GuidelineVersion | KnowledgeVersion;

/**
 * Type guard to check if entry is a Tool
 */
function isTool(entry: EntryUnion): entry is Tool {
  return 'name' in entry && !('title' in entry);
}

/**
 * Type guard to check if entry is a Guideline
 */
function isGuideline(entry: EntryUnion): entry is Guideline {
  return 'name' in entry && 'priority' in entry && !('title' in entry);
}

/**
 * Type guard to check if entry is Knowledge
 */
function isKnowledge(entry: EntryUnion): entry is Knowledge {
  return 'title' in entry;
}

/**
 * Helper to get entry ID regardless of type
 */
function getEntryId(entry: EntryUnion): string {
  return entry.id;
}

/**
 * Helper to get entry name/title for deduplication key
 */
function getEntryKeyName(entry: EntryUnion, type: 'tools' | 'guidelines' | 'knowledge'): string {
  if (type === 'knowledge' && isKnowledge(entry)) {
    return entry.title;
  }
  if ((type === 'tools' && isTool(entry)) || (type === 'guidelines' && isGuideline(entry))) {
    return entry.name;
  }
  // Fallback (should not happen)
  return entry.id;
}

// =============================================================================
// QUERY RESULT CACHE
// =============================================================================

// =============================================================================
// QUERY RESULT CACHE
// =============================================================================

/**
 * Generate a cache key from query parameters
 */
function getQueryCacheKey(params: MemoryQueryParams): string | null {
  // Only cache global scope queries without relatedTo filter
  if (params.scope?.type !== 'global' && params.scope?.type !== undefined) {
    return null;
  }
  if (params.relatedTo) {
    return null;
  }

  // Create a deterministic key from query parameters
  const key = JSON.stringify({
    types: params.types?.sort() || ['tools', 'guidelines', 'knowledge'].sort(),
    tags: params.tags,
    search: params.search,
    compact: params.compact,
    limit: params.limit || 20,
    includeVersions: params.includeVersions,
  });

  return `global:${key}`;
}

const queryCache = new LRUCache<MemoryQueryResult>({
  maxSize: 200,
  maxMemoryMB: 50,
  ttlMs: 5 * 60 * 1000, // 5 minutes
});

/**
 * Clear the query cache (useful for testing or after bulk updates)
 */
export function clearQueryCache(): void {
  queryCache.clear();
}

/**
 * Get query cache statistics
 */
export function getQueryCacheStats() {
  return queryCache.stats;
}

/**
 * Invalidate cache entries for a specific scope
 */
export function invalidateCacheScope(_scopeType: ScopeType, _scopeId?: string | null): void {
  // Simple invalidation for now as we don't track scopes in cache keys deeply yet
  queryCache.clear();
}

/**
 * Invalidate cache entries that might include a specific entry
 */
export function invalidateCacheEntry(_entryType: QueryEntryType, _entryId: string): void {
  queryCache.clear();
}

/**
 * Set cache strategy (aggressive, conservative, or disabled)
 */
export function setCacheStrategy(strategy: 'aggressive' | 'conservative' | 'disabled'): void {
  if (strategy === 'disabled') {
    queryCache.clear();
  }
}

interface ScopeDescriptor {
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
}

export interface ToolQueryResult extends QueryResultItemBase {
  type: 'tool';
  tool: Tool;
  version?: typeof toolVersions.$inferSelect;
  versions?: (typeof toolVersions.$inferSelect)[];
}

export interface GuidelineQueryResult extends QueryResultItemBase {
  type: 'guideline';
  guideline: Guideline;
  version?: typeof guidelineVersions.$inferSelect;
  versions?: (typeof guidelineVersions.$inferSelect)[];
}

export interface KnowledgeQueryResult extends QueryResultItemBase {
  type: 'knowledge';
  knowledge: Knowledge;
  version?: typeof knowledgeVersions.$inferSelect;
  versions?: (typeof knowledgeVersions.$inferSelect)[];
}

export type QueryResultItem = ToolQueryResult | GuidelineQueryResult | KnowledgeQueryResult;

export interface MemoryQueryResult {
  results: QueryResultItem[];
  meta: ResponseMeta;
}

// =============================================================================
// SCOPE INHERITANCE
// =============================================================================

// Add scope chain cache with shorter TTL (scope structure changes less often)
const scopeChainCache = new LRUCache<ScopeDescriptor[]>({
  maxSize: 100,
  ttlMs: 10 * 60 * 1000, // 10 minutes
});

function getScopeChainCacheKey(input?: { type: ScopeType; id?: string; inherit?: boolean }): string {
  if (!input) return 'global:inherit';
  return `${input.type}:${input.id ?? 'null'}:${input.inherit ?? true}`;
}

export function invalidateScopeChainCache(_scopeType?: ScopeType, _scopeId?: string): void {
  // Broad invalidation for now
  scopeChainCache.clear();
}

/**
 * Resolve scope inheritance chain in precedence order.
 *
 * Example for a session scope:
 *   session(id) -> project(projectId) -> org(orgId) -> global
 */
export function resolveScopeChain(input?: {
  type: ScopeType;
  id?: string;
  inherit?: boolean;
}): ScopeDescriptor[] {
  const cacheKey = getScopeChainCacheKey(input);
  const cached = scopeChainCache.get(cacheKey);
  if (cached) return cached;

  const inherit = input?.inherit ?? true;

  if (!input) {
    // Default to global scope
    const result: ScopeDescriptor[] = [{ scopeType: 'global', scopeId: null }];
    scopeChainCache.set(cacheKey, result);
    return result;
  }

  const db = getDb();
  const chain: ScopeDescriptor[] = [];

  const pushUnique = (scopeType: ScopeType, scopeId: string | null) => {
    if (!inherit && chain.length > 0) return;
    if (!inherit && chain.length === 0) {
      chain.push({ scopeType, scopeId });
      return;
    }

    if (!inherit) return;

    const exists = chain.some((s) => s.scopeType === scopeType && s.scopeId === scopeId);
    if (!exists) {
      chain.push({ scopeType, scopeId });
    }
  };

  // Start from requested scope
  switch (input.type) {
    case 'global': {
      pushUnique('global', null);
      break;
    }
    case 'org': {
      const orgId = input.id ?? null;
      pushUnique('org', orgId);
      if (inherit) {
        pushUnique('global', null);
      }
      break;
    }
    case 'project': {
      const projectId = input.id ?? null;
      pushUnique('project', projectId);

      if (inherit) {
        if (projectId) {
          const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
          if (project?.orgId) {
            pushUnique('org', project.orgId);
          }
        }
        pushUnique('global', null);
      }
      break;
    }
    case 'session': {
      const sessionId = input.id ?? null;
      pushUnique('session', sessionId);

      if (inherit && sessionId) {
        const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
        if (session?.projectId) {
          pushUnique('project', session.projectId);

          const project = db
            .select()
            .from(projects)
            .where(eq(projects.id, session.projectId))
            .get();
          if (project?.orgId) {
            pushUnique('org', project.orgId);
          }
        }
      }

      if (inherit) {
        pushUnique('global', null);
      }
      break;
    }
  }

  if (chain.length === 0) {
    // Fallback
    chain.push({ scopeType: 'global', scopeId: null });
  }

  scopeChainCache.set(cacheKey, chain);
  return chain;
}

// =============================================================================
// TAG & RELATION HELPERS
// =============================================================================

function getTagsForEntries(entryType: QueryEntryType, entryIds: string[]): Record<string, Tag[]> {
  if (entryIds.length === 0) return {};
  const db = getDb();

  const entryTagRows = db
    .select()
    .from(entryTags)
    .where(and(eq(entryTags.entryType, entryType), inArray(entryTags.entryId, entryIds)))
    .all();

  if (entryTagRows.length === 0) return {};

  const tagIds = Array.from(new Set(entryTagRows.map((r) => r.tagId)));
  const tagRows = db.select().from(tags).where(inArray(tags.id, tagIds)).all();
  const tagById = new Map(tagRows.map((t) => [t.id, t]));

  const result: Record<string, Tag[]> = {};
  for (const row of entryTagRows) {
    const tag = tagById.get(row.tagId);
    if (!tag) continue;
    const list = result[row.entryId] ?? [];
    list.push(tag);
    result[row.entryId] = list;
  }

  return result;
}

function filterByTags(
  tagsByEntry: Record<string, Tag[]>,
  tagFilter: MemoryQueryParams['tags']
): Set<string> {
  const include = new Set((tagFilter?.include ?? []).map((t) => t.toLowerCase()));
  const require = new Set((tagFilter?.require ?? []).map((t) => t.toLowerCase()));
  const exclude = new Set((tagFilter?.exclude ?? []).map((t) => t.toLowerCase()));

  const allowed = new Set<string>();

  for (const [entryId, tagList] of Object.entries(tagsByEntry)) {
    const nameSet = new Set(tagList.map((t) => t.name.toLowerCase()));

    // Exclude check: intersection must be empty
    if (exclude.size > 0) {
      const hasExcluded = [...exclude].some((ex) => nameSet.has(ex));
      if (hasExcluded) continue;
    }

    // Require check: require must be subset of nameSet
    if (require.size > 0) {
      const hasAllRequired = [...require].every((req) => nameSet.has(req));
      if (!hasAllRequired) continue;
    }

    // Include check: intersection must be non-empty
    if (include.size > 0) {
      const hasAnyIncluded = [...include].some((inc) => nameSet.has(inc));
      if (!hasAnyIncluded) continue;
    }

    allowed.add(entryId);
  }

  return allowed;
}

function getRelatedEntryIds(
  relatedTo: MemoryQueryParams['relatedTo']
): Record<QueryEntryType, Set<string>> {
  const result: Record<QueryEntryType, Set<string>> = {
    tool: new Set<string>(),
    guideline: new Set<string>(),
    knowledge: new Set<string>(),
  };

  if (!relatedTo) return result;

  const db = getDb();

  const rows = db
    .select()
    .from(entryRelations)
    .where(
      and(
        inArray(entryRelations.sourceType, ['tool', 'guideline', 'knowledge', 'project']),
        inArray(entryRelations.targetType, ['tool', 'guideline', 'knowledge', 'project'])
      )
    )
    .all()
    .filter((rel) => {
      const matchesSource = rel.sourceType === relatedTo.type && rel.sourceId === relatedTo.id;
      const matchesTarget = rel.targetType === relatedTo.type && rel.targetId === relatedTo.id;
      const matchesRelation = !relatedTo.relation || rel.relationType === relatedTo.relation;
      return matchesRelation && (matchesSource || matchesTarget);
    });

  for (const rel of rows) {
    if (
      rel.sourceType === 'tool' ||
      rel.sourceType === 'guideline' ||
      rel.sourceType === 'knowledge'
    ) {
      if (rel.sourceType === 'tool') result.tool.add(rel.sourceId);
      if (rel.sourceType === 'guideline') result.guideline.add(rel.sourceId);
      if (rel.sourceType === 'knowledge') result.knowledge.add(rel.sourceId);
    }
    if (
      rel.targetType === 'tool' ||
      rel.targetType === 'guideline' ||
      rel.targetType === 'knowledge'
    ) {
      if (rel.targetType === 'tool') result.tool.add(rel.targetId);
      if (rel.targetType === 'guideline') result.guideline.add(rel.targetId);
      if (rel.targetType === 'knowledge') result.knowledge.add(rel.targetId);
    }
  }

  return result;
}

// =============================================================================
// FTS5 FULL-TEXT SEARCH
// =============================================================================

/**
 * Execute FTS5 query for a specific entry type
 * Returns a Set of rowids that match the search query
 */
export function executeFts5Query(
  entryType: QueryEntryType,
  searchQuery: string,
  fields?: string[]
): Set<number> {
  const matchingRowids = new Set<number>();
  let ftsQuery = searchQuery; // Declare outside try block for error logging

  try {
    // Escape special FTS5 characters and build query
    // FTS5 uses a simple syntax: "term1 term2" for AND, "term1 OR term2" for OR
    const escapedQuery = searchQuery.replace(/"/g, '""');

    let ftsTable: string;
    let ftsColumns: string[];

    if (entryType === 'tool') {
      ftsTable = 'tools_fts';
      ftsColumns = ['name', 'description'];
    } else if (entryType === 'guideline') {
      ftsTable = 'guidelines_fts';
      ftsColumns = ['name', 'content', 'rationale'];
    } else {
      ftsTable = 'knowledge_fts';
      ftsColumns = ['title', 'content', 'source'];
    }

    // Build FTS5 query - if fields specified, search only those columns
    ftsQuery = escapedQuery;
    if (fields && fields.length > 0) {
      // FTS5 column-specific search: column:term
      const columnMap: Record<string, string> = {
        name: 'name',
        title: 'title',
        description: 'description',
        content: 'content',
        rationale: 'rationale',
        source: 'source',
      };

      const validFields = fields
        .map((f) => columnMap[f.toLowerCase()])
        .filter((f): f is string => !!f && ftsColumns.includes(f));

      if (validFields.length > 0) {
        // Search in specific columns
        const columnQueries = validFields.map((col) => `${col}:${escapedQuery}`);
        ftsQuery = columnQueries.join(' OR ');
      }
    }

    // Query FTS5 table
    // Query FTS5 table
    const query = getPreparedStatement(`
      SELECT rowid FROM ${ftsTable}
      WHERE ${ftsTable} MATCH ?
    `);

    const results = query.all(ftsQuery) as Array<{ rowid: number }>;
    for (const row of results) {
      matchingRowids.add(row.rowid);
    }
  } catch (error) {
    // If FTS5 fails (e.g., table doesn't exist), fall back to regular search
    // eslint-disable-next-line no-console
    if (PERF_LOG) {
      logger.error({ entryType, ftsQuery, error }, 'FTS5 query failed, falling back to LIKE');
    }
  }

  return matchingRowids;
}

// =============================================================================
// ADVANCED FILTERING HELPERS
// =============================================================================

/**
 * Check if a date string is within the specified range
 */
function dateInRange(dateStr: string | null | undefined, after?: string, before?: string): boolean {
  if (!dateStr) return true; // If no date, don't filter out

  try {
    const date = new Date(dateStr).getTime();
    if (Number.isNaN(date)) return true;

    if (after) {
      const afterDate = new Date(after).getTime();
      if (Number.isNaN(afterDate) || date < afterDate) return false;
    }

    if (before) {
      const beforeDate = new Date(before).getTime();
      if (Number.isNaN(beforeDate) || date > beforeDate) return false;
    }

    return true;
  } catch {
    return true; // On error, don't filter out
  }
}

/**
 * Check if priority is within range
 */
function priorityInRange(priority: number | null | undefined, min?: number, max?: number): boolean {
  if (priority === null || priority === undefined) return true; // No priority = don't filter

  if (min !== undefined && priority < min) return false;
  if (max !== undefined && priority > max) return false;

  return true;
}

/**
 * Calculate Levenshtein distance (for fuzzy matching)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    const row0 = matrix[0];
    if (row0) {
      row0[j] = j;
    }
  }

  for (let i = 1; i <= len1; i++) {
    const row = matrix[i];
    if (!row) continue;
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        const prevRow = matrix[i - 1];
        const prevVal = prevRow?.[j - 1];
        if (prevVal !== undefined) {
          row[j] = prevVal;
        }
      } else {
        const prevRow = matrix[i - 1];
        const currentRow = matrix[i];
        const val1 = prevRow?.[j];
        const val2 = currentRow?.[j - 1];
        const val3 = prevRow?.[j - 1];
        if (val1 !== undefined && val2 !== undefined && val3 !== undefined) {
          row[j] = Math.min(
            val1 + 1, // deletion
            val2 + 1, // insertion
            val3 + 1 // substitution
          );
        }
      }
    }
  }

  const finalRow = matrix[len1];
  const finalVal = finalRow?.[len2];
  return finalVal ?? 0;
}

/**
 * Check if text matches with fuzzy matching
 */
function fuzzyTextMatches(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;

  const haystackLower = haystack.toLowerCase();
  const needleLower = needle.toLowerCase();

  // First try exact substring match
  if (haystackLower.includes(needleLower)) return true;

  // Calculate similarity (1 - normalized distance)
  const maxLen = Math.max(haystackLower.length, needleLower.length);
  if (maxLen === 0) return true;

  const distance = levenshteinDistance(haystackLower, needleLower);
  const similarity = 1 - distance / maxLen;

  // Threshold: 0.7 similarity (allow ~30% difference)
  return similarity >= 0.7;
}

/**
 * Check if text matches using regex
 */
function regexTextMatches(haystack: string | null | undefined, pattern: string): boolean {
  if (!haystack) return false;

  try {
    const regex = new RegExp(pattern, 'i'); // Case-insensitive
    return regex.test(haystack);
  } catch {
    // Invalid regex, fall back to simple match
    return haystack.toLowerCase().includes(pattern.toLowerCase());
  }
}

// =============================================================================
// SCORING
// =============================================================================

function textMatches(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function computeScore(params: {
  hasExplicitRelation: boolean;
  matchingTagCount: number;
  scopeIndex: number;
  totalScopes: number;
  textMatched: boolean;
  priority?: number | null;
  createdAt?: string | null;
  semanticSimilarity?: number; // 0-1, from vector search
}): number {
  let score = 0;

  // If semantic similarity is available, use hybrid scoring
  if (params.semanticSimilarity !== undefined) {
    // Hybrid scoring: 70% semantic, 30% other factors
    const semanticScore = params.semanticSimilarity * 10; // Scale to 0-10
    score = semanticScore * 0.7;

    // Other factors contribute 30%
    let otherFactors = 0;

    if (params.hasExplicitRelation) {
      otherFactors += 5;
    }

    if (params.matchingTagCount > 0) {
      otherFactors += 3 * Math.min(params.matchingTagCount, 3);
    }

    const scopeWeight =
      params.totalScopes > 0 ? (params.totalScopes - params.scopeIndex) / params.totalScopes : 1;
    otherFactors += 2 * scopeWeight;

    if (params.textMatched) {
      otherFactors += 1;
    }

    if (params.priority !== null && params.priority !== undefined) {
      otherFactors += (params.priority / 100) * 1.5;
    }

    // Normalize other factors to max 10
    const maxOtherFactors = 5 + 9 + 2 + 1 + 1.5; // Max possible
    otherFactors = (otherFactors / maxOtherFactors) * 10;

    score += otherFactors * 0.3;
  } else {
    // Traditional scoring without semantic similarity
    if (params.hasExplicitRelation) {
      score += 5;
    }

    if (params.matchingTagCount > 0) {
      score += 3 * Math.min(params.matchingTagCount, 3);
    }

    const scopeWeight =
      params.totalScopes > 0 ? (params.totalScopes - params.scopeIndex) / params.totalScopes : 1;
    score += 2 * scopeWeight;

    if (params.textMatched) {
      score += 1;
    }

    if (params.priority !== null && params.priority !== undefined) {
      score += (params.priority / 100) * 1.5;
    }
  }

  // Simple recency boost: more recent createdAt gets a small bump
  if (params.createdAt) {
    try {
      const ts = new Date(params.createdAt).getTime();
      if (!Number.isNaN(ts)) {
        const now = Date.now();
        const ageMs = Math.max(now - ts, 0);
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const recency = Math.max(0, 30 - Math.min(ageDays, 30)) / 30; // 0-1 for up to 30 days
        score += 0.5 * recency;
      }
    } catch {
      // ignore parse errors
    }
  }

  return score;
}

// =============================================================================
// MAIN QUERY
// =============================================================================

const PERF_LOG = process.env.AGENT_MEMORY_PERF === '1';

/**
 * Execute FTS5 full-text search for better performance
 * Returns entry IDs that match the search query
 */
function executeFts5Search(
  search: string,
  types: ('tools' | 'guidelines' | 'knowledge')[]
): Record<QueryEntryType, Set<string>> {
  const result: Record<QueryEntryType, Set<string>> = {
    tool: new Set(),
    guideline: new Set(),
    knowledge: new Set(),
  };

  // Escape special FTS5 characters
  const escapedSearch = search.replace(/["*]/g, '').trim();
  if (!escapedSearch) return result;

  // Search tools
  if (types.includes('tools')) {
    const query = getPreparedStatement(`SELECT tool_id FROM tools_fts WHERE tools_fts MATCH ? ORDER BY rank`);
    const toolRows = query.all(escapedSearch) as Array<{ tool_id: string }>;
    for (const row of toolRows) {
      result.tool.add(row.tool_id);
    }
  }

  // Search guidelines
  if (types.includes('guidelines')) {
    const query = getPreparedStatement(`SELECT guideline_id FROM guidelines_fts WHERE guidelines_fts MATCH ? ORDER BY rank`);
    const guidelineRows = query.all(escapedSearch) as Array<{ guideline_id: string }>;
    for (const row of guidelineRows) {
      result.guideline.add(row.guideline_id);
    }
  }

  // Search knowledge
  if (types.includes('knowledge')) {
    const query = getPreparedStatement(`SELECT knowledge_id FROM knowledge_fts WHERE knowledge_fts MATCH ? ORDER BY rank`);
    const knowledgeRows = query.all(escapedSearch) as Array<{ knowledge_id: string }>;
    for (const row of knowledgeRows) {
      result.knowledge.add(row.knowledge_id);
    }
  }

  return result;
}

export function executeMemoryQuery(params: MemoryQueryParams): MemoryQueryResult {
  // Check cache first
  const cacheKey = getQueryCacheKey(params);
  const cached = cacheKey ? queryCache.get(cacheKey) : undefined;
  if (cached) {
    if (PERF_LOG) {
      // eslint-disable-next-line no-console
      logger.debug(
        {
          scopeType: params.scope?.type ?? 'none',
          resultsCount: cached.results.length,
        },
        'memory_query CACHE_HIT'
      );
    }
    return cached;
  }

  const db = getDb();

  const startMs = PERF_LOG ? Date.now() : 0;

  const types =
    params.types && params.types.length > 0
      ? params.types
      : (['tools', 'guidelines', 'knowledge'] as const);

  const scopeChain = resolveScopeChain(params.scope);
  const limit = params.limit && params.limit > 0 ? params.limit : 20;

  // New: Batched version loading helper
  function loadVersionsBatched(
    toolIds: string[],
    guidelineIds: string[],
    knowledgeIds: string[]
  ): {
    tools: Map<string, { current: ToolVersion; history: ToolVersion[] }>;
    guidelines: Map<string, { current: GuidelineVersion; history: GuidelineVersion[] }>;
    knowledge: Map<string, { current: KnowledgeVersion; history: KnowledgeVersion[] }>;
  } {
    const result = {
      tools: new Map<string, { current: ToolVersion; history: ToolVersion[] }>(),
      guidelines: new Map<string, { current: GuidelineVersion; history: GuidelineVersion[] }>(),
      knowledge: new Map<string, { current: KnowledgeVersion; history: KnowledgeVersion[] }>(),
    };

    if (toolIds.length > 0) {
      const versions = db
        .select()
        .from(toolVersions)
        .where(inArray(toolVersions.toolId, toolIds))
        .all();

      const map = new Map<string, ToolVersion[]>();
      for (const v of versions) {
        const list = map.get(v.toolId) ?? [];
        list.push(v);
        map.set(v.toolId, list);
      }

      for (const [id, list] of map) {
        list.sort((a, b) => b.versionNum - a.versionNum);
        if (list[0]) {
          result.tools.set(id, { current: list[0], history: list });
        }
      }
    }

    if (guidelineIds.length > 0) {
      const versions = db
        .select()
        .from(guidelineVersions)
        .where(inArray(guidelineVersions.guidelineId, guidelineIds))
        .all();

      const map = new Map<string, GuidelineVersion[]>();
      for (const v of versions) {
        const list = map.get(v.guidelineId) ?? [];
        list.push(v);
        map.set(v.guidelineId, list);
      }

      for (const [id, list] of map) {
        list.sort((a, b) => b.versionNum - a.versionNum);
        if (list[0]) {
          result.guidelines.set(id, { current: list[0], history: list });
        }
      }
    }

    if (knowledgeIds.length > 0) {
      const versions = db
        .select()
        .from(knowledgeVersions)
        .where(inArray(knowledgeVersions.knowledgeId, knowledgeIds))
        .all();

      const map = new Map<string, KnowledgeVersion[]>();
      for (const v of versions) {
        const list = map.get(v.knowledgeId) ?? [];
        list.push(v);
        map.set(v.knowledgeId, list);
      }

      for (const [id, list] of map) {
        list.sort((a, b) => b.versionNum - a.versionNum);
        if (list[0]) {
          result.knowledge.set(id, { current: list[0], history: list });
        }
      }
    }

    return result;
  }

  const relatedIds = getRelatedEntryIds(params.relatedTo);
  const search = params.search?.trim();

  // Use FTS5 if enabled and search query provided
  const useFts5 = params.useFts5 === true && search;
  const fts5Results = useFts5 ? executeFts5Search(search, [...types]) : null;

  const results: QueryResultItem[] = [];

  // Helper to process one type at a time
  const processType = (type: 'tools' | 'guidelines' | 'knowledge') => {
    const entryType: QueryEntryType =
      type === 'tools' ? 'tool' : type === 'guidelines' ? 'guideline' : 'knowledge';

    const entriesByScope: { entry: Tool | Guideline | Knowledge; scopeIndex: number }[] = [];

    scopeChain.forEach((scope, index) => {
      if (results.length + entriesByScope.length >= limit * 2) {
        // Soft cap to avoid pulling too many rows
        return;
      }

      if (type === 'tools') {
        const conditions = [
          eq(tools.scopeType, scope.scopeType),
          scope.scopeId === null ? isNull(tools.scopeId) : eq(tools.scopeId, scope.scopeId),
          eq(tools.isActive, true),
        ];

        // Add date filters
        if (params.createdAfter) {
          conditions.push(sql`${tools.createdAt} >= ${params.createdAfter}`);
        }
        if (params.createdBefore) {
          conditions.push(sql`${tools.createdAt} <= ${params.createdBefore}`);
        }

        const rows = db
          .select()
          .from(tools)
          .where(and(...conditions))
          .all();
        for (const row of rows) {
          entriesByScope.push({ entry: row, scopeIndex: index });
        }
      } else if (type === 'guidelines') {
        const conditions = [
          eq(guidelines.scopeType, scope.scopeType),
          scope.scopeId === null
            ? isNull(guidelines.scopeId)
            : eq(guidelines.scopeId, scope.scopeId),
          eq(guidelines.isActive, true),
        ];

        // Add date filters
        if (params.createdAfter) {
          conditions.push(sql`${guidelines.createdAt} >= ${params.createdAfter}`);
        }
        if (params.createdBefore) {
          conditions.push(sql`${guidelines.createdAt} <= ${params.createdBefore}`);
        }

        // Add priority filters
        if (params.priority) {
          if (params.priority.min !== undefined) {
            conditions.push(sql`${guidelines.priority} >= ${params.priority.min}`);
          }
          if (params.priority.max !== undefined) {
            conditions.push(sql`${guidelines.priority} <= ${params.priority.max}`);
          }
        }

        const rows = db
          .select()
          .from(guidelines)
          .where(and(...conditions))
          .all();
        for (const row of rows) {
          entriesByScope.push({ entry: row, scopeIndex: index });
        }
      } else {
        const conditions = [
          eq(knowledge.scopeType, scope.scopeType),
          scope.scopeId === null ? isNull(knowledge.scopeId) : eq(knowledge.scopeId, scope.scopeId),
          eq(knowledge.isActive, true),
        ];

        // Add date filters
        if (params.createdAfter) {
          conditions.push(sql`${knowledge.createdAt} >= ${params.createdAfter}`);
        }
        if (params.createdBefore) {
          conditions.push(sql`${knowledge.createdAt} <= ${params.createdBefore}`);
        }

        const rows = db
          .select()
          .from(knowledge)
          .where(and(...conditions))
          .all();
        for (const row of rows) {
          entriesByScope.push({ entry: row, scopeIndex: index });
        }
      }
    });

    if (entriesByScope.length === 0) return;

    // Deduplicate by (scopeType, scopeId, name/title)
    const dedupMap = new Map<string, { entry: EntryUnion; scopeIndex: number }>();
    for (const item of entriesByScope) {
      const entry = item.entry;
      const keyName = getEntryKeyName(entry, type);
      const key = `${entry.scopeType}:${entry.scopeId ?? ''}:${keyName}`;
      const existing = dedupMap.get(key);
      if (!existing || item.scopeIndex < existing.scopeIndex) {
        dedupMap.set(key, item);
      }
    }

    const deduped = Array.from(dedupMap.values());
    const entryIds = deduped.map((d) => getEntryId(d.entry));

    // Tags
    const tagsByEntry = getTagsForEntries(entryType, entryIds);

    // Tag filtering
    let allowedByTags: Set<string> | null = null;
    if (params.tags) {
      allowedByTags = filterByTags(tagsByEntry, params.tags);
    }

    // Relation filtering
    let allowedByRelation: Set<string> | null = null;
    if (params.relatedTo) {
      const relSet =
        entryType === 'tool'
          ? relatedIds.tool
          : entryType === 'guideline'
            ? relatedIds.guideline
            : relatedIds.knowledge;
      allowedByRelation = relSet;
    }

    // FTS5 filtering (if FTS5 enabled, only include entries that matched FTS5 search)
    let allowedByFts5: Set<string> | null = null;
    if (fts5Results) {
      allowedByFts5 =
        entryType === 'tool'
          ? fts5Results.tool
          : entryType === 'guideline'
            ? fts5Results.guideline
            : fts5Results.knowledge;
    }

    // Load versions efficiently
    // Collect IDs for this batch only
    const batchToolIds = type === 'tools' ? entryIds : [];
    const batchGuidelineIds = type === 'guidelines' ? entryIds : [];
    const batchKnowledgeIds = type === 'knowledge' ? entryIds : [];

    // We call this per type loop, which is efficient enough as we process types sequentially
    // Ideally we'd collect ALL first, but the structure is loop-based.
    // Given we only process each type once, this is fine.
    const batchedVersions = loadVersionsBatched(batchToolIds, batchGuidelineIds, batchKnowledgeIds);

    // Get FTS5 matching rowids if FTS5 is enabled and search query exists
    const useFts5 = params.useFts5 === true && search;
    let fts5MatchingRowids: Set<number> | null = null;
    if (useFts5) {
      fts5MatchingRowids = executeFts5Query(entryType, search, params.fields);
    }

    for (const { entry, scopeIndex } of deduped) {
      const id = getEntryId(entry);

      const entryTags = tagsByEntry[id] ?? [];

      if (allowedByTags && !allowedByTags.has(id)) continue;
      if (allowedByRelation && !allowedByRelation.has(id)) continue;
      if (allowedByFts5 && !allowedByFts5.has(id)) continue;

      // Advanced filtering: Date ranges
      if (
        params.createdAfter ||
        params.createdBefore ||
        params.updatedAfter ||
        params.updatedBefore
      ) {
        const createdAt = entry.createdAt;
        if (!dateInRange(createdAt, params.createdAfter, params.createdBefore)) {
          continue;
        }

        // For updated date, check version timestamps
        const versionData =
          type === 'tools'
            ? batchedVersions.tools.get(id)
            : type === 'guidelines'
              ? batchedVersions.guidelines.get(id)
              : batchedVersions.knowledge.get(id);

        const currentVersion = versionData?.current;

        if (params.updatedAfter || params.updatedBefore) {
          const updatedAt = currentVersion?.createdAt;
          if (!dateInRange(updatedAt, params.updatedAfter, params.updatedBefore)) {
            continue;
          }
        }
      }

      // Advanced filtering: Priority range (for guidelines)
      if (type === 'guidelines' && params.priority && isGuideline(entry)) {
        const priority = entry.priority;
        if (!priorityInRange(priority, params.priority.min, params.priority.max)) {
          continue;
        }
      }

      // Text search - use FTS5 if enabled, otherwise use regular matching
      let textMatched = false;
      if (search) {
        if (useFts5 && fts5MatchingRowids) {
          // Use FTS5 results - check if this entry's rowid is in the matching set
          const rowidQuery = getPreparedStatement(
            `SELECT rowid FROM ${type === 'tools' ? 'tools' : type === 'guidelines' ? 'guidelines' : 'knowledge'} WHERE id = ?`
          );
          const rowidResult = rowidQuery.get(id) as { rowid: number } | undefined;
          if (rowidResult && fts5MatchingRowids.has(rowidResult.rowid)) {
            textMatched = true;
          }
        } else {
          // Regular text matching with optional fuzzy/regex support
          const matchFunc = params.regex
            ? regexTextMatches
            : params.fuzzy
              ? fuzzyTextMatches
              : textMatches;

          if (type === 'tools' && isTool(entry)) {
            const v = batchedVersions.tools.get(id)?.current;
            // Field-specific search if specified
            if (params.fields && params.fields.length > 0) {
              const fields = params.fields.map((f) => f.toLowerCase());
              if (fields.includes('name')) {
                textMatched = textMatched || matchFunc(entry.name, search);
              }
              if (fields.includes('description')) {
                textMatched = textMatched || matchFunc(v?.description ?? null, search);
              }
            } else {
              textMatched =
                matchFunc(entry.name, search) || matchFunc(v?.description ?? null, search);
            }
          } else if (type === 'guidelines' && isGuideline(entry)) {
            const v = batchedVersions.guidelines.get(id)?.current;
            if (params.fields && params.fields.length > 0) {
              const fields = params.fields.map((f) => f.toLowerCase());
              if (fields.includes('name')) {
                textMatched = textMatched || matchFunc(entry.name, search);
              }
              if (fields.includes('content')) {
                textMatched = textMatched || matchFunc(v?.content ?? null, search);
              }
              if (fields.includes('rationale')) {
                textMatched = textMatched || matchFunc(v?.rationale ?? null, search);
              }
            } else {
              textMatched =
                matchFunc(entry.name, search) ||
                matchFunc(v?.content ?? null, search) ||
                matchFunc(v?.rationale ?? null, search);
            }
          } else if (type === 'knowledge' && isKnowledge(entry)) {
            const v = batchedVersions.knowledge.get(id)?.current;
            if (params.fields && params.fields.length > 0) {
              const fields = params.fields.map((f) => f.toLowerCase());
              if (fields.includes('title')) {
                textMatched = textMatched || matchFunc(entry.title, search);
              }
              if (fields.includes('content')) {
                textMatched = textMatched || matchFunc(v?.content ?? null, search);
              }
              if (fields.includes('source')) {
                textMatched = textMatched || matchFunc(v?.source ?? null, search);
              }
            } else {
              textMatched =
                matchFunc(entry.title, search) ||
                matchFunc(v?.content ?? null, search) ||
                matchFunc(v?.source ?? null, search);
            }
          }
        }

        if (!textMatched) {
          // If search is provided, filter out non-matching entries
          continue;
        }
      }

      const matchingTagCount = (() => {
        if (!params.tags || !params.tags.include || params.tags.include.length === 0) {
          return 0;
        }
        const includeNames = new Set(params.tags.include.map((t) => t.toLowerCase()));
        const names = entryTags.map((t) => t.name.toLowerCase());
        let count = 0;
        for (const n of names) {
          if (includeNames.has(n)) count++;
        }
        return count;
      })();

      const hasExplicitRelation =
        !!params.relatedTo &&
        ((entryType === 'tool' && relatedIds.tool.has(id)) ||
          (entryType === 'guideline' && relatedIds.guideline.has(id)) ||
          (entryType === 'knowledge' && relatedIds.knowledge.has(id)));

      const includeVersions = params.includeVersions ?? false;

      const currentVersion =
        type === 'tools' ? batchedVersions.tools.get(id)?.current
          : type === 'guidelines' ? batchedVersions.guidelines.get(id)?.current
            : batchedVersions.knowledge.get(id)?.current;

      const history =
        includeVersions ? (
          type === 'tools' ? batchedVersions.tools.get(id)?.history
            : type === 'guidelines' ? batchedVersions.guidelines.get(id)?.history
              : batchedVersions.knowledge.get(id)?.history
        ) : undefined;

      const score = computeScore({
        hasExplicitRelation,
        matchingTagCount,
        scopeIndex,
        totalScopes: scopeChain.length,
        textMatched: !!textMatched,
        priority: type === 'guidelines' && isGuideline(entry) ? entry.priority : null,
        createdAt: entry.createdAt,
      });

      if (type === 'tools' && isTool(entry)) {
        const item: ToolQueryResult = {
          type: 'tool',
          id,
          scopeType: entry.scopeType,
          scopeId: entry.scopeId ?? null,
          tags: entryTags,
          score,
          tool: entry,
          version: currentVersion as ToolVersion | undefined,
          versions: history as ToolVersion[] | undefined,
        };
        results.push(item);
      } else if (type === 'guidelines' && isGuideline(entry)) {
        const item: GuidelineQueryResult = {
          type: 'guideline',
          id,
          scopeType: entry.scopeType,
          scopeId: entry.scopeId ?? null,
          tags: entryTags,
          score,
          guideline: entry,
          version: currentVersion as GuidelineVersion | undefined,
          versions: history as GuidelineVersion[] | undefined,
        };
        results.push(item);
      } else if (type === 'knowledge' && isKnowledge(entry)) {
        const item: KnowledgeQueryResult = {
          type: 'knowledge',
          id,
          scopeType: entry.scopeType,
          scopeId: entry.scopeId ?? null,
          tags: entryTags,
          score,
          knowledge: entry,
          version: currentVersion as KnowledgeVersion | undefined,
          versions: history as KnowledgeVersion[] | undefined,
        };
        results.push(item);
      }
    }
  };

  if (types.includes('tools')) {
    processType('tools');
  }
  if (types.includes('guidelines')) {
    processType('guidelines');
  }
  if (types.includes('knowledge')) {
    processType('knowledge');
  }

  // Sort by score desc then recency (createdAt desc)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aCreated =
      (a.type === 'tool'
        ? a.tool.createdAt
        : a.type === 'guideline'
          ? a.guideline.createdAt
          : a.knowledge.createdAt) ?? '';
    const bCreated =
      (b.type === 'tool'
        ? b.tool.createdAt
        : b.type === 'guideline'
          ? b.guideline.createdAt
          : b.knowledge.createdAt) ?? '';
    return bCreated.localeCompare(aCreated);
  });

  const limited = results.slice(0, limit);

  // Compact mode: create new objects with only essential fields
  const compacted = params.compact
    ? limited.map((item): QueryResultItem => {
      if (item.type === 'tool') {
        return {
          ...item,
          version: undefined,
          versions: undefined,
          tool: {
            id: item.tool.id,
            name: item.tool.name,
            category: item.tool.category,
          } as Tool,
        };
      } else if (item.type === 'guideline') {
        return {
          ...item,
          version: undefined,
          versions: undefined,
          guideline: {
            id: item.guideline.id,
            name: item.guideline.name,
            category: item.guideline.category,
            priority: item.guideline.priority,
          } as Guideline,
        };
      } else {
        return {
          ...item,
          version: undefined,
          versions: undefined,
          knowledge: {
            id: item.knowledge.id,
            title: item.knowledge.title,
            category: item.knowledge.category,
          } as Knowledge,
        };
      }
    })
    : limited;

  const meta: ResponseMeta = {
    totalCount: results.length,
    returnedCount: compacted.length,
    truncated: results.length > compacted.length,
    hasMore: results.length > limited.length,
    nextCursor: undefined,
  };

  if (PERF_LOG) {
    const durationMs = Date.now() - startMs;
    logger.info(
      {
        scopeType: params.scope?.type ?? 'none',
        types: types.join(','),
        resultsCount: limited.length,
        totalCount: results.length,
        durationMs,
      },
      'memory_query performance'
    );
  }

  const result = {
    results: compacted,
    meta,
  };

  // Cache the result (only caches global scope queries)
  if (cacheKey) queryCache.set(cacheKey, result);

  return result;
}

/**
 * Async version of executeMemoryQuery with semantic search support
 *
 * This function extends the synchronous query with vector similarity search.
 * If semantic search is enabled and embeddings are available, it will:
 * 1. Generate an embedding for the search query
 * 2. Find similar entries using vector search
 * 3. Boost scores of semantically similar entries
 */
export async function executeMemoryQueryAsync(
  params: MemoryQueryParams
): Promise<MemoryQueryResult> {
  const search = params.search?.trim();
  const semanticSearchEnabled = params.semanticSearch !== false; // Default true
  const semanticThreshold = params.semanticThreshold ?? 0.7;

  // If semantic search is disabled or no search query, use sync version
  if (!semanticSearchEnabled || !search) {
    return executeMemoryQuery(params);
  }

  // Try semantic search
  let semanticResults: Map<string, number> | null = null;

  try {
    const embeddingService = getEmbeddingService();
    if (embeddingService.isAvailable()) {
      // Generate embedding for search query
      const embeddingResult = await embeddingService.embed(search);

      // Search vector database
      const vectorService = getVectorService();
      const types =
        params.types && params.types.length > 0
          ? params.types
          : (['tools', 'guidelines', 'knowledge'] as const);

      const entryTypes = types.map((t) => {
        if (t === 'tools') return 'tool';
        if (t === 'guidelines') return 'guideline';
        return 'knowledge';
      });

      const limit = params.limit && params.limit > 0 ? params.limit : 20;
      const similarEntries = await vectorService.searchSimilar(
        embeddingResult.embedding,
        entryTypes,
        limit * 3 // Get more results to account for filtering
      );

      // Filter by threshold and create map of entry -> similarity score
      semanticResults = new Map();
      for (const entry of similarEntries) {
        if (entry.score >= semanticThreshold) {
          const key = `${entry.entryType}:${entry.entryId}`;
          semanticResults.set(key, entry.score);
        }
      }

      if (PERF_LOG) {
        // eslint-disable-next-line no-console
        logger.debug(
          {
            similarEntriesCount: semanticResults.size,
            threshold: semanticThreshold,
          },
          'semantic_search found similar entries'
        );
      }
    }
  } catch (error) {
    // Log error but don't fail the query - fall back to text search
    // eslint-disable-next-line no-console
    logger.error({ error }, 'Semantic search failed, falling back to text search');
  }

  // Get regular query results
  const baseResults = executeMemoryQuery(params);

  // If no semantic results, return base results
  if (!semanticResults || semanticResults.size === 0) {
    return baseResults;
  }

  // Enhance results with semantic similarity scores
  // At this point semanticResults is guaranteed to be non-null
  const semanticResultsMap = semanticResults;
  const enhancedResults = baseResults.results.map((result) => {
    const key = `${result.type}:${result.id}`;
    const semanticSimilarity = semanticResultsMap.get(key);

    if (semanticSimilarity !== undefined) {
      // Recompute score with semantic similarity
      const base =
        result.type === 'tool'
          ? result.tool
          : result.type === 'guideline'
            ? result.guideline
            : result.knowledge;

      const newScore = computeScore({
        hasExplicitRelation: false, // Would need to recalculate
        matchingTagCount: result.tags.length,
        scopeIndex: 0, // Simplified
        totalScopes: 1,
        textMatched: true,
        priority: result.type === 'guideline' ? result.guideline.priority : null,
        createdAt: base.createdAt,
        semanticSimilarity,
      });

      return { ...result, score: newScore };
    }

    return result;
  });

  // Re-sort by new scores
  enhancedResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aCreated =
      (a.type === 'tool'
        ? a.tool.createdAt
        : a.type === 'guideline'
          ? a.guideline.createdAt
          : a.knowledge.createdAt) ?? '';
    const bCreated =
      (b.type === 'tool'
        ? b.tool.createdAt
        : b.type === 'guideline'
          ? b.guideline.createdAt
          : b.knowledge.createdAt) ?? '';
    return bCreated.localeCompare(aCreated);
  });

  return {
    results: enhancedResults.slice(0, params.limit || 20),
    meta: baseResults.meta,
  };
}
