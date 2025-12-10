/**
 * Database connection module for Agent Memory
 *
 * Environment Variables:
 * - AGENT_MEMORY_DB_PATH: Custom database file path (optional, defaults to data/memory.db)
 * - AGENT_MEMORY_PERF: Enable performance logging (set to '1' to enable)
 * - AGENT_MEMORY_CACHE: Enable query result caching (set to '0' to disable, enabled by default)
 * - AGENT_MEMORY_SKIP_INIT: Skip automatic database initialization (set to '1' to skip)
 */
/* eslint-disable no-console */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from './init.js';

// Get the directory of the current module (works in both src and dist)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Resolve data path relative to project root (go up from src/db or dist/db to project root)
const projectRoot = resolve(__dirname, '../..');
const DEFAULT_DB_PATH = process.env.AGENT_MEMORY_DB_PATH || resolve(projectRoot, 'data/memory.db');

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;
let isInitialized = false;

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
  sqliteInstance = new Database(dbPath, {
    readonly: options.readonly ?? false,
  });

  // Enable WAL mode for better concurrent access
  sqliteInstance.pragma('journal_mode = WAL');

  // Enable foreign keys
  sqliteInstance.pragma('foreign_keys = ON');

  // Auto-initialize database schema if not already done
  const shouldSkipInit = options.skipInit ?? process.env.AGENT_MEMORY_SKIP_INIT === '1';
  if (!shouldSkipInit && !isInitialized && !options.readonly) {
    const verbose = process.env.AGENT_MEMORY_PERF === '1';
    const result = initializeDatabase(sqliteInstance, { verbose });

    if (!result.success) {
      console.error('[db] Database initialization failed:', result.errors);
      throw new Error(`Database initialization failed: ${result.errors.join(', ')}`);
    }

    if (verbose && result.migrationsApplied.length > 0) {
      console.log(
        `[db] Applied ${result.migrationsApplied.length} migration(s):`,
        result.migrationsApplied
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
 * Run a transaction
 */
export function transaction<T>(fn: () => T): T {
  const sqlite = getSqlite();
  return sqlite.transaction(fn)();
}

export { schema };
export type DbClient = ReturnType<typeof drizzle>;
