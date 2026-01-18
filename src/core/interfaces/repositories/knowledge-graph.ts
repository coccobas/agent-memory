/**
 * Knowledge Graph Repository Interfaces
 *
 * Type Registry, Nodes, and Edges for the Flexible Knowledge Graph
 */

import type {
  NodeType,
  EdgeType,
  GraphNode,
  NodeVersion,
  GraphEdge,
  GraphTraversalOptions,
  GraphPath,
  ScopeType,
} from '../../../db/schema.js';
import type { PaginationOptions } from '../../../db/repositories/base.js';

// =============================================================================
// TYPE REGISTRY (Flexible Knowledge Graph)
// =============================================================================

/** Input for registering a new node type */
export interface RegisterNodeTypeInput {
  name: string;
  /** JSON Schema for validating node properties */
  schema: Record<string, unknown>;
  description?: string;
  parentTypeName?: string;
  createdBy?: string;
}

/** Input for registering a new edge type */
export interface RegisterEdgeTypeInput {
  name: string;
  /** JSON Schema for validating edge properties */
  schema?: Record<string, unknown>;
  description?: string;
  isDirected?: boolean;
  inverseName?: string;
  /** Allowed source node type names */
  sourceConstraints?: string[];
  /** Allowed target node type names */
  targetConstraints?: string[];
  createdBy?: string;
}

/** Validation result from type registry */
export interface TypeValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ITypeRegistry {
  // Node types

