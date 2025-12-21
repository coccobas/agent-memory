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
  description: 'Manage projects. Actions: create, list, get, update',
  commonParams: {
    id: { type: 'string', description: 'Project ID (get, update)' },
    name: { type: 'string', description: 'Project name' },
    orgId: { type: 'string', description: 'Parent organization ID' },
    description: { type: 'string', description: 'Project description' },
    rootPath: { type: 'string', description: 'Filesystem root path' },
    metadata: { type: 'object', description: 'Optional metadata' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    create: {
      handler: (p) =>
        scopeHandlers.projectCreate(p as unknown as ProjectCreateParams & { adminKey?: string }),
    },
    list: {
      handler: (p) => scopeHandlers.projectList(p as unknown as ProjectListParams),
    },
    get: {
      handler: (p) => scopeHandlers.projectGet(p as unknown as ProjectGetParams),
    },
    update: {
      handler: (p) =>
        scopeHandlers.projectUpdate(p as unknown as ProjectUpdateParams & { adminKey?: string }),
    },
    delete: {
      handler: (p) =>
        scopeHandlers.projectDelete(p as unknown as ProjectDeleteParams & { adminKey?: string }),
    },
  },
};
