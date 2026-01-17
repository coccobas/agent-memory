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

  /**
   * Perform a health check on the database connection.
   * @param options.attemptReconnect - If true, attempt to reconnect when health check fails
   * @returns Health check result with ok status, latency, and optional reconnect info
   */
  healthCheck(options?: { attemptReconnect?: boolean }): Promise<{
    ok: boolean;
    latencyMs: number;
    reconnected?: boolean;
  }>;
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
// RATE LIMITER ADAPTER
// =============================================================================

/**
 * Result of a rate limit check operation.
 */
export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterMs?: number;
}

/**
 * Rate limiter statistics for a given key.
 */
export interface RateLimitStats {
  count: number;
  remaining: number;
  windowMs: number;
}

/**
 * Configuration for a rate limiter bucket.
 */
export interface RateLimiterBucketConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Whether rate limiting is enabled */
  enabled?: boolean;
  /** Minimum burst protection (default: 100) */
  minBurstProtection?: number;
}

/**
 * Abstract rate limiter adapter interface.
 * Wraps rate limiter implementations (in-memory, Redis, etc.)
 */
export interface IRateLimiterAdapter {
  /**
   * Check if a request is allowed and consume a token if so.
   * @param key - The rate limit key (e.g., agent ID, IP address)
   * @returns Result with allowed status, remaining tokens, and timing info
   */
  check(key: string): Promise<RateLimitCheckResult>;

  /**
   * Consume a token for the given key.
   * @param key - The rate limit key
   * @returns Whether the request was allowed
   */
  consume(key: string): Promise<boolean>;

  /**
   * Get statistics for a given key without consuming a token.
   * @param key - The rate limit key
   * @returns Current usage statistics
   */
  getStats(key: string): Promise<RateLimitStats>;

  /**
   * Reset rate limit counters for a specific key.
   * @param key - The rate limit key to reset
   */
  reset(key: string): Promise<void>;

  /**
   * Reset all rate limit counters.
   */
  resetAll(): Promise<void>;

  /**
   * Update configuration dynamically.
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<RateLimiterBucketConfig>): void;

  /**
   * Check if rate limiting is enabled.
   */
  isEnabled(): boolean;

  /**
   * Stop and cleanup resources.
   */
  stop(): Promise<void>;
}

// =============================================================================
// CIRCUIT BREAKER ADAPTER
// =============================================================================

/**
 * Circuit breaker state for distributed state sharing.
 */
export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successes: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
}

/**
 * Configuration for circuit breaker state adapter.
 */
export interface CircuitBreakerStateConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  successThreshold: number;
}

/**
 * Abstract circuit breaker state adapter interface.
 * Wraps circuit breaker state storage (local, Redis, etc.)
 * for distributed state sharing across instances.
 */
export interface ICircuitBreakerStateAdapter {
  /**
   * Get the current state for a service.
   * @param serviceName - The name of the service
   * @returns The current circuit breaker state or null if not found
   */
  getState(serviceName: string): Promise<CircuitBreakerState | null>;

  /**
   * Set the state for a service.
   * @param serviceName - The name of the service
   * @param state - The new circuit breaker state
   */
  setState(serviceName: string, state: CircuitBreakerState): Promise<void>;

  /**
   * Record a failure and return the updated state.
   * Atomically increments failure count and handles state transitions.
   * @param serviceName - The name of the service
   * @param config - Circuit breaker configuration
   * @returns The updated circuit breaker state
   */
  recordFailure(
    serviceName: string,
    config: CircuitBreakerStateConfig
  ): Promise<CircuitBreakerState>;

  /**
   * Record a success and return the updated state.
   * Atomically increments success count and handles state transitions.
   * @param serviceName - The name of the service
   * @param config - Circuit breaker configuration
   * @returns The updated circuit breaker state
   */
  recordSuccess(
    serviceName: string,
    config: CircuitBreakerStateConfig
  ): Promise<CircuitBreakerState>;

  /**
   * Reset the circuit breaker state for a service.
   * @param serviceName - The name of the service
   */
  reset(serviceName: string): Promise<void>;

  /**
   * Reset all circuit breaker states.
   */
  resetAll(): Promise<void>;
}

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
