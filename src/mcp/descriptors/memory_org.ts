/**
 * memory_org tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { scopeHandlers } from '../handlers/scopes.handler.js';
import type { OrgCreateParams, OrgListParams } from '../types.js';

export const memoryOrgDescriptor: ToolDescriptor = {
  name: 'memory_org',
  visibility: 'standard',
  description: 'Manage organizations. Actions: create, list',
  commonParams: {
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    create: {
      params: {
        name: { type: 'string' },
        metadata: { type: 'object' },
      },
      contextHandler: (ctx, p) =>
        scopeHandlers.orgCreate(ctx, p as unknown as OrgCreateParams & { adminKey?: string }),
    },
    list: {
      contextHandler: (ctx, p) => scopeHandlers.orgList(ctx, p as unknown as OrgListParams),
    },
  },
};
