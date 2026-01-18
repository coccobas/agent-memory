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
import type { ICacheAdapter } from '../core/adapters/interfaces.js';
import { isPermissiveModeEnabled, shouldWarnDevMode } from '../config/auth.js';

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

/**
 * Cache value type for parent scope lookups
 */
export type ParentScopeValue = { type: ScopeType; id: string | null } | null;

/**
 * Cache value type for permission check results
 */
export interface PermissionCheckCacheValue {
  result: boolean;
  timestamp: number;
  /** Bug #10 fix: Version at time of caching for invalidation detection */
  version: number;
}

// =============================================================================
// PERMISSION SERVICE CLASS
// =============================================================================

/**
 * PermissionService class with encapsulated caches and DI
 *
 * Caches are instance-level, not module-level, enabling:
 * - Clean test isolation
 * - Proper lifecycle management
 * - Swappable cache implementations (LRU, Redis)
 */
export class PermissionService {
  private readonly db: DbClient;
  private readonly logger = createComponentLogger('permission');
  private readonly parentScopeCache: ICacheAdapter<ParentScopeValue>;
  private permissionsExistCache: { value: boolean; timestamp: number; version: number } | null =
    null;
  private hasWarnedAboutPermissiveMode = false;

  /**
   * Bug #10 fix: Version counter for cache invalidation.
   * Incremented on any permission change to detect stale cache entries.
   */
  private cacheVersion = 0;

  /**
   * Cache for permission check results
   * Key format: {agentId}:{action}:{entryType}:{entryId}:{scopeType}:{scopeId}
   */
  private readonly permissionCheckCache = new Map<string, PermissionCheckCacheValue>();

  private static readonly PERMISSIONS_EXIST_CACHE_TTL_MS = 30 * 1000; // 30 seconds
  private static readonly PERMISSION_CHECK_CACHE_TTL_MS = 30 * 1000; // 30 seconds
  private static readonly PERMISSION_CHECK_CACHE_MAX_SIZE = 1000; // Limit memory usage

