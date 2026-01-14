/**
 * Graph Schema - Flexible Knowledge Graph Tables
 *
 * This schema provides a unified property graph model for storing
 * diverse technical data: code entities, dependencies, hardware,
 * telemetry, weather data, etc.
 *
 * Key features:
 * - Dynamic node/edge types via type registry
 * - JSON properties validated against type schemas
 * - Versioning for audit trail
 * - Preserved scope hierarchy (global/org/project/session)
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// TYPE REGISTRY TABLES
// =============================================================================

/**
 * Node type definitions - replaces hardcoded entry types
 * Allows users to define custom node types (e.g., 'sensor', 'weather_station')
 */
export const nodeTypes = sqliteTable(
  'node_types',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** JSON Schema for validating node properties */
    schema: text('schema', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    description: text('description'),
    /** Parent type for type hierarchy (e.g., 'function' extends 'code_entity') */
    parentTypeId: text('parent_type_id'),
    /** Built-in types cannot be deleted */
    isBuiltin: integer('is_builtin', { mode: 'boolean' }).default(false).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('idx_node_types_name').on(table.name),
    index('idx_node_types_parent').on(table.parentTypeId),
  ]
);

/**
 * Edge type definitions - replaces hardcoded relation types
 * Allows users to define custom relationship types (e.g., 'measures', 'controls')
 */
export const edgeTypes = sqliteTable(
  'edge_types',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** JSON Schema for validating edge properties */
    schema: text('schema', { mode: 'json' }).$type<Record<string, unknown>>(),
    description: text('description'),
    /** Whether this edge is directed (default true) */
    isDirected: integer('is_directed', { mode: 'boolean' }).default(true).notNull(),
    /** Inverse name for bidirectional semantics (e.g., 'imported_by' for 'imports') */
    inverseName: text('inverse_name'),
    /** JSON array of allowed source node type names */
    sourceConstraints: text('source_constraints', { mode: 'json' }).$type<string[]>(),
    /** JSON array of allowed target node type names */
    targetConstraints: text('target_constraints', { mode: 'json' }).$type<string[]>(),
    /** Built-in types cannot be deleted */
    isBuiltin: integer('is_builtin', { mode: 'boolean' }).default(false).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('idx_edge_types_name').on(table.name),
    index('idx_edge_types_inverse').on(table.inverseName),
  ]
);

// =============================================================================
// UNIFIED NODE TABLE
// =============================================================================

/**
 * Nodes - unified table for all entity types
 * Replaces separate tools, guidelines, knowledge, experience tables
 */
export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    /** Reference to node_types.id */
    nodeTypeId: text('node_type_id')
      .references(() => nodeTypes.id)
      .notNull(),
    /** Scope type (preserved from existing design) */
    scopeType: text('scope_type', { enum: ['global', 'org', 'project', 'session'] }).notNull(),
    /** Scope ID (null for global scope) */
    scopeId: text('scope_id'),
    /** Human-readable identifier */
    name: text('name').notNull(),
    /** Flexible properties validated against type schema */
    properties: text('properties', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    /** Current version ID for version tracking */
    currentVersionId: text('current_version_id'),
    /** Soft delete flag */
    isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
    /** Access tracking for forgetting/decay */
    lastAccessedAt: text('last_accessed_at'),
    accessCount: integer('access_count').default(0).notNull(),
    /** Link to original entry (knowledge, guideline, tool, etc.) */
    entryId: text('entry_id'),
    /** Type of the linked entry */
    entryType: text('entry_type', { enum: ['knowledge', 'guideline', 'tool', 'experience', 'task'] }),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_nodes_type').on(table.nodeTypeId),
    index('idx_nodes_scope').on(table.scopeType, table.scopeId),
    uniqueIndex('idx_nodes_scope_name').on(table.nodeTypeId, table.scopeType, table.scopeId, table.name),
    index('idx_nodes_active').on(table.isActive),
    index('idx_nodes_created').on(table.createdAt),
    // Index for entry → node lookups
    index('idx_nodes_entry').on(table.entryType, table.entryId),
    // Unique constraint to prevent duplicate entry mappings
    uniqueIndex('idx_nodes_entry_unique').on(table.entryType, table.entryId),
  ]
);

/**
 * Node versions - append-only history for audit trail
 */
