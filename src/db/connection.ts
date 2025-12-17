/**
 * Database connection module for Agent Memory
 *
 * Database connection management
 * Manages SQLite connection singleton with health checks
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initializeDatabase } from './init.js';
import { createComponentLogger } from '../utils/logger.js';
import { toLongPath, normalizePath } from '../utils/paths.js';
import { config } from '../config/index.js';

const logger = createComponentLogger('connection');

// =============================================================================
// CONSTANTS FROM CONFIG
// =============================================================================

const MAX_PREPARED_STATEMENTS = config.cache.maxPreparedStatements;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = config.health.checkIntervalMs;
const DEFAULT_DB_PATH = toLongPath(normalizePath(config.database.path));

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;
let isInitialized = false;

// Cache for prepared statements with LRU eviction
const preparedStatementCache = new Map<string, Database.Statement>();

export interface ConnectionOptions {
  dbPath?: string;
  readonly?: boolean;
  skipInit?: boolean;
}

/**
 * Get or create the database connection
 */
export function getDb(options: ConnectionOptions = {}): ReturnType<typeof drizzle> {
  const dbPath = options.dbPath ?? DEFAULT_DB_PATH;

  if (dbInstance) {
    return dbInstance;
  }

  // Ensure data directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Create SQLite connection with WAL mode for better concurrency
  try {
    sqliteInstance = new Database(dbPath, {
      readonly: options.readonly ?? false,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for common native module errors
    if (errorMessage.includes('MODULE_NOT_FOUND') || errorMessage.includes('Cannot find module')) {
      throw new Error(
        `Failed to load better-sqlite3 native module.\n` +
          `Error: ${errorMessage}\n\n` +
          `This is usually caused by:\n` +
          `1. Missing native bindings for your platform (${process.platform}/${process.arch})\n` +
          `2. Node.js version mismatch (currently ${process.version})\n` +
          `3. Architecture mismatch\n\n` +
          `Solutions:\n` +
          `- Run: npm rebuild better-sqlite3\n` +
          `- Or reinstall: npm install --force better-sqlite3`
      );
    }

    // Re-throw with additional context
    throw new Error(`Failed to create database connection: ${errorMessage}`);
  }

  // Enable WAL mode for better concurrent access
  sqliteInstance.pragma('journal_mode = WAL');

  // Enable foreign keys
  sqliteInstance.pragma('foreign_keys = ON');

  // Auto-initialize database schema if not already done
  const shouldSkipInit = options.skipInit ?? config.database.skipInit;
  if (!shouldSkipInit && !isInitialized && !options.readonly) {
    const result = initializeDatabase(sqliteInstance, { verbose: config.database.verbose });

    if (!result.success) {
      logger.error({ errors: result.errors }, 'Database initialization failed');
      throw new Error(`Database initialization failed: ${result.errors.join(', ')}`);
    }

    if (config.database.verbose && result.migrationsApplied.length > 0) {
      logger.info(
        { migrations: result.migrationsApplied, count: result.migrationsApplied.length },
        'Applied migrations'
      );
    }

    isInitialized = true;
  }

  // Create Drizzle instance with schema
  dbInstance = drizzle(sqliteInstance, { schema });

  return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
    isInitialized = false; // Reset initialization flag
    preparedStatementCache.clear();
    stopHealthCheckInterval();
  }
}

/**
 * Get the raw SQLite instance for direct operations
 */
export function getSqlite(): Database.Database {
  if (!sqliteInstance) {
    getDb(); // Initialize if not already done
  }
  if (!sqliteInstance) {
    throw new Error('Failed to initialize database connection');
  }
  return sqliteInstance;
}

/**
 * Check if the database connection is healthy
 */
export function isDbHealthy(): boolean {
  if (!sqliteInstance || !sqliteInstance.open) {
    return false;
  }
  try {
    sqliteInstance.prepare('SELECT 1').get();
    return true;
  } catch (error) {
    logger.warn({ error }, 'Database health check failed');
    return false;
  }
}

const MAX_RECONNECT_ATTEMPTS = config.health.maxReconnectAttempts;
const RECONNECT_BASE_DELAY_MS = config.health.reconnectBaseDelayMs;
const RECONNECT_MAX_DELAY_MS = config.health.reconnectMaxDelayMs;

/**
 * Attempt to reconnect to the database with exponential backoff
 * Uses iterative approach to avoid stack overflow risk
 */
export async function attemptReconnect(options: ConnectionOptions = {}): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    logger.info(
      { attempt, maxAttempts: MAX_RECONNECT_ATTEMPTS },
      'Attempting to reconnect to database...'
    );

    try {
      closeDb();

      // Wait briefly before reconnecting (exponential backoff)
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1),
        RECONNECT_MAX_DELAY_MS
      );
      await new Promise((resolve) => setTimeout(resolve, delay));

      getDb(options);

      if (isDbHealthy()) {
        logger.info({ attempt }, 'Successfully reconnected to database');
        return true;
      }

      logger.warn({ attempt }, 'Reconnect succeeded but health check failed');
    } catch (error) {
      logger.error({ error, attempt }, 'Reconnect attempt failed');
    }
  }

  logger.error(
    { maxAttempts: MAX_RECONNECT_ATTEMPTS },
    'Max reconnect attempts reached, giving up'
  );
  return false;
}

/**
 * Get DB instance ensuring it is healthy
 */
export async function getDbWithHealthCheck(
  options: ConnectionOptions = {}
): Promise<ReturnType<typeof drizzle>> {
  if (!isDbHealthy()) {
    const reconnected = await attemptReconnect(options);
    if (!reconnected) {
      throw new Error('Database connection failed and could not reconnect');
    }
  }
  return getDb(options);
}

let healthCheckInterval: NodeJS.Timeout | null = null;

export function startHealthCheckInterval(intervalMs = DEFAULT_HEALTH_CHECK_INTERVAL_MS): void {
  if (healthCheckInterval) return;

  healthCheckInterval = setInterval(() => {
    if (!isDbHealthy()) {
      logger.warn('Background health check failed, triggering reconnect');
      attemptReconnect().catch((err) => {
        logger.error({ error: err }, 'Background reconnect failed');
      });
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
 * Run a transaction
 */
export function transaction<T>(fn: () => T): T {
  const sqlite = getSqlite();
  return sqlite.transaction(fn)();
}

export { schema };
export type DbClient = ReturnType<typeof drizzle>;
