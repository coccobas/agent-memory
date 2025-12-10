import { v4 as uuidv4 } from 'uuid';

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
