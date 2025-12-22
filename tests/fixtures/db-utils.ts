/**
 * Database Utilities for Tests
 *
 * Shared utilities for database setup and cleanup in tests.
 */

import { existsSync, unlinkSync, mkdirSync } from 'node:fs';

/**
 * Clean up SQLite database files including WAL and SHM files.
 *
 * @param dbPath - Path to the main database file
 */
export function cleanupDbFiles(dbPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const path = `${dbPath}${suffix}`;
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        // Ignore errors (file may be locked or already deleted)
      }
    }
  }
}

/**
 * Ensure a directory exists, creating it if necessary.
 *
 * @param dir - Directory path to ensure exists
 */
export function ensureDirectory(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Ensure the data directory exists for test databases.
 * Default path is './data'
 *
 * @param subdir - Optional subdirectory under ./data
 */
export function ensureDataDirectory(subdir?: string): void {
  const dir = subdir ? `./data/${subdir}` : './data';
  ensureDirectory(dir);
}
