import { v4 as uuidv4 } from 'uuid';
import { eq, and, or } from 'drizzle-orm';
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

// =============================================================================
// CURSOR PAGINATION HELPERS
// =============================================================================

/**
 * Cursor payload structure for offset-based pagination
 */
interface CursorPayload {
  offset: number;
}

/**
 * Encode an offset into a cursor string (base64 JSON)
 *
 * @param offset - The offset to encode
 * @returns Base64-encoded cursor string
 */
export function encodeCursor(offset: number): string {
  const payload: CursorPayload = { offset };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Decode a cursor string back into an offset
 *
 * @param cursor - Base64-encoded cursor string
 * @returns Decoded payload or null if invalid
 */
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf8');
    const payload = JSON.parse(json) as CursorPayload;
    if (typeof payload.offset === 'number' && payload.offset >= 0) {
      return payload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Paginated result wrapper (used internally by repositories)
 */
export interface PaginatedResult<T> {
  items: T[];
  meta: ResponseMeta;
}

/**
 * Create a paginated result from items.
 * Uses "fetch limit+1" strategy to detect hasMore without COUNT query.
 *
 * @param items - Items fetched from database (should be limit+1 to detect hasMore)
 * @param limit - The requested limit
 * @param offset - The current offset
 * @returns Paginated result with proper metadata
 */
export function createPaginatedResult<T>(
  items: T[],
  limit: number,
  offset: number
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const returnedItems = hasMore ? items.slice(0, limit) : items;

  return {
    items: returnedItems,
    meta: {
      totalCount: -1, // Not computed (would require separate COUNT query)
      returnedCount: returnedItems.length,
      truncated: hasMore,
      hasMore,
      nextCursor: hasMore ? encodeCursor(offset + limit) : undefined,
    },
  };
}

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
export type CascadeEntryType = 'tool' | 'guideline' | 'knowledge' | 'experience';

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
