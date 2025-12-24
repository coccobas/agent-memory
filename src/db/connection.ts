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
import {
  isDatabaseInitialized,
  getDatabase,
  getSqlite as getContainerSqlite,
  clearDatabaseRegistration,
} from '../core/container.js';

const logger = createComponentLogger('connection');

// =============================================================================
// CONSTANTS FROM CONFIG
// =============================================================================

const MAX_PREPARED_STATEMENTS = config.cache.maxPreparedStatements;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = config.health.checkIntervalMs;

// Cache for prepared statements with LRU eviction
const preparedStatementCache = new Map<string, Database.Statement>();

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
    throw new Error('Database not initialized. Call createAppContext() first.');
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
    preparedStatementCache.clear();
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
    throw new Error('Database not initialized. Call createAppContext() first.');
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

let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic health check.
 * Logs a warning if the database becomes unhealthy.
 */
export function startHealthCheckInterval(intervalMs = DEFAULT_HEALTH_CHECK_INTERVAL_MS): void {
  if (healthCheckInterval) return;

  healthCheckInterval = setInterval(() => {
    if (!isDbHealthy()) {
      logger.warn('Database health check failed');
    }
  }, intervalMs);

  // Do not keep process alive just for this interval
  healthCheckInterval.unref();
}

export function stopHealthCheckInterval(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

/**
 * Get a cached prepared statement or create a new one
 * Implements LRU eviction when cache exceeds MAX_PREPARED_STATEMENTS
 */
export function getPreparedStatement(sql: string): Database.Statement {
  const sqlite = getSqlite();

  let stmt = preparedStatementCache.get(sql);
  if (stmt) {
    // Move to end of Map to mark as recently used (LRU)
    preparedStatementCache.delete(sql);
    preparedStatementCache.set(sql, stmt);
    return stmt;
  }

  // Create new prepared statement
  stmt = sqlite.prepare(sql);

  // Evict oldest entry if cache is full (LRU eviction)
  if (preparedStatementCache.size >= MAX_PREPARED_STATEMENTS) {
    // First entry in Map is the least recently used
    const firstKey = preparedStatementCache.keys().next().value;
    if (firstKey) {
      preparedStatementCache.delete(firstKey);
      // Note: better-sqlite3 statements don't need explicit cleanup
      // They are cleaned up when the database connection closes
    }
  }

  preparedStatementCache.set(sql, stmt);
  return stmt;
}

/**
 * Run a transaction with explicit sqlite instance (DI pattern)
 *
 * @param sqlite - The better-sqlite3 database instance
 * @param fn - The function to run in a transaction
 */
export function transactionWithDb<T>(sqlite: Database.Database, fn: () => T): T {
  return sqlite.transaction(fn)();
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
 * Synchronous sleep using a busy-wait loop.
 * Note: This blocks the event loop but is acceptable for short database contention scenarios.
 */
function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy wait - necessary for synchronous SQLite context
  }
}

/**
 * Run a transaction with exponential backoff retry for transient errors.
 * Handles SQLITE_BUSY, SQLITE_LOCKED, and other database contention issues.
 *
 * @param sqlite - The better-sqlite3 database instance
 * @param fn - The function to run in a transaction
 * @param options - Retry configuration (defaults from config.transaction)
 * @returns The result of the transaction function
 * @throws The last error if all retries fail
 */
export function transactionWithRetry<T>(
  sqlite: Database.Database,
  fn: () => T,
  options?: TransactionRetryOptions
): T {
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

      sleepSync(delay);
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
  preparedStatementCache.clear();
}

export { schema };
export type DbClient = AppDb;

// =============================================================================
// CONTAINER RE-EXPORTS
// =============================================================================

// Re-export container functions for convenience (including registerDatabase for tests)
export { resetContainer, isContainerInitialized, registerDatabase } from '../core/container.js';
