/**
 * Adapter Interfaces
 *
 * Abstract interfaces for storage, cache, locks, and events.
 * Allows swapping implementations (SQLite → PostgreSQL, LRU → Redis, etc.)
 * without changing application code.
 *
 * Design: Async-first interface for PostgreSQL compatibility.
 * SQLite adapters wrap synchronous calls in Promise.resolve().
 */

import type { EntryChangedEvent } from '../../utils/events.js';

// Re-export for convenience
export type { EntryChangedEvent };

// =============================================================================
// STORAGE ADAPTER
// =============================================================================

/**
 * Abstract storage adapter interface.
 * Wraps database connections (SQLite, PostgreSQL, etc.)
 *
 * All query methods are async to support PostgreSQL.
 * SQLite implementations wrap sync calls in Promise.resolve().
 */
export interface IStorageAdapter {
  // Lifecycle
  connect(): Promise<void>;
  close(): Promise<void>;
  isConnected(): boolean;

  /**
   * Execute a raw SQL query and return all results.
   * @param sql - SQL query string with parameter placeholders
   * @param params - Query parameters (positional)
   * @returns Promise resolving to array of results
   */
  executeRaw<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute a raw SQL query and return the first result.
   * @param sql - SQL query string with parameter placeholders
   * @param params - Query parameters (positional)
   * @returns Promise resolving to first result or undefined
   */
  executeRawSingle<T>(sql: string, params?: unknown[]): Promise<T | undefined>;

  /**
   * Execute a function within a database transaction.
   * Automatically commits on success, rolls back on error.
   * @param fn - Async function to execute within transaction
   * @returns Promise resolving to function result
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  // ORM instance access (for repository compatibility)
  // Returns the underlying ORM instance (Drizzle for SQLite/PostgreSQL)
  getDb(): unknown;

  // Raw connection access (for low-level operations)
  // SQLite: Database.Database, PostgreSQL: Pool
  getRawConnection(): unknown;

  // Health check
  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>;
}

// =============================================================================
// CACHE ADAPTER
// =============================================================================

/**
 * Abstract cache adapter interface.
 * Wraps cache implementations (LRU, Redis, etc.)
 */
export interface ICacheAdapter<T = unknown> {
  // Basic operations
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;

  // Bulk invalidation
  invalidateByPrefix(prefix: string): number;
  invalidateByPredicate(predicate: (key: string) => boolean): number;

  // Stats
  size(): number;
  memoryBytes(): number;
}

// =============================================================================
// LOCK ADAPTER
// =============================================================================

/**
 * Lock information returned by lock operations.
 */
export interface LockInfo {
  key: string;
  owner: string;
  acquiredAt: Date;
  expiresAt: Date | null;
  metadata?: Record<string, unknown>;
}

/**
 * Options for acquiring a lock.
 */
export interface AcquireLockOptions {
  ttlMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Result of a lock acquisition attempt.
 */
export interface AcquireLockResult {
  acquired: boolean;
  lock?: LockInfo;
}

/**
 * Filter options for listing locks.
 */
export interface ListLocksFilter {
  owner?: string;
}

/**
 * Abstract lock adapter interface.
 * Wraps lock implementations (local file locks, Redis distributed locks, etc.)
 */
export interface ILockAdapter {
  // Lock operations
  acquire(key: string, owner: string, options?: AcquireLockOptions): Promise<AcquireLockResult>;
  release(key: string, owner: string): Promise<boolean>;
  forceRelease(key: string, reason?: string): Promise<boolean>;

  // Query operations
  isLocked(key: string): Promise<boolean>;
  getLock(key: string): Promise<LockInfo | null>;
  listLocks(filter?: ListLocksFilter): Promise<LockInfo[]>;

  // Maintenance
  cleanupExpired(): Promise<number>;
}

// =============================================================================
// EVENT ADAPTER
// =============================================================================

/**
 * Abstract event adapter interface.
 * Wraps event bus implementations (local EventEmitter, Redis pub/sub, etc.)
 */
export interface IEventAdapter<TEvent = unknown> {
  subscribe(handler: (event: TEvent) => void): () => void;
  emit(event: TEvent): void;
  clear(): void;
  subscriberCount(): number;
}

/**
 * Typed event adapter for entry change events.
 */
export type EntryEventAdapter = IEventAdapter<EntryChangedEvent>;

// =============================================================================
// ADAPTERS COLLECTION
// =============================================================================

/**
 * Collection of all adapters used by the application.
 */
export interface Adapters {
  storage: IStorageAdapter;
  cache: ICacheAdapter;
  lock: ILockAdapter;
  event: EntryEventAdapter;
}
