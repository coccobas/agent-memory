/**
 * Permission service for fine-grained access control
 *
 * Default behavior: If no permissions are configured, access is DENIED (secure by default).
 * Set AGENT_MEMORY_PERMISSIONS_MODE=permissive to allow all operations without explicit grants.
 */

import { getDb, type DbClient } from '../db/connection.js';
import { permissions, projects, sessions } from '../db/schema.js';
import { eq, and, or, isNull } from 'drizzle-orm';
import type { ScopeType, PermissionEntryType, EntryType } from '../db/schema.js';
import { createComponentLogger } from '../utils/logger.js';
import { LRUCache } from '../utils/lru-cache.js';

// Scope hierarchy for permission inheritance:
// session → project → org → global

// Cache for parent scope lookups to avoid repeated DB queries
// TTL of 5 minutes - scope hierarchy rarely changes
const parentScopeCache = new LRUCache<{ type: ScopeType; id: string | null } | null>({
  maxSize: 500,
  ttlMs: 5 * 60 * 1000,
});

// Cache for permission existence check - avoids DB query on every permission check
// Short TTL (30 seconds) to quickly reflect when permissions are added/removed
let permissionsExistCache: { value: boolean; timestamp: number } | null = null;
const PERMISSIONS_EXIST_CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Check if any permissions exist in the database (cached)
 * Returns true if at least one permission record exists
 *
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
function checkPermissionsExist(dbClient?: DbClient): boolean {
  const now = Date.now();

  // Return cached value if still valid
  if (
    permissionsExistCache &&
    now - permissionsExistCache.timestamp < PERMISSIONS_EXIST_CACHE_TTL_MS
  ) {
    return permissionsExistCache.value;
  }

  // Query database
  try {
    const db = dbClient ?? getDb();
    const permCount = db.select().from(permissions).limit(1).all().length;
    const exists = permCount > 0;

    // Cache the result
    permissionsExistCache = { value: exists, timestamp: now };
    return exists;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('no such table') || errorMessage.includes('permissions')) {
      // During migration, permissions table doesn't exist
      permissionsExistCache = { value: false, timestamp: now };
      return false;
    }
    throw error;
  }
}

/**
 * Invalidate the permissions existence cache
 * Call this when permissions are granted or revoked
 */
function invalidatePermissionsExistCache(): void {
  permissionsExistCache = null;
}

/**
 * Get parent scope information for inheritance
 * Returns the parent scope type and ID, or null if at global level
 *
 * Uses LRU cache to avoid repeated DB queries for the same scope.
 *
 * @param scopeType - The scope type
 * @param scopeId - The scope ID
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
function getParentScope(
  scopeType: ScopeType,
  scopeId: string | null | undefined,
  dbClient?: DbClient
): { type: ScopeType; id: string | null } | null {
  if (scopeType === 'global') {
    return null; // Global has no parent
  }

  // Check cache first
  const cacheKey = `${scopeType}:${scopeId ?? ''}`;
  const cached = parentScopeCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const db = dbClient ?? getDb();
  let result: { type: ScopeType; id: string | null } | null = null;

  if (scopeType === 'session' && scopeId) {
    // Session's parent is project (get from session record)
    try {
      const session = db.select().from(sessions).where(eq(sessions.id, scopeId)).get();
      if (session?.projectId) {
        result = { type: 'project', id: session.projectId };
      }
    } catch {
      // Session table may not exist or session not found
    }
    // Fall back to global if no project found
    if (!result) {
      result = { type: 'global', id: null };
    }
  } else if (scopeType === 'project' && scopeId) {
    // Project's parent is org (get from project record)
    try {
      const project = db.select().from(projects).where(eq(projects.id, scopeId)).get();
      if (project?.orgId) {
        result = { type: 'org', id: project.orgId };
      }
    } catch {
      // Project table may not exist or project not found
    }
    // Fall back to global if no org found
    if (!result) {
      result = { type: 'global', id: null };
    }
  } else if (scopeType === 'org') {
    // Org's parent is global
    result = { type: 'global', id: null };
  } else {
    // Default fallback to global
    result = { type: 'global', id: null };
  }

  // Cache the result
  parentScopeCache.set(cacheKey, result);
  return result;
}

/**
 * Build scope chain for inheritance checking
 * Returns array of scopes from most specific to least specific (global)
 *
 * @param scopeType - The scope type
 * @param scopeId - The scope ID
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
function buildScopeChain(
  scopeType: ScopeType,
  scopeId: string | null | undefined,
  dbClient?: DbClient
): Array<{ type: ScopeType; id: string | null }> {
  const chain: Array<{ type: ScopeType; id: string | null }> = [];

  // Add current scope
  chain.push({ type: scopeType, id: scopeId ?? null });

  // Walk up the hierarchy
  let current: { type: ScopeType; id: string | null } | null = {
    type: scopeType,
    id: scopeId ?? null,
  };
  while (current && current.type !== 'global') {
    const parent = getParentScope(current.type, current.id, dbClient);
    if (parent && !chain.some((s) => s.type === parent.type && s.id === parent.id)) {
      chain.push(parent);
      current = parent;
    } else {
      break;
    }
  }

  // Ensure global is always last
  if (!chain.some((s) => s.type === 'global')) {
    chain.push({ type: 'global', id: null });
  }

  return chain;
}

const logger = createComponentLogger('permission');

// Track if we've warned about permissive mode (warn once per process)
let hasWarnedAboutPermissiveMode = false;

export type PermissionLevel = 'read' | 'write' | 'admin';
export type Action = 'read' | 'write' | 'delete';

/**
 * Permission hierarchy: admin > write > read
 * Higher numbers grant access to lower-numbered actions.
 */
