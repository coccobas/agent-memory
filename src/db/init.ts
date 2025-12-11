/**
 * Database initialization and migration module
 *
 * Handles automatic schema setup and migration tracking to ensure
 * the database is always in a valid state when the server starts.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('init');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}

export interface InitResult {
  success: boolean;
  alreadyInitialized: boolean;
  migrationsApplied: string[];
  errors: string[];
}

/**
 * Create the migrations tracking table if it doesn't exist
 */
function ensureMigrationTable(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
}

/**
 * Get list of applied migrations
 */
function getAppliedMigrations(sqlite: Database.Database): Set<string> {
  ensureMigrationTable(sqlite);

  const rows = sqlite.prepare('SELECT name FROM _migrations ORDER BY id').all() as {
    name: string;
  }[];
  return new Set(rows.map((r) => r.name));
}

/**
 * Mark a migration as applied
 */
function recordMigration(sqlite: Database.Database, name: string): void {
  sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
}

/**
 * Get all migration files from the migrations directory
 */
function getMigrationFiles(): Array<{ name: string; path: string; order: number }> {
  // Try multiple locations to find migrations
  // 1. From dist/db/ -> look in src/db/migrations/ (production)
  // 2. From src/db/ -> look in src/db/migrations/ (development)
  const possiblePaths = [
    resolve(__dirname, 'migrations'), // Same directory (src/db/migrations or dist/db/migrations)
    resolve(__dirname, '../../src/db/migrations'), // From dist/db/ to src/db/migrations/
    resolve(__dirname, '../db/migrations'), // From src/ to src/db/migrations/
  ];

  let migrationsDir: string | undefined;
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      migrationsDir = path;
      break;
    }
  }

  if (!migrationsDir) {
    return [];
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.includes('snapshot'))
    .sort(); // Natural sort ensures 0000_, 0001_, etc. are in order

  return files.map((file, idx) => ({
    name: file,
    path: resolve(migrationsDir, file),
    order: idx,
  }));
}

/**
 * Check if database is initialized (has any tables besides _migrations)
 */
