/**
 * Permission service for fine-grained access control
 *
 * Default behavior: If no permissions are configured, access is DENIED (secure by default).
 * Set AGENT_MEMORY_PERMISSIONS_MODE=permissive to allow all operations without explicit grants.
 */

import type { DbClient } from '../db/connection.js';
import { permissions, projects, sessions } from '../db/schema.js';
import { eq, and, or, isNull } from 'drizzle-orm';
import type { ScopeType, PermissionEntryType, EntryType } from '../db/schema.js';
import { createComponentLogger } from '../utils/logger.js';
import { LRUCache } from '../utils/lru-cache.js';
import type { MemoryCoordinator } from '../core/memory-coordinator.js';

// =============================================================================
// TYPES
// =============================================================================

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
 * Entry for batch permission checking
 */
export interface BatchPermissionEntry {
  id: string;
  entryType: EntryType;
  scopeType: ScopeType;
  scopeId: string | null;
}

/**
 * Result of batch permission check
 */
export type BatchPermissionResult = Map<string, boolean>;

// =============================================================================
// PERMISSION SERVICE CLASS
// =============================================================================

/**
 * PermissionService class with encapsulated caches and DI
 *
 * Caches are instance-level, not module-level, enabling:
 * - Clean test isolation
 * - Memory coordinator integration
 * - Proper lifecycle management
 */
export class PermissionService {
  private readonly db: DbClient;
  private readonly logger = createComponentLogger('permission');
  private readonly parentScopeCache: LRUCache<{ type: ScopeType; id: string | null } | null>;
  private permissionsExistCache: { value: boolean; timestamp: number } | null = null;
  private hasWarnedAboutPermissiveMode = false;

  private static readonly PERMISSIONS_EXIST_CACHE_TTL_MS = 30 * 1000; // 30 seconds

  constructor(db: DbClient, memoryCoordinator?: MemoryCoordinator) {
    this.db = db;

    // Create parent scope cache with LRU eviction
    this.parentScopeCache = new LRUCache<{ type: ScopeType; id: string | null } | null>({
      maxSize: 500,
      ttlMs: 5 * 60 * 1000, // 5 minutes
    });

    // Register with memory coordinator if provided
    if (memoryCoordinator) {
      memoryCoordinator.register('parent-scope', this.parentScopeCache, 7);
    }
  }

  /**
   * Check if a granted permission level satisfies the required level.
   */
  private hasRequiredLevel(granted: PermissionLevel, required: PermissionLevel): boolean {
    return PERMISSION_HIERARCHY[granted] >= PERMISSION_HIERARCHY[required];
  }

