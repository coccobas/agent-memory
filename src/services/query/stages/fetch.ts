/**
 * Fetch Stage
 *
 * Fetches entries from the database for each type.
 * Applies scope, date filters, and FTS5 ID filtering at the DB level.
 *
 * Uses injected dependencies for DB access to support testing with mocks.
 */

import { tools, guidelines, knowledge, experiences } from '../../../db/schema.js';
import type { Tool, Guideline, Knowledge, Experience } from '../../../db/schema.js';
import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PipelineContext, QueryEntryType, DbInstance } from '../pipeline.js';
import { FETCH_HEADROOM_MULTIPLIER } from '../../../utils/constants.js';

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
  const { scopeChain, params, ftsMatchIds, limit } = ctx;
  const { table, ftsKey, applyExtraFilters } = config;

  for (let index = 0; index < scopeChain.length; index++) {
    if (result.length >= softCap) break;

    const scope = scopeChain[index]!;
    const conditions: SQL[] = [
      eq(table.scopeType, scope.scopeType),
      scope.scopeId === null ? isNull(table.scopeId) : eq(table.scopeId, scope.scopeId),
      eq(table.isActive, true),
    ];

    // Date filters
    if (params.createdAfter) {
      conditions.push(sql`${table.createdAt} >= ${params.createdAfter}`);
    }
    if (params.createdBefore) {
      conditions.push(sql`${table.createdAt} <= ${params.createdBefore}`);
    }

    // Type-specific extra filters (e.g., priority for guidelines)
    applyExtraFilters?.(conditions, ctx);

    // FTS5 ID filter
    if (ftsMatchIds && ftsMatchIds[ftsKey].size > 0) {
      conditions.push(inArray(table.id, Array.from(ftsMatchIds[ftsKey])));
    }

    const perScopeLimit = Math.max(softCap - result.length, limit);
    const rows = db
      .select()
      .from(table)
      .where(and(...conditions))
      .orderBy(sql`${table.createdAt} DESC`)
      .limit(perScopeLimit)
      .all();

    for (const row of rows) {
      result.push({ entry: row as T, scopeIndex: index });
    }
  }
}

// =============================================================================
// FETCH STAGE
// =============================================================================

/**
 * Fetch stage - fetches entries from DB
 *
 * Uses ctx.deps.getDb() for database access instead of calling getDb() directly.
 */
export function fetchStage(ctx: PipelineContext): PipelineContext {
  const db = ctx.deps.getDb();
  const { types, limit } = ctx;

  const fetchedEntries: PipelineContext['fetchedEntries'] = {
    tools: [],
    guidelines: [],
    knowledge: [],
    experiences: [],
  };

  const softCap = limit * FETCH_HEADROOM_MULTIPLIER;

  for (const type of types) {
    if (type === 'tools') {
      fetchEntriesGeneric(db, FETCH_CONFIGS.tools, ctx, fetchedEntries.tools, softCap);
    } else if (type === 'guidelines') {
      fetchEntriesGeneric(db, FETCH_CONFIGS.guidelines, ctx, fetchedEntries.guidelines, softCap);
    } else if (type === 'knowledge') {
      fetchEntriesGeneric(db, FETCH_CONFIGS.knowledge, ctx, fetchedEntries.knowledge, softCap);
    } else if (type === 'experiences') {
      fetchEntriesGeneric(db, FETCH_CONFIGS.experiences, ctx, fetchedEntries.experiences, softCap);
    }
  }

  return {
    ...ctx,
    fetchedEntries,
  };
}