function isDatabaseInitialized(sqlite: Database.Database): boolean {
  try {
    const tables = sqlite
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%' 
      AND name != '_migrations'
    `
      )
      .all() as { name: string }[];

    return tables.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Apply a single migration file
 */
function applyMigration(sqlite: Database.Database, name: string, path: string, options: { force?: boolean; verbose?: boolean } = {}): void {
  const sql = readFileSync(path, 'utf-8');

  // Split by statement-breakpoint comments that drizzle-kit generates
  const rawStatements = sql.split(/-->\s*statement-breakpoint/i);

  // Process each statement: remove leading comments but keep the SQL
  const statements: string[] = [];
  for (const rawStmt of rawStatements) {
    const trimmed = rawStmt.trim();
    if (!trimmed) continue;

    // Remove leading comment lines but keep the actual SQL
    const lines = trimmed.split('\n');
    const sqlLines: string[] = [];
    let foundSql = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('--') && !foundSql) {
        // Skip leading comments
        continue;
      }
      foundSql = true;
      sqlLines.push(line);
    }

    const finalStatement = sqlLines.join('\n').trim();
    if (finalStatement) {
      statements.push(finalStatement);
    }
  }

  // Execute each statement with error handling
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!statement || !statement.trim()) continue;

    try {
      sqlite.exec(statement);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if it's an "already exists" error that we can safely ignore
      const isAlreadyExistsError = 
        errorMessage.includes('already exists') ||
        errorMessage.includes('duplicate column name') ||
        errorMessage.includes('UNIQUE constraint failed: _migrations.name');
      
      // Check if it's a "table doesn't exist" error for DROP/ALTER operations
      const isTableNotExistsError = 
        errorMessage.includes('no such table') ||
        errorMessage.includes('no such column');
      
      // For DROP TABLE, INSERT INTO, or ALTER operations, "table doesn't exist" might be okay
      const isDropOrInsert = statement.trim().toUpperCase().startsWith('DROP') ||
                            statement.trim().toUpperCase().startsWith('INSERT') ||
                            statement.trim().toUpperCase().startsWith('ALTER');
      
      if (isAlreadyExistsError || (isTableNotExistsError && isDropOrInsert)) {
        // Log but continue - this is expected in some scenarios (force mode, partial migrations)
        if (options.verbose) {
          logger.warn({ migration: name, statement: i, error: errorMessage }, 'Skipping statement (object already exists or doesn\'t exist)');
        }
        continue;
      }
      
      // For other errors, re-throw
      throw error;
    }
  }

  // Record migration, but handle the case where it's already recorded
  // This can happen if a migration was partially applied before
  try {
    recordMigration(sqlite, name);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // If migration is already recorded, that's okay - skip silently
    if (errorMessage.includes('UNIQUE constraint failed: _migrations.name')) {
      if (options.verbose) {
        logger.warn({ migration: name }, 'Migration already recorded, skipping');
      }
      // Migration already recorded, which is fine
      return;
    }
    // For other errors, re-throw
    throw error;
  }
}

/**
 * Initialize the database with all pending migrations
 *
 * This function is idempotent and safe to call multiple times.
 * It will only apply migrations that haven't been applied yet.
 */
export function initializeDatabase(
  sqlite: Database.Database,
  options: { force?: boolean; verbose?: boolean } = {}
): InitResult {
  const result: InitResult = {
    success: false,
    alreadyInitialized: false,
    migrationsApplied: [],
    errors: [],
  };

  try {
    // Check if already initialized
    const wasInitialized = isDatabaseInitialized(sqlite);
    result.alreadyInitialized = wasInitialized && !options.force;

    // Get migration state
    const appliedMigrations = getAppliedMigrations(sqlite);
    const migrationFiles = getMigrationFiles();

    if (migrationFiles.length === 0) {
      result.errors.push('No migration files found in src/db/migrations/');
      return result;
    }

    // Filter to only pending migrations
    const pendingMigrations = options.force
      ? migrationFiles
      : migrationFiles.filter((m) => !appliedMigrations.has(m.name));

    if (pendingMigrations.length === 0 && wasInitialized) {
      if (options.verbose) {
        logger.info('Database already initialized, no pending migrations');
      }
      result.success = true;
      result.alreadyInitialized = true;
      return result;
    }

    // Apply migrations in a transaction
    sqlite.transaction(() => {
      for (const migration of pendingMigrations) {
        if (options.verbose) {
          logger.info({ migration: migration.name }, 'Applying migration');
        }

        applyMigration(sqlite, migration.name, migration.path, options);
        result.migrationsApplied.push(migration.name);
      }
    })();

    result.success = true;

    if (options.verbose) {
      logger.info({ count: result.migrationsApplied.length }, 'Database initialized successfully');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(message);

    if (options.verbose) {
      logger.error({ error: message }, 'Database initialization failed');
    }
  }

  return result;
}

/**
 * Get current migration status
 */
export function getMigrationStatus(sqlite: Database.Database): {
  initialized: boolean;
  appliedMigrations: string[];
  pendingMigrations: string[];
  totalMigrations: number;
} {
  const initialized = isDatabaseInitialized(sqlite);
  const appliedMigrations = Array.from(getAppliedMigrations(sqlite));
  const allMigrations = getMigrationFiles().map((m) => m.name);
  const pendingMigrations = allMigrations.filter((m) => !appliedMigrations.includes(m));

  return {
    initialized,
    appliedMigrations,
    pendingMigrations,
    totalMigrations: allMigrations.length,
  };
}

/**
 * Reset database (drops all tables and re-initializes)
 * USE WITH CAUTION - This will delete all data!
 */
export function resetDatabase(
  sqlite: Database.Database,
  options: { verbose?: boolean } = {}
): InitResult {
  try {
    if (options.verbose) {
      logger.info('Resetting database...');
    }

    // Get all tables
    const tables = sqlite
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
    `
      )
      .all() as { name: string }[];

    // Disable foreign key checks temporarily to allow dropping tables in any order
    sqlite.pragma('foreign_keys = OFF');

    // Drop all tables
    for (const table of tables) {
      sqlite.exec(`DROP TABLE IF EXISTS ${table.name}`);
    }

    // Re-enable foreign key checks
    sqlite.pragma('foreign_keys = ON');

    // Re-initialize
    return initializeDatabase(sqlite, { ...options, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      alreadyInitialized: false,
      migrationsApplied: [],
      errors: [message],
    };
  }
}
