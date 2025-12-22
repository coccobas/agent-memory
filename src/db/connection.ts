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
  return getDatabase() as AppDb;
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
