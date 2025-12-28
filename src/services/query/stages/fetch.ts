/**
 * Fetch Stage
 *
 * Fetches entries from the database for each type.
 * Applies scope, date filters, and FTS5 ID filtering at the DB level.
 * Also fetches entries from semantic search results (semanticScores).
 *
 * Uses injected dependencies for DB access to support testing with mocks.
 */

import { tools, guidelines, knowledge, experiences } from '../../../db/schema.js';
import type { Tool, Guideline, Knowledge, Experience } from '../../../db/schema.js';
import { eq, and, or, isNull, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PipelineContext, QueryEntryType, DbInstance } from '../pipeline.js';
import { createValidationError } from '../../../core/errors.js';

// =============================================================================
// ADAPTIVE HEADROOM CALCULATION
// =============================================================================

/**
 * Computes adaptive fetch headroom based on filter signals in the pipeline context.
 *
 * Uses lower multipliers when filters are highly selective (fewer results expected):
 * - 1.2x when FTS matches or related IDs are less than the limit
 * - 1.5x when tag filters (require/exclude) are present
 * - 2.0x as default fallback
 */
function computeAdaptiveHeadroom(ctx: PipelineContext): number {
  const { ftsMatchIds, params, limit } = ctx;

  // If FTS matches exist and total matches are less than limit, use minimal headroom
  if (ftsMatchIds) {
    const totalMatches = Object.values(ftsMatchIds).reduce(
      (sum, idSet) => sum + idSet.size,
      0
    );
    if (totalMatches < limit) {
      return 1.2;
    }
  }

  // If relatedTo is set, check if total related IDs are less than limit
  if (params.relatedTo && ctx.relatedIds) {
    const totalRelatedIds = Object.values(ctx.relatedIds).reduce(
      (sum, idSet) => sum + idSet.size,
      0
    );
    if (totalRelatedIds < limit) {
      return 1.2;
    }
  }

  // If tag filters are present (require or exclude arrays), use moderate headroom
  if (params.tags) {
    const hasRequire = Array.isArray(params.tags.require) && params.tags.require.length > 0;
    const hasExclude = Array.isArray(params.tags.exclude) && params.tags.exclude.length > 0;
    if (hasRequire || hasExclude) {
      return 1.5;
    }
  }

  // Default headroom for general queries
  return 2.0;
}

// =============================================================================
// FETCH CONFIGURATION
// =============================================================================

type EntryUnion = Tool | Guideline | Knowledge | Experience;

interface FetchConfig {
  table: typeof tools | typeof guidelines | typeof knowledge | typeof experiences;
  ftsKey: QueryEntryType;
  applyExtraFilters?: (conditions: SQL[], ctx: PipelineContext) => void;
}

const FETCH_CONFIGS: Record<'tools' | 'guidelines' | 'knowledge' | 'experiences', FetchConfig> = {
  tools: {
    table: tools,
    ftsKey: 'tool',
  },
  guidelines: {
    table: guidelines,
    ftsKey: 'guideline',
    applyExtraFilters: (conditions, ctx) => {
      const { params } = ctx;
      if (params.priority) {
        if (params.priority.min !== undefined) {
          conditions.push(sql`${guidelines.priority} >= ${params.priority.min}`);
        }
        if (params.priority.max !== undefined) {
          conditions.push(sql`${guidelines.priority} <= ${params.priority.max}`);
        }
      }
    },
  },
  knowledge: {
    table: knowledge,
    ftsKey: 'knowledge',
    // Temporal filtering handled specially in fetchKnowledgeWithTemporal
  },
  experiences: {
    table: experiences,
    ftsKey: 'experience',
    applyExtraFilters: (conditions, ctx) => {
      const { params } = ctx;
      // Filter by experience level if specified (via extension params)
      if ((params as { level?: string }).level) {
        conditions.push(sql`${experiences.level} = ${(params as { level: string }).level}`);
      }
    },
  },
};

// =============================================================================
// GENERIC FETCHER
// =============================================================================

/**
 * Generic entry fetcher that works for all entry types.
 * The config object provides type-specific table references and extra filters.
 */
