/**
 * Permission service for fine-grained access control
 *
 * Default behavior: If no permissions are configured, all agents have full access (backward compatible)
 */

import { getDb } from '../db/connection.js';
import { permissions } from '../db/schema.js';
import { eq, and, or, isNull } from 'drizzle-orm';
import type { ScopeType, PermissionEntryType, EntryType } from '../db/schema.js';

export type PermissionLevel = 'read' | 'write' | 'admin';
export type Action = 'read' | 'write' | 'delete';

/**
 * Check if an agent has permission to perform an action
 *
 * Permission hierarchy:
 * - admin: can read, write, and delete
 * - write: can read and write
 * - read: can only read
 *
 * Scope inheritance:
 * - Permissions at more specific scopes override less specific ones
 * - Global permissions apply to all scopes unless overridden
 *
 * @param agentId - The agent/user ID
 * @param action - The action to check (read, write, delete)
 * @param entryType - The type of entry (tool, guideline, knowledge)
 * @param entryId - The entry ID (optional, for entry-specific permissions)
 * @param scopeType - The scope type
 * @param scopeId - The scope ID (optional)
 * @returns true if the agent has permission, false otherwise
 */
export function checkPermission(
  agentId: string | null | undefined,
  action: Action,
  entryType: EntryType,
  entryId: string | null | undefined,
  scopeType: ScopeType,
  scopeId: string | null | undefined
): boolean {
  // If no agentId provided, deny access (security by default)
  if (!agentId) {
    return false;
  }

  // Filter out 'project' from entryType as it's not supported in permissions schema
  if (entryType === 'project') {
    return true; // Default to allow for project entries
  }

  const db = getDb();

  // Check if any permissions exist - if not, default to full access (backward compatible)
  // Handle case where permissions table doesn't exist yet (during migration)
  try {
    const permCount = db.select().from(permissions).limit(1).all().length;
    if (permCount === 0) {
      return true; // No permissions configured = full access for backward compatibility
    }
  } catch (error) {
    // If permissions table doesn't exist yet (during migration), default to allow
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('no such table') || errorMessage.includes('permissions')) {
      return true; // Table doesn't exist yet, default to allow
    }
    throw error; // Re-throw other errors
  }

  // Map action to required permission level
  const requiredPermission: PermissionLevel =
    action === 'read' ? 'read' : action === 'write' ? 'write' : 'admin';

  // Build permission check query
  // Check in order of specificity:
  // 1. Entry-specific permission in this scope
  // 2. Entry-specific permission in parent scopes
  // 3. Entry-type permission in this scope
  // 4. Entry-type permission in parent scopes
  // 5. Global permission for this entry type

  const conditions = [];

  // Entry-specific permission in this scope
  if (entryId) {
    conditions.push(
      and(
        eq(permissions.agentId, agentId),
        eq(permissions.entryType, entryType as PermissionEntryType),
        eq(permissions.entryId, entryId),
        eq(permissions.scopeType, scopeType),
        scopeId === null || scopeId === undefined
          ? isNull(permissions.scopeId)
          : eq(permissions.scopeId, scopeId)
      )
    );
  }

  // Entry-type permission in this scope
  conditions.push(
    and(
      eq(permissions.agentId, agentId),
      eq(permissions.entryType, entryType as 'tool' | 'guideline' | 'knowledge'),
      isNull(permissions.entryId),
      eq(permissions.scopeType, scopeType),
      scopeId === null || scopeId === undefined
        ? isNull(permissions.scopeId)
        : eq(permissions.scopeId, scopeId)
    )
  );

  // Global entry-type permission
  conditions.push(
    and(
      eq(permissions.agentId, agentId),
      eq(permissions.entryType, entryType as 'tool' | 'guideline' | 'knowledge'),
      isNull(permissions.entryId),
      eq(permissions.scopeType, 'global'),
      isNull(permissions.scopeId)
    )
  );

  // Query for matching permissions
  const matchingPerms = db
    .select()
    .from(permissions)
    .where(or(...conditions))
    .all();

  if (matchingPerms.length === 0) {
    return false; // No matching permissions = deny access
  }

  // Check if any matching permission grants the required level
  for (const perm of matchingPerms) {
    const permLevel = perm.permission as PermissionLevel;

    // Check permission hierarchy
    if (requiredPermission === 'read' && permLevel === 'read') return true;
    if (requiredPermission === 'read' && permLevel === 'write') return true;
    if (requiredPermission === 'read' && permLevel === 'admin') return true;
    if (requiredPermission === 'write' && permLevel === 'write') return true;
    if (requiredPermission === 'write' && permLevel === 'admin') return true;
    if (requiredPermission === 'admin' && permLevel === 'admin') return true;
  }

  return false; // No permission grants the required level
}

/**
 * Grant permission to an agent
 */
