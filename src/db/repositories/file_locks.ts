/**
 * File Lock Repository
 *
 * Factory function that accepts DatabaseDeps for dependency injection.
 * Manages file-level locks for concurrent editing.
 */

import { eq, and, sql } from 'drizzle-orm';
import { getDb, getSqlite, transactionWithDb } from '../connection.js';
import { fileLocks, type FileLock, type NewFileLock } from '../schema.js';
import { generateId, now, DEFAULT_LOCK_TIMEOUT_SECONDS, MAX_LOCK_TIMEOUT_SECONDS } from './base.js';
import { createComponentLogger } from '../../utils/logger.js';
import { normalizePath, isPathSafe } from '../../utils/paths.js';
import type { DatabaseDeps } from '../../core/types.js';
import type {
  IFileLockRepository,
  CheckoutOptions,
  ListLocksFilter,
} from '../../core/interfaces/repositories.js';

// Re-export input types for backward compatibility
export type { CheckoutOptions, ListLocksFilter } from '../../core/interfaces/repositories.js';

const logger = createComponentLogger('FileLockRepo');

// =============================================================================
// FILE LOCKS REPOSITORY FACTORY
// =============================================================================

/**
 * Create a file lock repository with injected database dependencies
 */
export function createFileLockRepository(deps: DatabaseDeps): IFileLockRepository {
  const { db, sqlite } = deps;

  const repo: IFileLockRepository = {
    checkout(filePath: string, agentId: string, options: CheckoutOptions = {}): FileLock {
      // Validate required parameters
      if (!filePath) throw new Error('filePath is required');
      if (!agentId) throw new Error('agentId is required');

      // Normalize and validate path
      const normalizedPath = normalizePath(filePath);
      if (!isPathSafe(filePath)) {
        throw new Error(`Invalid or unsafe file path: ${filePath}`);
      }

      // Calculate expiration
      const expiresIn = options.expiresIn ?? DEFAULT_LOCK_TIMEOUT_SECONDS;
      if (expiresIn > MAX_LOCK_TIMEOUT_SECONDS) {
        throw new Error(`Lock timeout cannot exceed ${MAX_LOCK_TIMEOUT_SECONDS} seconds`);
      }

      const checkedOutAt = now();
      const expiresAt =
        expiresIn > 0 ? new Date(Date.parse(checkedOutAt) + expiresIn * 1000).toISOString() : null;

      const id = generateId();
      const newLock: NewFileLock = {
        id,
        filePath: normalizedPath,
        checkedOutBy: agentId,
        sessionId: options.sessionId,
        projectId: options.projectId,
        checkedOutAt,
        expiresAt,
        metadata: options.metadata ?? null,
      };

      return transactionWithDb(sqlite, () => {
        const nowTime = new Date().toISOString();

        // Atomic: Delete expired lock for THIS specific file, then insert
        // This avoids TOCTOU race by targeting only the specific file within the transaction
        db.delete(fileLocks)
          .where(
            and(
              eq(fileLocks.filePath, normalizedPath),
              sql`${fileLocks.expiresAt} IS NOT NULL AND ${fileLocks.expiresAt} < ${nowTime}`
            )
          )
          .run();

        try {
          db.insert(fileLocks).values(newLock).run();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isUnique =
            message.includes('UNIQUE constraint failed') &&
            message.includes('file_locks.file_path');
          if (!isUnique) throw error;

          // Lock exists and is not expired - get details for error message
          const existing = db
            .select()
            .from(fileLocks)
            .where(eq(fileLocks.filePath, normalizedPath))
            .get();

          if (existing) {
            throw new Error(
              `File ${filePath} is already locked by agent ${existing.checkedOutBy}`
            );
          }
          // This shouldn't happen - unique constraint failed but no lock found
          throw new Error(`Failed to acquire lock for ${filePath}: constraint violation`);
        }

        // Return the newly created lock
        return db.select().from(fileLocks).where(eq(fileLocks.id, id)).get() as FileLock;
      });
    },

    checkin(filePath: string, agentId: string): void {
      if (!filePath) throw new Error('filePath is required');
      if (!agentId) throw new Error('agentId is required');

      transactionWithDb(sqlite, () => {
        // Clean up expired locks first
        repo.cleanupExpiredLocks();

        const normalizedPath = normalizePath(filePath);
        const lock = repo.getLock(normalizedPath);
        if (!lock) {
          throw new Error(`File ${filePath} is not locked`);
        }

        if (lock.checkedOutBy !== agentId) {
          throw new Error(
            `File ${filePath} is locked by agent ${lock.checkedOutBy}, not ${agentId}`
          );
        }

        // Delete by id to avoid deleting a replaced lock
        db.delete(fileLocks).where(eq(fileLocks.id, lock.id)).run();
      });
    },

    forceUnlock(filePath: string, agentId: string, reason?: string): void {
      if (!filePath) throw new Error('filePath is required');
      if (!agentId) throw new Error('agentId is required');

      transactionWithDb(sqlite, () => {
        // Clean up expired locks first
        repo.cleanupExpiredLocks();

        const normalizedPath = normalizePath(filePath);
        const lock = repo.getLock(normalizedPath);
        if (!lock) {
          throw new Error(`File ${filePath} is not locked`);
        }

        logger.warn(
          {
            filePath,
            lockedBy: lock.checkedOutBy,
            unlockedBy: agentId,
            reason,
          },
          'Force unlocking file'
        );

        // Update metadata with force unlock info before deleting
        const metadata = {
          ...(lock.metadata || {}),
          forceUnlockedBy: agentId,
          forceUnlockedAt: now(),
          ...(reason ? { forceUnlockReason: reason } : {}),
        };

        db.update(fileLocks).set({ metadata }).where(eq(fileLocks.id, lock.id)).run();

        // Delete by id
        db.delete(fileLocks).where(eq(fileLocks.id, lock.id)).run();
      });
    },

    isLocked(filePath: string): boolean {
      if (!filePath) throw new Error('filePath is required');
      repo.cleanupExpiredLocks();
      const normalizedPath = normalizePath(filePath);
      return repo.getLock(normalizedPath) !== null;
    },

    getLock(filePath: string): FileLock | null {
      if (!filePath) throw new Error('filePath is required');

      const normalizedPath = normalizePath(filePath);
      // Get lock for this file
      const lock = db.select().from(fileLocks).where(eq(fileLocks.filePath, normalizedPath)).get();

      if (!lock) return null;

      // Check if expired (this check is redundant if cleanupExpiredLocks is always called first,
      // but good for direct calls to getLock)
      const nowTime = new Date().toISOString();
      if (lock.expiresAt && lock.expiresAt <= nowTime) {
        return null;
      }

      return lock;
    },

    listLocks(filter: ListLocksFilter = {}): FileLock[] {
      const nowTime = new Date().toISOString();

      // Clean up expired locks first
      repo.cleanupExpiredLocks();

      const conditions = [];

      if (filter.projectId !== undefined) {
        conditions.push(eq(fileLocks.projectId, filter.projectId));
      }

      if (filter.sessionId !== undefined) {
        conditions.push(eq(fileLocks.sessionId, filter.sessionId));
      }

      if (filter.agentId !== undefined) {
        conditions.push(eq(fileLocks.checkedOutBy, filter.agentId));
      }

      let query = db.select().from(fileLocks);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const locks = query.all();

      // Filter out expired locks
      return locks.filter((lock) => {
        if (!lock.expiresAt) return true;
        return lock.expiresAt > nowTime;
      });
    },

    cleanupExpiredLocks(): number {
      const nowTime = new Date().toISOString();
      try {
        const result = db
          .delete(fileLocks)
          .where(sql`${fileLocks.expiresAt} IS NOT NULL AND ${fileLocks.expiresAt} < ${nowTime}`)
          .run();
        return result.changes;
      } catch {
        return 0;
      }
    },

    cleanupStaleLocks(maxAgeHours = 24): number {
      const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
      try {
        const result = db
          .delete(fileLocks)
          .where(sql`${fileLocks.expiresAt} IS NULL AND ${fileLocks.checkedOutAt} < ${cutoff}`)
          .run();
        return result.changes;
      } catch {
        return 0;
      }
    },
  };

  return repo;
}