function fetchEntriesGeneric<T extends EntryUnion>(
  db: DbInstance,
  config: FetchConfig,
  ctx: PipelineContext,
  result: Array<{ entry: T; scopeIndex: number }>,
  softCap: number
): void {
  const { scopeChain, params, ftsMatchIds } = ctx;
  const { table, ftsKey, applyExtraFilters } = config;

  // Build scope conditions for all scopes in the chain (batched approach)
  // This replaces N separate queries with a single query using OR
  const scopeConditions: SQL[] = [];
  for (const scope of scopeChain) {
    const scopeCondition =
      scope.scopeId === null
        ? and(eq(table.scopeType, scope.scopeType), isNull(table.scopeId))
        : and(eq(table.scopeType, scope.scopeType), eq(table.scopeId, scope.scopeId));
    if (scopeCondition) {
      scopeConditions.push(scopeCondition);
    }
  }

  // Build common conditions
  const commonConditions: SQL[] = [eq(table.isActive, true)];

  // Date filters
  if (params.createdAfter) {
    commonConditions.push(sql`${table.createdAt} >= ${params.createdAfter}`);
  }
  if (params.createdBefore) {
    commonConditions.push(sql`${table.createdAt} <= ${params.createdBefore}`);
  }

  // Type-specific extra filters (e.g., priority for guidelines)
  applyExtraFilters?.(commonConditions, ctx);

  // FTS5 ID filter
  if (ftsMatchIds && ftsMatchIds[ftsKey].size > 0) {
    commonConditions.push(inArray(table.id, Array.from(ftsMatchIds[ftsKey])));
  }

  // Single batched query with OR for all scopes
  const rows = db
    .select()
    .from(table)
    .where(and(or(...scopeConditions), ...commonConditions))
    .orderBy(sql`${table.createdAt} DESC`)
    .limit(softCap)
    .all();

  // Map each entry to its scope index post-query
  for (const row of rows) {
    const entry = row as T;
    // Find which scope this entry belongs to (first matching scope in chain)
    const scopeIndex = scopeChain.findIndex(
      (scope) =>
        scope.scopeType === entry.scopeType &&
        (scope.scopeId === null ? entry.scopeId === null : scope.scopeId === entry.scopeId)
    );
    result.push({ entry, scopeIndex: scopeIndex >= 0 ? scopeIndex : scopeChain.length });
  }

  // Sort by scope priority (lower index = higher priority), then by createdAt
  result.sort((a, b) => {
    if (a.scopeIndex !== b.scopeIndex) {
      return a.scopeIndex - b.scopeIndex;
    }
    // Secondary sort by createdAt (newer first)
    const aTime = new Date(a.entry.createdAt ?? 0).getTime();
    const bTime = new Date(b.entry.createdAt ?? 0).getTime();
    return bTime - aTime;
  });

  // Trim to soft cap if needed
  if (result.length > softCap) {
    result.length = softCap;
  }
}

// =============================================================================
// INPUT VALIDATION
// =============================================================================

/**
 * Validates and sanitizes ISO 8601 date strings to prevent SQL injection.
 * @param value - The value to validate
 * @param fieldName - The field name for error reporting
 * @returns The validated ISO date string
 * @throws Error if the value is not a valid ISO 8601 date string
 */
function validateIsoDate(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw createValidationError(fieldName, 'must be a string', 'Provide a date as a string value');
  }
  const isoRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
  if (!isoRegex.test(value)) {
    throw createValidationError(fieldName, 'must be a valid ISO 8601 date string', 'Use format like 2024-01-15 or 2024-01-15T10:30:00Z');
  }
  return value;
}

// =============================================================================
// TEMPORAL KNOWLEDGE FETCH
// =============================================================================

/**
 * Fetch knowledge entries with temporal filtering.
 * When atTime or validDuring is specified, joins with knowledge_versions
 * to filter by temporal validity.
 */
