/**
 * Graph Sync Service
 *
 * Synchronizes memory entries (knowledge, guidelines, tools, experiences) with
 * graph nodes and edges. This keeps the graph representation in sync with the
 * primary entry repositories.
 *
 * Design:
 * - Called automatically after entry creation (if enabled)
 * - Non-fatal errors (logged but don't fail the main operation)
 * - Idempotent (safe to retry)
 */

import type { INodeRepository, IEdgeRepository, ITypeRegistry } from '../../core/interfaces/repositories.js';
import type { GraphNodeWithVersion, GraphEdgeWithType } from '../../db/schema/graph.js';
import type { ScopeType } from '../../db/schema.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('graph-sync');

/**
 * Metadata about an entry to sync to the graph
 */
export interface EntrySyncMetadata {
  /** Entry type (maps to node type) */
  entryType: 'knowledge' | 'guideline' | 'tool' | 'experience';
  /** Entry ID (used as entry_id on node) */
  entryId: string;
  /** Entry name/title */
  name: string;
  /** Scope type */
  scopeType: ScopeType;
  /** Scope ID (if not global) */
  scopeId?: string;
  /** Additional properties to store on node */
  properties?: Record<string, unknown>;
  /** Creator */
  createdBy?: string;
}

/**
 * Metadata about a relation to sync to an edge
 */
export interface RelationSyncMetadata {
  /** Relation type (maps to edge type) */
  relationType: 'applies_to' | 'depends_on' | 'conflicts_with' | 'related_to' | 'parent_task' | 'subtask_of';
  /** Source entry ID */
  sourceEntryId: string;
  /** Source entry type */
  sourceEntryType: 'knowledge' | 'guideline' | 'tool' | 'experience' | 'task';
  /** Target entry ID */
  targetEntryId: string;
  /** Target entry type */
  targetEntryType: 'knowledge' | 'guideline' | 'tool' | 'experience' | 'task';
  /** Edge properties */
  properties?: Record<string, unknown>;
  /** Creator */
  createdBy?: string;
}

/**
 * Graph Sync Service
 */
export class GraphSyncService {
  private nodeRepo: INodeRepository;
  private edgeRepo: IEdgeRepository;
  private typeRegistry: ITypeRegistry;

  constructor(nodeRepo: INodeRepository, edgeRepo: IEdgeRepository, typeRegistry: ITypeRegistry) {
    this.nodeRepo = nodeRepo;
    this.edgeRepo = edgeRepo;
    this.typeRegistry = typeRegistry;
  }

