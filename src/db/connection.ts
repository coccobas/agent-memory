/**
 * Database connection module for Agent Memory
 *
 * Environment Variables:
 * - AGENT_MEMORY_DB_PATH: Custom database file path (optional, defaults to data/memory.db)
 * - AGENT_MEMORY_PERF: Enable performance logging (set to '1' to enable)
 * - AGENT_MEMORY_CACHE: Enable query result caching (set to '0' to disable, enabled by default)
 * - AGENT_MEMORY_SKIP_INIT: Skip automatic database initialization (set to '1' to skip)
 *
 * Semantic Search Environment Variables:
 * - AGENT_MEMORY_EMBEDDING_PROVIDER: 'openai' | 'local' | 'disabled' (default: 'openai')
 * - AGENT_MEMORY_OPENAI_API_KEY: OpenAI API key (required for OpenAI provider)
 * - AGENT_MEMORY_OPENAI_MODEL: OpenAI embedding model (default: 'text-embedding-3-small')
 * - AGENT_MEMORY_VECTOR_DB_PATH: Path to vector database (default: 'data/vectors.lance')
 * - AGENT_MEMORY_SEMANTIC_THRESHOLD: Default similarity threshold 0-1 (default: 0.7)
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from './init.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('db');

// Get the directory of the current module (works in both src and dist)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Resolve data path relative to project root (go up from src/db or dist/db to project root)
const projectRoot = resolve(__dirname, '../..');
const DEFAULT_DB_PATH = process.env.AGENT_MEMORY_DB_PATH || resolve(projectRoot, 'data/memory.db');

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;
let isInitialized = false;

// Cache for prepared statements
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
  const shouldSkipInit = options.skipInit ?? process.env.AGENT_MEMORY_SKIP_INIT === '1';
  if (!shouldSkipInit && !isInitialized && !options.readonly) {
    const verbose = process.env.AGENT_MEMORY_PERF === '1';
    const result = initializeDatabase(sqliteInstance, { verbose });

    if (!result.success) {
      logger.error({ errors: result.errors }, 'Database initialization failed');
      throw new Error(`Database initialization failed: ${result.errors.join(', ')}`);
    }

    if (verbose && result.migrationsApplied.length > 0) {
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
    sqliteInstance = null;
    dbInstance = null;
    isInitialized = false; // Reset initialization flag
    preparedStatementCache.clear();
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
 * Get a cached prepared statement or create a new one
 */
export function getPreparedStatement(sql: string): Database.Statement {
  const sqlite = getSqlite();

  let stmt = preparedStatementCache.get(sql);
  if (!stmt) {
    stmt = sqlite.prepare(sql);
    preparedStatementCache.set(sql, stmt);
  }

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
