/**
 * Full-Text Search Service Factory
 *
 * Provides a factory function to create the appropriate FTS service
 * based on the database type (SQLite or PostgreSQL).
 */

import type Database from 'better-sqlite3';
import type { Pool } from 'pg';
import type { IFTSService } from './interfaces.js';
import { createSQLiteFTSService } from './sqlite-fts.service.js';
import { createPostgreSQLFTSService } from './postgresql-fts.service.js';
import { createValidationError } from '../../core/errors.js';

// Re-export interfaces and types
export type { IFTSService, FTSResult, FTSSearchOptions, FTSDatabaseType } from './interfaces.js';

// Re-export implementations
export { SQLiteFTSService, createSQLiteFTSService } from './sqlite-fts.service.js';
export { PostgreSQLFTSService, createPostgreSQLFTSService } from './postgresql-fts.service.js';

/**
 * Dependencies for creating an FTS service.
 */
export type FTSServiceDeps =
  | { dbType: 'sqlite'; sqlite: Database.Database }
  | { dbType: 'postgresql'; pool: Pool };

/**
 * Create an FTS service based on the database type.
 *
 * @param deps - Dependencies including database type and connection
 * @returns Appropriate FTS service implementation
 */
export function createFTSService(deps: FTSServiceDeps): IFTSService {
  switch (deps.dbType) {
    case 'sqlite':
      return createSQLiteFTSService(deps.sqlite);
    case 'postgresql':
      return createPostgreSQLFTSService(deps.pool);
    default: {
      // Exhaustive check
      const _exhaustive: never = deps;
      throw createValidationError('dbType', `Unknown database type: ${JSON.stringify(_exhaustive)}`, 'Use either sqlite or postgresql');
    }
  }
}

/**
 * Legacy helper functions for backwards compatibility.
 * These delegate to the singleton FTS service when available.
 */

// Note: These are kept for backwards compatibility with existing code
// that imports from fts.service.ts. New code should use IFTSService directly.

/**
 * Escape query string for FTS5 - preserves structure.
 * @deprecated Use IFTSService.escapeQuery() instead
 */
export function escapeFts5Query(query: string): string {
  let escaped = query.replace(/"/g, '""');
  if (/[\s+\-|*()]/.test(escaped)) {
    escaped = `"${escaped}"`;
  }
  return escaped;
}

/**
 * Simple FTS5 quote escaping.
 * @deprecated Use IFTSService.escapeQuery() instead
 */
export function escapeFts5Quotes(query: string): string {
  return query.replace(/"/g, '""');
}

/**
 * Escape query string for FTS5 MATCH - tokenized mode.
 * @deprecated Use IFTSService.escapeQuery() instead
 */
export function escapeFts5QueryTokenized(input: string): string {
  return input
    .replace(/["*]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
}
