/**
 * Type Registry Service
 *
 * Manages dynamic node and edge type definitions for the flexible knowledge graph.
 * Provides type registration, validation, and lookup with caching.
 */

import { eq } from 'drizzle-orm';
import { nodeTypes, edgeTypes, type NodeType, type EdgeType } from '../../db/schema/graph.js';
import type {
  ITypeRegistry,
  RegisterNodeTypeInput,
  RegisterEdgeTypeInput,
  TypeValidationResult,
} from '../../core/interfaces/repositories.js';
import type { DatabaseDeps } from '../../core/types.js';
import { generateId, now } from '../../db/repositories/base.js';
import { createComponentLogger } from '../../utils/logger.js';
import { LRUCache } from '../../utils/lru-cache.js';
import { BUILTIN_NODE_TYPES, BUILTIN_EDGE_TYPES } from './builtin-types.js';

const logger = createComponentLogger('type-registry');

/**
 * Simple JSON Schema validator
 * For production, consider using ajv for full JSON Schema support
 */
function validateAgainstSchema(
  data: unknown,
  schema: Record<string, unknown>
): TypeValidationResult {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Data must be an object'] };
  }

  const dataObj = data as Record<string, unknown>;
  const properties = schema.properties as Record<string, { type?: string; required?: boolean }> | undefined;
  const required = schema.required as string[] | undefined;

  // Check required fields
  if (required) {
    for (const field of required) {
      if (!(field in dataObj) || dataObj[field] === undefined || dataObj[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check property types
  if (properties) {
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in dataObj && dataObj[key] !== undefined && dataObj[key] !== null) {
        const value = dataObj[key];
        const expectedType = propSchema.type;

        if (expectedType) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (expectedType !== actualType) {
            errors.push(`Field '${key}' expected type '${expectedType}', got '${actualType}'`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Create a TypeRegistry service instance
 */
export function createTypeRegistry(deps: DatabaseDeps): ITypeRegistry {
  const { db } = deps;

  // In-memory caches for fast lookup
  const nodeTypeCache = new LRUCache<NodeType>({ maxSize: 100, ttlMs: 5 * 60 * 1000 });
  const edgeTypeCache = new LRUCache<EdgeType>({ maxSize: 100, ttlMs: 5 * 60 * 1000 });

  // Name to ID mappings
  const nodeTypeNameToId = new Map<string, string>();
  const edgeTypeNameToId = new Map<string, string>();

  /**
   * Refresh name-to-ID mappings from database
   */
  function refreshNodeTypeMappings(): void {
    const types = db.select().from(nodeTypes).all();
    nodeTypeNameToId.clear();
    for (const t of types) {
      nodeTypeNameToId.set(t.name, t.id);
      nodeTypeCache.set(t.id, t);
    }
  }

  function refreshEdgeTypeMappings(): void {
    const types = db.select().from(edgeTypes).all();
    edgeTypeNameToId.clear();
    for (const t of types) {
      edgeTypeNameToId.set(t.name, t.id);
      edgeTypeCache.set(t.id, t);
    }
  }

  return {
    // =========================================================================
    // NODE TYPES
    // =========================================================================

    async registerNodeType(input: RegisterNodeTypeInput): Promise<NodeType> {
      // Check if type already exists
      const existing = db
        .select()
        .from(nodeTypes)
        .where(eq(nodeTypes.name, input.name))
        .get();

      if (existing) {
        throw new Error(`Node type '${input.name}' already exists`);
      }

      // Resolve parent type ID if provided
      let parentTypeId: string | undefined;
      if (input.parentTypeName) {
        const parent = db
          .select()
          .from(nodeTypes)
          .where(eq(nodeTypes.name, input.parentTypeName))
          .get();

        if (!parent) {
          throw new Error(`Parent node type '${input.parentTypeName}' not found`);
        }
        parentTypeId = parent.id;
      }

      const id = generateId();
      const nodeType: NodeType = {
        id,
        name: input.name,
        schema: input.schema,
        description: input.description ?? null,
        parentTypeId: parentTypeId ?? null,
        isBuiltin: false,
        createdAt: now(),
        createdBy: input.createdBy ?? null,
      };

      db.insert(nodeTypes).values(nodeType).run();

      // Update cache
      nodeTypeCache.set(id, nodeType);
      nodeTypeNameToId.set(input.name, id);

      logger.info({ name: input.name, id }, 'Registered node type');
      return nodeType;
    },

    async getNodeType(name: string): Promise<NodeType | undefined> {
      // Check cache first
      const cachedId = nodeTypeNameToId.get(name);
      if (cachedId) {
        const cached = nodeTypeCache.get(cachedId);
        if (cached) return cached;
      }

      // Query database
      const result = db
        .select()
        .from(nodeTypes)
        .where(eq(nodeTypes.name, name))
        .get();

      if (result) {
        nodeTypeCache.set(result.id, result);
        nodeTypeNameToId.set(result.name, result.id);
      }

      return result;
    },

    async getNodeTypeById(id: string): Promise<NodeType | undefined> {
      // Check cache first
      const cached = nodeTypeCache.get(id);
      if (cached) return cached;

      // Query database
      const result = db
        .select()
        .from(nodeTypes)
        .where(eq(nodeTypes.id, id))
        .get();

      if (result) {
        nodeTypeCache.set(result.id, result);
        nodeTypeNameToId.set(result.name, result.id);
      }

      return result;
    },

    async listNodeTypes(options?: { includeBuiltin?: boolean }): Promise<NodeType[]> {
      const results = db.select().from(nodeTypes).all();

      if (options?.includeBuiltin === false) {
        return results.filter((t) => !t.isBuiltin);
      }

      return results;
    },

    async validateNodeProperties(
      typeName: string,
      properties: unknown
    ): Promise<TypeValidationResult> {
      const nodeType = await this.getNodeType(typeName);

      if (!nodeType) {
        return { valid: false, errors: [`Node type '${typeName}' not found`] };
      }

      return validateAgainstSchema(properties, nodeType.schema);
    },

    async deleteNodeType(name: string): Promise<boolean> {
      const existing = db
        .select()
        .from(nodeTypes)
        .where(eq(nodeTypes.name, name))
        .get();

      if (!existing) {
        return false;
      }

      if (existing.isBuiltin) {
        throw new Error(`Cannot delete built-in node type '${name}'`);
      }

      db.delete(nodeTypes).where(eq(nodeTypes.name, name)).run();

      // Clear cache
      nodeTypeCache.delete(existing.id);
      nodeTypeNameToId.delete(name);

      logger.info({ name }, 'Deleted node type');
      return true;
    },

    // =========================================================================
    // EDGE TYPES
    // =========================================================================

    async registerEdgeType(input: RegisterEdgeTypeInput): Promise<EdgeType> {
      // Check if type already exists
      const existing = db
        .select()
        .from(edgeTypes)
        .where(eq(edgeTypes.name, input.name))
        .get();

      if (existing) {
        throw new Error(`Edge type '${input.name}' already exists`);
      }

      const id = generateId();
      const edgeType: EdgeType = {
        id,
        name: input.name,
        schema: input.schema ?? null,
        description: input.description ?? null,
        isDirected: input.isDirected ?? true,
        inverseName: input.inverseName ?? null,
        sourceConstraints: input.sourceConstraints ?? null,
        targetConstraints: input.targetConstraints ?? null,
        isBuiltin: false,
        createdAt: now(),
        createdBy: input.createdBy ?? null,
      };

      db.insert(edgeTypes).values(edgeType).run();

      // Update cache
      edgeTypeCache.set(id, edgeType);
      edgeTypeNameToId.set(input.name, id);

      logger.info({ name: input.name, id }, 'Registered edge type');
      return edgeType;
    },

    async getEdgeType(name: string): Promise<EdgeType | undefined> {
      // Check cache first
      const cachedId = edgeTypeNameToId.get(name);
      if (cachedId) {
        const cached = edgeTypeCache.get(cachedId);
        if (cached) return cached;
      }

      // Query database
      const result = db
        .select()
        .from(edgeTypes)
        .where(eq(edgeTypes.name, name))
        .get();

      if (result) {
        edgeTypeCache.set(result.id, result);
        edgeTypeNameToId.set(result.name, result.id);
      }

      return result;
    },

    async getEdgeTypeById(id: string): Promise<EdgeType | undefined> {
      // Check cache first
      const cached = edgeTypeCache.get(id);
      if (cached) return cached;

      // Query database
      const result = db
        .select()
        .from(edgeTypes)
        .where(eq(edgeTypes.id, id))
        .get();

      if (result) {
        edgeTypeCache.set(result.id, result);
        edgeTypeNameToId.set(result.name, result.id);
      }

      return result;
    },

    async listEdgeTypes(options?: { includeBuiltin?: boolean }): Promise<EdgeType[]> {
      const results = db.select().from(edgeTypes).all();

      if (options?.includeBuiltin === false) {
        return results.filter((t) => !t.isBuiltin);
      }

      return results;
    },

    async validateEdgeProperties(
      typeName: string,
      properties: unknown
    ): Promise<TypeValidationResult> {
      const edgeType = await this.getEdgeType(typeName);

      if (!edgeType) {
        return { valid: false, errors: [`Edge type '${typeName}' not found`] };
      }

      // Edge properties are optional, so if no schema, always valid
      if (!edgeType.schema) {
        return { valid: true };
      }

      return validateAgainstSchema(properties, edgeType.schema);
    },

    async deleteEdgeType(name: string): Promise<boolean> {
      const existing = db
        .select()
        .from(edgeTypes)
        .where(eq(edgeTypes.name, name))
        .get();

      if (!existing) {
        return false;
      }

      if (existing.isBuiltin) {
        throw new Error(`Cannot delete built-in edge type '${name}'`);
      }

      db.delete(edgeTypes).where(eq(edgeTypes.name, name)).run();

      // Clear cache
      edgeTypeCache.delete(existing.id);
      edgeTypeNameToId.delete(name);

      logger.info({ name }, 'Deleted edge type');
      return true;
    },

    // =========================================================================
    // SEEDING
    // =========================================================================

    async seedBuiltinTypes(): Promise<void> {
      logger.info('Seeding built-in node and edge types...');

      // Seed node types
      for (const typeDef of BUILTIN_NODE_TYPES) {
        const existing = db
          .select()
          .from(nodeTypes)
          .where(eq(nodeTypes.name, typeDef.name))
          .get();

        if (!existing) {
          const id = generateId();
          db.insert(nodeTypes)
            .values({
              id,
              name: typeDef.name,
              schema: typeDef.schema,
              description: typeDef.description,
              parentTypeId: null, // Resolved after all types created
              isBuiltin: true,
              createdAt: now(),
              createdBy: 'system',
            })
            .run();
          logger.debug({ name: typeDef.name }, 'Created built-in node type');
        }
      }

      // Resolve parent type references
      for (const typeDef of BUILTIN_NODE_TYPES) {
        if (typeDef.parentTypeName) {
          const parent = db
            .select()
            .from(nodeTypes)
            .where(eq(nodeTypes.name, typeDef.parentTypeName))
            .get();

          if (parent) {
            db.update(nodeTypes)
              .set({ parentTypeId: parent.id })
              .where(eq(nodeTypes.name, typeDef.name))
              .run();
          }
        }
      }

      // Seed edge types
      for (const typeDef of BUILTIN_EDGE_TYPES) {
        const existing = db
          .select()
          .from(edgeTypes)
          .where(eq(edgeTypes.name, typeDef.name))
          .get();

        if (!existing) {
          const id = generateId();
          db.insert(edgeTypes)
            .values({
              id,
              name: typeDef.name,
              schema: typeDef.schema ?? null,
              description: typeDef.description,
              isDirected: typeDef.isDirected ?? true,
              inverseName: typeDef.inverseName ?? null,
              sourceConstraints: typeDef.sourceConstraints ?? null,
              targetConstraints: typeDef.targetConstraints ?? null,
              isBuiltin: true,
              createdAt: now(),
              createdBy: 'system',
            })
            .run();
          logger.debug({ name: typeDef.name }, 'Created built-in edge type');
        }
      }

      // Refresh caches
      refreshNodeTypeMappings();
      refreshEdgeTypeMappings();

      logger.info(
        {
          nodeTypes: BUILTIN_NODE_TYPES.length,
          edgeTypes: BUILTIN_EDGE_TYPES.length,
        },
        'Built-in types seeded'
      );
    },
  };
}
