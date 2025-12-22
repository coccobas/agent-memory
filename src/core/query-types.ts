/**
 * Query Parameter Types with Discriminated Unions
 *
 * This module provides type-safe query parameter interfaces using discriminated
 * unions to group related parameters by query strategy.
 */

import type { ScopeType, EntryType, RelationType } from '../db/schema.js';

// =============================================================================
// BASE TYPES
// =============================================================================

/**
 * Entry types for query filtering
 */
export type QueryEntryType = 'tools' | 'guidelines' | 'knowledge';

/**
 * Scope descriptor for filtering by scope
 */
export interface ScopeDescriptor {
  type: ScopeType;
  id?: string;
  inherit?: boolean;
}

/**
 * Tag filter descriptor
 */
export interface TagFilter {
  include?: string[];
  require?: string[];
  exclude?: string[];
}

/**
 * Related entry descriptor
 */
export interface RelatedToDescriptor {
  type: EntryType;
  id: string;
  relation?: RelationType;
  depth?: number;
  direction?: 'forward' | 'backward' | 'both';
  maxResults?: number;
}

/**
 * Date range filter
 */
export interface DateRangeFilter {
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}

/**
 * Recency scoring options
 */
export interface RecencyOptions {
  recencyWeight?: number;
  decayHalfLifeDays?: number;
  decayFunction?: 'linear' | 'exponential' | 'step';
  useUpdatedAt?: boolean;
}

// =============================================================================
// BASE QUERY PARAMS
// =============================================================================

/**
 * Common parameters for all query types
 */
export interface BaseQueryParams {
  types?: QueryEntryType[];
  scope?: ScopeDescriptor;
  limit?: number;
  includeVersions?: boolean;
  includeInactive?: boolean;
  compact?: boolean;
}

// =============================================================================
// STRATEGY-SPECIFIC QUERY PARAMS
// =============================================================================

/**
 * Text search query (FTS5 or LIKE-based)
 */
export interface TextSearchQuery extends BaseQueryParams {
  strategy: 'text';
  search: string;
  useFts5?: boolean;
  fuzzy?: boolean;
  fields?: string[];
  regex?: boolean;
}

/**
 * Semantic/vector search query
 */
export interface SemanticSearchQuery extends BaseQueryParams {
  strategy: 'semantic';
  search: string;
  semanticThreshold?: number;
}

/**
 * Relation-based query (graph traversal)
 */
export interface RelationQuery extends BaseQueryParams {
  strategy: 'relation';
  relatedTo: RelatedToDescriptor;
  followRelations?: boolean;
}

/**
 * Tag-based query
 */
export interface TagQuery extends BaseQueryParams {
  strategy: 'tag';
  tags: TagFilter;
}

/**
 * Date range query
 */
export interface DateRangeQuery extends BaseQueryParams, DateRangeFilter {
  strategy: 'date';
}

/**
 * Priority filter query (guidelines only)
 */
export interface PriorityQuery extends BaseQueryParams {
  strategy: 'priority';
  priority: { min?: number; max?: number };
}

/**
 * Conversation context query
 */
export interface ConversationContextQuery extends BaseQueryParams {
  strategy: 'conversation';
  conversationId: string;
  messageId?: string;
  autoLinkContext?: boolean;
}

/**
 * Default/unspecified strategy - for backward compatibility
 * Allows all parameters but with optional strategy field.
 * This is the canonical query params type used throughout the codebase.
 */
export interface DefaultQuery extends BaseQueryParams, DateRangeFilter, RecencyOptions {
  strategy?: 'default' | undefined;
  // Search params
  search?: string;
  semanticSearch?: boolean;
  semanticThreshold?: number;
  useFts5?: boolean;
  fields?: string[];
  fuzzy?: boolean;
  regex?: boolean;
  // Tag params
  tags?: TagFilter;
  // Relation params
  relatedTo?: RelatedToDescriptor;
  followRelations?: boolean;
  // Priority params
  priority?: { min?: number; max?: number };
  // Conversation params
  conversationId?: string;
  messageId?: string;
  autoLinkContext?: boolean;
}

/**
 * Alias for backward compatibility.
 * Use DefaultQuery or TypedMemoryQuery for new code.
 */
export type MemoryQueryParams = DefaultQuery;

// =============================================================================
// UNIFIED QUERY TYPE
// =============================================================================

/**
 * Discriminated union of all query types
 *
 * Use the `strategy` field to narrow the type and get type-safe access
 * to strategy-specific parameters.
 *
 * @example
 * function handleQuery(query: TypedMemoryQuery) {
 *   if (query.strategy === 'text') {
 *     // query.search is string (required)
 *     // query.useFts5 is boolean | undefined
 *   } else if (query.strategy === 'semantic') {
 *     // query.search is string (required)
 *     // query.semanticThreshold is number | undefined
 *   }
 * }
 */
export type TypedMemoryQuery =
  | TextSearchQuery
  | SemanticSearchQuery
  | RelationQuery
  | TagQuery
  | DateRangeQuery
  | PriorityQuery
  | ConversationContextQuery
  | DefaultQuery;

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isTextSearchQuery(query: TypedMemoryQuery): query is TextSearchQuery {
  return query.strategy === 'text';
}

export function isSemanticSearchQuery(query: TypedMemoryQuery): query is SemanticSearchQuery {
  return query.strategy === 'semantic';
}

export function isRelationQuery(query: TypedMemoryQuery): query is RelationQuery {
  return query.strategy === 'relation';
}

export function isTagQuery(query: TypedMemoryQuery): query is TagQuery {
  return query.strategy === 'tag';
}

export function isDateRangeQuery(query: TypedMemoryQuery): query is DateRangeQuery {
  return query.strategy === 'date';
}

export function isPriorityQuery(query: TypedMemoryQuery): query is PriorityQuery {
  return query.strategy === 'priority';
}

export function isConversationContextQuery(
  query: TypedMemoryQuery
): query is ConversationContextQuery {
  return query.strategy === 'conversation';
}

export function isDefaultQuery(query: TypedMemoryQuery): query is DefaultQuery {
  return query.strategy === undefined || query.strategy === 'default';
}

// =============================================================================
// CONVERSION HELPERS
// =============================================================================

/**
 * Infer query strategy from parameters
 * Determines the best strategy based on which parameters are present
 */
export function inferQueryStrategy(params: Record<string, unknown>): TypedMemoryQuery['strategy'] {
  if (params.semanticSearch === true && params.search) {
    return 'semantic';
  }
  if (params.relatedTo) {
    return 'relation';
  }
  if (params.tags && Object.keys(params.tags as object).length > 0) {
    return 'tag';
  }
  if (params.createdAfter || params.createdBefore || params.updatedAfter || params.updatedBefore) {
    return 'date';
  }
  if (params.priority) {
    return 'priority';
  }
  if (params.conversationId) {
    return 'conversation';
  }
  if (params.search) {
    return 'text';
  }
  return 'default';
}
