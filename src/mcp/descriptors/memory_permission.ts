/**
 * memory_permission tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { permissionHandlers } from '../handlers/permissions.handler.js';

export const memoryPermissionDescriptor: ToolDescriptor = {
  name: 'memory_permission',
  visibility: 'standard',
  description: 'Manage permissions. Actions: grant, revoke, check, list',
  commonParams: {
    admin_key: { type: 'string' },
    agent_id: { type: 'string' },
    scope_type: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scope_id: { type: 'string' },
    entry_type: { type: 'string', enum: ['tool', 'guideline', 'knowledge'] },
    permission: { type: 'string', enum: ['read', 'write', 'admin'] },
    created_by: { type: 'string' },
    permission_id: { type: 'string' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    grant: { contextHandler: (ctx, params) => permissionHandlers.grant(ctx, params) },
    revoke: { contextHandler: (ctx, params) => permissionHandlers.revoke(ctx, params) },
    check: { contextHandler: (ctx, params) => permissionHandlers.check(ctx, params) },
    list: { contextHandler: (ctx, params) => permissionHandlers.list(ctx, params) },
  },
};
