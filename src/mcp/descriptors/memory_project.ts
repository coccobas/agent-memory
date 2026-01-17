/**
 * memory_project tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { scopeHandlers } from '../handlers/scopes.handler.js';
import type {
  ProjectCreateParams,
  ProjectListParams,
  ProjectGetParams,
  ProjectUpdateParams,
  ProjectDeleteParams,
} from '../types.js';

export const memoryProjectDescriptor: ToolDescriptor = {
  name: 'memory_project',
  visibility: 'standard',
  description: 'Manage projects. Actions: create, list, get, update, delete',
  commonParams: {
    id: { type: 'string', description: 'Project ID (get, update, delete)' },
    name: { type: 'string', description: 'Project name' },
    orgId: { type: 'string', description: 'Parent organization ID' },
    description: { type: 'string', description: 'Project description' },
    rootPath: { type: 'string', description: 'Filesystem root path' },
    metadata: { type: 'object', description: 'Optional metadata' },
    limit: { type: 'number' },
    offset: { type: 'number' },
    admin_key: { type: 'string', description: 'Admin key (required for create/update/delete)' },
    confirm: { type: 'boolean', description: 'Confirmation flag (required for delete)' },
  },
  actions: {
    create: {
      contextHandler: (ctx, p) =>
        scopeHandlers.projectCreate(
          ctx,
          p as unknown as ProjectCreateParams & { adminKey?: string }
        ),
    },
    list: {
      contextHandler: (ctx, p) => scopeHandlers.projectList(ctx, p as unknown as ProjectListParams),
    },
    get: {
      contextHandler: (ctx, p) => scopeHandlers.projectGet(ctx, p as unknown as ProjectGetParams),
    },
    update: {
      contextHandler: (ctx, p) =>
        scopeHandlers.projectUpdate(
          ctx,
          p as unknown as ProjectUpdateParams & { adminKey?: string }
        ),
    },
    delete: {
      contextHandler: (ctx, p) =>
        scopeHandlers.projectDelete(
          ctx,
          p as unknown as ProjectDeleteParams & { adminKey?: string }
        ),
    },
  },
};
