/**
 * memory_permission tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { permissionHandlers } from '../handlers/permissions.handler.js';

export const memoryPermissionDescriptor: ToolDescriptor = {
  name: 'memory_permission',
  description: 'Manage permissions. Actions: grant, revoke, check, list',
  commonParams: {
    admin_key: { type: 'string', description: 'Admin key (grant, revoke, list)' },
    agent_id: { type: 'string', description: 'Agent identifier (grant, revoke, check, list)' },
    scope_type: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope type (grant, revoke, check, list)',
    },
    scope_id: { type: 'string', description: 'Scope ID (grant, revoke, check, list)' },
    entry_type: {
      type: 'string',
      enum: ['tool', 'guideline', 'knowledge'],
      description: 'Entry type (grant, revoke, check, list)',
    },
    permission: {
      type: 'string',
      enum: ['read', 'write', 'admin'],
      description: 'Permission level (grant)',
    },
    created_by: { type: 'string', description: 'Creator identifier (grant)' },
    permission_id: { type: 'string', description: 'Permission ID (revoke)' },
    limit: { type: 'number', description: 'Max results (list, default: all)' },
    offset: { type: 'number', description: 'Skip N results (list)' },
  },
  actions: {
    grant: { handler: permissionHandlers.grant },
    revoke: { handler: permissionHandlers.revoke },
    check: { handler: permissionHandlers.check },
    list: { handler: permissionHandlers.list },
  },
};
