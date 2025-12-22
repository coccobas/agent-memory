/**
 * Base type definitions for MCP params
 *
 * These generic types reduce duplication across Tool, Guideline, and Knowledge params.
 */

import type { ScopeType, EntryType, PermissionEntryType, RelationType } from '../../db/schema.js';

// =============================================================================
// SCOPE & PAGINATION (Common across all)
// =============================================================================

export interface ScopeParams {
  scopeType: ScopeType;
  scopeId?: string;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
}

// =============================================================================
// GENERIC ENTRY CRUD PARAMS
// =============================================================================

/**
 * Base interface for adding entries (Tool, Guideline, Knowledge)
 * Entry-specific types extend this with their own fields.
 */
export interface BaseAddParams extends ScopeParams {
  createdBy?: string;
}

/**
 * Base interface for updating entries
 * Entry-specific types extend this with their own fields.
 */
export interface BaseUpdateParams {
  id: string;
  changeReason?: string;
  updatedBy?: string;
}

/**
 * Base interface for getting entries by ID or identifier
 * Supports scope inheritance lookup.
 */
export interface BaseGetParams {
  id?: string;
  scopeType?: ScopeType;
  scopeId?: string;
  inherit?: boolean;
}

/**
 * Base interface for listing entries with filters
 * Entry-specific types extend this with their category types.
 */
export interface BaseListParams extends PaginationParams {
  scopeType?: ScopeType;
  scopeId?: string;
  includeInactive?: boolean;
}

/**
 * Simple ID-only param for history and deactivate operations
 * Replaces duplicate [Entry]HistoryParams and [Entry]DeactivateParams.
 */
export interface EntryIdParam {
  id: string;
}

// Re-export schema types for convenience
export type { ScopeType, EntryType, PermissionEntryType, RelationType };
