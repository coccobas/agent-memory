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

const logger = createComponentLogger('db-factory');

/**
 * Factory to create a new database connection (for DI container)
 */
export async function createDatabaseConnection(
  configuration: Config
): Promise<{ db: AppDb; sqlite: Database.Database }> {
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
  return { db, sqlite };
}
