/**
 * Migration Loader Utility
 *
 * Dynamically discovers and applies database migrations.
 * This eliminates the need for hardcoded migration lists in test setup.
 */

import type Database from 'better-sqlite3';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Get the path to the migrations directory
 */
export function getMigrationsDir(): string {
  return join(process.cwd(), 'src/db/migrations');
}

/**
 * Discover all migration files in the migrations directory.
 * Files are sorted alphanumerically to ensure correct order (0000_, 0001_, etc.)
 *
 * @returns Array of migration filenames sorted in order
 */
export function getMigrationFiles(): string[] {
  const migrationsDir = getMigrationsDir();
  if (!existsSync(migrationsDir)) {
    return [];
  }

  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // Alphanumeric sort ensures 0000, 0001, ... order
}

/**
 * Apply all migrations to a SQLite database instance.
 * Splits each migration file on '--> statement-breakpoint' delimiters.
 *
 * @param sqlite - The better-sqlite3 database instance
 */
export function applyMigrations(sqlite: Database.Database): void {
  const migrationsDir = getMigrationsDir();
  const migrations = getMigrationFiles();

  for (const migrationFile of migrations) {
    const migrationPath = join(migrationsDir, migrationFile);
    if (existsSync(migrationPath)) {
      const migrationSql = readFileSync(migrationPath, 'utf-8');
      const statements = migrationSql.split('--> statement-breakpoint');
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed) {
          sqlite.exec(trimmed);
        }
      }
    }
  }
}
