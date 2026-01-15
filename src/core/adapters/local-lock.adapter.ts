/**
 * Local Lock Adapter
 *
 * Wraps the existing IFileLockRepository implementation
 * behind the ILockAdapter interface.
 */

import type {
  ILockAdapter,
  LockInfo,
  AcquireLockOptions,
  AcquireLockResult,
  ListLocksFilter,
} from './interfaces.js';
import type { IFileLockRepository } from '../interfaces/repositories.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('local-lock-adapter');

/**
 * Local lock adapter implementation.
 * Wraps the existing SQLite-backed FileLockRepository.
 */
export class LocalLockAdapter implements ILockAdapter {
  private repo: IFileLockRepository;

  constructor(repo: IFileLockRepository) {
    this.repo = repo;
  }

  async acquire(
    key: string,
    owner: string,
    options?: AcquireLockOptions
  ): Promise<AcquireLockResult> {
    try {
      const lock = await this.repo.checkout(key, owner, {
        expiresIn: options?.ttlMs ? Math.floor(options.ttlMs / 1000) : undefined,
        metadata: options?.metadata,
      });

      return {
        acquired: true,
        lock: this.toLockInfo(lock),
      };
    } catch (error) {
      // Checkout throws if already locked by another agent
      if (error instanceof Error && error.message.includes('locked')) {
        return { acquired: false };
      }
      throw error;
    }
  }

  async release(key: string, owner: string): Promise<boolean> {
    try {
      await this.repo.checkin(key, owner);
      return true;
    } catch (error) {
      logger.debug({ error, key, owner }, 'Failed to release lock, returning false');
      return false;
    }
  }

  async forceRelease(key: string, reason?: string): Promise<boolean> {
    try {
      // forceUnlock requires an agentId for audit, use 'system' for forced releases
      await this.repo.forceUnlock(key, 'system', reason);
      return true;
    } catch (error) {
      logger.debug({ error, key, reason }, 'Failed to force release lock, returning false');
      return false;
    }
  }

  async isLocked(key: string): Promise<boolean> {
    return this.repo.isLocked(key);
  }

  async getLock(key: string): Promise<LockInfo | null> {
    const lock = await this.repo.getLock(key);
    return lock ? this.toLockInfo(lock) : null;
  }

  async listLocks(filter?: ListLocksFilter): Promise<LockInfo[]> {
    const locks = await this.repo.listLocks(filter?.owner ? { agentId: filter.owner } : undefined);
    return locks.map((lock) => this.toLockInfo(lock));
  }

  async cleanupExpired(): Promise<number> {
    return this.repo.cleanupExpiredLocks();
  }

  /**
   * Convert repository FileLock to adapter LockInfo.
   */
  private toLockInfo(lock: {
    filePath: string;
    checkedOutBy: string;
    checkedOutAt: string;
    expiresAt: string | null;
    metadata: Record<string, unknown> | null;
  }): LockInfo {
    return {
      key: lock.filePath,
      owner: lock.checkedOutBy,
      acquiredAt: new Date(lock.checkedOutAt),
      expiresAt: lock.expiresAt ? new Date(lock.expiresAt) : null,
      metadata: lock.metadata ?? undefined,
    };
  }
}

/**
 * Create a local lock adapter from a FileLockRepository instance.
 */
export function createLocalLockAdapter(repo: IFileLockRepository): ILockAdapter {
  return new LocalLockAdapter(repo);
}