  /**
   * Sync an entry to a graph node
   *
   * Creates a node in the graph corresponding to the memory entry.
   * If a node already exists for this entry, returns the existing node.
   *
   * @param metadata - Entry metadata
   * @returns Created or existing node, or null on error
   */
  async syncEntryToNode(metadata: EntrySyncMetadata): Promise<GraphNodeWithVersion | null> {
    try {
      // Check if node already exists for this entry
      const existing = await this.findNodeByEntry(metadata.entryType, metadata.entryId);
      if (existing) {
        logger.debug(
          { entryType: metadata.entryType, entryId: metadata.entryId, nodeId: existing.id },
          'Node already exists for entry'
        );
        return existing;
      }

      // Verify node type exists
      const nodeType = await this.typeRegistry.getNodeType(metadata.entryType);
      if (!nodeType) {
        logger.warn(
          { nodeType: metadata.entryType },
          'Node type not found, cannot sync entry to graph'
        );
        return null;
      }

      // Create node with entry_id and entry_type for reverse lookup
      const node = await this.nodeRepo.create({
        nodeTypeName: metadata.entryType,
        scopeType: metadata.scopeType,
        scopeId: metadata.scopeId,
        name: metadata.name,
        properties: {
          ...metadata.properties,
          entry_id: metadata.entryId,
          entry_type: metadata.entryType,
        },
        createdBy: metadata.createdBy,
      });

      logger.info(
        {
          entryType: metadata.entryType,
          entryId: metadata.entryId,
          nodeId: node.id,
          nodeName: node.name,
        },
        'Synced entry to graph node'
      );

      return node;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          entryType: metadata.entryType,
          entryId: metadata.entryId,
          error: errorMessage,
        },
        'Failed to sync entry to graph node'
      );
      return null;
    }
  }

  /**
   * Sync a relation to a graph edge
   *
   * Creates an edge in the graph corresponding to the entry relation.
   * Requires that nodes exist for both source and target entries.
   *
   * @param metadata - Relation metadata
   * @returns Created edge, or null on error
   */
  async syncRelationToEdge(metadata: RelationSyncMetadata): Promise<GraphEdgeWithType | null> {
    try {
      // Find source node
      const sourceNode = await this.findNodeByEntry(metadata.sourceEntryType, metadata.sourceEntryId);
      if (!sourceNode) {
        logger.debug(
          { sourceType: metadata.sourceEntryType, sourceId: metadata.sourceEntryId },
          'Source node not found, cannot sync relation'
        );
        return null;
      }

      // Find target node
      const targetNode = await this.findNodeByEntry(metadata.targetEntryType, metadata.targetEntryId);
      if (!targetNode) {
        logger.debug(
          { targetType: metadata.targetEntryType, targetId: metadata.targetEntryId },
          'Target node not found, cannot sync relation'
        );
        return null;
      }

      // Check if edge already exists
      const existingEdges = await this.edgeRepo.getOutgoingEdges(sourceNode.id, metadata.relationType);
      const alreadyExists = existingEdges.some((e) => e.targetId === targetNode.id);
      if (alreadyExists) {
        logger.debug(
          {
            relationType: metadata.relationType,
            sourceId: sourceNode.id,
            targetId: targetNode.id,
          },
          'Edge already exists'
        );
        return null;
      }

      // Verify edge type exists
      const edgeType = await this.typeRegistry.getEdgeType(metadata.relationType);
      if (!edgeType) {
        logger.warn(
          { edgeType: metadata.relationType },
          'Edge type not found, cannot sync relation to graph'
        );
        return null;
      }

      // Create edge
      const edge = await this.edgeRepo.create({
        edgeTypeName: metadata.relationType,
        sourceId: sourceNode.id,
        targetId: targetNode.id,
        properties: metadata.properties,
        createdBy: metadata.createdBy,
      });

      logger.info(
        {
          relationType: metadata.relationType,
          sourceId: sourceNode.id,
          targetId: targetNode.id,
          edgeId: edge.id,
        },
        'Synced relation to graph edge'
      );

      return edge;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          relationType: metadata.relationType,
          sourceId: metadata.sourceEntryId,
          targetId: metadata.targetEntryId,
          error: errorMessage,
        },
        'Failed to sync relation to graph edge'
      );
      return null;
    }
  }

  /**
   * Find a graph node by entry ID and type
   *
   * @param entryType - Entry type
   * @param entryId - Entry ID
   * @returns Node if found, undefined otherwise
   */
  private async findNodeByEntry(
    entryType: string,
    entryId: string
  ): Promise<GraphNodeWithVersion | undefined> {
    try {
      // List nodes of this type and filter by entry_id property
      // TODO: Add index on properties.entry_id for performance
      const nodes = await this.nodeRepo.list({ nodeTypeName: entryType }, { limit: 1000 });

      return nodes.find((n) => {
        const props = n.properties as Record<string, unknown> | null;
        return props?.entry_id === entryId;
      });
    } catch (error) {
      logger.warn(
        { entryType, entryId, error: error instanceof Error ? error.message : String(error) },
        'Error finding node by entry'
      );
      return undefined;
    }
  }
}

/**
 * Create a GraphSyncService instance
 */
export function createGraphSyncService(
  nodeRepo: INodeRepository,
  edgeRepo: IEdgeRepository,
  typeRegistry: ITypeRegistry
): GraphSyncService {
  return new GraphSyncService(nodeRepo, edgeRepo, typeRegistry);
}
