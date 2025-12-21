/**
 * memory_org tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { scopeHandlers } from '../handlers/scopes.handler.js';
import type { OrgCreateParams, OrgListParams } from '../types.js';

export const memoryOrgDescriptor: ToolDescriptor = {
  name: 'memory_org',
  description: 'Manage organizations. Actions: create, list',
  commonParams: {
    limit: { type: 'number', description: 'Max results (list, default 20)' },
    offset: { type: 'number', description: 'Skip N results (list)' },
  },
  actions: {
    create: {
      params: {
        name: { type: 'string', description: 'Organization name (create)' },
        metadata: { type: 'object', description: 'Optional metadata (create)' },
      },
      handler: (p) =>
        scopeHandlers.orgCreate(p as unknown as OrgCreateParams & { adminKey?: string }),
    },
    list: {
      handler: (p) => scopeHandlers.orgList(p as unknown as OrgListParams),
    },
  },
};