  constructor(db: DbClient, cacheAdapter: ICacheAdapter<ParentScopeValue>) {
    this.db = db;
    this.parentScopeCache = cacheAdapter;
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
    const currentVersion = this.cacheVersion;

    // Bug #10 fix: Also validate version matches to detect invalidation
    if (
      this.permissionsExistCache &&
      this.permissionsExistCache.version === currentVersion &&
      now - this.permissionsExistCache.timestamp < PermissionService.PERMISSIONS_EXIST_CACHE_TTL_MS
    ) {
      return this.permissionsExistCache.value;
    }

    try {
      const result = this.db.select().from(permissions).limit(1).get();
      const exists = result !== undefined;
      this.permissionsExistCache = { value: exists, timestamp: now, version: currentVersion };
      return exists;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('no such table') || errorMessage.includes('permissions')) {
        this.permissionsExistCache = { value: false, timestamp: now, version: currentVersion };
        return false;
      }
      throw error;
    }
  }

  /**
   * Invalidate all permission caches
   */
  invalidateCache(): void {
    // Bug #10 fix: Increment version to invalidate any in-flight cache reads
    this.cacheVersion++;
    this.permissionsExistCache = null;
    this.parentScopeCache.clear();
    this.permissionCheckCache.clear();
  }

  /**
   * Build cache key for permission check
   */
  private buildPermissionCheckCacheKey(
    agentId: string,
    action: Action,
    entryType: EntryType,
    entryId: string | null | undefined,
    scopeType: ScopeType,
    scopeId: string | null | undefined
  ): string {
    // Bug #346 fix: Distinguish null vs undefined to prevent cache key collisions
    // Using distinct markers: 'N' for null, 'U' for undefined, actual value otherwise
    const normalizeNullish = (val: string | null | undefined): string => {
      if (val === null) return '\x00N'; // Null marker (unlikely to appear in IDs)
      if (val === undefined) return '\x00U'; // Undefined marker
      return val;
    };
    return `${agentId}:${action}:${entryType}:${normalizeNullish(entryId)}:${scopeType}:${normalizeNullish(scopeId)}`;
  }

  /**
   * Get cached permission check result
   */
  private getCachedPermissionCheck(cacheKey: string): boolean | undefined {
    const cached = this.permissionCheckCache.get(cacheKey);
    if (!cached) return undefined;

    const now = Date.now();
    const currentVersion = this.cacheVersion;

    // Bug #10 fix: Validate version matches to detect invalidation
    if (
      cached.version !== currentVersion ||
      now - cached.timestamp > PermissionService.PERMISSION_CHECK_CACHE_TTL_MS
    ) {
      this.permissionCheckCache.delete(cacheKey);
      return undefined;
    }

    // Refresh position in Map for true LRU behavior:
    // Delete and re-insert to move entry to end of iteration order
    this.permissionCheckCache.delete(cacheKey);
    this.permissionCheckCache.set(cacheKey, cached);

    return cached.result;
  }

  /**
   * Set cached permission check result
   */
  private setCachedPermissionCheck(cacheKey: string, result: boolean): void {
    // Evict oldest entries if cache is too large
    if (this.permissionCheckCache.size >= PermissionService.PERMISSION_CHECK_CACHE_MAX_SIZE) {
      const oldestKey = this.permissionCheckCache.keys().next().value;
      if (oldestKey) {
        this.permissionCheckCache.delete(oldestKey);
      }
    }

    // Bug #10 fix: Include version for invalidation detection
    this.permissionCheckCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      version: this.cacheVersion,
    });
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
      } catch (error) {
        // Session table may not exist or query failed
        this.logger.debug({ error, scopeId }, 'Session lookup failed, assuming no parent project');
      }
      if (!result) {
        // Bug #342 fix: Log warning when session has no projectId - this causes global fallback
        // which may grant unintended permissions. Orphan sessions should be rare.
        this.logger.debug(
          { scopeType, scopeId, fallback: 'global' },
          'Session scope falling back to global - session has no projectId or not found'
        );
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
        // Bug #342 fix: Log when project has no orgId - this causes global fallback
        this.logger.debug(
          { scopeType, scopeId, fallback: 'global' },
          'Project scope falling back to global - project has no orgId or not found'
        );
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

  // ===========================================================================
  // PERMISSION CHECK HELPERS (extracted to reduce duplication)
  // ===========================================================================

  /**
   * Check if permissive mode is enabled (permissions bypassed).
   *
   * Uses isPermissiveModeEnabled() which supports:
   * - AGENT_MEMORY_DEV_MODE=true (new, bypasses everything)
   * - AGENT_MEMORY_PERMISSIONS_MODE=permissive (legacy, permissions only)
   *
   * @returns true if permissive mode allows access (permissions bypassed)
   */
  private checkPermissiveMode(): boolean {
    // Use the unified auth config's isPermissiveModeEnabled()
    if (!isPermissiveModeEnabled()) {
      return false;
    }

    // Log warning once per session
    if (!this.hasWarnedAboutPermissiveMode) {
      if (shouldWarnDevMode()) {
        this.logger.warn(
          '⚠️  SECURITY WARNING: Permissive mode enabled in production-like environment. ' +
            'All permission checks are bypassed. Set AGENT_MEMORY_DEV_MODE=false for production.'
        );
      } else {
        this.logger.info(
          '🔓 Dev mode enabled - all permission checks bypassed. ' +
            'This is intended for local development only.'
        );
      }
      this.hasWarnedAboutPermissiveMode = true;
    }

    return true;
  }

  /**
   * Map an action to the required permission level
   */
  private getRequiredPermissionLevel(action: Action): PermissionLevel {
    return action === 'read' ? 'read' : action === 'write' ? 'write' : 'admin';
  }

  /**
   * Build permission query conditions for a single entry
   */
  private buildPermissionConditions(
    agentId: string,
    entryType: EntryType,
    entryId: string | null | undefined,
    scopeChain: Array<{ type: ScopeType; id: string | null }>
  ): ReturnType<typeof and>[] {
    const conditions: ReturnType<typeof and>[] = [];

    for (const scope of scopeChain) {
      // Entry-specific permission
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

      // Entry-type permission (applies to all entries of this type in scope)
      conditions.push(
        and(
          eq(permissions.agentId, agentId),
          eq(permissions.entryType, entryType as PermissionEntryType),
          isNull(permissions.entryId),
          eq(permissions.scopeType, scope.type),
          scope.id === null ? isNull(permissions.scopeId) : eq(permissions.scopeId, scope.id)
        )
      );
    }

    return conditions;
  }

  /**
   * Check if any permission in the list meets the required level
   */
  private hasAnyRequiredLevel(
    perms: Array<{ permission: string }>,
    requiredLevel: PermissionLevel
  ): boolean {
    return perms.some((p) => this.hasRequiredLevel(p.permission as PermissionLevel, requiredLevel));
  }

  // Maximum OR conditions per query to avoid performance degradation
  private static readonly MAX_OR_CONDITIONS = 20;

  /**
   * Execute permission query with chunking for large condition sets
   * Prevents performance issues when many entries are checked
   */
  private executeChunkedPermissionQuery(
    conditions: ReturnType<typeof and>[]
  ): (typeof permissions.$inferSelect)[] {
    if (conditions.length <= PermissionService.MAX_OR_CONDITIONS) {
      return this.db
        .select()
        .from(permissions)
        .where(or(...conditions))
        .all();
    }

    // Chunk the conditions and merge results
    const results: (typeof permissions.$inferSelect)[] = [];
    for (let i = 0; i < conditions.length; i += PermissionService.MAX_OR_CONDITIONS) {
      const chunk = conditions.slice(i, i + PermissionService.MAX_OR_CONDITIONS);
      const chunkResults = this.db
        .select()
        .from(permissions)
        .where(or(...chunk))
        .all();
      results.push(...chunkResults);
    }
    return results;
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
    if (this.checkPermissiveMode()) {
      return true;
    }

    if (!agentId) {
      return false;
    }

    // Project entries require proper permission checks like other entry types
    // The hardcoded bypass was a security vulnerability (Bug #1 from BUGS-ANALYSIS.md)

    // Check cache first
    const cacheKey = this.buildPermissionCheckCacheKey(
      agentId,
      action,
      entryType,
      entryId,
      scopeType,
      scopeId
    );
    const cachedResult = this.getCachedPermissionCheck(cacheKey);
    if (cachedResult !== undefined) {
      return cachedResult;
    }

    if (!this.checkPermissionsExist()) {
      this.logger.debug(
        { agentId, action, entryType, scopeType },
        'Access denied: no permissions configured'
      );
      this.setCachedPermissionCheck(cacheKey, false);
      return false;
    }

    const requiredPermission = this.getRequiredPermissionLevel(action);
    const scopeChain = this.buildScopeChain(scopeType, scopeId);
    const conditions = this.buildPermissionConditions(agentId, entryType, entryId, scopeChain);

    const matchingPerms = this.executeChunkedPermissionQuery(conditions);

    if (matchingPerms.length === 0) {
      this.logger.debug(
        { agentId, action, entryType, scopeType, scopeId },
        'Access denied: no matching permissions'
      );
      this.setCachedPermissionCheck(cacheKey, false);
      return false;
    }

    if (this.hasAnyRequiredLevel(matchingPerms, requiredPermission)) {
      this.setCachedPermissionCheck(cacheKey, true);
      return true;
    }

    this.logger.debug(
      {
        agentId,
        action,
        requiredPermission,
        foundPermissions: matchingPerms.map((p) => p.permission),
      },
      'Access denied: insufficient permission level'
    );
    this.setCachedPermissionCheck(cacheKey, false);
    return false;
  }

  /**
   * Batch check permissions for multiple entries
   *
   * This is more efficient than calling check() in a loop because:
   * 1. Unique scope chains are computed once
   * 2. Single DB query for all permission lookups (with chunking for large sets)
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
    if (this.checkPermissiveMode()) {
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

    // All entry types (including project) require proper permission checks
    // Bug #343 fix: removed the project bypass that allowed any agent to modify projects
    const nonProjectEntries = entries;

    if (!this.checkPermissionsExist()) {
      for (const entry of nonProjectEntries) {
        results.set(entry.id, false);
      }
      return results;
    }

    const requiredPermission = this.getRequiredPermissionLevel(action);

    // Collect unique scope chains and build conditions using helper
    const allConditions: ReturnType<typeof and>[] = [];
    const entryScopes = new Map<string, Array<{ type: ScopeType; id: string | null }>>();

    for (const entry of nonProjectEntries) {
      const scopeChain = this.buildScopeChain(entry.scopeType, entry.scopeId);
      entryScopes.set(entry.id, scopeChain);
      allConditions.push(
        ...this.buildPermissionConditions(agentId, entry.entryType, entry.id, scopeChain)
      );
    }

    // Batch query with chunking for large condition sets
    const matchingPerms = this.executeChunkedPermissionQuery(allConditions);

    // Index permissions by scope for efficient lookup
    const permsByScope = new Map<string, Array<(typeof matchingPerms)[0]>>();
    for (const perm of matchingPerms) {
      const key = `${perm.scopeType}:${perm.scopeId ?? ''}:${perm.entryType}:${perm.entryId ?? ''}`;
      const existing = permsByScope.get(key) ?? [];
      existing.push(perm);
      permsByScope.set(key, existing);
    }

    // Check each entry against the collected permissions
    for (const entry of nonProjectEntries) {
      const scopeChain = entryScopes.get(entry.id);
      if (!scopeChain) {
        // Entry scope chain not found - deny access
        results.set(entry.id, false);
        continue;
      }
      let hasPermission = false;

      for (const scope of scopeChain) {
        // Check entry-specific permission
        const entryKey = `${scope.type}:${scope.id ?? ''}:${entry.entryType}:${entry.id}`;
        const entryPerms = permsByScope.get(entryKey) ?? [];
        if (this.hasAnyRequiredLevel(entryPerms, requiredPermission)) {
          hasPermission = true;
          break;
        }

        // Check entry-type permission
        const typeKey = `${scope.type}:${scope.id ?? ''}:${entry.entryType}:`;
        const typePerms = permsByScope.get(typeKey) ?? [];
        if (this.hasAnyRequiredLevel(typePerms, requiredPermission)) {
          hasPermission = true;
          break;
        }
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
    // Bug #343 note: Project permissions cannot be stored in the permissions table as the schema
    // only allows 'tool', 'guideline', 'knowledge', 'experience'. Projects use organizational
    // membership for access control. Silently skip project grants.
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

    // Bug #10 fix: Increment version and invalidate caches
    // Bug #345 note: This only invalidates local caches. In multi-instance deployments,
    // other instances will have stale caches until their TTL expires or they restart.
    // For strong consistency in distributed setups, use Redis-backed cache with pub/sub invalidation.
    this.cacheVersion++;
    this.permissionsExistCache = null;
    this.permissionCheckCache.clear();
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
        params.entryId === null
          ? isNull(permissions.entryId)
          : eq(permissions.entryId, params.entryId)
      );
    }

    if (params.permission !== undefined) {
      conditions.push(eq(permissions.permission, params.permission));
    }

    this.db
      .delete(permissions)
      .where(and(...conditions))
      .run();

    // Bug #10 fix: Increment version and invalidate caches
    this.cacheVersion++;
    this.permissionsExistCache = null;
    this.permissionCheckCache.clear();
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
