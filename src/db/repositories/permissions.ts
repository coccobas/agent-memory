import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '../connection.js';
import {
  permissions,
  type Permission,
  type NewPermission,
  type ScopeType,
  type PermissionEntryType,
} from '../schema.js';
import { generateId, type PaginationOptions, DEFAULT_LIMIT, MAX_LIMIT } from './base.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreatePermissionInput {
  agentId: string;
  scopeType?: ScopeType | null;
  scopeId?: string | null;
  entryType?: PermissionEntryType | null;
  entryId?: string | null;
  permission: 'read' | 'write' | 'admin';
}

export interface ListPermissionsFilter {
  agentId?: string;
  scopeType?: ScopeType | null;
  scopeId?: string | null;
  entryType?: PermissionEntryType | null;
  entryId?: string | null;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export const permissionRepo = {
  /**
   * Create or update a permission
   *
   * @param input - Permission creation parameters
   * @returns The created or updated permission
   */
  createOrUpdate(input: CreatePermissionInput): Permission {
    const db = getDb();

    // Check if permission already exists
    const conditions = [eq(permissions.agentId, input.agentId)];

    if (input.scopeType !== undefined) {
      if (input.scopeType === null) {
        conditions.push(isNull(permissions.scopeType));
      } else {
        conditions.push(eq(permissions.scopeType, input.scopeType));
      }
    }

    if (input.scopeId !== undefined) {
      if (input.scopeId === null) {
        conditions.push(isNull(permissions.scopeId));
      } else {
        conditions.push(eq(permissions.scopeId, input.scopeId));
      }
    }

    if (input.entryType !== undefined) {
      if (input.entryType === null) {
        conditions.push(isNull(permissions.entryType));
      } else {
        conditions.push(eq(permissions.entryType, input.entryType));
      }
    }

    if (input.entryId !== undefined) {
      if (input.entryId === null) {
        conditions.push(isNull(permissions.entryId));
      } else {
        conditions.push(eq(permissions.entryId, input.entryId));
      }
    }

    const existing = db
      .select()
      .from(permissions)
      .where(and(...conditions))
      .get();

    if (existing) {
      // Update existing permission
      db.update(permissions)
        .set({
          permission: input.permission,
        })
        .where(eq(permissions.id, existing.id))
        .run();
      return db
        .select()
        .from(permissions)
        .where(eq(permissions.id, existing.id))
        .get() as Permission;
    }

    // Create new permission
    const permissionId = generateId();
    const permission: NewPermission = {
      id: permissionId,
      agentId: input.agentId,
      scopeType: input.scopeType ?? null,
      scopeId: input.scopeId ?? null,
      entryType: input.entryType ?? null,
      entryId: input.entryId ?? null,
      permission: input.permission,
    };

    db.insert(permissions).values(permission).run();
    return db
      .select()
      .from(permissions)
      .where(eq(permissions.id, permissionId))
      .get() as Permission;
  },

  /**
   * Get a permission by ID
   */
  getById(id: string): Permission | undefined {
    const db = getDb();
    return db.select().from(permissions).where(eq(permissions.id, id)).get() as
      | Permission
      | undefined;
  },

  /**
   * List permissions with optional filters
   */
  list(filter: ListPermissionsFilter = {}, options: PaginationOptions = {}): Permission[] {
    const db = getDb();
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options.offset ?? 0;

    const conditions = [];

    if (filter.agentId) {
      conditions.push(eq(permissions.agentId, filter.agentId));
    }

    if (filter.scopeType !== undefined) {
      if (filter.scopeType === null) {
        conditions.push(isNull(permissions.scopeType));
      } else {
        conditions.push(eq(permissions.scopeType, filter.scopeType));
      }
    }

    if (filter.scopeId !== undefined) {
      if (filter.scopeId === null) {
        conditions.push(isNull(permissions.scopeId));
      } else {
        conditions.push(eq(permissions.scopeId, filter.scopeId));
      }
    }

    if (filter.entryType !== undefined) {
      if (filter.entryType === null) {
        conditions.push(isNull(permissions.entryType));
      } else {
        conditions.push(eq(permissions.entryType, filter.entryType));
      }
    }

    if (filter.entryId !== undefined) {
      if (filter.entryId === null) {
        conditions.push(isNull(permissions.entryId));
      } else {
        conditions.push(eq(permissions.entryId, filter.entryId));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db
      .select()
      .from(permissions)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .all() as Permission[];
  },

  /**
   * Delete a permission by ID
   */
  delete(id: string): void {
    const db = getDb();
    db.delete(permissions).where(eq(permissions.id, id)).run();
  },

  /**
   * Delete permissions matching filter
   */
  deleteByFilter(filter: ListPermissionsFilter): number {
    const db = getDb();

    const conditions = [];

    if (filter.agentId) {
      conditions.push(eq(permissions.agentId, filter.agentId));
    }

    if (filter.scopeType !== undefined) {
      if (filter.scopeType === null) {
        conditions.push(isNull(permissions.scopeType));
      } else {
        conditions.push(eq(permissions.scopeType, filter.scopeType));
      }
    }

    if (filter.scopeId !== undefined) {
      if (filter.scopeId === null) {
        conditions.push(isNull(permissions.scopeId));
      } else {
        conditions.push(eq(permissions.scopeId, filter.scopeId));
      }
    }

    if (filter.entryType !== undefined) {
      if (filter.entryType === null) {
        conditions.push(isNull(permissions.entryType));
      } else {
        conditions.push(eq(permissions.entryType, filter.entryType));
      }
    }

    if (filter.entryId !== undefined) {
      if (filter.entryId === null) {
        conditions.push(isNull(permissions.entryId));
      } else {
        conditions.push(eq(permissions.entryId, filter.entryId));
      }
    }

    if (conditions.length === 0) {
      return 0; // Don't delete all permissions without explicit filter
    }

    const whereClause = and(...conditions);
    const result = db.delete(permissions).where(whereClause).run();
    return result.changes ?? 0;
  },
};
