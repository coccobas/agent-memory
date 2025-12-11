/**
 * Permission checking helpers for MCP handlers
 */

import { checkPermission } from '../../services/permission.service.js';
import type { ScopeType, EntryType } from '../../db/schema.js';

/**
 * Check if an agent has permission for an action
 * Returns true if agentId is not provided (backward compatibility)
 *
 * @param agentId - Optional agent identifier
 * @param action - Action to check
 * @param scopeType - Scope type
 * @param scopeId - Optional scope ID
 * @param entryType - Optional entry type
 * @returns true if allowed, false if denied
 * @throws Error if permission is denied
 */
export function requirePermission(
  agentId: string | undefined,
  action: 'read' | 'write',
  scopeType: ScopeType,
  scopeId?: string | null,
  entryType?: EntryType | null
): void {
  // If no agentId provided, allow access (backward compatibility)
  if (!agentId) {
    return;
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
