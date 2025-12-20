/**
 * Permission checking helpers for MCP handlers
 */

import { checkPermission } from '../../services/permission.service.js';
import type { ScopeType, EntryType } from '../../db/schema.js';

/**
 * Check if the system is in permissive mode (backward compatibility)
 * In permissive mode, missing agentId is allowed
 * In strict mode (default when permissions exist), agentId is required
 */
function isPermissiveMode(): boolean {
  return process.env.AGENT_MEMORY_PERMISSIONS_MODE === 'permissive';
}

/**
 * Check if an agent has permission for an action
 *
 * Behavior:
 * - If AGENT_MEMORY_PERMISSIONS_MODE=permissive: allow access when agentId is missing
 * - Otherwise: require agentId for all permission-checked operations
 *
 * @param agentId - Optional agent identifier
 * @param action - Action to check
 * @param scopeType - Scope type
 * @param scopeId - Optional scope ID
 * @param entryType - Optional entry type
 * @throws Error if permission is denied or agentId missing in strict mode
 */
export function requirePermission(
  agentId: string | undefined,
  action: 'read' | 'write',
  scopeType: ScopeType,
  scopeId?: string | null,
  entryType?: EntryType | null
): void {
  // If no agentId provided, check if permissive mode allows it
  if (!agentId) {
    if (isPermissiveMode()) {
      return; // Allow in permissive mode
    }
    throw new Error(
      `Authentication required: agentId must be provided. Set AGENT_MEMORY_PERMISSIONS_MODE=permissive to allow anonymous access.`
    );
  }

  const hasPermission = checkPermission(
    agentId,
    action,
    entryType ?? 'tool',
    null,
    scopeType,
    scopeId
  );

  if (!hasPermission) {
    throw new Error(
      `Permission denied: agent '${agentId}' does not have '${action}' permission for ${entryType ?? 'all entries'} in ${scopeType}${scopeId ? `:${scopeId}` : ''}`
    );
  }
}

/**
 * Check if agentId is required based on current mode
 * Use this to validate agentId at the start of handlers
 */
export function requireAgentId(agentId: string | undefined): asserts agentId is string {
  if (!agentId && !isPermissiveMode()) {
    throw new Error(
      `Authentication required: agentId must be provided. Set AGENT_MEMORY_PERMISSIONS_MODE=permissive to allow anonymous access.`
    );
  }
}

/**
 * Check permission for filtering (returns boolean, doesn't throw)
 * Used when filtering lists of entries based on permissions
 *
 * @param agentId - Optional agent identifier
 * @param action - Action to check
 * @param entryType - Entry type
 * @param entryId - Entry ID
 * @param scopeType - Scope type
 * @param scopeId - Scope ID
 * @returns true if permission is granted, false otherwise
 */
export function checkPermissionForFilter(
  agentId: string | undefined,
  action: 'read' | 'write' | 'delete',
  entryType: EntryType,
  entryId: string | null,
  scopeType: ScopeType,
  scopeId: string | null
): boolean {
  // If no agentId provided, check if permissive mode allows it
  if (!agentId) {
    return isPermissiveMode();
  }

  return checkPermission(agentId, action, entryType, entryId, scopeType, scopeId);
}
