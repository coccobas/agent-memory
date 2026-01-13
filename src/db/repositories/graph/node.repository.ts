/**
 * Node Repository
 *
 * CRUD operations for graph nodes with versioning support.
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { transactionWithRetry } from '../../connection.js';
import {
  nodes,
  nodeVersions,
  nodeTypes,
  type GraphNode,
  type NewGraphNode,
  type NodeVersion,
  type NewNodeVersion,
  type ScopeType,
} from '../../schema.js';
import { generateId, now, type PaginationOptions } from '../base.js';
import { createValidationError } from '../../../core/errors.js';
import { createComponentLogger } from '../../../utils/logger.js';
import type { DatabaseDeps } from '../../../core/types.js';
import type {
  INodeRepository,
  CreateGraphNodeInput,
  UpdateGraphNodeInput,
  ListGraphNodesFilter,
  GraphNodeWithVersion,
} from '../../../core/interfaces/repositories.js';

const logger = createComponentLogger('node-repository');

// =============================================================================
// NODE REPOSITORY FACTORY
// =============================================================================

/**
 * Create a node repository with injected database dependencies
 */
export function createNodeRepository(deps: DatabaseDeps): INodeRepository {
  const { db, sqlite } = deps;

  /**
   * Resolve node type ID from name
   */
  function resolveNodeTypeId(typeName: string): string {
    const nodeType = db
      .select()
      .from(nodeTypes)
      .where(eq(nodeTypes.name, typeName))
      .get();

    if (!nodeType) {
      throw createValidationError('nodeTypeName', `Node type '${typeName}' not found`);
    }
    return nodeType.id;
  }

  /**
   * Get node with current version (sync helper for transactions)
   */
  function getByIdSync(id: string): GraphNodeWithVersion | undefined {
    const node = db.select().from(nodes).where(eq(nodes.id, id)).get();
    if (!node) return undefined;

    const nodeType = db
      .select()
      .from(nodeTypes)
      .where(eq(nodeTypes.id, node.nodeTypeId))
      .get();

    const currentVersion = node.currentVersionId
      ? db
          .select()
          .from(nodeVersions)
          .where(eq(nodeVersions.id, node.currentVersionId))
          .get()
      : undefined;

    return {
      ...node,
      nodeTypeName: nodeType?.name ?? 'unknown',
      currentVersion,
    };
  }

  const repo: INodeRepository = {
    async create(input: CreateGraphNodeInput): Promise<GraphNodeWithVersion> {
      if (!input.nodeTypeName) {
        throw createValidationError('nodeTypeName', 'nodeTypeName is required');
      }
      if (!input.name) {
        throw createValidationError('name', 'name is required');
      }
      if (!input.scopeType) {
        throw createValidationError('scopeType', 'scopeType is required');
      }

      return await transactionWithRetry(sqlite!, () => {
        const nodeTypeId = resolveNodeTypeId(input.nodeTypeName);
        const nodeId = generateId();
        const versionId = generateId();
        const timestamp = now();

        // Check for name uniqueness within scope
        const existing = db
          .select()
          .from(nodes)
          .where(
            and(
              eq(nodes.nodeTypeId, nodeTypeId),
              eq(nodes.scopeType, input.scopeType),
              input.scopeId ? eq(nodes.scopeId, input.scopeId) : sql`${nodes.scopeId} IS NULL`,
              eq(nodes.name, input.name)
            )
          )
          .get();

        if (existing) {
          throw createValidationError(
            'name',
            `Node '${input.name}' of type '${input.nodeTypeName}' already exists in this scope`
          );
        }

        // Create the node entry
        const nodeEntry: NewGraphNode = {
          id: nodeId,
          nodeTypeId,
          scopeType: input.scopeType,
          scopeId: input.scopeId ?? null,
          name: input.name,
          properties: input.properties ?? {},
          currentVersionId: null,
          isActive: true,
          accessCount: 0,
          createdAt: timestamp,
          createdBy: input.createdBy ?? null,
          updatedAt: timestamp,
        };

        db.insert(nodes).values(nodeEntry).run();

        // Create the initial version
        const version: NewNodeVersion = {
          id: versionId,
          nodeId,
          versionNum: 1,
          properties: input.properties ?? {},
          changeReason: 'Initial version',
          validFrom: input.validFrom ?? null,
          validUntil: input.validUntil ?? null,
          createdAt: timestamp,
          createdBy: input.createdBy ?? null,
        };

        db.insert(nodeVersions).values(version).run();

        // Update currentVersionId
        db.update(nodes)
          .set({ currentVersionId: versionId })
          .where(eq(nodes.id, nodeId))
          .run();

        const result = getByIdSync(nodeId);
        if (!result) {
          throw createValidationError('id', `Failed to create node with id ${nodeId}`);
        }

        logger.info({ nodeId, type: input.nodeTypeName, name: input.name }, 'Created node');
        return result;
      });
    },

    async getById(id: string): Promise<GraphNodeWithVersion | undefined> {
      return getByIdSync(id);
    },

    async getByName(
      nodeTypeName: string,
      name: string,
      scopeType: ScopeType,
      scopeId?: string
    ): Promise<GraphNodeWithVersion | undefined> {
      const nodeType = db
        .select()
        .from(nodeTypes)
        .where(eq(nodeTypes.name, nodeTypeName))
        .get();

      if (!nodeType) return undefined;

      const node = db
        .select()
        .from(nodes)
        .where(
          and(
            eq(nodes.nodeTypeId, nodeType.id),
            eq(nodes.scopeType, scopeType),
            scopeId ? eq(nodes.scopeId, scopeId) : sql`${nodes.scopeId} IS NULL`,
            eq(nodes.name, name)
          )
        )
        .get();

      if (!node) return undefined;
      return getByIdSync(node.id);
    },

    async list(
      filter?: ListGraphNodesFilter,
      options?: PaginationOptions
    ): Promise<GraphNodeWithVersion[]> {
      const limit = options?.limit ?? 20;
      const offset = options?.offset ?? 0;

      // Build query conditions
      const conditions: ReturnType<typeof eq>[] = [];

      if (filter?.nodeTypeName) {
        const nodeType = db
          .select()
          .from(nodeTypes)
          .where(eq(nodeTypes.name, filter.nodeTypeName))
          .get();
        if (nodeType) {
          conditions.push(eq(nodes.nodeTypeId, nodeType.id));
        } else {
          return []; // Type doesn't exist, no results
        }
      }

      if (filter?.scopeType) {
        conditions.push(eq(nodes.scopeType, filter.scopeType));
      }

      if (filter?.scopeId !== undefined) {
        if (filter.scopeId) {
          conditions.push(eq(nodes.scopeId, filter.scopeId));
        } else {
          conditions.push(sql`${nodes.scopeId} IS NULL`);
        }
      }

      if (filter?.isActive !== undefined) {
        conditions.push(eq(nodes.isActive, filter.isActive));
      }

      // Execute query
      const results =
        conditions.length > 0
          ? db
              .select()
              .from(nodes)
              .where(and(...conditions))
              .orderBy(desc(nodes.createdAt))
              .limit(limit)
              .offset(offset)
              .all()
          : db
              .select()
              .from(nodes)
              .orderBy(desc(nodes.createdAt))
              .limit(limit)
              .offset(offset)
              .all();

      // Bug #264 fix: Batch fetch node types and versions to avoid N+1 query pattern
      if (results.length === 0) {
        return [];
      }

      // Collect unique IDs for batch queries
      const nodeTypeIds = [...new Set(results.map((n) => n.nodeTypeId))];
      const versionIds = results
        .map((n) => n.currentVersionId)
        .filter((id): id is string => id !== null);

      // Batch fetch node types (1 query instead of N)
      const nodeTypeMap = new Map<string, string>();
      if (nodeTypeIds.length > 0) {
        const types = db
          .select({ id: nodeTypes.id, name: nodeTypes.name })
          .from(nodeTypes)
          .where(inArray(nodeTypes.id, nodeTypeIds))
          .all();
        for (const t of types) {
          nodeTypeMap.set(t.id, t.name);
        }
      }

      // Batch fetch versions (1 query instead of N)
      const versionMap = new Map<string, typeof nodeVersions.$inferSelect>();
      if (versionIds.length > 0) {
        const versions = db
          .select()
          .from(nodeVersions)
          .where(inArray(nodeVersions.id, versionIds))
          .all();
        for (const v of versions) {
          versionMap.set(v.id, v);
        }
      }

      // Map results with pre-fetched data
      return results.map((node) => ({
        ...node,
        nodeTypeName: nodeTypeMap.get(node.nodeTypeId) ?? 'unknown',
        currentVersion: node.currentVersionId ? versionMap.get(node.currentVersionId) : undefined,
      }));
    },

    async update(
      id: string,
      input: UpdateGraphNodeInput
    ): Promise<GraphNodeWithVersion | undefined> {
      return await transactionWithRetry(sqlite!, () => {
        const existing = db.select().from(nodes).where(eq(nodes.id, id)).get();
        if (!existing) return undefined;

        const timestamp = now();

        // Get current version number
        const lastVersion = db
          .select()
          .from(nodeVersions)
          .where(eq(nodeVersions.nodeId, id))
          .orderBy(desc(nodeVersions.versionNum))
          .limit(1)
          .get();

        const newVersionNum = (lastVersion?.versionNum ?? 0) + 1;
        const versionId = generateId();

        // Create new version if properties changed
        if (input.properties !== undefined) {
          const version: NewNodeVersion = {
            id: versionId,
            nodeId: id,
            versionNum: newVersionNum,
            properties: input.properties,
            changeReason: input.changeReason ?? null,
            validFrom: input.validFrom ?? null,
            validUntil: input.validUntil ?? null,
            createdAt: timestamp,
            createdBy: input.updatedBy ?? null,
          };

          db.insert(nodeVersions).values(version).run();
        }

        // Update node
        const updates: Partial<GraphNode> = {
          updatedAt: timestamp,
        };

        if (input.name !== undefined) {
          updates.name = input.name;
        }

        if (input.properties !== undefined) {
          updates.properties = input.properties;
          updates.currentVersionId = versionId;
        }

        db.update(nodes).set(updates).where(eq(nodes.id, id)).run();

        logger.info({ nodeId: id }, 'Updated node');
        return getByIdSync(id);
      });
    },

    async getHistory(nodeId: string): Promise<NodeVersion[]> {
      return db
        .select()
        .from(nodeVersions)
        .where(eq(nodeVersions.nodeId, nodeId))
        .orderBy(desc(nodeVersions.versionNum))
        .all();
    },

    async deactivate(id: string): Promise<boolean> {
      const result = db
        .update(nodes)
        .set({ isActive: false, updatedAt: now() })
        .where(eq(nodes.id, id))
        .run();

      if (result.changes > 0) {
        logger.info({ nodeId: id }, 'Deactivated node');
        return true;
      }
      return false;
    },

    async reactivate(id: string): Promise<boolean> {
      const result = db
        .update(nodes)
        .set({ isActive: true, updatedAt: now() })
        .where(eq(nodes.id, id))
        .run();

      if (result.changes > 0) {
        logger.info({ nodeId: id }, 'Reactivated node');
        return true;
      }
      return false;
    },

    async delete(id: string): Promise<boolean> {
      return await transactionWithRetry(sqlite!, () => {
        const existing = db.select().from(nodes).where(eq(nodes.id, id)).get();
        if (!existing) return false;

        // Delete versions first (cascade should handle this, but be explicit)
        db.delete(nodeVersions).where(eq(nodeVersions.nodeId, id)).run();

        // Delete the node
        db.delete(nodes).where(eq(nodes.id, id)).run();

        logger.info({ nodeId: id }, 'Deleted node');
        return true;
      });
    },

    async updateAccessMetrics(id: string): Promise<void> {
      const timestamp = now();
      db.update(nodes)
        .set({
          lastAccessedAt: timestamp,
          accessCount: sql`${nodes.accessCount} + 1`,
        })
        .where(eq(nodes.id, id))
        .run();
    },
  };

  return repo;
}