  /**
   * Check if any permissions exist in the database (cached)
   */
  private checkPermissionsExist(): boolean {
    const now = Date.now();

    if (
      this.permissionsExistCache &&
      now - this.permissionsExistCache.timestamp < PermissionService.PERMISSIONS_EXIST_CACHE_TTL_MS
    ) {
      return this.permissionsExistCache.value;
    }

    try {
      const permCount = this.db.select().from(permissions).limit(1).all().length;
      const exists = permCount > 0;
      this.permissionsExistCache = { value: exists, timestamp: now };
      return exists;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('no such table') || errorMessage.includes('permissions')) {
        this.permissionsExistCache = { value: false, timestamp: now };
        return false;
      }
      throw error;
    }
  }

  /**
   * Invalidate the permissions existence cache
   */
  invalidateCache(): void {
    this.permissionsExistCache = null;
    this.parentScopeCache.clear();
  }

  /**
   * Get parent scope information for inheritance
   */
  private getParentScope(
    scopeType: ScopeType,
    scopeId: string | null | undefined
  ): { type: ScopeType; id: string | null } | null {
    if (scopeType === 'global') {
      return null;
    }

    const cacheKey = `${scopeType}:${scopeId ?? ''}`;
    const cached = this.parentScopeCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    let result: { type: ScopeType; id: string | null } | null = null;

    if (scopeType === 'session' && scopeId) {
      try {
        const session = this.db.select().from(sessions).where(eq(sessions.id, scopeId)).get();
        if (session?.projectId) {
          result = { type: 'project', id: session.projectId };
        }
      } catch {
        // Session table may not exist
      }
      if (!result) {
        result = { type: 'global', id: null };
      }
    } else if (scopeType === 'project' && scopeId) {
      try {
        const project = this.db.select().from(projects).where(eq(projects.id, scopeId)).get();
        if (project?.orgId) {
          result = { type: 'org', id: project.orgId };
        }
      } catch {
        // Project table may not exist
      }
      if (!result) {
        result = { type: 'global', id: null };
      }
    } else if (scopeType === 'org') {
      result = { type: 'global', id: null };
    } else {
      result = { type: 'global', id: null };
    }

    this.parentScopeCache.set(cacheKey, result);
    return result;
  }

  /**
   * Build scope chain for inheritance checking
   */
  private buildScopeChain(
    scopeType: ScopeType,
    scopeId: string | null | undefined
  ): Array<{ type: ScopeType; id: string | null }> {
    const chain: Array<{ type: ScopeType; id: string | null }> = [];
    chain.push({ type: scopeType, id: scopeId ?? null });

    let current: { type: ScopeType; id: string | null } | null = {
      type: scopeType,
      id: scopeId ?? null,
    };

    while (current && current.type !== 'global') {
      const parent = this.getParentScope(current.type, current.id);
      if (parent && !chain.some((s) => s.type === parent.type && s.id === parent.id)) {
        chain.push(parent);
        current = parent;
      } else {
        break;
      }
    }

    if (!chain.some((s) => s.type === 'global')) {
      chain.push({ type: 'global', id: null });
    }

    return chain;
  }

  /**
   * Check if an agent has permission to perform an action
   */
  check(
    agentId: string | null | undefined,
    action: Action,
    entryType: EntryType,
    entryId: string | null | undefined,
    scopeType: ScopeType,
    scopeId: string | null | undefined
  ): boolean {
    // Check for permissive mode first
    const permissiveMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE === 'permissive';
    if (permissiveMode) {
      if (!this.hasWarnedAboutPermissiveMode) {
        this.logger.warn(
          'SECURITY WARNING: Permission checks disabled (AGENT_MEMORY_PERMISSIONS_MODE=permissive). ' +
            'This should only be used in development. In production, configure explicit permissions.'
        );
        this.hasWarnedAboutPermissiveMode = true;
      }
      return true;
    }

    if (!agentId) {
      return false;
    }

    if (entryType === 'project') {
      return true;
    }

    if (!this.checkPermissionsExist()) {
      this.logger.debug(
        { agentId, action, entryType, scopeType },
        'Access denied: no permissions configured'
      );
      return false;
    }

    const requiredPermission: PermissionLevel =
      action === 'read' ? 'read' : action === 'write' ? 'write' : 'admin';

    const scopeChain = this.buildScopeChain(scopeType, scopeId);
    const conditions = [];

    for (const scope of scopeChain) {
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

    const matchingPerms = this.db
      .select()
      .from(permissions)
      .where(or(...conditions))
      .all();

    if (matchingPerms.length === 0) {
      this.logger.debug(
        { agentId, action, entryType, scopeType, scopeId },
        'Access denied: no matching permissions'
      );
      return false;
    }

    for (const perm of matchingPerms) {
      if (this.hasRequiredLevel(perm.permission as PermissionLevel, requiredPermission)) {
        return true;
      }
    }

    this.logger.debug(
      { agentId, action, requiredPermission, foundPermissions: matchingPerms.map((p) => p.permission) },
      'Access denied: insufficient permission level'
    );
    return false;
  }

  /**
   * Batch check permissions for multiple entries
   *
   * This is more efficient than calling check() in a loop because:
   * 1. Unique scope chains are computed once
   * 2. Single DB query for all permission lookups
   * 3. Results are cached in a Map for O(1) lookup
   */
  checkBatch(
    agentId: string | null | undefined,
    action: Action,
    entries: BatchPermissionEntry[]
  ): BatchPermissionResult {
    const results: BatchPermissionResult = new Map();

    if (entries.length === 0) {
      return results;
    }

    // Check for permissive mode first
    const permissiveMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE === 'permissive';
    if (permissiveMode) {
      if (!this.hasWarnedAboutPermissiveMode) {
        this.logger.warn(
          'SECURITY WARNING: Permission checks disabled (AGENT_MEMORY_PERMISSIONS_MODE=permissive).'
        );
        this.hasWarnedAboutPermissiveMode = true;
      }
      for (const entry of entries) {
        results.set(entry.id, true);
      }
      return results;
    }

    if (!agentId) {
      for (const entry of entries) {
        results.set(entry.id, false);
      }
      return results;
    }

    // Handle project entries (always allowed)
    const nonProjectEntries: BatchPermissionEntry[] = [];
    for (const entry of entries) {
      if (entry.entryType === 'project') {
        results.set(entry.id, true);
      } else {
        nonProjectEntries.push(entry);
      }
    }

    if (nonProjectEntries.length === 0) {
      return results;
    }

    if (!this.checkPermissionsExist()) {
      for (const entry of nonProjectEntries) {
        results.set(entry.id, false);
      }
      return results;
    }

    const requiredPermission: PermissionLevel =
      action === 'read' ? 'read' : action === 'write' ? 'write' : 'admin';

    // Collect unique scope chains and build conditions
    const allConditions = [];
    const entryScopes = new Map<string, Array<{ type: ScopeType; id: string | null }>>();

    for (const entry of nonProjectEntries) {
      const scopeChain = this.buildScopeChain(entry.scopeType, entry.scopeId);
      entryScopes.set(entry.id, scopeChain);

      for (const scope of scopeChain) {
        // Entry-specific permission
        allConditions.push(
          and(
            eq(permissions.agentId, agentId),
            eq(permissions.entryType, entry.entryType as PermissionEntryType),
            eq(permissions.entryId, entry.id),
            eq(permissions.scopeType, scope.type),
            scope.id === null ? isNull(permissions.scopeId) : eq(permissions.scopeId, scope.id)
          )
        );

        // Entry-type permission
        allConditions.push(
          and(
            eq(permissions.agentId, agentId),
            eq(permissions.entryType, entry.entryType as 'tool' | 'guideline' | 'knowledge'),
            isNull(permissions.entryId),
            eq(permissions.scopeType, scope.type),
            scope.id === null ? isNull(permissions.scopeId) : eq(permissions.scopeId, scope.id)
          )
        );
      }
    }

    // Single batch query for all permissions
    const matchingPerms = this.db
      .select()
      .from(permissions)
      .where(or(...allConditions))
      .all();

    // Index permissions by scope for efficient lookup
    const permsByScope = new Map<string, Array<typeof matchingPerms[0]>>();
    for (const perm of matchingPerms) {
      const key = `${perm.scopeType}:${perm.scopeId ?? ''}:${perm.entryType}:${perm.entryId ?? ''}`;
      const existing = permsByScope.get(key) ?? [];
      existing.push(perm);
      permsByScope.set(key, existing);
    }

    // Check each entry against the collected permissions
    for (const entry of nonProjectEntries) {
      const scopeChain = entryScopes.get(entry.id)!;
      let hasPermission = false;

      for (const scope of scopeChain) {
        // Check entry-specific permission
        const entryKey = `${scope.type}:${scope.id ?? ''}:${entry.entryType}:${entry.id}`;
        const entryPerms = permsByScope.get(entryKey) ?? [];
        for (const perm of entryPerms) {
          if (this.hasRequiredLevel(perm.permission as PermissionLevel, requiredPermission)) {
            hasPermission = true;
            break;
          }
        }

        if (hasPermission) break;

        // Check entry-type permission
        const typeKey = `${scope.type}:${scope.id ?? ''}:${entry.entryType}:`;
        const typePerms = permsByScope.get(typeKey) ?? [];
        for (const perm of typePerms) {
          if (this.hasRequiredLevel(perm.permission as PermissionLevel, requiredPermission)) {
            hasPermission = true;
            break;
          }
        }

        if (hasPermission) break;
      }

      results.set(entry.id, hasPermission);
    }

    return results;
  }

  /**
   * Grant permission to an agent
   */
  grant(params: {
    agentId: string;
    scopeType?: ScopeType;
    scopeId?: string | null;
    entryType?: EntryType;
    entryId?: string | null;
    permission: PermissionLevel;
  }): void {
    if (params.entryType === 'project') {
      return;
    }

    const id = `${params.agentId}:${params.scopeType ?? 'global'}:${params.scopeId ?? ''}:${params.entryType ?? '*'}:${params.entryId ?? '*'}:${params.permission}`;
    const filteredEntryType = params.entryType as 'tool' | 'guideline' | 'knowledge' | null;

    this.db
      .insert(permissions)
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
        set: { permission: params.permission },
      })
      .run();

    this.permissionsExistCache = null;
  }

  /**
   * Revoke permission from an agent
   */
  revoke(params: {
    agentId: string;
    scopeType?: ScopeType;
    scopeId?: string | null;
    entryType?: EntryType;
    entryId?: string | null;
    permission?: PermissionLevel;
  }): void {
    if (params.entryType === 'project') {
      return;
    }

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
      conditions.push(
        eq(permissions.entryType, params.entryType as 'tool' | 'guideline' | 'knowledge')
      );
    }

    if (params.entryId !== undefined) {
      conditions.push(
        params.entryId === null ? isNull(permissions.entryId) : eq(permissions.entryId, params.entryId)
      );
    }

    if (params.permission !== undefined) {
      conditions.push(eq(permissions.permission, params.permission));
    }

    this.db.delete(permissions).where(and(...conditions)).run();
    this.permissionsExistCache = null;
  }

  /**
   * Get all permissions for an agent
   */
  getForAgent(agentId: string): Array<{
    id: string;
    scopeType: ScopeType | null;
    scopeId: string | null;
    entryType: EntryType | null;
    entryId: string | null;
    permission: PermissionLevel;
  }> {
    const perms = this.db.select().from(permissions).where(eq(permissions.agentId, agentId)).all();

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
  list(params?: {
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
    const perms = this.db.select().from(permissions).where(whereClause).all();

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
}
