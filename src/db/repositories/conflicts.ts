/**
 * Conflict Repository
 *
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { and, eq } from 'drizzle-orm';
import { getDb } from '../connection.js';
import { conflictLog, type ConflictLog } from '../schema.js';
import { now, type PaginationOptions, DEFAULT_LIMIT, MAX_LIMIT } from './base.js';
import type { DatabaseDeps } from '../../core/types.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ListConflictsFilter {
  entryType?: 'tool' | 'guideline' | 'knowledge';
  resolved?: boolean;
}

export interface IConflictRepository {
  list(filter?: ListConflictsFilter, options?: PaginationOptions): ConflictLog[];
  getById(id: string): ConflictLog | undefined;
  resolve(id: string, resolution: string, resolvedBy?: string): ConflictLog | undefined;
}

// =============================================================================
// CONFLICT REPOSITORY FACTORY
// =============================================================================

/**
 * Create a conflict repository with injected database dependencies
 */
export function createConflictRepository(deps: DatabaseDeps): IConflictRepository {
  const { db } = deps;

  const repo: IConflictRepository = {
    list(filter: ListConflictsFilter = {}, options: PaginationOptions = {}): ConflictLog[] {
      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = options.offset ?? 0;

      const conditions = [];

      if (filter.entryType !== undefined) {
        conditions.push(eq(conflictLog.entryType, filter.entryType));
      }

      if (filter.resolved !== undefined) {
        conditions.push(eq(conflictLog.resolved, filter.resolved));
      }

      let query = db.select().from(conflictLog);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      return query.orderBy(conflictLog.detectedAt).limit(limit).offset(offset).all();
    },

    getById(id: string): ConflictLog | undefined {
      return db.select().from(conflictLog).where(eq(conflictLog.id, id)).get();
    },

    resolve(id: string, resolution: string, resolvedBy?: string): ConflictLog | undefined {
      const existing = repo.getById(id);
      if (!existing) return undefined;

      const resolvedAt = now();

      db.update(conflictLog)
        .set({
          resolved: true,
          resolution,
          resolvedAt,
          resolvedBy,
        })
        .where(eq(conflictLog.id, id))
        .run();

      return repo.getById(id) ?? undefined;
    },
  };

  return repo;
}

// =============================================================================
// TEMPORARY BACKWARD COMPAT EXPORTS
// =============================================================================

function createLegacyConflictRepo(): IConflictRepository {
  return createConflictRepository({ db: getDb(), sqlite: null as any });
}

let _conflictRepo: IConflictRepository | null = null;

/**
 * @deprecated Use AppContext.repos.conflicts instead
 */
export const conflictRepo: IConflictRepository = new Proxy({} as IConflictRepository, {
  get(_, prop: keyof IConflictRepository) {
    if (!_conflictRepo) _conflictRepo = createLegacyConflictRepo();
    return _conflictRepo[prop];
  },
});
