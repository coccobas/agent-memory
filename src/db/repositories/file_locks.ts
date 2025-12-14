/**
 * File lock repository
 * Manages file-level locks for concurrent editing
 */

import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../connection.js';
import { fileLocks, type FileLock, type NewFileLock } from '../schema.js';
import { generateId, now, DEFAULT_LOCK_TIMEOUT_SECONDS, MAX_LOCK_TIMEOUT_SECONDS } from './base.js';
import { createComponentLogger } from '../../utils/logger.js';
import { normalizePath, isPathSafe } from '../../utils/paths.js';

// =============================================================================
// FILE LOCKS REPOSITORY
// =============================================================================

const logger = createComponentLogger('FileLockRepo');

export interface CheckoutOptions {
  sessionId?: string;
  projectId?: string;
  expiresIn?: number; // seconds
  metadata?: Record<string, unknown>;
}

export interface ListLocksFilter {
  projectId?: string;
  sessionId?: string;
  agentId?: string;
}

export const fileLockRepo = {
  /**
   * Checkout a file (create a lock)
   *
   * @param filePath - Absolute path to the file to lock
   * @param agentId - Identifier of the agent checking out the file
   * @param options - Optional checkout configuration
   * @returns The created file lock
   * @throws Error if file is already locked or timeout exceeds maximum
   */
  checkout(filePath: string, agentId: string, options: CheckoutOptions = {}): FileLock {
    const db = getDb();

    // Validate required parameters
    if (!filePath) throw new Error('filePath is required');
    if (!agentId) throw new Error('agentId is required');

    // Normalize and validate path
    const normalizedPath = normalizePath(filePath);
    if (!isPathSafe(filePath)) {
      throw new Error(`Invalid or unsafe file path: ${filePath}`);
    }

    // Clean up expired locks first
    this.cleanupExpiredLocks();

    // Check if file is already locked
    const existing = this.getLock(normalizedPath);
    if (existing) {
      throw new Error(`File ${filePath} is already locked by agent ${existing.checkedOutBy}`);
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

    db.insert(fileLocks).values(newLock).run();

    const result = this.getLock(normalizedPath);
    if (!result) {
      throw new Error(`Failed to create lock for ${filePath}`);
    }
    return result;
  },

  /**
   * Check in a file (remove lock if owned by agent)
   *
   * @param filePath - Absolute path to the file to check in
   * @param agentId - Identifier of the agent checking in the file
   * @throws Error if file is not locked or locked by a different agent
   */
  checkin(filePath: string, agentId: string): void {
    const db = getDb();

    if (!filePath) throw new Error('filePath is required');
    if (!agentId) throw new Error('agentId is required');

    // Clean up expired locks first
    this.cleanupExpiredLocks();

    const normalizedPath = normalizePath(filePath);
    const lock = this.getLock(normalizedPath);
    if (!lock) {
      throw new Error(`File ${filePath} is not locked`);
    }

    if (lock.checkedOutBy !== agentId) {
      throw new Error(`File ${filePath} is locked by agent ${lock.checkedOutBy}, not ${agentId}`);
    }

    db.delete(fileLocks).where(eq(fileLocks.filePath, normalizedPath)).run();
  },

  /**
   * Force unlock a file (remove lock regardless of owner)
   *
   * @param filePath - Absolute path to the file to unlock
   * @param agentId - Identifier of the agent performing the force unlock
   * @param reason - Optional reason for forcing the unlock
   * @throws Error if file is not locked
   */
  forceUnlock(filePath: string, agentId: string, reason?: string): void {
    const db = getDb();

    if (!filePath) throw new Error('filePath is required');
    if (!agentId) throw new Error('agentId is required');

    // Clean up expired locks first
    this.cleanupExpiredLocks();

    const normalizedPath = normalizePath(filePath);
    const lock = this.getLock(normalizedPath);
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

    db.update(fileLocks).set({ metadata }).where(eq(fileLocks.filePath, normalizedPath)).run();

    // Delete the lock
    db.delete(fileLocks).where(eq(fileLocks.filePath, normalizedPath)).run();
  },

  /**
   * Check if a file is currently locked (not expired)
   *
   * @param filePath - Absolute path to the file to check
   * @returns True if the file is currently locked
   */
  isLocked(filePath: string): boolean {
    if (!filePath) throw new Error('filePath is required');
    this.cleanupExpiredLocks();
    const normalizedPath = normalizePath(filePath);
    return this.getLock(normalizedPath) !== null;
  },

  /**
   * Get lock information for a file
   *
   * @param filePath - Absolute path to the file
   * @returns The file lock if it exists and is not expired, null otherwise
   */
  getLock(filePath: string): FileLock | null {
    const db = getDb();

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

  /**
   * List active locks with optional filtering
   *
   * @param filter - Optional filters for projectId, sessionId, or agentId
   * @returns Array of active file locks matching the filter criteria
   */
  listLocks(filter: ListLocksFilter = {}): FileLock[] {
    const db = getDb();
    const nowTime = new Date().toISOString();

    // Clean up expired locks first
    this.cleanupExpiredLocks();

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

  /**
   * Clean up expired locks
   *
   * @returns The number of locks removed
   */
  cleanupExpiredLocks(): number {
    return cleanupExpiredLocks().cleaned;
  },

  /**
   * Clean up stale locks
   */
  cleanupStaleLocks(maxAgeHours = 24): number {
    return cleanupStaleLocks(maxAgeHours).cleaned;
  }
};

export function cleanupExpiredLocks(): { cleaned: number; errors: string[] } {
  const db = getDb();
  const now = new Date().toISOString();
  const errors: string[] = [];

  try {
    // Find and delete expired locks
    const result = db
      .delete(fileLocks)
      .where(sql`${fileLocks.expiresAt} IS NOT NULL AND ${fileLocks.expiresAt} < ${now}`)
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
    // Delete locks older than cutoff that have no expiration set (or just very old ones generally?)
    // Guide says: IS NULL AND checkedOutAt < cutoff.
    const result = db
      .delete(fileLocks)
      .where(
        sql`${fileLocks.expiresAt} IS NULL AND ${fileLocks.checkedOutAt} < ${cutoff}`
      )
      .run();

    return { cleaned: result.changes, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { cleaned: 0, errors };
  }
}
