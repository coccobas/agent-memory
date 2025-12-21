import { v4 as uuidv4 } from 'uuid';
import { eq, and, or, inArray } from 'drizzle-orm';
import { getDb } from '../connection.js';
import {
  entryTags,
  entryRelations,
  entryEmbeddings,
  permissions,
  conflictLog,
  type EntryType,
} from '../schema.js';

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
 * @param entryType - The type of entry ('tool', 'guideline', 'knowledge')
 * @param entryId - The ID of the entry being deleted
 */
export function cascadeDeleteRelatedRecords(
  entryType: CascadeEntryType,
  entryId: string
): void {
  const db = getDb();

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
  void (async () => {
    try {
      await vectorCleanupHook(entryType, entryId);
    } catch {
      // Errors should be logged by the hook implementation
    }
  })();
}

/**
 * Check for concurrent write conflict and log if detected
 *
 * @param entryType - The type of entry
 * @param entryId - The ID of the entry
 * @param previousVersionId - The ID of the previous version
 * @param newVersionId - The ID of the new version being created
 * @param lastWriteTime - Timestamp of the last write (from previousVersion.createdAt)
 * @returns true if a conflict was detected
 */
export function checkAndLogConflict(
  entryType: CascadeEntryType,
  entryId: string,
  previousVersionId: string,
  newVersionId: string,
  lastWriteTime: Date
): boolean {
  const currentTime = Date.now();
  const lastTime = lastWriteTime.getTime();

  if (currentTime - lastTime < CONFLICT_WINDOW_MS) {
    const db = getDb();
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
 * Batch fetch versions by IDs and return a Map for efficient lookup.
 * Generic helper to avoid N+1 queries when listing entries with versions.
 *
 * @param versionTable - The drizzle version table to query
 * @param versionIds - Array of version IDs to fetch
 * @returns Map of version ID to version object
 */
export function batchFetchVersionsById<T extends { id: string }>(
  versionTable: Parameters<ReturnType<typeof getDb>['select']>[0] extends undefined
    ? never
    : { id: { name: string } },
  versionIds: string[]
): Map<string, T> {
  if (versionIds.length === 0) {
    return new Map();
  }

  const db = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
