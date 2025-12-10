import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../connection.js';
import { fileLocks, type FileLock, type NewFileLock } from '../schema.js';
import { generateId, now, DEFAULT_LOCK_TIMEOUT_SECONDS, MAX_LOCK_TIMEOUT_SECONDS } from './base.js';

// =============================================================================
// FILE LOCKS REPOSITORY
// =============================================================================

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

    // Clean up expired locks first
    this.cleanupExpiredLocks();

    // Check if file is already locked
    const existing = this.getLock(filePath);
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
    const lock: NewFileLock = {
      id,
      filePath,
      checkedOutBy: agentId,
      sessionId: options.sessionId,
      projectId: options.projectId,
      checkedOutAt,
      expiresAt,
      metadata: options.metadata,
    };

    db.insert(fileLocks).values(lock).run();

    return this.getLock(filePath)!;
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

    // Clean up expired locks first
    this.cleanupExpiredLocks();

    const lock = this.getLock(filePath);
    if (!lock) {
      throw new Error(`File ${filePath} is not locked`);
    }

    if (lock.checkedOutBy !== agentId) {
      throw new Error(`File ${filePath} is locked by agent ${lock.checkedOutBy}, not ${agentId}`);
    }

    db.delete(fileLocks).where(eq(fileLocks.filePath, filePath)).run();
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

    // Clean up expired locks first
    this.cleanupExpiredLocks();

    const lock = this.getLock(filePath);
    if (!lock) {
      throw new Error(`File ${filePath} is not locked`);
    }

    // Update metadata with force unlock info before deleting
    const metadata = {
      ...(lock.metadata || {}),
      forceUnlockedBy: agentId,
      forceUnlockedAt: now(),
      ...(reason ? { forceUnlockReason: reason } : {}),
    };

    db.update(fileLocks).set({ metadata }).where(eq(fileLocks.filePath, filePath)).run();

    // Delete the lock
    db.delete(fileLocks).where(eq(fileLocks.filePath, filePath)).run();
  },

  /**
   * Check if a file is currently locked (not expired)
   *
   * @param filePath - Absolute path to the file to check
   * @returns True if the file is currently locked
   */
  isLocked(filePath: string): boolean {
    this.cleanupExpiredLocks();
    return this.getLock(filePath) !== null;
  },

  /**
   * Get lock information for a file
   *
   * @param filePath - Absolute path to the file
   * @returns The file lock if it exists and is not expired, null otherwise
   */
  getLock(filePath: string): FileLock | null {
    const db = getDb();
    const nowTime = new Date().toISOString();

    // Get lock for this file
    const lock = db.select().from(fileLocks).where(eq(fileLocks.filePath, filePath)).get();

    if (!lock) return null;

    // Check if expired
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
    const db = getDb();
    const nowTime = new Date().toISOString();

    // Get all locks with expiration
    const locks = db
      .select()
      .from(fileLocks)
      .where(sql`${fileLocks.expiresAt} IS NOT NULL`)
      .all();

    // Delete expired ones
    let deleted = 0;
    for (const lock of locks) {
      if (lock.expiresAt && lock.expiresAt <= nowTime) {
        db.delete(fileLocks).where(eq(fileLocks.id, lock.id)).run();
        deleted++;
      }
    }

    return deleted;
  },
};
