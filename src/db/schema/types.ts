/**
 * Shared type definitions for database schema
 */

/**
 * Scope type enum for memory entries
 */
export type ScopeType = 'global' | 'org' | 'project' | 'session';

/**
 * Entry type enum for polymorphic associations
 */
export type EntryType = 'tool' | 'guideline' | 'knowledge' | 'project' | 'experience';

/**
 * Permission entry type (subset of EntryType - excludes 'project')
 */
export type PermissionEntryType = 'tool' | 'guideline' | 'knowledge';

/**
 * Relation type enum for entry relations
 */
export type RelationType =
  | 'applies_to'
  | 'depends_on'
  | 'conflicts_with'
  | 'related_to'
  | 'parent_task'
  | 'subtask_of'
  | 'promoted_to';

/**
 * Conversation status enum
 */
export type ConversationStatus = 'active' | 'completed' | 'archived';

/**
 * Message role enum
 */
export type MessageRole = 'user' | 'agent' | 'system';

/**
 * Verification action type enum
 */
export type VerificationActionType = 'pre_check' | 'post_check' | 'acknowledge';