export const nodeVersions = sqliteTable(
  'node_versions',
  {
    id: text('id').primaryKey(),
    /** Reference to nodes.id */
    nodeId: text('node_id')
      .references(() => nodes.id, { onDelete: 'cascade' })
      .notNull(),
    /** Sequential version number */
    versionNum: integer('version_num').notNull(),
    /** Snapshot of properties at this version */
    properties: text('properties', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    /** Reason for this version */
    changeReason: text('change_reason'),
    /** Temporal validity - when this version becomes valid */
    validFrom: text('valid_from'),
    /** Temporal validity - when this version expires */
    validUntil: text('valid_until'),
    /** ID of version that supersedes this one */
    invalidatedBy: text('invalidated_by'),
    /** Conflict detection flag */
    conflictFlag: integer('conflict_flag', { mode: 'boolean' }).default(false).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_node_versions_node').on(table.nodeId),
    uniqueIndex('idx_node_versions_unique').on(table.nodeId, table.versionNum),
    index('idx_node_versions_valid').on(table.validFrom, table.validUntil),
  ]
);

// =============================================================================
// UNIFIED EDGE TABLE
// =============================================================================

/**
 * Edges - unified table for all relationship types
 * Replaces entry_relations with typed, weighted, property-rich edges
 */
export const edges = sqliteTable(
  'edges',
  {
    id: text('id').primaryKey(),
    /** Reference to edge_types.id */
    edgeTypeId: text('edge_type_id')
      .references(() => edgeTypes.id)
      .notNull(),
    /** Source node */
    sourceId: text('source_id')
      .references(() => nodes.id, { onDelete: 'cascade' })
      .notNull(),
    /** Target node */
    targetId: text('target_id')
      .references(() => nodes.id, { onDelete: 'cascade' })
      .notNull(),
    /** Flexible edge properties */
    properties: text('properties', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
    /** Edge weight for ranking/filtering (default 1.0) */
    weight: real('weight').default(1.0).notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_edges_type').on(table.edgeTypeId),
    index('idx_edges_source').on(table.sourceId),
    index('idx_edges_target').on(table.targetId),
    index('idx_edges_weight').on(table.weight),
    // Unique constraint: only one edge of each type between two nodes
    uniqueIndex('idx_edges_unique').on(table.sourceId, table.targetId, table.edgeTypeId),
    // Composite index for traversal queries
    index('idx_edges_source_type').on(table.sourceId, table.edgeTypeId),
    index('idx_edges_target_type').on(table.targetId, table.edgeTypeId),
  ]
);

// =============================================================================
// GRAPH TAGS (Links tags to nodes)
// =============================================================================

/**
 * Node tags - links tags to graph nodes
 * Separate from entry_tags to keep systems parallel
 */
export const nodeTags = sqliteTable(
  'node_tags',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .references(() => nodes.id, { onDelete: 'cascade' })
      .notNull(),
    /** References existing tags table */
    tagId: text('tag_id').notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_node_tags_node').on(table.nodeId),
    index('idx_node_tags_tag').on(table.tagId),
    uniqueIndex('idx_node_tags_unique').on(table.nodeId, table.tagId),
  ]
);

// =============================================================================
// GRAPH EMBEDDINGS (Links embeddings to nodes)
// =============================================================================

/**
 * Node embeddings - tracks embedding status for graph nodes
 * Separate from entry_embeddings to keep systems parallel
 */
export const nodeEmbeddings = sqliteTable(
  'node_embeddings',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .references(() => nodes.id, { onDelete: 'cascade' })
      .notNull(),
    /** Version ID that was embedded */
    versionId: text('version_id').notNull(),
    hasEmbedding: integer('has_embedding', { mode: 'boolean' }).default(false).notNull(),
    embeddingModel: text('embedding_model'),
    embeddingProvider: text('embedding_provider', { enum: ['openai', 'lmstudio', 'local', 'disabled'] }),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_node_embeddings_node').on(table.nodeId),
    uniqueIndex('idx_node_embeddings_version').on(table.nodeId, table.versionId),
    index('idx_node_embeddings_status').on(table.hasEmbedding),
  ]
);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

// Node types
export type NodeType = typeof nodeTypes.$inferSelect;
export type NewNodeType = typeof nodeTypes.$inferInsert;

// Edge types
export type EdgeType = typeof edgeTypes.$inferSelect;
export type NewEdgeType = typeof edgeTypes.$inferInsert;

// Nodes
export type GraphNode = typeof nodes.$inferSelect;
export type NewGraphNode = typeof nodes.$inferInsert;

// Node versions
export type NodeVersion = typeof nodeVersions.$inferSelect;
export type NewNodeVersion = typeof nodeVersions.$inferInsert;

// Edges
export type GraphEdge = typeof edges.$inferSelect;
export type NewGraphEdge = typeof edges.$inferInsert;

// Node tags
export type NodeTag = typeof nodeTags.$inferSelect;
export type NewNodeTag = typeof nodeTags.$inferInsert;

// Node embeddings
export type NodeEmbedding = typeof nodeEmbeddings.$inferSelect;
export type NewNodeEmbedding = typeof nodeEmbeddings.$inferInsert;