function fetchKnowledgeWithTemporal(
  db: DbInstance,
  ctx: PipelineContext,
  result: Array<{ entry: Knowledge; scopeIndex: number }>,
  softCap: number
): void {
  const { scopeChain, params, ftsMatchIds, limit } = ctx;
  const config = FETCH_CONFIGS.knowledge;
  const { ftsKey } = config;

  // Check if temporal filtering is needed
  const hasTemporal = params.atTime || params.validDuring;

  for (let index = 0; index < scopeChain.length; index++) {
    if (result.length >= softCap) break;

    const scope = scopeChain[index]!;
    const perScopeLimit = Math.max(softCap - result.length, limit);

    if (hasTemporal) {
      // Use raw SQL with join for temporal filtering
      // Validate all temporal parameters to prevent SQL injection
      const atTime = params.atTime;
      const validDuring = params.validDuring;

      let temporalConditions = '';
      const queryParams: unknown[] = [
        scope.scopeType,
        scope.scopeId ?? null,
      ];

      if (atTime) {
        // Validate atTime parameter
        const validatedAtTime = validateIsoDate(atTime, 'atTime');

        // Entry is valid at a specific point in time
        // valid_from <= atTime (or null) AND valid_until > atTime (or null)
        temporalConditions = `
          AND (kv.valid_from IS NULL OR kv.valid_from <= ?)
          AND (kv.valid_until IS NULL OR kv.valid_until > ?)
        `;
        queryParams.push(validatedAtTime, validatedAtTime);
      } else if (validDuring) {
        // Validate validDuring parameters
        const validatedStart = validateIsoDate(validDuring.start, 'validDuring.start');
        const validatedEnd = validateIsoDate(validDuring.end, 'validDuring.end');

        // Entry is valid during a period (overlaps with the period)
        // valid_from <= end AND valid_until >= start (accounting for nulls)
        temporalConditions = `
          AND (kv.valid_from IS NULL OR kv.valid_from <= ?)
          AND (kv.valid_until IS NULL OR kv.valid_until >= ?)
        `;
        queryParams.push(validatedEnd, validatedStart);
      }

      // Build date filter conditions with validation
      let dateConditions = '';
      if (params.createdAfter) {
        const validatedCreatedAfter = validateIsoDate(params.createdAfter, 'createdAfter');
        dateConditions += ` AND k.created_at >= ?`;
        queryParams.push(validatedCreatedAfter);
      }
      if (params.createdBefore) {
        const validatedCreatedBefore = validateIsoDate(params.createdBefore, 'createdBefore');
        dateConditions += ` AND k.created_at <= ?`;
        queryParams.push(validatedCreatedBefore);
      }

      // Build FTS filter condition
      let ftsCondition = '';
      if (ftsMatchIds && ftsMatchIds[ftsKey].size > 0) {
        const ids = Array.from(ftsMatchIds[ftsKey]);
        const placeholders = ids.map(() => '?').join(',');
        ftsCondition = ` AND k.id IN (${placeholders})`;
        queryParams.push(...ids);
      }

      queryParams.push(perScopeLimit);

      const sqlQuery = `
        SELECT DISTINCT k.*
        FROM knowledge k
        INNER JOIN knowledge_versions kv ON k.current_version_id = kv.id
        WHERE k.scope_type = ?
          AND (k.scope_id = ? OR (k.scope_id IS NULL AND ? IS NULL))
          AND k.is_active = 1
          ${temporalConditions}
          ${dateConditions}
          ${ftsCondition}
        ORDER BY k.created_at DESC
        LIMIT ?
      `;

      // Adjust query params for the NULL check
      queryParams.splice(2, 0, scope.scopeId ?? null);

      const stmt = ctx.deps.getPreparedStatement(sqlQuery);
      const rows = stmt.all(...queryParams) as Knowledge[];

      for (const row of rows) {
        result.push({ entry: row, scopeIndex: index });
      }
    } else {
      // No temporal filtering, use standard fetch
      fetchEntriesGeneric(db, config, ctx, result, softCap);
      break; // fetchEntriesGeneric handles all scopes
    }
  }
}

// =============================================================================
// SEMANTIC ENTRY FETCH
// =============================================================================

/**
 * Fetches entries by ID from semantic search results that weren't already fetched.
 * This ensures semantically relevant entries are included even if they're outside
 * the normal scope-based fetch criteria.
 */
function fetchSemanticEntries<T extends EntryUnion>(
  db: DbInstance,
  table: typeof tools | typeof guidelines | typeof knowledge | typeof experiences,
  existingIds: Set<string>,
  semanticIds: string[],
  result: Array<{ entry: T; scopeIndex: number }>,
  scopeChainLength: number
): void {
  // Find IDs that are in semantic results but not already fetched
  const missingIds = semanticIds.filter((id) => !existingIds.has(id));

  if (missingIds.length === 0) return;

  // Fetch by ID in batches
  const batchSize = 100;
  for (let i = 0; i < missingIds.length; i += batchSize) {
    const batch = missingIds.slice(i, i + batchSize);
    const rows = db
      .select()
      .from(table)
      .where(and(inArray(table.id, batch), eq(table.isActive, true)))
      .all();

    for (const row of rows) {
      const entry = row as T;
      // Use scope chain length as index to indicate lower priority than scope-based entries
      result.push({ entry, scopeIndex: scopeChainLength });
      existingIds.add(entry.id);
    }
  }
}

