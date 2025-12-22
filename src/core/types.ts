/**
 * Core/shared types used across transports (MCP, REST, etc).
 *
 * Keep this file free of any transport-specific concerns so that
 * adapters can be built independently.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import type { ScopeType, AppSchema } from '../db/schema.js';

/**
 * Type-safe Drizzle database with full schema type information.
 * Provides autocomplete for table names and column types.
 */
export type AppDb = BetterSQLite3Database<AppSchema>;

/**
 * Database dependencies for repository factory functions.
 * Passed to repository factories instead of using service locator pattern.
 */
export interface DatabaseDeps {
  /** Drizzle ORM database instance with schema types */
  db: AppDb;
  /** Raw better-sqlite3 database instance for transactions and raw SQL */
  sqlite: Database.Database;
}

// Re-export query types from query-types.ts
export type {
  QueryEntryType,
  ScopeDescriptor,
  TagFilter,
  RelatedToDescriptor,
  DateRangeFilter,
  RecencyOptions,
  BaseQueryParams,
  TextSearchQuery,
  SemanticSearchQuery,
  RelationQuery,
  TagQuery,
  DateRangeQuery,
  PriorityQuery,
  ConversationContextQuery,
  DefaultQuery,
  TypedMemoryQuery,
  MemoryQueryParams,
} from './query-types.js';

export {
  isTextSearchQuery,
  isSemanticSearchQuery,
  isRelationQuery,
  isTagQuery,
  isDateRangeQuery,
  isPriorityQuery,
  isConversationContextQuery,
  isDefaultQuery,
  inferQueryStrategy,
} from './query-types.js';

export interface ResponseMeta {
  totalCount: number;
  returnedCount: number;
  truncated: boolean;
  hasMore: boolean;
  nextCursor?: string;
}

export interface MemoryContextParams {
  scopeType: ScopeType;
  scopeId?: string;
  inherit?: boolean;
  compact?: boolean;
  limitPerType?: number;
}
