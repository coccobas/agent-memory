/**
 * Database Connection Module for Agent Memory
 *
 * Provides database connection management via the DI container.
 * All database access goes through the container (core/container.ts).
 *
 * Usage:
 * - createAppContext() for initialization
 * - getDb() / getSqlite() for access (requires prior initialization)
 * - resetContainer() for test cleanup
 * - registerDatabase() for test setup with custom DB instances
 */

import type Database from 'better-sqlite3';
import * as schema from './schema.js';
import type { AppDb } from '../core/types.js';
import { createComponentLogger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { createServiceUnavailableError } from '../core/errors.js';
import {
  isDatabaseInitialized,
  getDatabase,
  getSqlite as getContainerSqlite,
  clearDatabaseRegistration,
  setHealthCheckInterval as containerSetHealthCheckInterval,
  clearHealthCheckInterval as containerClearHealthCheckInterval,
  hasHealthCheckInterval as containerHasHealthCheckInterval,
  getPreparedStatement as containerGetPreparedStatement,
  clearPreparedStatementCache as containerClearPreparedStatementCache,
} from '../core/container.js';

const logger = createComponentLogger('connection');

// =============================================================================
// CONSTANTS FROM CONFIG
// =============================================================================

const DEFAULT_HEALTH_CHECK_INTERVAL_MS = config.health.checkIntervalMs;

export interface ConnectionOptions {
  dbPath?: string;
  readonly?: boolean;
  skipInit?: boolean;
}

/**
 * Get the database connection from the container.
 *
 * @throws Error if database not initialized. Call createAppContext() first.
 */
export function getDb(_options: ConnectionOptions = {}): AppDb {
  if (!isDatabaseInitialized()) {
    throw createServiceUnavailableError('Database', 'not initialized. Call createAppContext() first');
  }
  return getDatabase();
}

/**
 * Close the database connection and clear the container registration.
 */
export function closeDb(): void {
  if (isDatabaseInitialized()) {
    try {
      const sqlite = getContainerSqlite();
      sqlite.close();
    } catch {
      // Ignore close errors
    }
    containerClearPreparedStatementCache();
    stopHealthCheckInterval();
  }
  clearDatabaseRegistration();
}

/**
 * Get the raw SQLite instance from the container.
 *
 * @throws Error if database not initialized.
 */
export function getSqlite(): Database.Database {
  if (!isDatabaseInitialized()) {
    throw createServiceUnavailableError('Database', 'not initialized. Call createAppContext() first');
  }
  return getContainerSqlite();
}

/**
 * Check if the database connection is healthy
 */
export function isDbHealthy(): boolean {
  if (!isDatabaseInitialized()) {
    return false;
  }
  try {
    const sqlite = getContainerSqlite();
    if (!sqlite.open) {
      return false;
    }
    sqlite.prepare('SELECT 1').get();
    return true;
  } catch (error) {
    logger.warn({ error }, 'Database health check failed');
    return false;
  }
}

/**
 * Start periodic health check.
 * Logs a warning if the database becomes unhealthy.
 * Uses Container for interval storage to enable test isolation.
 */
export function startHealthCheckInterval(intervalMs = DEFAULT_HEALTH_CHECK_INTERVAL_MS): void {
  if (containerHasHealthCheckInterval()) return;

  const interval = setInterval(() => {
    if (!isDbHealthy()) {
      logger.warn('Database health check failed');
    }
  }, intervalMs);

  // Do not keep process alive just for this interval
  interval.unref();

  containerSetHealthCheckInterval(interval);
}

export function stopHealthCheckInterval(): void {
  containerClearHealthCheckInterval();
}

/**
 * Get a cached prepared statement or create a new one.
 * Uses LRU cache with automatic eviction when capacity is reached.
 * Uses Container for cache storage to enable test isolation.
 */
export function getPreparedStatement(sql: string): Database.Statement {
  const sqlite = getSqlite();

  // Get from LRU cache or create with factory
  // LRU cache handles eviction automatically when maxSize is exceeded
  const stmt = containerGetPreparedStatement(sql, () => sqlite.prepare(sql));
  if (!stmt) {
    // Should not happen with factory, but TypeScript needs this
    return sqlite.prepare(sql);
  }

  return stmt;
}

/**
 * Run a transaction with explicit sqlite instance (DI pattern)
 *
 * @param sqlite - The better-sqlite3 database instance (optional for PostgreSQL mode)
 * @param fn - The function to run in a transaction
 *
 * In PostgreSQL mode (sqlite undefined), runs the function directly.
 * PostgreSQL transactions are handled by the adapter layer.
 */
export function transactionWithDb<T>(sqlite: Database.Database | undefined, fn: () => T): T {
  if (sqlite) {
    return sqlite.transaction(fn)();
  }
  // PostgreSQL mode: run directly (transactions handled by adapter)
  return fn();
}

// =============================================================================
// TRANSACTION RETRY LOGIC (ADR-007)
// =============================================================================

/**
 * Error codes that indicate transient database contention issues
 * that may succeed on retry.
 */
const RETRYABLE_ERROR_PATTERNS = [
  'SQLITE_BUSY',
  'SQLITE_LOCKED',
  'SQLITE_PROTOCOL',
  'database is locked',
  'database is busy',
];

/**
 * Check if an error is retryable (transient database contention).
 *
 * @param error - The error to check
 * @returns true if the error is retryable
 */
export function isRetryableDbError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const code = 'code' in error ? String(error.code).toUpperCase() : '';

  return RETRYABLE_ERROR_PATTERNS.some(
    (pattern) => message.includes(pattern.toLowerCase()) || code.includes(pattern.toUpperCase())
  );
}