/**
 * Extracts semantic entry IDs for a specific type from the semanticScores map.
 * The vectorService stores entries with their entry type prefix.
 */
function getSemanticIdsForType(
  semanticScores: Map<string, number> | undefined,
  _entryType: QueryEntryType
): string[] {
  if (!semanticScores || semanticScores.size === 0) return [];

  // semanticScores contains entry IDs directly (no type prefix)
  // All IDs in the map are potentially relevant
  return Array.from(semanticScores.keys());
}

// =============================================================================
// FETCH STAGE
// =============================================================================

/**
 * Fetch stage - fetches entries from DB
 *
 * Uses ctx.deps.getDb() for database access instead of calling getDb() directly.
 * Applies adaptive headroom calculation and per-type result limiting.
 * Also fetches entries from semantic search results (semanticScores).
 */
export function fetchStage(ctx: PipelineContext): PipelineContext {
  const db = ctx.deps.getDb();
  const { types, limit, semanticScores, scopeChain } = ctx;

  const fetchedEntries: PipelineContext['fetchedEntries'] = {
    tools: [],
    guidelines: [],
    knowledge: [],
    experiences: [],
  };

  // Use adaptive headroom based on filter signals
  const adaptiveHeadroom = computeAdaptiveHeadroom(ctx);
  const softCap = limit * adaptiveHeadroom;

  // Distribute softCap across types to prevent over-fetching
  const perTypeSoftCap = Math.ceil(softCap / types.length);

  for (const type of types) {
    if (type === 'tools') {
      fetchEntriesGeneric(db, FETCH_CONFIGS.tools, ctx, fetchedEntries.tools, perTypeSoftCap);
    } else if (type === 'guidelines') {
      fetchEntriesGeneric(db, FETCH_CONFIGS.guidelines, ctx, fetchedEntries.guidelines, perTypeSoftCap);
    } else if (type === 'knowledge') {
      // Use temporal-aware fetch for knowledge (handles atTime/validDuring)
      fetchKnowledgeWithTemporal(db, ctx, fetchedEntries.knowledge, perTypeSoftCap);
    } else if (type === 'experiences') {
      fetchEntriesGeneric(db, FETCH_CONFIGS.experiences, ctx, fetchedEntries.experiences, perTypeSoftCap);
    }
  }

  // Also fetch entries from semantic search results that weren't already fetched
  if (semanticScores && semanticScores.size > 0) {
    const scopeChainLen = scopeChain.length;

    if (types.includes('tools')) {
      const existingIds = new Set(fetchedEntries.tools.map((e) => e.entry.id));
      const semanticIds = getSemanticIdsForType(semanticScores, 'tool');
      fetchSemanticEntries(db, tools, existingIds, semanticIds, fetchedEntries.tools, scopeChainLen);
    }
    if (types.includes('guidelines')) {
      const existingIds = new Set(fetchedEntries.guidelines.map((e) => e.entry.id));
      const semanticIds = getSemanticIdsForType(semanticScores, 'guideline');
      fetchSemanticEntries(db, guidelines, existingIds, semanticIds, fetchedEntries.guidelines, scopeChainLen);
    }
    if (types.includes('knowledge')) {
      const existingIds = new Set(fetchedEntries.knowledge.map((e) => e.entry.id));
      const semanticIds = getSemanticIdsForType(semanticScores, 'knowledge');
      fetchSemanticEntries(db, knowledge, existingIds, semanticIds, fetchedEntries.knowledge, scopeChainLen);
    }
    if (types.includes('experiences')) {
      const existingIds = new Set(fetchedEntries.experiences.map((e) => e.entry.id));
      const semanticIds = getSemanticIdsForType(semanticScores, 'experience');
      fetchSemanticEntries(db, experiences, existingIds, semanticIds, fetchedEntries.experiences, scopeChainLen);
    }
  }

  return {
    ...ctx,
    fetchedEntries,
  };
}

