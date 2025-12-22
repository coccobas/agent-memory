/**
 * Entry Repository Utilities
 *
 * Shared utility functions for entry repositories (tools, guidelines, knowledge).
 * Reduces duplication without requiring structural changes to existing repos.
 */

import { eq, and, isNull, inArray, type SQL } from 'drizzle-orm';
import type { ScopeType } from '../schema.js';
import { DEFAULT_LIMIT, MAX_LIMIT, type PaginationOptions, type DrizzleDb } from './base.js';

// =============================================================================
// TYPES
// =============================================================================

export interface BaseListFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  includeInactive?: boolean;
}

export interface ScopeMatchParams {
  identifier: string;
  scopeType: ScopeType;
  scopeId?: string;
  inherit?: boolean;
}

// =============================================================================
// PAGINATION HELPERS
// =============================================================================

/**
 * Normalize pagination options with defaults and limits
 */
export function normalizePagination(options: PaginationOptions = {}): {
  limit: number;
  offset: number;
} {
  return {
    limit: Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    offset: options.offset ?? 0,
  };
}

// =============================================================================
// CONDITION BUILDERS
// =============================================================================

/**
 * Build common scope conditions for list queries
 */
export function buildScopeConditions<
  TTable extends { scopeType: unknown; scopeId: unknown; isActive: unknown },
>(table: TTable, filter: BaseListFilter): SQL[] {
  const conditions: SQL[] = [];

  if (filter.scopeType !== undefined) {
    conditions.push(eq(table.scopeType as never, filter.scopeType));
  }

  if (filter.scopeId !== undefined) {
    conditions.push(eq(table.scopeId as never, filter.scopeId));
  } else if (filter.scopeType === 'global') {
    conditions.push(isNull(table.scopeId as never));
  }

  if (!filter.includeInactive) {
    conditions.push(eq(table.isActive as never, true));
  }

  return conditions;
}

// =============================================================================
// VERSION BATCH FETCHING
// =============================================================================

/**
 * Batch fetch versions to avoid N+1 queries (explicit DI)
 * Generic helper that works with any version table structure
 *
 * @param db - The database connection (explicit DI)
 * @param versionTable - The version table to query
 * @param versionIds - Array of version IDs to fetch
 */
export function batchFetchVersionsWithDb<TVersion extends { id: string }>(
  db: DrizzleDb,
  versionTable: { id: unknown },
  versionIds: (string | null | undefined)[]
): Map<string, TVersion> {
  const filteredIds = versionIds.filter((id): id is string => id !== null && id !== undefined);

  if (filteredIds.length === 0) {
    return new Map();
  }

  const versions = db
    .select()
    .from(versionTable as never)
    .where(inArray(versionTable.id as never, filteredIds))
    .all() as TVersion[];

  return new Map(versions.map((v) => [v.id, v]));
}

/**
 * Attach versions to entries using a map
 */
export function attachVersions<TEntry extends { currentVersionId: string | null }, TVersion>(
  entries: TEntry[],
  versionsMap: Map<string, TVersion>
): Array<TEntry & { currentVersion?: TVersion }> {
  return entries.map((entry) => ({
    ...entry,
    currentVersion: entry.currentVersionId ? versionsMap.get(entry.currentVersionId) : undefined,
  }));
}

// =============================================================================
// SCOPE INHERITANCE
// =============================================================================

/**
 * Build conditions for exact scope match
 */
export function buildExactScopeConditions<
  TTable extends { scopeType: unknown; scopeId: unknown; isActive: unknown },
>(
  table: TTable,
  identifierColumn: unknown,
  identifier: string,
  scopeType: ScopeType,
  scopeId?: string
): SQL {
  const conditions = [
    eq(identifierColumn as never, identifier),
    eq(table.scopeType as never, scopeType),
    eq(table.isActive as never, true),
  ];

  if (scopeId) {
    conditions.push(eq(table.scopeId as never, scopeId));
  } else {
    conditions.push(isNull(table.scopeId as never));
  }

  return and(...conditions)!;
}

/**
 * Build conditions for global scope fallback
 */
export function buildGlobalScopeConditions<
  TTable extends { scopeType: unknown; scopeId: unknown; isActive: unknown },
>(table: TTable, identifierColumn: unknown, identifier: string): SQL {
  return and(
    eq(identifierColumn as never, identifier),
    eq(table.scopeType as never, 'global'),
    isNull(table.scopeId as never),
    eq(table.isActive as never, true)
  )!;
}
