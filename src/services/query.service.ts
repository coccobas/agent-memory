/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
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
} from '../db/schema.js';
import type { MemoryQueryParams, ResponseMeta } from '../mcp/types.js';
import { getEmbeddingService } from './embedding.service.js';
import { getVectorService } from './vector.service.js';

type QueryEntryType = 'tool' | 'guideline' | 'knowledge';

// =============================================================================
// QUERY RESULT CACHE
// =============================================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

/**
 * Simple in-memory cache for global scope queries
 * Cache is only used for global scope queries (which rarely change)
 * TTL: 5 minutes (300000ms)
 */
class QueryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly ttl = 5 * 60 * 1000; // 5 minutes
  private readonly enabled = process.env.AGENT_MEMORY_CACHE !== '0';

  /**
   * Generate a cache key from query parameters
   */
  private getCacheKey(params: MemoryQueryParams): string | null {
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

  /**
   * Get cached result if available and not expired
   */
  get<T>(params: MemoryQueryParams): T | null {
    if (!this.enabled) return null;

    const key = this.getCacheKey(params);
    if (!key) return null;

    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Store result in cache
   */
  set<T>(params: MemoryQueryParams, value: T): void {
    if (!this.enabled) return;

    const key = this.getCacheKey(params);
    if (!key) return;

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });

    // Limit cache size to 100 entries
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      enabled: this.enabled,
      ttl: this.ttl,
    };
  }
}

