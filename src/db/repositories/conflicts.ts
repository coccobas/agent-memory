import { and, eq } from 'drizzle-orm';
import { getDb } from '../connection.js';
import { conflictLog, type ConflictLog } from '../schema.js';
import { now, type PaginationOptions, DEFAULT_LIMIT, MAX_LIMIT } from './base.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ListConflictsFilter {
  entryType?: 'tool' | 'guideline' | 'knowledge';
  resolved?: boolean;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export const conflictRepo = {
  /**
   * List conflicts with optional filtering.
   */
  list(filter: ListConflictsFilter = {}, options: PaginationOptions = {}): ConflictLog[] {
    const db = getDb();
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

  /**
   * Get a conflict by ID.
   */
  getById(id: string): ConflictLog | undefined {
    const db = getDb();
    return db.select().from(conflictLog).where(eq(conflictLog.id, id)).get();
  },

  /**
   * Resolve a conflict by marking it as resolved and recording resolution details.
   *
   * Note: Does not mutate underlying versions; it only updates the conflict_log row.
   */
  resolve(id: string, resolution: string, resolvedBy?: string): ConflictLog | undefined {
    const db = getDb();

    const existing = this.getById(id);
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

    return this.getById(id) ?? undefined;
  },
};
