/**
 * Permissions handler
 */

import type { PermissionLevel } from '../../services/permission.service.js';
import type { ScopeType, EntryType } from '../../db/schema.js';
import { requireAdminKey } from '../../utils/admin.js';
import type { AppContext } from '../../core/context.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isScopeType,
  isEntryType,
  isNumber,
  isPermissionLevel,
  isPermissionAction,
} from '../../utils/type-guards.js';
import { createValidationError } from '../../core/errors.js';

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
  grant(context: AppContext, params: Record<string, unknown>) {
    requireAdminKey(params);
    const agent_id = getRequiredParam(params, 'agent_id', isString);
    const scope_type = getOptionalParam(params, 'scope_type', isScopeType);
    const scope_id = getOptionalParam(params, 'scope_id', isString);
    const entry_type = getOptionalParam(params, 'entry_type', isEntryType);
    const permission = getRequiredParam(params, 'permission', isPermissionLevel);

    const perm = context.services.permission.grant({
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
  revoke(context: AppContext, params: Record<string, unknown>) {
    requireAdminKey(params);
    const permission_id = getOptionalParam(params, 'permission_id', isString);
    const agent_id = getOptionalParam(params, 'agent_id', isString);
    const scope_type = getOptionalParam(params, 'scope_type', isScopeType);
    const scope_id = getOptionalParam(params, 'scope_id', isString);
    const entry_type = getOptionalParam(params, 'entry_type', isEntryType);

    if (!permission_id && !agent_id) {
      throw createValidationError(
        'permission_id or agent_id',
        'is required',
        'Provide either permission_id or agent_id to revoke'
      );
    }

    if (!agent_id) {
      throw createValidationError(
        'agent_id',
        'is required when not using permission_id',
        'Provide agent_id to identify which permission to revoke'
      );
    }

    context.services.permission.revoke({
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
  check(context: AppContext, params: Record<string, unknown>) {
    const agent_id = getRequiredParam(params, 'agent_id', isString);
    const action = getRequiredParam(params, 'action', isPermissionAction);
    const scope_type = getRequiredParam(params, 'scope_type', isScopeType);
    const scope_id = getOptionalParam(params, 'scope_id', isString);
    const entry_type = getOptionalParam(params, 'entry_type', isEntryType);

    const hasPermission = context.services.permission.check(
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
  list(context: AppContext, params: Record<string, unknown>) {
    requireAdminKey(params);
    const agent_id = getOptionalParam(params, 'agent_id', isString);
    const scope_type = getOptionalParam(params, 'scope_type', isScopeType);
    const scope_id = getOptionalParam(params, 'scope_id', isString);
    const entry_type = getOptionalParam(params, 'entry_type', isEntryType);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const permissionsList = context.services.permission.list({
      agentId: agent_id,
      scopeType: scope_type ?? undefined,
      scopeId: scope_id ?? undefined,
      entryType: entry_type && isEntryType(entry_type) ? entry_type : undefined,
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
