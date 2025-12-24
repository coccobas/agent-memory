/**
 * Shared type definitions for PostgreSQL database schema
 *
 * Re-exports from the common types module for consistency
 * between SQLite and PostgreSQL implementations.
 */

// Re-export all types from the shared types module
export type {
  ScopeType,
  EntryType,
  PermissionEntryType,
  RelationType,
  ConversationStatus,
  MessageRole,
  VerificationActionType,
} from '../types.js';
