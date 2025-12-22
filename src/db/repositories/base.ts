import { v4 as uuidv4 } from 'uuid';
import { eq, and, or, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  entryTags,
  entryRelations,
  entryEmbeddings,
  permissions,
  conflictLog,
  type EntryType,
} from '../schema.js';
import { createComponentLogger } from '../../utils/logger.js';

/**
 * Database type alias for explicit DI in repository methods
 */
export type DrizzleDb = BetterSQLite3Database<any>;

const logger = createComponentLogger('repository-base');

/**
 * Generate a new UUID
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Get current ISO timestamp
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Base interface for scope-aware queries
 */
export interface ScopeFilter {
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  inherit?: boolean;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Standard response metadata
 */
export interface ResponseMeta {
  totalCount: number;
  returnedCount: number;
  truncated: boolean;
  hasMore: boolean;
  nextCursor?: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: ResponseMeta;
}

/**
 * Default limit for queries
 */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Conflict detection window in milliseconds
 */
export const CONFLICT_WINDOW_MS = 5000;

/**
 * Default file lock timeout in seconds (1 hour)
 */
export const DEFAULT_LOCK_TIMEOUT_SECONDS = 3600;

/**
 * Maximum file lock timeout in seconds (24 hours)
 */
export const MAX_LOCK_TIMEOUT_SECONDS = 86400;

// =============================================================================
// SHARED REPOSITORY HELPERS
// =============================================================================

/**
 * Entry types that support cascade delete and relations
 * Excludes 'project' as it has different handling
 */
export type CascadeEntryType = 'tool' | 'guideline' | 'knowledge';

/**
 * Delete all related records for an entry (tags, relations, embeddings, permissions)
 * This is the common cascade cleanup logic used before deleting an entry.
 *
 * @param db - The database connection (explicit DI)
 * @param entryType - The type of entry ('tool', 'guideline', 'knowledge')
 * @param entryId - The ID of the entry being deleted
 */
export function cascadeDeleteRelatedRecordsWithDb(
  db: DrizzleDb,
  entryType: CascadeEntryType,
  entryId: string
): void {
  // 1. Delete tags associated with this entry
  db.delete(entryTags)
    .where(and(eq(entryTags.entryType, entryType), eq(entryTags.entryId, entryId)))
    .run();

  // 2. Delete relations where this entry is source or target
  db.delete(entryRelations)
    .where(
      or(
        and(eq(entryRelations.sourceType, entryType), eq(entryRelations.sourceId, entryId)),
        and(eq(entryRelations.targetType, entryType), eq(entryRelations.targetId, entryId))
      )
    )
    .run();

  // 3. Delete embedding tracking records
  db.delete(entryEmbeddings)
    .where(and(eq(entryEmbeddings.entryType, entryType), eq(entryEmbeddings.entryId, entryId)))
    .run();

  // 4. Delete entry-specific permissions
  db.delete(permissions)
    .where(and(eq(permissions.entryType, entryType), eq(permissions.entryId, entryId)))
    .run();
}

/**
 * Async fire-and-forget vector embedding cleanup
 * Used after deactivating or deleting an entry.
 *
 * @param entryType - The type of entry
 * @param entryId - The ID of the entry
 */
export type VectorCleanupHook = (entryType: EntryType, entryId: string) => Promise<void>;

let vectorCleanupHook: VectorCleanupHook | null = null;

/**
 * Register a cleanup hook for vector DB data.
 *
 * This keeps repository code DB-focused while allowing service-layer integrations
 * (like vector storage) to subscribe to lifecycle events.
 */
export function registerVectorCleanupHook(hook: VectorCleanupHook | null): void {
  vectorCleanupHook = hook;
}

export function asyncVectorCleanup(entryType: EntryType, entryId: string): void {
  if (!vectorCleanupHook) return;
  vectorCleanupHook(entryType, entryId).catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), entryType, entryId },
      'Vector cleanup failed'
    );
  });
}

/**
 * Check for concurrent write conflict and log if detected
 *
 * @param db - The database connection (explicit DI)
 * @param entryType - The type of entry
 * @param entryId - The ID of the entry
 * @param previousVersionId - The ID of the previous version
 * @param newVersionId - The ID of the new version being created
 * @param lastWriteTime - Timestamp of the last write (from previousVersion.createdAt)
 * @returns true if a conflict was detected
 */
export function checkAndLogConflictWithDb(
  db: DrizzleDb,
  entryType: CascadeEntryType,
  entryId: string,
  previousVersionId: string,
  newVersionId: string,
  lastWriteTime: Date
): boolean {
  const currentTime = Date.now();
  const lastTime = lastWriteTime.getTime();

  if (currentTime - lastTime < CONFLICT_WINDOW_MS) {
    db.insert(conflictLog)
      .values({
        id: generateId(),
        entryType,
        entryId,
        versionAId: previousVersionId,
        versionBId: newVersionId,
      })
      .run();
    return true;
  }

  return false;
}

/**
 * Type for version tables (any table with an id column)
 */
export type VersionTable = { id: { name: string } };

/**
 * Batch fetch versions by IDs and return a Map for efficient lookup.
 * Generic helper to avoid N+1 queries when listing entries with versions.
 *
 * @param db - The database connection (explicit DI)
 * @param versionTable - The drizzle version table to query
 * @param versionIds - Array of version IDs to fetch
 * @returns Map of version ID to version object
 */
export function batchFetchVersionsByIdWithDb<T extends { id: string }>(
  db: DrizzleDb,
  versionTable: VersionTable,
  versionIds: string[]
): Map<string, T> {
  if (versionIds.length === 0) {
    return new Map();
  }

  // Type assertion needed: Drizzle's table types are complex and don't easily support
  // generic table access. The runtime behavior is correct as long as versionTable has an 'id' column.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic table access requires type assertion
  const versionsList = db
    .select()
    .from(versionTable as any)
    .where(inArray((versionTable as any).id, versionIds))
    .all() as T[];

  const versionsMap = new Map<string, T>();
  for (const v of versionsList) {
    versionsMap.set(v.id, v);
  }
  return versionsMap;
}