// =============================================================================
// ASYNC FETCH STAGE
// =============================================================================

/**
 * Async fetch stage - fetches entries from DB with parallel per-type fetching
 *
 * Uses Promise.all to run fetches for different types concurrently.
 * Each type fetch still runs synchronously, but multiple types run in parallel.
 * This enables better utilization of I/O wait time when fetching multiple entry types.
 */
export async function fetchStageAsync(ctx: PipelineContext): Promise<PipelineContext> {
  const db = ctx.deps.getDb();
  const { types, limit, semanticScores, scopeChain } = ctx;

  const fetchedEntries: PipelineContext['fetchedEntries'] = {
    tools: [],
    guidelines: [],
    knowledge: [],
    experiences: [],
  };

  // Use adaptive headroom based on filter signals
  const adaptiveHeadroom = computeAdaptiveHeadroom(ctx);
  const softCap = limit * adaptiveHeadroom;

  // Distribute softCap across types to prevent over-fetching
  const perTypeSoftCap = Math.ceil(softCap / types.length);

  // Create fetch promises for each type (wrap sync in setImmediate for true parallelism)
  const fetchPromises: Promise<void>[] = [];

  for (const type of types) {
    if (type === 'tools') {
      fetchPromises.push(
        new Promise((resolve) => {
          setImmediate(() => {
            fetchEntriesGeneric(db, FETCH_CONFIGS.tools, ctx, fetchedEntries.tools, perTypeSoftCap);
            resolve();
          });
        })
      );
    } else if (type === 'guidelines') {
      fetchPromises.push(
        new Promise((resolve) => {
          setImmediate(() => {
            fetchEntriesGeneric(db, FETCH_CONFIGS.guidelines, ctx, fetchedEntries.guidelines, perTypeSoftCap);
            resolve();
          });
        })
      );
    } else if (type === 'knowledge') {
      fetchPromises.push(
        new Promise((resolve) => {
          setImmediate(() => {
            // Use temporal-aware fetch for knowledge (handles atTime/validDuring)
            fetchKnowledgeWithTemporal(db, ctx, fetchedEntries.knowledge, perTypeSoftCap);
            resolve();
          });
        })
      );
    } else if (type === 'experiences') {
      fetchPromises.push(
        new Promise((resolve) => {
          setImmediate(() => {
            fetchEntriesGeneric(db, FETCH_CONFIGS.experiences, ctx, fetchedEntries.experiences, perTypeSoftCap);
            resolve();
          });
        })
      );
    }
  }

  // Execute all fetches in parallel
  await Promise.all(fetchPromises);

  // Also fetch entries from semantic search results that weren't already fetched
  if (semanticScores && semanticScores.size > 0) {
    const scopeChainLen = scopeChain.length;

    if (types.includes('tools')) {
      const existingIds = new Set(fetchedEntries.tools.map((e) => e.entry.id));
      const semanticIds = getSemanticIdsForType(semanticScores, 'tool');
      fetchSemanticEntries(db, tools, existingIds, semanticIds, fetchedEntries.tools, scopeChainLen);
    }
    if (types.includes('guidelines')) {
      const existingIds = new Set(fetchedEntries.guidelines.map((e) => e.entry.id));
      const semanticIds = getSemanticIdsForType(semanticScores, 'guideline');
      fetchSemanticEntries(db, guidelines, existingIds, semanticIds, fetchedEntries.guidelines, scopeChainLen);
    }
    if (types.includes('knowledge')) {
      const existingIds = new Set(fetchedEntries.knowledge.map((e) => e.entry.id));
      const semanticIds = getSemanticIdsForType(semanticScores, 'knowledge');
      fetchSemanticEntries(db, knowledge, existingIds, semanticIds, fetchedEntries.knowledge, scopeChainLen);
    }
    if (types.includes('experiences')) {
      const existingIds = new Set(fetchedEntries.experiences.map((e) => e.entry.id));
      const semanticIds = getSemanticIdsForType(semanticScores, 'experience');
      fetchSemanticEntries(db, experiences, existingIds, semanticIds, fetchedEntries.experiences, scopeChainLen);
    }
  }

  return {
    ...ctx,
    fetchedEntries,
  };
}