  /**
   * Register a new node type.
   * @param input - Node type registration parameters
   * @returns Created node type
   * @throws {AgentMemoryError} E1000 - Missing required field (name, schema)
   * @throws {AgentMemoryError} E2001 - Node type with same name already exists
   * @throws {AgentMemoryError} E2000 - Parent type not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  registerNodeType(input: RegisterNodeTypeInput): Promise<NodeType>;

  /**
   * Get a node type by name.
   * @param name - Node type name
   * @returns Node type if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getNodeType(name: string): Promise<NodeType | undefined>;

  /**
   * Get a node type by ID.
   * @param id - Node type ID
   * @returns Node type if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getNodeTypeById(id: string): Promise<NodeType | undefined>;

  /**
   * List all node types.
   * @param options - Filter options (includeBuiltin)
   * @returns Array of node types
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  listNodeTypes(options?: { includeBuiltin?: boolean }): Promise<NodeType[]>;

  /**
   * Validate node properties against the type's JSON schema.
   * @param typeName - Node type name
   * @param properties - Properties to validate
   * @returns Validation result with errors if invalid
   * @throws {AgentMemoryError} E2000 - Node type not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  validateNodeProperties(typeName: string, properties: unknown): Promise<TypeValidationResult>;

  /**
   * Delete a node type.
   * @param name - Node type name
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E1003 - Cannot delete builtin type
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  deleteNodeType(name: string): Promise<boolean>;

  // Edge types

  /**
   * Register a new edge type.
   * @param input - Edge type registration parameters
   * @returns Created edge type
   * @throws {AgentMemoryError} E1000 - Missing required field (name)
   * @throws {AgentMemoryError} E2001 - Edge type with same name already exists
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  registerEdgeType(input: RegisterEdgeTypeInput): Promise<EdgeType>;

  /**
   * Get an edge type by name.
   * @param name - Edge type name
   * @returns Edge type if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getEdgeType(name: string): Promise<EdgeType | undefined>;

  /**
   * Get an edge type by ID.
   * @param id - Edge type ID
   * @returns Edge type if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getEdgeTypeById(id: string): Promise<EdgeType | undefined>;

  /**
   * List all edge types.
   * @param options - Filter options (includeBuiltin)
   * @returns Array of edge types
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  listEdgeTypes(options?: { includeBuiltin?: boolean }): Promise<EdgeType[]>;

  /**
   * Validate edge properties against the type's JSON schema.
   * @param typeName - Edge type name
   * @param properties - Properties to validate
   * @returns Validation result with errors if invalid
   * @throws {AgentMemoryError} E2000 - Edge type not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  validateEdgeProperties(typeName: string, properties: unknown): Promise<TypeValidationResult>;

  /**
   * Delete an edge type.
   * @param name - Edge type name
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E1003 - Cannot delete builtin type
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  deleteEdgeType(name: string): Promise<boolean>;

  // Seed built-in types

  /**
   * Seed built-in node and edge types into the database.
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  seedBuiltinTypes(): Promise<void>;
}

// =============================================================================
// NODE REPOSITORY (Graph Nodes)
// =============================================================================

/** Input for creating a graph node */
export interface CreateGraphNodeInput {
  nodeTypeName: string;
  scopeType: ScopeType;
  scopeId?: string;
  name: string;
  properties?: Record<string, unknown>;
  validFrom?: string;
  validUntil?: string;
  /** Link to original entry (for bidirectional mapping) */
  entryId?: string;
  /** Type of the linked entry */
  entryType?: 'knowledge' | 'guideline' | 'tool' | 'experience' | 'task' | 'episode';
  createdBy?: string;
}

/** Input for updating a graph node */
export interface UpdateGraphNodeInput {
  name?: string;
  properties?: Record<string, unknown>;
  validFrom?: string;
  validUntil?: string;
  changeReason?: string;
  updatedBy?: string;
}

/** Filter for listing graph nodes */
export interface ListGraphNodesFilter {
  nodeTypeName?: string;
  nodeTypeId?: string;
  scopeType?: ScopeType;
  scopeId?: string;
  isActive?: boolean;
  includeInactive?: boolean;
  inherit?: boolean;
}

/** Node with current version */
export interface GraphNodeWithVersion extends GraphNode {
  nodeTypeName: string;
  currentVersion?: NodeVersion;
}

export interface INodeRepository {
  /**
   * Create a new graph node.
   * @param input - Node creation parameters
   * @returns Created node with version info
   * @throws {AgentMemoryError} E1000 - Missing required field (nodeTypeName, name, scopeType)
   * @throws {AgentMemoryError} E2000 - Node type not found
   * @throws {AgentMemoryError} E1001 - Node properties validation failed
   * @throws {AgentMemoryError} E2001 - Node with same name and type exists in scope
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateGraphNodeInput): Promise<GraphNodeWithVersion>;

  /**
   * Get a node by ID.
   * @param id - Node ID
   * @returns Node with version info if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string): Promise<GraphNodeWithVersion | undefined>;

  /**
   * Get a node by name and type within a scope.
   * @param name - Node name
   * @param nodeTypeName - Node type name
   * @param scopeType - Scope type
   * @param scopeId - Scope ID (required for non-global scopes)
   * @param inherit - Whether to search parent scopes
   * @returns Node if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByName(
    name: string,
    nodeTypeName: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<GraphNodeWithVersion | undefined>;

  /**
   * Find a node by its linked entry ID and type (for bidirectional mapping).
   * @param entryType - Type of the linked entry
   * @param entryId - Entry ID
   * @returns Node if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByEntry(
    entryType: 'knowledge' | 'guideline' | 'tool' | 'experience' | 'task' | 'episode',
    entryId: string
  ): Promise<GraphNodeWithVersion | undefined>;

  /**
   * List nodes matching filter criteria.
   * @param filter - Filter options (type, scope, active status)
   * @param options - Pagination options
   * @returns Array of nodes
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(filter?: ListGraphNodesFilter, options?: PaginationOptions): Promise<GraphNodeWithVersion[]>;

  /**
   * Update a node (creates new version).
   * @param id - Node ID
   * @param input - Update parameters
   * @returns Updated node, or undefined if not found
   * @throws {AgentMemoryError} E1001 - Node properties validation failed
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(id: string, input: UpdateGraphNodeInput): Promise<GraphNodeWithVersion | undefined>;

  /**
   * Get version history for a node.
   * @param nodeId - Node ID
   * @returns Array of versions (newest first)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getHistory(nodeId: string): Promise<NodeVersion[]>;

  /**
   * Deactivate a node (soft delete).
   * @param id - Node ID
   * @returns true if deactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  deactivate(id: string): Promise<boolean>;

  /**
   * Reactivate a previously deactivated node.
   * @param id - Node ID
   * @returns true if reactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  reactivate(id: string): Promise<boolean>;

  /**
   * Permanently delete a node and all its versions and edges.
   * @param id - Node ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;

  /**
   * Update access metrics for a node (recency score, access count).
   * @param id - Node ID
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  updateAccessMetrics(id: string): Promise<void>;
}

// =============================================================================
// EDGE REPOSITORY (Graph Edges)
// =============================================================================

/** Input for creating a graph edge */
export interface CreateGraphEdgeInput {
  edgeTypeName: string;
  sourceId: string;
  targetId: string;
  properties?: Record<string, unknown>;
  weight?: number;
  createdBy?: string;
}

/** Input for updating a graph edge */
export interface UpdateGraphEdgeInput {
  properties?: Record<string, unknown>;
  weight?: number;
}

/** Filter for listing graph edges */
export interface ListGraphEdgesFilter {
  edgeTypeName?: string;
  edgeTypeId?: string;
  sourceId?: string;
  targetId?: string;
}

/** Edge with type name resolved */
export interface GraphEdgeWithType extends GraphEdge {
  edgeTypeName: string;
  isDirected: boolean;
  inverseName: string | null;
}

export interface IEdgeRepository {
  /**
   * Create a new graph edge.
   * @param input - Edge creation parameters
   * @returns Created edge with type info
   * @throws {AgentMemoryError} E1000 - Missing required field (edgeTypeName, sourceId, targetId)
   * @throws {AgentMemoryError} E2000 - Edge type or source/target node not found
   * @throws {AgentMemoryError} E1001 - Edge properties validation failed
   * @throws {AgentMemoryError} E1004 - Edge violates source/target type constraints
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateGraphEdgeInput): Promise<GraphEdgeWithType>;

  /**
   * Get an edge by ID.
   * @param id - Edge ID
   * @returns Edge with type info if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string): Promise<GraphEdgeWithType | undefined>;

  /**
   * List edges matching filter criteria.
   * @param filter - Filter options (type, source, target)
   * @param options - Pagination options
   * @returns Array of edges
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(filter?: ListGraphEdgesFilter, options?: PaginationOptions): Promise<GraphEdgeWithType[]>;

  /**
   * Update an edge.
   * @param id - Edge ID
   * @param input - Update parameters
   * @returns Updated edge, or undefined if not found
   * @throws {AgentMemoryError} E1001 - Edge properties validation failed
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(id: string, input: UpdateGraphEdgeInput): Promise<GraphEdgeWithType | undefined>;

  /**
   * Delete an edge.
   * @param id - Edge ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;

  // Graph traversal

  /**
   * Get all outgoing edges from a node.
   * @param nodeId - Source node ID
   * @param edgeTypeName - Optional filter by edge type
   * @returns Array of edges
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getOutgoingEdges(nodeId: string, edgeTypeName?: string): Promise<GraphEdgeWithType[]>;

  /**
   * Get all incoming edges to a node.
   * @param nodeId - Target node ID
   * @param edgeTypeName - Optional filter by edge type
   * @returns Array of edges
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getIncomingEdges(nodeId: string, edgeTypeName?: string): Promise<GraphEdgeWithType[]>;

  /**
   * Get neighboring nodes connected by edges.
   * @param nodeId - Node ID
   * @param options - Traversal options (direction, edge types, node types)
   * @returns Array of neighboring nodes
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getNeighbors(nodeId: string, options?: GraphTraversalOptions): Promise<GraphNodeWithVersion[]>;

  /**
   * Traverse the graph from a starting node.
   * @param startNodeId - Starting node ID
   * @param options - Traversal options (depth, direction, filters)
   * @returns Array of reachable nodes
   * @throws {AgentMemoryError} E2000 - Start node not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  traverse(startNodeId: string, options?: GraphTraversalOptions): Promise<GraphNodeWithVersion[]>;

  /**
   * Find all paths between two nodes.
   * @param startNodeId - Starting node ID
   * @param endNodeId - Target node ID
   * @param maxDepth - Maximum path length (default: 5)
   * @returns Array of paths
   * @throws {AgentMemoryError} E2000 - Start or end node not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  findPaths(startNodeId: string, endNodeId: string, maxDepth?: number): Promise<GraphPath[]>;
}
