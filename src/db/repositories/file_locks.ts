/**
 * File Lock Repository
 *
 * Factory function that accepts DatabaseDeps for dependency injection.
 * Manages file-level locks for concurrent editing.
 */

import { eq, and, sql } from 'drizzle-orm';
import { transactionWithDb } from '../connection.js';
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
import {
  createValidationError,
  createFileLockError,
  createNotFoundError,
} from '../../core/errors.js';

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
    async checkout(
      filePath: string,
      agentId: string,
      options: CheckoutOptions = {}
    ): Promise<FileLock> {
      // Validate required parameters
      if (!filePath) throw createValidationError('filePath', 'is required');
      if (!agentId) throw createValidationError('agentId', 'is required');

      // Normalize and validate path
      const normalizedPath = normalizePath(filePath);
      if (!isPathSafe(filePath)) {
        throw createValidationError('filePath', `invalid or unsafe path: ${filePath}`);
      }

      // Calculate expiration
      const expiresIn = options.expiresIn ?? DEFAULT_LOCK_TIMEOUT_SECONDS;
      if (expiresIn > MAX_LOCK_TIMEOUT_SECONDS) {
        throw createValidationError(
          'expiresIn',
          `cannot exceed ${MAX_LOCK_TIMEOUT_SECONDS} seconds`
        );
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
            throw createFileLockError(filePath, existing.checkedOutBy);
          }
          // This shouldn't happen - unique constraint failed but no lock found
          throw createValidationError('lock', `constraint violation for ${filePath}`);
        }

        // Return the newly created lock
        return db.select().from(fileLocks).where(eq(fileLocks.id, id)).get() as FileLock;
      });
    },

    async checkin(filePath: string, agentId: string): Promise<void> {
      if (!filePath) throw createValidationError('filePath', 'is required');
      if (!agentId) throw createValidationError('agentId', 'is required');

      transactionWithDb(sqlite, () => {
        // Clean up expired locks first (sync call within transaction)
        const nowTime = new Date().toISOString();
        db.delete(fileLocks)
          .where(sql`${fileLocks.expiresAt} IS NOT NULL AND ${fileLocks.expiresAt} < ${nowTime}`)
          .run();

        const normalizedPath = normalizePath(filePath);
        const lock = db
          .select()
          .from(fileLocks)
          .where(eq(fileLocks.filePath, normalizedPath))
          .get();
        if (!lock) {
          throw createNotFoundError('lock', filePath);
        }

        // Check if expired
        if (lock.expiresAt && lock.expiresAt <= nowTime) {
          throw createValidationError('lock', `has expired for ${filePath}`);
        }

        if (lock.checkedOutBy !== agentId) {
          throw createFileLockError(filePath, lock.checkedOutBy);
        }

        // Delete by id to avoid deleting a replaced lock
        db.delete(fileLocks).where(eq(fileLocks.id, lock.id)).run();
      });
    },

    async forceUnlock(filePath: string, agentId: string, reason?: string): Promise<void> {
      if (!filePath) throw createValidationError('filePath', 'is required');
      if (!agentId) throw createValidationError('agentId', 'is required');

      transactionWithDb(sqlite, () => {
        // Clean up expired locks first (sync call within transaction)
        const nowTime = new Date().toISOString();
        db.delete(fileLocks)
          .where(sql`${fileLocks.expiresAt} IS NOT NULL AND ${fileLocks.expiresAt} < ${nowTime}`)
          .run();

        const normalizedPath = normalizePath(filePath);
        const lock = db
          .select()
          .from(fileLocks)
          .where(eq(fileLocks.filePath, normalizedPath))
          .get();
        if (!lock) {
          throw createNotFoundError('lock', filePath);
        }

        // Check if expired
        if (lock.expiresAt && lock.expiresAt <= nowTime) {
          throw createValidationError('lock', `has expired for ${filePath}`);
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

    async isLocked(filePath: string): Promise<boolean> {
      if (!filePath) throw createValidationError('filePath', 'is required');
      await repo.cleanupExpiredLocks();
      const normalizedPath = normalizePath(filePath);
      return (await repo.getLock(normalizedPath)) !== null;
    },

    async getLock(filePath: string): Promise<FileLock | null> {
      if (!filePath) throw createValidationError('filePath', 'is required');

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

    async listLocks(filter: ListLocksFilter = {}): Promise<FileLock[]> {
      const nowTime = new Date().toISOString();

      // Clean up expired locks first
      await repo.cleanupExpiredLocks();

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

    async cleanupExpiredLocks(): Promise<number> {
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

    async cleanupStaleLocks(maxAgeHours = 24): Promise<number> {
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
