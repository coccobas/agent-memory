/**
 * Edge Repository
 *
 * CRUD operations for graph edges with traversal support.
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, desc, inArray } from 'drizzle-orm';
import { transactionWithRetry } from '../../connection.js';
import {
  edges,
  edgeTypes,
  nodes,
  nodeTypes,
  type GraphEdge,
  type NewGraphEdge,
} from '../../schema.js';
import { generateId, now, type PaginationOptions } from '../base.js';
import { createValidationError } from '../../../core/errors.js';
import { createComponentLogger } from '../../../utils/logger.js';
import type { DatabaseDeps } from '../../../core/types.js';
import type {
  IEdgeRepository,
  CreateGraphEdgeInput,
  UpdateGraphEdgeInput,
  ListGraphEdgesFilter,
  GraphEdgeWithType,
  GraphNodeWithVersion,
  INodeRepository,
} from '../../../core/interfaces/repositories.js';
import type { GraphTraversalOptions, GraphPath } from '../../schema/types.js';

const logger = createComponentLogger('edge-repository');

// =============================================================================
// EDGE REPOSITORY FACTORY
// =============================================================================

/**
 * Create an edge repository with injected database dependencies
 */
export function createEdgeRepository(
  deps: DatabaseDeps,
  nodeRepository: INodeRepository
): IEdgeRepository {
  const { db, sqlite } = deps;

  /**
   * Resolve edge type ID from name
   */
  function resolveEdgeTypeId(typeName: string): string {
    const edgeType = db
      .select()
      .from(edgeTypes)
      .where(eq(edgeTypes.name, typeName))
      .get();

    if (!edgeType) {
      throw createValidationError('edgeTypeName', `Edge type '${typeName}' not found`);
    }
    return edgeType.id;
  }

  /**
   * Get edge with type info
   */
  function getByIdSync(id: string): GraphEdgeWithType | undefined {
    const edge = db.select().from(edges).where(eq(edges.id, id)).get();
    if (!edge) return undefined;

    const edgeType = db
      .select()
      .from(edgeTypes)
      .where(eq(edgeTypes.id, edge.edgeTypeId))
      .get();

    return {
      ...edge,
      edgeTypeName: edgeType?.name ?? 'unknown',
      isDirected: edgeType?.isDirected ?? true,
      inverseName: edgeType?.inverseName ?? null,
    };
  }

  /**
   * Get node type name for validation
   */
  function getNodeTypeName(nodeId: string): string | undefined {
    const node = db.select().from(nodes).where(eq(nodes.id, nodeId)).get();
    if (!node) return undefined;

    const nodeType = db
      .select()
      .from(nodeTypes)
      .where(eq(nodeTypes.id, node.nodeTypeId))
      .get();

    return nodeType?.name;
  }

  const repo: IEdgeRepository = {
    async create(input: CreateGraphEdgeInput): Promise<GraphEdgeWithType> {
      if (!input.edgeTypeName) {
        throw createValidationError('edgeTypeName', 'edgeTypeName is required');
      }
      if (!input.sourceId) {
        throw createValidationError('sourceId', 'sourceId is required');
      }
      if (!input.targetId) {
        throw createValidationError('targetId', 'targetId is required');
      }

      return await transactionWithRetry(sqlite!, () => {
        const edgeTypeId = resolveEdgeTypeId(input.edgeTypeName);

        // Validate source node exists
        const sourceNode = db
          .select()
          .from(nodes)
          .where(eq(nodes.id, input.sourceId))
          .get();
        if (!sourceNode) {
          throw createValidationError('sourceId', `Source node '${input.sourceId}' not found`);
        }

        // Validate target node exists
        const targetNode = db
          .select()
          .from(nodes)
          .where(eq(nodes.id, input.targetId))
          .get();
        if (!targetNode) {
          throw createValidationError('targetId', `Target node '${input.targetId}' not found`);
        }

        // Check edge type constraints
        const edgeType = db
          .select()
          .from(edgeTypes)
          .where(eq(edgeTypes.id, edgeTypeId))
          .get();

        if (edgeType?.sourceConstraints) {
          const sourceTypeName = getNodeTypeName(input.sourceId);
          if (
            sourceTypeName &&
            !edgeType.sourceConstraints.includes(sourceTypeName)
          ) {
            throw createValidationError(
              'sourceId',
              `Edge type '${input.edgeTypeName}' does not allow source type '${sourceTypeName}'`
            );
          }
        }

        if (edgeType?.targetConstraints) {
          const targetTypeName = getNodeTypeName(input.targetId);
          if (
            targetTypeName &&
            !edgeType.targetConstraints.includes(targetTypeName)
          ) {
            throw createValidationError(
              'targetId',
              `Edge type '${input.edgeTypeName}' does not allow target type '${targetTypeName}'`
            );
          }
        }

        // Check for duplicate edge
        const existing = db
          .select()
          .from(edges)
          .where(
            and(
              eq(edges.sourceId, input.sourceId),
              eq(edges.targetId, input.targetId),
              eq(edges.edgeTypeId, edgeTypeId)
            )
          )
          .get();

        if (existing) {
          throw createValidationError(
            'edgeTypeName',
            `Edge of type '${input.edgeTypeName}' already exists between these nodes`
          );
        }

        const edgeId = generateId();
        const timestamp = now();

        const edgeEntry: NewGraphEdge = {
          id: edgeId,
          edgeTypeId,
          sourceId: input.sourceId,
          targetId: input.targetId,
          properties: input.properties ?? {},
          weight: input.weight ?? 1.0,
          createdAt: timestamp,
          createdBy: input.createdBy ?? null,
        };

        db.insert(edges).values(edgeEntry).run();

        const result = getByIdSync(edgeId);
        if (!result) {
          throw createValidationError('id', `Failed to create edge with id ${edgeId}`);
        }

        logger.info(
          {
            edgeId,
            type: input.edgeTypeName,
            source: input.sourceId,
            target: input.targetId,
          },
          'Created edge'
        );
        return result;
      });
    },

    async getById(id: string): Promise<GraphEdgeWithType | undefined> {
      return getByIdSync(id);
    },

    async list(
      filter?: ListGraphEdgesFilter,
      options?: PaginationOptions
    ): Promise<GraphEdgeWithType[]> {
      const limit = options?.limit ?? 20;
      const offset = options?.offset ?? 0;

      // Build query conditions
      const conditions: ReturnType<typeof eq>[] = [];

      if (filter?.edgeTypeName) {
        const edgeType = db
          .select()
          .from(edgeTypes)
          .where(eq(edgeTypes.name, filter.edgeTypeName))
          .get();
        if (edgeType) {
          conditions.push(eq(edges.edgeTypeId, edgeType.id));
        } else {
          return []; // Type doesn't exist, no results
        }
      }

      if (filter?.sourceId) {
        conditions.push(eq(edges.sourceId, filter.sourceId));
      }

      if (filter?.targetId) {
        conditions.push(eq(edges.targetId, filter.targetId));
      }

      // Execute query
      const results =
        conditions.length > 0
          ? db
              .select()
              .from(edges)
              .where(and(...conditions))
              .orderBy(desc(edges.createdAt))
              .limit(limit)
              .offset(offset)
              .all()
          : db
              .select()
              .from(edges)
              .orderBy(desc(edges.createdAt))
              .limit(limit)
              .offset(offset)
              .all();

      // Fetch edge types
      return results.map((edge) => {
        const edgeType = db
          .select()
          .from(edgeTypes)
          .where(eq(edgeTypes.id, edge.edgeTypeId))
          .get();

        return {
          ...edge,
          edgeTypeName: edgeType?.name ?? 'unknown',
          isDirected: edgeType?.isDirected ?? true,
          inverseName: edgeType?.inverseName ?? null,
        };
      });
    },

    async update(
      id: string,
      input: UpdateGraphEdgeInput
    ): Promise<GraphEdgeWithType | undefined> {
      const existing = db.select().from(edges).where(eq(edges.id, id)).get();
      if (!existing) return undefined;

      const updates: Partial<GraphEdge> = {};

      if (input.properties !== undefined) {
        updates.properties = input.properties;
      }

      if (input.weight !== undefined) {
        updates.weight = input.weight;
      }

      if (Object.keys(updates).length > 0) {
        db.update(edges).set(updates).where(eq(edges.id, id)).run();
        logger.info({ edgeId: id }, 'Updated edge');
      }

      return getByIdSync(id);
    },

    async delete(id: string): Promise<boolean> {
      const existing = db.select().from(edges).where(eq(edges.id, id)).get();
      if (!existing) return false;

      db.delete(edges).where(eq(edges.id, id)).run();
      logger.info({ edgeId: id }, 'Deleted edge');
      return true;
    },

    async getOutgoingEdges(
      nodeId: string,
      edgeTypeName?: string
    ): Promise<GraphEdgeWithType[]> {
      const conditions: ReturnType<typeof eq>[] = [eq(edges.sourceId, nodeId)];

      if (edgeTypeName) {
        const edgeType = db
          .select()
          .from(edgeTypes)
          .where(eq(edgeTypes.name, edgeTypeName))
          .get();
        if (edgeType) {
          conditions.push(eq(edges.edgeTypeId, edgeType.id));
        } else {
          return [];
        }
      }

      const results = db
        .select()
        .from(edges)
        .where(and(...conditions))
        .all();

      return results.map((edge) => {
        const edgeType = db
          .select()
          .from(edgeTypes)
          .where(eq(edgeTypes.id, edge.edgeTypeId))
          .get();

        return {
          ...edge,
          edgeTypeName: edgeType?.name ?? 'unknown',
          isDirected: edgeType?.isDirected ?? true,
          inverseName: edgeType?.inverseName ?? null,
        };
      });
    },

    async getIncomingEdges(
      nodeId: string,
      edgeTypeName?: string
    ): Promise<GraphEdgeWithType[]> {
      const conditions: ReturnType<typeof eq>[] = [eq(edges.targetId, nodeId)];

      if (edgeTypeName) {
        const edgeType = db
          .select()
          .from(edgeTypes)
          .where(eq(edgeTypes.name, edgeTypeName))
          .get();
        if (edgeType) {
          conditions.push(eq(edges.edgeTypeId, edgeType.id));
        } else {
          return [];
        }
      }

      const results = db
        .select()
        .from(edges)
        .where(and(...conditions))
        .all();

      return results.map((edge) => {
        const edgeType = db
          .select()
          .from(edgeTypes)
          .where(eq(edgeTypes.id, edge.edgeTypeId))
          .get();

        return {
          ...edge,
          edgeTypeName: edgeType?.name ?? 'unknown',
          isDirected: edgeType?.isDirected ?? true,
          inverseName: edgeType?.inverseName ?? null,
        };
      });
    },

    async getNeighbors(
      nodeId: string,
      options?: GraphTraversalOptions
    ): Promise<GraphNodeWithVersion[]> {
      const direction = options?.direction ?? 'both';
      const neighborIds = new Set<string>();

      // Get edge type IDs if filtering
      let edgeTypeIds: string[] | undefined;
      if (options?.edgeTypes && options.edgeTypes.length > 0) {
        edgeTypeIds = [];
        for (const typeName of options.edgeTypes) {
          const edgeType = db
            .select()
            .from(edgeTypes)
            .where(eq(edgeTypes.name, typeName))
            .get();
          if (edgeType) {
            edgeTypeIds.push(edgeType.id);
          }
        }
        if (edgeTypeIds.length === 0) {
          return []; // No valid edge types
        }
      }

      // Get outgoing neighbors
      if (direction === 'out' || direction === 'both') {
        const conditions: ReturnType<typeof eq>[] = [eq(edges.sourceId, nodeId)];
        if (edgeTypeIds) {
          conditions.push(inArray(edges.edgeTypeId, edgeTypeIds));
        }

        const outgoing = db
          .select()
          .from(edges)
          .where(and(...conditions))
          .all();

        for (const edge of outgoing) {
          neighborIds.add(edge.targetId);
        }
      }

      // Get incoming neighbors
      if (direction === 'in' || direction === 'both') {
        const conditions: ReturnType<typeof eq>[] = [eq(edges.targetId, nodeId)];
        if (edgeTypeIds) {
          conditions.push(inArray(edges.edgeTypeId, edgeTypeIds));
        }

        const incoming = db
          .select()
          .from(edges)
          .where(and(...conditions))
          .all();

        for (const edge of incoming) {
          neighborIds.add(edge.sourceId);
        }
      }

      // Fetch nodes with optional type filter
      const results: GraphNodeWithVersion[] = [];
      for (const id of neighborIds) {
        const node = await nodeRepository.getById(id);
        if (node) {
          // Apply node type filter
          if (options?.nodeTypeFilter && options.nodeTypeFilter.length > 0) {
            if (!options.nodeTypeFilter.includes(node.nodeTypeName)) {
              continue;
            }
          }
          results.push(node);
        }
      }

      // Apply limit
      if (options?.limit && results.length > options.limit) {
        return results.slice(0, options.limit);
      }

      return results;
    },

    async traverse(
      startNodeId: string,
      options?: GraphTraversalOptions
    ): Promise<GraphNodeWithVersion[]> {
      const maxDepth = options?.maxDepth ?? 3;
      const visited = new Set<string>([startNodeId]);
      const results: GraphNodeWithVersion[] = [];

      // BFS traversal
      let currentLevel = [startNodeId];

      for (let depth = 0; depth < maxDepth && currentLevel.length > 0; depth++) {
        const nextLevel: string[] = [];

        for (const nodeId of currentLevel) {
          const neighbors = await this.getNeighbors(nodeId, options);

          for (const neighbor of neighbors) {
            if (!visited.has(neighbor.id)) {
              visited.add(neighbor.id);
              results.push(neighbor);
              nextLevel.push(neighbor.id);
            }
          }
        }

        currentLevel = nextLevel;
      }

      // Apply limit
      if (options?.limit && results.length > options.limit) {
        return results.slice(0, options.limit);
      }

      return results;
    },

    async findPaths(
      startNodeId: string,
      endNodeId: string,
      maxDepth?: number
    ): Promise<GraphPath[]> {
      const maxPathDepth = maxDepth ?? 5;
      const paths: GraphPath[] = [];

      // DFS path finding
      interface PathState {
        nodeId: string;
        nodePath: Array<{ id: string; type: string; name: string }>;
        edgePath: Array<{ id: string; type: string; sourceId: string; targetId: string }>;
      }

      const stack: PathState[] = [];

      // Get start node info
      const startNode = await nodeRepository.getById(startNodeId);
      if (!startNode) return [];

      stack.push({
        nodeId: startNodeId,
        nodePath: [
          { id: startNode.id, type: startNode.nodeTypeName, name: startNode.name },
        ],
        edgePath: [],
      });

      while (stack.length > 0 && paths.length < 100) {
        // Limit results
        const current = stack.pop()!;

        if (current.nodeId === endNodeId) {
          paths.push({
            nodes: current.nodePath,
            edges: current.edgePath,
            totalDepth: current.edgePath.length,
          });
          continue;
        }

        if (current.edgePath.length >= maxPathDepth) {
          continue;
        }

        // Get outgoing edges
        const outgoingEdges = await this.getOutgoingEdges(current.nodeId);

        for (const edge of outgoingEdges) {
          // Avoid cycles
          if (current.nodePath.some((n) => n.id === edge.targetId)) {
            continue;
          }

          const targetNode = await nodeRepository.getById(edge.targetId);
          if (!targetNode) continue;

          stack.push({
            nodeId: edge.targetId,
            nodePath: [
              ...current.nodePath,
              { id: targetNode.id, type: targetNode.nodeTypeName, name: targetNode.name },
            ],
            edgePath: [
              ...current.edgePath,
              {
                id: edge.id,
                type: edge.edgeTypeName,
                sourceId: edge.sourceId,
                targetId: edge.targetId,
              },
            ],
          });
        }
      }

      return paths;
    },
  };

  return repo;
}