// =============================================================================
// STANDALONE CLEANUP FUNCTIONS (for backward compatibility)
// =============================================================================

export function cleanupExpiredLocks(): { cleaned: number; errors: string[] } {
  const db = getDb();
  const nowTime = new Date().toISOString();
  const errors: string[] = [];

  try {
    // Find and delete expired locks
    const result = db
      .delete(fileLocks)
      .where(sql`${fileLocks.expiresAt} IS NOT NULL AND ${fileLocks.expiresAt} < ${nowTime}`)
      .run();

    return { cleaned: result.changes, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { cleaned: 0, errors };
  }
}

export function cleanupStaleLocks(maxAgeHours = 24): { cleaned: number; errors: string[] } {
  const db = getDb();
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  const errors: string[] = [];

  try {
    // Delete locks older than cutoff that have no expiration set
    const result = db
      .delete(fileLocks)
      .where(sql`${fileLocks.expiresAt} IS NULL AND ${fileLocks.checkedOutAt} < ${cutoff}`)
      .run();

    return { cleaned: result.changes, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { cleaned: 0, errors };
  }
}

// =============================================================================
// TEMPORARY BACKWARD COMPAT EXPORTS
// TODO: Remove these when all call sites are updated to use AppContext.repos
// =============================================================================

/**
 * @deprecated Use createFileLockRepository(deps) instead. Will be removed when AppContext.repos is wired.
 */
function createLegacyFileLockRepo(): IFileLockRepository {
  return createFileLockRepository({ db: getDb(), sqlite: getSqlite() });
}

// Lazy-initialized singleton instance for backward compatibility
let _fileLockRepo: IFileLockRepository | null = null;

/**
 * @deprecated Use AppContext.repos.fileLocks instead
 */
export const fileLockRepo: IFileLockRepository = new Proxy({} as IFileLockRepository, {
  get(_, prop: keyof IFileLockRepository) {
    if (!_fileLockRepo) _fileLockRepo = createLegacyFileLockRepo();
    return _fileLockRepo[prop];
  },
});