const PERMISSION_HIERARCHY: Record<PermissionLevel, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

/**
 * Check if a granted permission level satisfies the required level.
 * admin grants all, write grants write+read, read grants only read.
 */
function hasRequiredLevel(granted: PermissionLevel, required: PermissionLevel): boolean {
  return PERMISSION_HIERARCHY[granted] >= PERMISSION_HIERARCHY[required];
}

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
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 * @returns true if the agent has permission, false otherwise
 */
export function checkPermission(
  agentId: string | null | undefined,
  action: Action,
  entryType: EntryType,
  entryId: string | null | undefined,
  scopeType: ScopeType,
  scopeId: string | null | undefined,
  dbClient?: DbClient
): boolean {
  // Check for permissive mode first - this always takes precedence
  const permissiveMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE === 'permissive';
  if (permissiveMode) {
    // Security: Warn once about permissive mode being active
    if (!hasWarnedAboutPermissiveMode) {
      logger.warn(
        'SECURITY WARNING: Permission checks disabled (AGENT_MEMORY_PERMISSIONS_MODE=permissive). ' +
          'This should only be used in development. In production, configure explicit permissions.'
      );
      hasWarnedAboutPermissiveMode = true;
    }
    // In permissive mode, all access is allowed (for development/testing)
    return true;
  }

  // If no agentId provided, deny access (security by default)
  if (!agentId) {
    return false;
  }

  // Filter out 'project' from entryType as it's not supported in permissions schema
  if (entryType === 'project') {
    return true; // Default to allow for project entries
  }

  const db = dbClient ?? getDb();

  // Check if any permissions exist (cached to avoid DB query on every check)
  if (!checkPermissionsExist(db)) {
    // No permissions configured - deny access (secure by default)
    // To allow access without explicit permissions, set AGENT_MEMORY_PERMISSIONS_MODE=permissive
    logger.debug(
      { agentId, action, entryType, scopeType },
      'Access denied: no permissions configured. Grant permissions or set AGENT_MEMORY_PERMISSIONS_MODE=permissive'
    );
    return false;
  }

  // Map action to required permission level
  const requiredPermission: PermissionLevel =
    action === 'read' ? 'read' : action === 'write' ? 'write' : 'admin';

  // Build scope chain for inheritance (most specific to least specific)
  const scopeChain = buildScopeChain(scopeType, scopeId, db);

  // Build permission check query
  // Check in order of specificity:
  // 1. Entry-specific permission in each scope (from most to least specific)
  // 2. Entry-type permission in each scope (from most to least specific)

  const conditions = [];

  // For each scope in the chain, check both entry-specific and entry-type permissions
  for (const scope of scopeChain) {
    // Entry-specific permission in this scope
    if (entryId) {
      conditions.push(
        and(
          eq(permissions.agentId, agentId),
          eq(permissions.entryType, entryType as PermissionEntryType),
          eq(permissions.entryId, entryId),
          eq(permissions.scopeType, scope.type),
          scope.id === null ? isNull(permissions.scopeId) : eq(permissions.scopeId, scope.id)
        )
      );
    }

    // Entry-type permission in this scope
    conditions.push(
      and(
        eq(permissions.agentId, agentId),
        eq(permissions.entryType, entryType as 'tool' | 'guideline' | 'knowledge'),
        isNull(permissions.entryId),
        eq(permissions.scopeType, scope.type),
        scope.id === null ? isNull(permissions.scopeId) : eq(permissions.scopeId, scope.id)
      )
    );
  }

  // Query for matching permissions
  const matchingPerms = db
    .select()
    .from(permissions)
    .where(or(...conditions))
    .all();

  if (matchingPerms.length === 0) {
    // No matching permissions for this agent
    logger.debug(
      { agentId, action, entryType, scopeType, scopeId },
      'Access denied: agent has no matching permissions for this scope/entry type'
    );
    return false;
  }

  // Check if any matching permission grants the required level
  for (const perm of matchingPerms) {
    const permLevel = perm.permission as PermissionLevel;

    // Check permission hierarchy using lookup table
    if (hasRequiredLevel(permLevel, requiredPermission)) {
      return true;
    }
  }

  // Agent has permissions but not at the required level
  logger.debug(
    {
      agentId,
      action,
      requiredPermission,
      foundPermissions: matchingPerms.map((p) => p.permission),
    },
    'Access denied: agent has permissions but not at required level'
  );
  return false;
}

