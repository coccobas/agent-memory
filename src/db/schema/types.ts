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
 * Extended entry type for audit logging (includes non-core entity types)
 */
export type AuditEntryType =
  | EntryType
  | 'graph_node'
  | 'graph_edge'
  | 'relation'
  | 'tag'
  | 'episode'
  | 'permission';

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

// =============================================================================
// GRAPH TYPES (Flexible Knowledge Graph)
// =============================================================================

/**
 * Graph entry type - used for polymorphic associations in graph system
 * Represents the type of a graph node (maps to node_types.name)
 */
export type GraphEntryType = string; // Dynamic - defined by user via type registry

/**
 * Graph relation type - used for edge types
 * Represents the type of a graph edge (maps to edge_types.name)
 */
export type GraphRelationType = string; // Dynamic - defined by user via type registry

/**
 * Edge direction for graph traversal
 */
export type EdgeDirection = 'out' | 'in' | 'both';

/**
 * Graph traversal options
 */
export interface GraphTraversalOptions {
  edgeTypes?: string[];
  direction?: EdgeDirection;
  maxDepth?: number;
  nodeTypeFilter?: string[];
  limit?: number;
}

/**
 * Graph path result
 */
export interface GraphPath {
  nodes: Array<{ id: string; type: string; name: string }>;
  edges: Array<{ id: string; type: string; sourceId: string; targetId: string }>;
  totalDepth: number;
}
