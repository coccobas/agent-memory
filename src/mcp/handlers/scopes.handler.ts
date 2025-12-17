/**
 * Scope management handlers (organizations, projects, sessions)
 */

import {
  organizationRepo,
  projectRepo,
  sessionRepo,
  type CreateOrganizationInput,
  type CreateProjectInput,
  type UpdateProjectInput,
  type CreateSessionInput,
} from '../../db/repositories/scopes.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isObject,
  isBoolean,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';

/**
 * Type guard to check if a value is a valid session status
 */
function isSessionStatus(value: unknown): value is 'active' | 'paused' | 'completed' | 'discarded' {
  return isString(value) && ['active', 'paused', 'completed', 'discarded'].includes(value);
}

export const scopeHandlers = {
  // ===========================================================================
  // ORGANIZATIONS
  // ===========================================================================

  orgCreate(params: Record<string, unknown>) {
    const name = getRequiredParam(params, 'name', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    const input: CreateOrganizationInput = {
      name,
      metadata,
    };

    const org = organizationRepo.create(input);
    return formatTimestamps({ success: true, organization: org });
  },

  orgList(params: Record<string, unknown>) {
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const organizations = organizationRepo.list({ limit, offset });
    return formatTimestamps({
      organizations,
      meta: {
        returnedCount: organizations.length,
      },
    });
  },

  // ===========================================================================
  // PROJECTS
  // ===========================================================================

  projectCreate(params: Record<string, unknown>) {
    const name = getRequiredParam(params, 'name', isString);
    const orgId = getOptionalParam(params, 'orgId', isString);
    const description = getOptionalParam(params, 'description', isString);
    const rootPath = getOptionalParam(params, 'rootPath', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    const input: CreateProjectInput = {
      name,
      orgId,
      description,
      rootPath,
      metadata,
    };

    const project = projectRepo.create(input);
    return formatTimestamps({ success: true, project });
  },

  projectList(params: Record<string, unknown>) {
    const orgId = getOptionalParam(params, 'orgId', isString);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const projects = projectRepo.list({ orgId }, { limit, offset });
    return formatTimestamps({
      projects,
      meta: {
        returnedCount: projects.length,
      },
    });
  },

  projectGet(params: Record<string, unknown>) {
    const id = getOptionalParam(params, 'id', isString);
    const name = getOptionalParam(params, 'name', isString);
    const orgId = getOptionalParam(params, 'orgId', isString);

    if (!id && !name) {
      throw new Error('Either id or name is required');
    }

    let project;
    if (id) {
      project = projectRepo.getById(id);
    } else if (name) {
      project = projectRepo.getByName(name, orgId);
    }

    if (!project) {
      throw new Error('Project not found');
    }

    return formatTimestamps({ project });
  },

  projectUpdate(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);
    const name = getOptionalParam(params, 'name', isString);
    const description = getOptionalParam(params, 'description', isString);
    const rootPath = getOptionalParam(params, 'rootPath', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    const input: UpdateProjectInput = {};
    if (name !== undefined) input.name = name;
    if (description !== undefined) input.description = description;
    if (rootPath !== undefined) input.rootPath = rootPath;
    if (metadata !== undefined) input.metadata = metadata;

    const project = projectRepo.update(id, input);
    if (!project) {
      throw new Error('Project not found');
    }

    return formatTimestamps({ success: true, project });
  },

  projectDelete(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);
    const confirm = getOptionalParam(params, 'confirm', isBoolean);

    if (!confirm) {
      throw new Error(
        'Delete requires confirmation. Set confirm: true to proceed. WARNING: This will permanently delete the project and cannot be undone.'
      );
    }

    const deleted = projectRepo.delete(id);
    if (!deleted) {
      throw new Error('Project not found or already deleted');
    }

    return { success: true, message: `Project ${id} deleted` };
  },

  // ===========================================================================
  // SESSIONS
  // ===========================================================================

  sessionStart(params: Record<string, unknown>) {
    const projectId = getOptionalParam(params, 'projectId', isString);
    const name = getOptionalParam(params, 'name', isString);
    const purpose = getOptionalParam(params, 'purpose', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    const input: CreateSessionInput = {
      projectId,
      name,
      purpose,
      agentId,
      metadata,
    };

    const session = sessionRepo.create(input);
    return formatTimestamps({ success: true, session });
  },

  sessionEnd(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);
    const status = getOptionalParam(params, 'status', isSessionStatus);

    const session = sessionRepo.end(id, (status ?? 'completed') as 'completed' | 'discarded');
    if (!session) {
      throw new Error('Session not found');
    }

    return formatTimestamps({ success: true, session });
  },

  sessionList(params: Record<string, unknown>) {
    const projectId = getOptionalParam(params, 'projectId', isString);
    const status = getOptionalParam(params, 'status', isSessionStatus);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const sessions = sessionRepo.list({ projectId, status }, { limit, offset });
    return formatTimestamps({
      sessions,
      meta: {
        returnedCount: sessions.length,
      },
    });
  },
};
