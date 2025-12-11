/**
 * Permissions handler
 */

import {
  checkPermission,
  grantPermission,
  revokePermission,
  listPermissions as listPermissionsFromService,
  type PermissionLevel,
} from '../../services/permission.service.js';
import type { ScopeType, EntryType } from '../../db/schema.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export interface PermissionGrantParams {
  agent_id: string;
  scope_type?: ScopeType | null;
  scope_id?: string | null;
  entry_type?: EntryType | null;
  permission: PermissionLevel;
  created_by?: string;
}

export interface PermissionRevokeParams {
  permission_id?: string;
  agent_id?: string;
  scope_type?: ScopeType | null;
  scope_id?: string | null;
  entry_type?: EntryType | null;
}

export interface PermissionCheckParams {
  agent_id: string;
  action: 'read' | 'write';
  scope_type: ScopeType;
  scope_id?: string | null;
  entry_type?: EntryType | null;
}

export interface PermissionListParams {
  agent_id?: string;
  scope_type?: ScopeType | null;
  scope_id?: string | null;
  entry_type?: EntryType | null;
  limit?: number;
  offset?: number;
}

export const permissionHandlers = {
  /**
   * Grant a permission to an agent
   */
  grant(params: Record<string, unknown>) {
    const { agent_id, scope_type, scope_id, entry_type, permission } =
      cast<PermissionGrantParams>(params);

    if (!agent_id) {
      throw new Error('agent_id is required');
    }

    if (!permission) {
      throw new Error('permission is required');
    }

    const perm = grantPermission({
      agentId: agent_id,
      scopeType: scope_type ?? undefined,
      scopeId: scope_id,
      entryType: entry_type ?? undefined,
      permission,
    });

    return {
      permission: perm,
      message: 'Permission granted successfully',
    };
  },

  /**
   * Revoke a permission
   */
  revoke(params: Record<string, unknown>) {
    const { agent_id, scope_type, scope_id, entry_type } = cast<PermissionRevokeParams>(params);

    if (!agent_id) {
      throw new Error('agent_id is required');
    }

    revokePermission({
      agentId: agent_id,
      scopeType: scope_type ?? undefined,
      scopeId: scope_id,
      entryType: entry_type ?? undefined,
    });

    return {
      message: 'Permission revoked successfully',
    };
  },

  /**
   * Check if an agent has permission
   */
  check(params: Record<string, unknown>) {
    const { agent_id, action, scope_type, scope_id, entry_type } =
      cast<PermissionCheckParams>(params);

    if (!agent_id) {
      throw new Error('agent_id is required');
    }

    if (!action) {
      throw new Error('action is required');
    }

    if (!scope_type) {
      throw new Error('scope_type is required');
    }

    const hasPermission = checkPermission(
      agent_id,
      action,
      entry_type ?? 'tool',
      null,
      scope_type,
      scope_id ?? null
    );

    return {
      has_permission: hasPermission,
      agent_id,
      action,
      scope_type,
      scope_id: scope_id ?? null,
      entry_type: entry_type ?? null,
    };
  },

  /**
   * List permissions
   */
  list(params: Record<string, unknown>) {
    const { agent_id, scope_type, scope_id, entry_type, limit, offset } =
      cast<PermissionListParams>(params);

    const permissionsList = listPermissionsFromService({
      agentId: agent_id,
      scopeType: scope_type ?? undefined,
      scopeId: scope_id ?? undefined,
      entryType: entry_type === 'project' ? undefined : (entry_type ?? undefined),
    });

    // Apply pagination
    const start = offset ?? 0;
    const end = limit ? start + limit : permissionsList.length;
    const paginated = permissionsList.slice(start, end);

    return {
      permissions: paginated.map((p) => ({
        id: p.id,
        agentId: p.agentId,
        scopeType: p.scopeType,
        scopeId: p.scopeId,
        entryType: p.entryType,
        entryId: p.entryId,
        permission: p.permission,
      })),
      total: permissionsList.length,
      limit: limit ?? permissionsList.length,
      offset: start,
    };
  },
};
