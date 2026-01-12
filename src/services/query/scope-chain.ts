/**
 * Scope Chain Resolution
 *
 * Resolves scope inheritance chains for memory queries.
 * Supports hierarchical scopes: global -> org -> project -> session
 */

import { eq } from 'drizzle-orm';
import type { DbClient } from '../../db/connection.js';
import { projects, sessions, type ScopeType } from '../../db/schema.js';
import { LRUCache } from '../../utils/lru-cache.js';
import { getRuntime, isRuntimeRegistered } from '../../core/container.js';
import { createValidationError } from '../../core/errors.js';

// =============================================================================
// UUID VALIDATION
// =============================================================================

/**
 * Validates that a string is a valid UUID format.
 * Accepts UUIDs with or without hyphens.
 */
const UUID_REGEX = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[1-5][0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12}$/i;

function validateScopeId(id: string | undefined, scopeType: ScopeType): string | undefined {
  if (id === undefined || id === null) return undefined;

  // Validate UUID format for non-global scopes
  if (!UUID_REGEX.test(id)) {
    throw createValidationError(
      `${scopeType}Id`,
      `Invalid ${scopeType} ID format: must be a valid UUID`,
      'Provide a valid UUID like "123e4567-e89b-12d3-a456-426614174000"'
    );
  }
  return id;
}

// =============================================================================
// TYPES
// =============================================================================

export interface ScopeDescriptor {
  scopeType: ScopeType;
  scopeId: string | null;
}

// =============================================================================
// SCOPE CHAIN CACHE
// =============================================================================

// Add scope chain cache with shorter TTL (scope structure changes less often)
// Increased from 100 to 500 for multi-tenant deployments
const scopeChainCache = new LRUCache<ScopeDescriptor[]>({
  maxSize: 500,
  ttlMs: 10 * 60 * 1000, // 10 minutes
});

// Lazy registration with memory coordinator
let scopeChainCacheRegistered = false;

function ensureScopeChainCacheRegistered(): void {
  if (!scopeChainCacheRegistered && isRuntimeRegistered()) {
    getRuntime().memoryCoordinator.register('scopeChain', scopeChainCache, 8); // Higher priority - metadata cache
    scopeChainCacheRegistered = true;
  }
}

function getScopeChainCacheKey(input?: {
  type: ScopeType;
  id?: string;
  inherit?: boolean;
}): string {
  if (!input) return 'global:inherit';
  return `${input.type}:${input.id ?? 'null'}:${input.inherit ?? true}`;
}

export function invalidateScopeChainCache(_scopeType?: ScopeType, _scopeId?: string): void {
  ensureScopeChainCacheRegistered();
  // Broad invalidation for now
  scopeChainCache.clear();
}

/**
 * Clear the scope chain cache (for testing)
 */
export function clearScopeChainCache(): void {
  ensureScopeChainCacheRegistered();
  scopeChainCache.clear();
}

// =============================================================================
// SCOPE CHAIN RESOLUTION
// =============================================================================

/**
 * Resolve scope inheritance chain in precedence order.
 *
 * Example for a session scope:
 *   session(id) -> project(projectId) -> org(orgId) -> global
 *
 * @param input - Scope input (type, id, inherit)
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function resolveScopeChain(
  input:
    | {
        type: ScopeType;
        id?: string;
        inherit?: boolean;
      }
    | undefined,
  db: DbClient
): ScopeDescriptor[] {
  ensureScopeChainCacheRegistered();
  const cacheKey = getScopeChainCacheKey(input);
  const cached = scopeChainCache.get(cacheKey);
  if (cached) return cached;

  const inherit = input?.inherit ?? true;

  if (!input) {
    // Default to global scope
    const result: ScopeDescriptor[] = [{ scopeType: 'global', scopeId: null }];
    scopeChainCache.set(cacheKey, result);
    return result;
  }
  const chain: ScopeDescriptor[] = [];

  const pushUnique = (scopeType: ScopeType, scopeId: string | null) => {
    // For inherit=false, only allow the first (requested) scope
    if (!inherit && chain.length > 0) {
      return;
    }

    // Avoid duplicates
    const exists = chain.some((s) => s.scopeType === scopeType && s.scopeId === scopeId);
    if (!exists) {
      chain.push({ scopeType, scopeId });
    }
  };

  // Validate scope ID format before any database operations
  if (input.type !== 'global' && input.id) {
    validateScopeId(input.id, input.type);
  }

  // Start from requested scope
  switch (input.type) {
    case 'global': {
      pushUnique('global', null);
      break;
    }
    case 'org': {
      const orgId = input.id ?? null;
      pushUnique('org', orgId);
      if (inherit) {
        pushUnique('global', null);
      }
      break;
    }
    case 'project': {
      const projectId = input.id ?? null;
      pushUnique('project', projectId);

      if (inherit) {
        if (projectId) {
          const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
          if (project?.orgId) {
            pushUnique('org', project.orgId);
          }
        }
        pushUnique('global', null);
      }
      break;
    }
    case 'session': {
      const sessionId = input.id ?? null;
      pushUnique('session', sessionId);

      if (inherit && sessionId) {
        const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
        if (session?.projectId) {
          pushUnique('project', session.projectId);

          const project = db
            .select()
            .from(projects)
            .where(eq(projects.id, session.projectId))
            .get();
          if (project?.orgId) {
            pushUnique('org', project.orgId);
          }
        }
      }

      if (inherit) {
        pushUnique('global', null);
      }
      break;
    }
  }

  if (chain.length === 0) {
    // Fallback
    chain.push({ scopeType: 'global', scopeId: null });
  }

  scopeChainCache.set(cacheKey, chain);
  return chain;
}
