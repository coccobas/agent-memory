import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.js';
import { initializeDatabase } from './init.js';
import { createComponentLogger } from '../utils/logger.js';
import { toLongPath, normalizePath } from '../utils/paths.js';
import type { Config } from '../config/index.js';
import type { AppDb } from '../core/types.js';
import type { Pool } from 'pg';
import type { PostgreSQLStorageAdapter } from '../core/adapters/postgresql.adapter.js';

const logger = createComponentLogger('db-factory');

/**
 * SQLite database connection result
 */
export interface SQLiteConnection {
  type: 'sqlite';
  db: AppDb;
  sqlite: Database.Database;
}

/**
 * PostgreSQL database connection result
 */
export interface PostgreSQLConnection {
  type: 'postgresql';
  adapter: PostgreSQLStorageAdapter;
  pool: Pool;
}

/**
 * Discriminated union of database connections
 */
export type DatabaseConnection = SQLiteConnection | PostgreSQLConnection;

/**
 * Factory to create a new database connection based on configuration.
 * Returns a discriminated union based on dbType.
 */
export async function createDatabaseConnection(configuration: Config): Promise<DatabaseConnection> {
  if (configuration.dbType === 'postgresql') {
    return createPostgreSQLConnection(configuration);
  }
  return createSQLiteConnection(configuration);
}

/**
 * Create a SQLite database connection
 */
async function createSQLiteConnection(configuration: Config): Promise<SQLiteConnection> {
  const dbPath = toLongPath(normalizePath(configuration.database.path));

  // Ensure data directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let sqlite: Database.Database;

  // Create SQLite connection with WAL mode for better concurrency
  try {
    sqlite = new Database(dbPath, {
      readonly: false,
      timeout: configuration.database.busyTimeoutMs,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for common native module errors
    if (errorMessage.includes('MODULE_NOT_FOUND') || errorMessage.includes('Cannot find module')) {
      throw new Error(
        `Failed to load better-sqlite3 native module.\n` +
          `Error: ${errorMessage}\n\n` +
          `This is usually caused by:\n` +
          `1. Missing native bindings for your platform (${process.platform}/${process.arch})
` +
          `2. Node.js version mismatch (currently ${process.version})
` +
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
  sqlite.pragma('journal_mode = WAL');

  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  // Wait for locks instead of failing fast (important for multi-process startup and migrations)
  sqlite.pragma(`busy_timeout = ${configuration.database.busyTimeoutMs}`);

  // Auto-initialize database schema if not already done
  if (!configuration.database.skipInit) {
    const result = initializeDatabase(sqlite, { verbose: configuration.database.verbose });

    if (!result.success) {
      logger.error({ errors: result.errors }, 'Database initialization failed');
      throw new Error(`Database initialization failed: ${result.errors.join(', ')}`);
    }

    if (configuration.database.verbose && result.migrationsApplied.length > 0) {
      logger.info(
        { migrations: result.migrationsApplied, count: result.migrationsApplied.length },
        'Applied migrations'
      );
    }
  }

  const db = drizzle(sqlite, { schema });
  return { type: 'sqlite', db, sqlite };
}

/**
 * Create a PostgreSQL database connection
 */
async function createPostgreSQLConnection(configuration: Config): Promise<PostgreSQLConnection> {
  // Dynamic import to avoid loading pg when using SQLite
  const { PostgreSQLStorageAdapter } = await import('../core/adapters/postgresql.adapter.js');

  const adapter = new PostgreSQLStorageAdapter(configuration.postgresql);
  await adapter.connect();

  // Run PostgreSQL migrations if not skipping init
  if (!configuration.database.skipInit) {
    await runPostgreSQLMigrations(adapter, configuration.database.verbose);
  }

  const pool = adapter.getRawConnection();
  logger.info({ host: configuration.postgresql.host, database: configuration.postgresql.database }, 'Connected to PostgreSQL');

  return { type: 'postgresql', adapter, pool };
}

/**
 * Run PostgreSQL migrations from the migrations/postgresql directory
 */
async function runPostgreSQLMigrations(adapter: PostgreSQLStorageAdapter, verbose: boolean): Promise<void> {
  const { readFileSync, readdirSync, existsSync: fsExistsSync } = await import('node:fs');
  const { join, dirname: pathDirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  // Get the migrations directory path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = pathDirname(__filename);
  const migrationsDir = join(__dirname, 'migrations', 'postgresql');

  if (!fsExistsSync(migrationsDir)) {
    logger.warn({ migrationsDir }, 'PostgreSQL migrations directory not found');
    return;
  }

  // Create migrations tracking table if it doesn't exist
  await adapter.executeRaw(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get already applied migrations
  const applied = await adapter.executeRaw<{ name: string }>('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.map((m) => m.name));

  // Get all migration files sorted by name
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const migrationsApplied: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');

    try {
      await adapter.executeRaw(sql);
      await adapter.executeRaw('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      migrationsApplied.push(file);
    } catch (error) {
      logger.error({ file, error }, 'PostgreSQL migration failed');
      throw new Error(`PostgreSQL migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (verbose && migrationsApplied.length > 0) {
    logger.info({ migrations: migrationsApplied, count: migrationsApplied.length }, 'Applied PostgreSQL migrations');
  }
}