const queryCache = new QueryCache();

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
  return queryCache.getStats();
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
  const inherit = input?.inherit ?? true;

  if (!input) {
    // Default to global scope
    return [{ scopeType: 'global', scopeId: null }];
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
    const names = tagList.map((t) => t.name.toLowerCase());
    const nameSet = new Set(names);

    if (exclude.size > 0) {
      let hasExcluded = false;
      for (const ex of exclude) {
        if (nameSet.has(ex)) {
          hasExcluded = true;
          break;
        }
      }
      if (hasExcluded) continue;
    }

    if (require.size > 0) {
      let allRequired = true;
      for (const req of require) {
        if (!nameSet.has(req)) {
          allRequired = false;
          break;
        }
      }
      if (!allRequired) continue;
    }

    if (include.size > 0) {
      let anyIncluded = false;
      for (const inc of include) {
        if (nameSet.has(inc)) {
          anyIncluded = true;
          break;
        }
      }
      if (!anyIncluded) continue;
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

export function executeMemoryQuery(params: MemoryQueryParams): MemoryQueryResult {
  // Check cache first
  const cached = queryCache.get<MemoryQueryResult>(params);
  if (cached) {
    if (PERF_LOG) {
      // eslint-disable-next-line no-console
      console.error(
        `[agent-memory] memory_query CACHE_HIT scope=${params.scope?.type ?? 'none'} results=${cached.results.length}`
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

  const relatedIds = getRelatedEntryIds(params.relatedTo);
  const search = params.search?.trim();

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
        const rows = db
          .select()
          .from(tools)
          .where(
            and(
              eq(tools.scopeType, scope.scopeType),
              scope.scopeId === null ? isNull(tools.scopeId) : eq(tools.scopeId, scope.scopeId),
              eq(tools.isActive, true)
            )
          )
          .all();
        for (const row of rows) {
          entriesByScope.push({ entry: row, scopeIndex: index });
        }
      } else if (type === 'guidelines') {
        const rows = db
          .select()
          .from(guidelines)
          .where(
            and(
              eq(guidelines.scopeType, scope.scopeType),
              scope.scopeId === null
                ? isNull(guidelines.scopeId)
                : eq(guidelines.scopeId, scope.scopeId),
              eq(guidelines.isActive, true)
            )
          )
          .all();
        for (const row of rows) {
          entriesByScope.push({ entry: row, scopeIndex: index });
        }
      } else {
        const rows = db
          .select()
          .from(knowledge)
          .where(
            and(
              eq(knowledge.scopeType, scope.scopeType),
              scope.scopeId === null
                ? isNull(knowledge.scopeId)
                : eq(knowledge.scopeId, scope.scopeId),
              eq(knowledge.isActive, true)
            )
          )
          .all();
        for (const row of rows) {
          entriesByScope.push({ entry: row, scopeIndex: index });
        }
      }
    });

    if (entriesByScope.length === 0) return;

    // Deduplicate by (scopeType, scopeId, name/title)
    const dedupMap = new Map<string, { entry: Tool | Guideline | Knowledge; scopeIndex: number }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    for (const item of entriesByScope) {
      const e = item.entry as any;
      const keyName = type === 'knowledge' ? e.title : e.name;
      const key = `${e.scopeType}:${e.scopeId ?? ''}:${keyName}`;
      const existing = dedupMap.get(key);
      if (!existing || item.scopeIndex < existing.scopeIndex) {
        dedupMap.set(key, item);
      }
    }

    const deduped = Array.from(dedupMap.values());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const entryIds = deduped.map((d) => (d.entry as any).id as string);

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

    // Load current versions and optionally history
    const includeVersions = params.includeVersions ?? false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const versionMap = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historyMap = new Map<string, any[]>();

    if (type === 'tools') {
      const versionRows = db
        .select()
        .from(toolVersions)
        .where(inArray(toolVersions.toolId, entryIds))
        .all();
      for (const v of versionRows) {
        const list = historyMap.get(v.toolId) ?? [];
        list.push(v);
        historyMap.set(v.toolId, list);
      }
      for (const [toolId, list] of historyMap) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        list.sort((a, b) => b.versionNum - a.versionNum);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        versionMap.set(toolId, list[0] as (typeof list)[number]);
      }
    } else if (type === 'guidelines') {
      const versionRows = db
        .select()
        .from(guidelineVersions)
        .where(inArray(guidelineVersions.guidelineId, entryIds))
        .all();
      for (const v of versionRows) {
        const list = historyMap.get(v.guidelineId) ?? [];
        list.push(v);
        historyMap.set(v.guidelineId, list);
      }
      for (const [guidelineId, list] of historyMap) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        list.sort((a, b) => b.versionNum - a.versionNum);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        versionMap.set(guidelineId, list[0] as (typeof list)[number]);
      }
    } else {
      const versionRows = db
        .select()
        .from(knowledgeVersions)
        .where(inArray(knowledgeVersions.knowledgeId, entryIds))
        .all();
      for (const v of versionRows) {
        const list = historyMap.get(v.knowledgeId) ?? [];
        list.push(v);
        historyMap.set(v.knowledgeId, list);
      }
      for (const [knowledgeId, list] of historyMap) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        list.sort((a, b) => b.versionNum - a.versionNum);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        versionMap.set(knowledgeId, list[0] as (typeof list)[number]);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument
    for (const { entry, scopeIndex } of deduped) {
      const base = entry as any;
      const id = base.id as string;

      const entryTags = tagsByEntry[id] ?? [];

      if (allowedByTags && !allowedByTags.has(id)) continue;
      if (allowedByRelation && !allowedByRelation.has(id)) continue;

      // Text search
      let textMatched = false;
      if (search) {
        if (type === 'tools') {
          const v = versionMap.get(id);
          textMatched = textMatches(base.name, search) || textMatches(v?.description, search);
        } else if (type === 'guidelines') {
          const v = versionMap.get(id);
          textMatched =
            textMatches(base.name, search) ||
            textMatches(v?.content, search) ||
            textMatches(v?.rationale, search);
        } else {
          const v = versionMap.get(id);
          textMatched =
            textMatches(base.title, search) ||
            textMatches(v?.content, search) ||
            textMatches(v?.source, search);
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

      const currentVersion = versionMap.get(id);

      const score = computeScore({
        hasExplicitRelation,
        matchingTagCount,
        scopeIndex,
        totalScopes: scopeChain.length,
        textMatched: !!textMatched,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        priority: type === 'guidelines' ? (base.priority as number | null) : null,
        createdAt: base.createdAt as string | null | undefined,
      });

      if (type === 'tools') {
        const item: ToolQueryResult = {
          type: 'tool',
          id,
          scopeType: base.scopeType,
          scopeId: base.scopeId ?? null,
          tags: entryTags,
          score,
          tool: base as Tool,
          version: currentVersion,
          versions: includeVersions ? (historyMap.get(id) ?? []) : undefined,
        };
        results.push(item);
      } else if (type === 'guidelines') {
        const item: GuidelineQueryResult = {
          type: 'guideline',
          id,
          scopeType: base.scopeType,
          scopeId: base.scopeId ?? null,
          tags: entryTags,
          score,
          guideline: base as Guideline,
          version: currentVersion,
          versions: includeVersions ? (historyMap.get(id) ?? []) : undefined,
        };
        results.push(item);
      } else {
        const item: KnowledgeQueryResult = {
          type: 'knowledge',
          id,
          scopeType: base.scopeType,
          scopeId: base.scopeId ?? null,
          tags: entryTags,
          score,
          knowledge: base as Knowledge,
          version: currentVersion,
          versions: includeVersions ? (historyMap.get(id) ?? []) : undefined,
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

  // Compact mode: strip heavy fields
  if (params.compact) {
    for (const item of limited) {
      if (item.type === 'tool') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyItem = item as any;
        delete anyItem.version;
        delete anyItem.versions;
        anyItem.tool = {
          id: item.tool.id,
          name: item.tool.name,
          category: item.tool.category,
        };
      } else if (item.type === 'guideline') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyItem = item as any;
        delete anyItem.version;
        delete anyItem.versions;
        // eslint-disable-next-line @typescript-eslint/await-thenable
        anyItem.guideline = {
          id: item.guideline.id,
          name: item.guideline.name,
          category: item.guideline.category,
          priority: item.guideline.priority,
        };
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyItem = item as any;
        delete anyItem.version;
        delete anyItem.versions;
        anyItem.knowledge = {
          id: item.knowledge.id,
          title: item.knowledge.title,
          category: item.knowledge.category,
        };
      }
    }
  }

  const meta: ResponseMeta = {
    totalCount: results.length,
    returnedCount: limited.length,
    truncated: results.length > limited.length,
    hasMore: results.length > limited.length,
    nextCursor: undefined,
  };

  if (PERF_LOG) {
    const durationMs = Date.now() - startMs;
    // eslint-disable-next-line no-console
    console.error(
      `[agent-memory] memory_query scope=${params.scope?.type ?? 'none'} types=${types.join(
        ','
      )} results=${limited.length}/${results.length} durationMs=${durationMs}`
    );
  }

  const result = {
    results: limited,
    meta,
  };

  // Cache the result (only caches global scope queries)
  queryCache.set(params, result);

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
        console.error(
          `[agent-memory] semantic_search found ${semanticResults.size} similar entries (threshold: ${semanticThreshold})`
        );
      }
    }
  } catch (error) {
    // Log error but don't fail the query - fall back to text search
    // eslint-disable-next-line no-console
    console.error('[query] Semantic search failed, falling back to text search:', error);
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