export interface TransactionRetryOptions {
  /** Maximum number of retry attempts (default: config.transaction.maxRetries) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: config.transaction.initialDelayMs) */
  initialDelayMs?: number;
  /** Maximum delay cap in ms (default: config.transaction.maxDelayMs) */
  maxDelayMs?: number;
  /** Backoff multiplier for exponential delay (default: config.transaction.backoffMultiplier) */
  backoffMultiplier?: number;
}

/**
 * Async sleep using setTimeout.
 * Does not block the event loop.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a transaction with exponential backoff retry for transient errors.
 * Handles SQLITE_BUSY, SQLITE_LOCKED, and other database contention issues.
 *
 * **SQLite mode**: Uses better-sqlite3's synchronous transaction() with retry logic.
 * Handles SQLITE_BUSY, SQLITE_LOCKED, and other contention errors.
 *
 * **PostgreSQL mode**: Runs fn() directly without wrapping in a transaction.
 * For PostgreSQL transactions with retry logic, use:
 * - `IStorageAdapter.transaction()` from PostgreSQLStorageAdapter
 *   (includes built-in retry for deadlocks, serialization failures, connection issues)
 *
 * @param sqlite - The better-sqlite3 database instance (undefined for PostgreSQL mode)
 * @param fn - The function to run in a transaction
 * @param options - Retry configuration (defaults from config.transaction)
 * @returns The result of the transaction function
 * @throws The last error if all retries fail
 */
export async function transactionWithRetry<T>(
  sqlite: Database.Database | undefined,
  fn: () => T,
  options?: TransactionRetryOptions
): Promise<T> {
  // PostgreSQL mode: run directly
  // PostgreSQL transactions with retry are handled by IStorageAdapter.transaction()
  if (!sqlite) {
    return fn();
  }

  const maxRetries = options?.maxRetries ?? config.transaction.maxRetries;
  const initialDelay = options?.initialDelayMs ?? config.transaction.initialDelayMs;
  const maxDelay = options?.maxDelayMs ?? config.transaction.maxDelayMs;
  const multiplier = options?.backoffMultiplier ?? config.transaction.backoffMultiplier;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return sqlite.transaction(fn)();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRetryable = isRetryableDbError(error);
      const hasMoreAttempts = attempt <= maxRetries;

      if (!isRetryable || !hasMoreAttempts) {
        logger.warn(
          {
            error: lastError.message,
            attempt,
            maxRetries: maxRetries + 1,
            retryable: isRetryable,
          },
          'Transaction failed'
        );
        throw lastError;
      }

      logger.debug(
        {
          error: lastError.message,
          attempt,
          nextDelayMs: delay,
        },
        'Retrying transaction after transient error'
      );

      await sleep(delay);
      delay = Math.min(delay * multiplier, maxDelay);
    }
  }

  // Should not reach here, but TypeScript needs it
  throw lastError ?? new Error('Transaction failed with unknown error');
}

/**
 * Clear the prepared statement cache.
 * Useful for tests when switching database instances.
 */
export function clearPreparedStatementCache(): void {
  containerClearPreparedStatementCache();
}

export { schema };
export type DbClient = AppDb;

// =============================================================================
// CONTAINER RE-EXPORTS
// =============================================================================

// Re-export container functions for convenience (including registerDatabase for tests)
export { resetContainer, isContainerInitialized, registerDatabase } from '../core/container.js';