export function grantPermission(params: {
  agentId: string;
  scopeType?: ScopeType;
  scopeId?: string | null;
  entryType?: EntryType;
  entryId?: string | null;
  permission: PermissionLevel;
}): void {
  // Filter out 'project' from entryType as it's not supported in permissions schema
  if (params.entryType === 'project') {
    return; // Skip granting permissions for project entries
  }

  const db = getDb();
  const id = `${params.agentId}:${params.scopeType ?? 'global'}:${params.scopeId ?? ''}:${params.entryType ?? '*'}:${params.entryId ?? '*'}:${params.permission}`;

  // After early return, entryType can't be 'project', so we can safely cast
  const filteredEntryType = params.entryType as 'tool' | 'guideline' | 'knowledge' | null;

  db.insert(permissions)
    .values({
      id,
      agentId: params.agentId,
      scopeType: params.scopeType ?? null,
      scopeId: params.scopeId ?? null,
      entryType: filteredEntryType,
      entryId: params.entryId ?? null,
      permission: params.permission,
    })
    .onConflictDoUpdate({
      target: permissions.id,
      set: {
        permission: params.permission,
      },
    })
    .run();
}

/**
 * Revoke permission from an agent
 */
export function revokePermission(params: {
  agentId: string;
  scopeType?: ScopeType;
  scopeId?: string | null;
  entryType?: EntryType;
  entryId?: string | null;
  permission?: PermissionLevel; // If not specified, revoke all permissions matching other criteria
}): void {
  // Filter out 'project' from entryType as it's not supported in permissions schema
  if (params.entryType === 'project') {
    return; // Skip revoking permissions for project entries
  }

  const db = getDb();

  const conditions = [eq(permissions.agentId, params.agentId)];

  if (params.scopeType !== undefined) {
    conditions.push(
      params.scopeId === null || params.scopeId === undefined
        ? isNull(permissions.scopeId)
        : eq(permissions.scopeId, params.scopeId)
    );
    conditions.push(eq(permissions.scopeType, params.scopeType));
  }

  if (params.entryType !== undefined) {
    // After early return, entryType can't be 'project', so we can safely cast
    conditions.push(
      eq(permissions.entryType, params.entryType as 'tool' | 'guideline' | 'knowledge')
    );
  }

  if (params.entryId !== undefined) {
    conditions.push(
      params.entryId === null
        ? isNull(permissions.entryId)
        : eq(permissions.entryId, params.entryId)
    );
  }

  if (params.permission !== undefined) {
    conditions.push(eq(permissions.permission, params.permission));
  }

  db.delete(permissions)
    .where(and(...conditions))
    .run();
}

/**
 * Get all permissions for an agent
 */
export function getAgentPermissions(agentId: string): Array<{
  id: string;
  scopeType: ScopeType | null;
  scopeId: string | null;
  entryType: EntryType | null;
  entryId: string | null;
  permission: PermissionLevel;
}> {
  const db = getDb();

  const perms = db.select().from(permissions).where(eq(permissions.agentId, agentId)).all();

  return perms.map((p) => ({
    id: p.id,
    scopeType: p.scopeType as ScopeType | null,
    scopeId: p.scopeId,
    entryType: p.entryType as EntryType | null,
    entryId: p.entryId,
    permission: p.permission as PermissionLevel,
  }));
}

/**
 * List all permissions (optionally filtered)
 */
export function listPermissions(params?: {
  agentId?: string;
  scopeType?: ScopeType;
  scopeId?: string;
  entryType?: 'tool' | 'guideline' | 'knowledge';
  entryId?: string;
}): Array<{
  id: string;
  agentId: string;
  entryType: 'tool' | 'guideline' | 'knowledge' | null;
  entryId: string | null;
  scopeType: ScopeType | null;
  scopeId: string | null;
  permission: PermissionLevel;
  createdAt: string;
}> {
  const db = getDb();

  const conditions = [];
  if (params?.agentId) {
    conditions.push(eq(permissions.agentId, params.agentId));
  }
  if (params?.scopeType) {
    conditions.push(eq(permissions.scopeType, params.scopeType));
  }
  if (params?.scopeId) {
    conditions.push(eq(permissions.scopeId, params.scopeId));
  }
  if (params?.entryType) {
    conditions.push(eq(permissions.entryType, params.entryType));
  }
  if (params?.entryId) {
    conditions.push(eq(permissions.entryId, params.entryId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const perms = db.select().from(permissions).where(whereClause).all();

  return perms.map((p) => ({
    id: p.id,
    agentId: p.agentId,
    entryType: p.entryType as 'tool' | 'guideline' | 'knowledge' | null,
    entryId: p.entryId,
    scopeType: p.scopeType as ScopeType | null,
    scopeId: p.scopeId,
    permission: p.permission as PermissionLevel,
    createdAt: p.createdAt,
  }));
}