/**
 * Grant permission to an agent
 *
 * @param params - Permission parameters
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function grantPermission(
  params: {
    agentId: string;
    scopeType?: ScopeType;
    scopeId?: string | null;
    entryType?: EntryType;
    entryId?: string | null;
    permission: PermissionLevel;
  },
  dbClient?: DbClient
): void {
  // Filter out 'project' from entryType as it's not supported in permissions schema
  if (params.entryType === 'project') {
    return; // Skip granting permissions for project entries
  }

  const db = dbClient ?? getDb();
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

  // Invalidate cache since permissions changed
  invalidatePermissionsExistCache();
}

/**
 * Revoke permission from an agent
 *
 * @param params - Permission parameters
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function revokePermission(
  params: {
    agentId: string;
    scopeType?: ScopeType;
    scopeId?: string | null;
    entryType?: EntryType;
    entryId?: string | null;
    permission?: PermissionLevel; // If not specified, revoke all permissions matching other criteria
  },
  dbClient?: DbClient
): void {
  // Filter out 'project' from entryType as it's not supported in permissions schema
  if (params.entryType === 'project') {
    return; // Skip revoking permissions for project entries
  }

  const db = dbClient ?? getDb();

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

  // Invalidate cache since permissions changed
  invalidatePermissionsExistCache();
}

/**
 * Get all permissions for an agent
 *
 * @param agentId - The agent ID
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function getAgentPermissions(
  agentId: string,
  dbClient?: DbClient
): Array<{
  id: string;
  scopeType: ScopeType | null;
  scopeId: string | null;
  entryType: EntryType | null;
  entryId: string | null;
  permission: PermissionLevel;
}> {
  const db = dbClient ?? getDb();

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
 *
 * @param params - Optional filter parameters
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function listPermissions(
  params?: {
    agentId?: string;
    scopeType?: ScopeType;
    scopeId?: string;
    entryType?: 'tool' | 'guideline' | 'knowledge';
    entryId?: string;
  },
  dbClient?: DbClient
): Array<{
  id: string;
  agentId: string;
  entryType: 'tool' | 'guideline' | 'knowledge' | null;
  entryId: string | null;
  scopeType: ScopeType | null;
  scopeId: string | null;
  permission: PermissionLevel;
  createdAt: string;
}> {
  const db = dbClient ?? getDb();

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
