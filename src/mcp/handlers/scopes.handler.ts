/**
 * Scope management handlers (organizations, projects, sessions)
 *
 * Security: Destructive operations require admin key authentication.
 *
 * Context-aware handlers that receive AppContext for dependency injection.
 */

import type {
  CreateOrganizationInput,
  CreateProjectInput,
  UpdateProjectInput,
  CreateSessionInput,
} from '../../core/interfaces/repositories.js';
import type { AppContext } from '../../core/context.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isObject,
  isBoolean,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { getCriticalGuidelinesForSession } from '../../services/critical-guidelines.service.js';
import { requireAdminKey } from '../../utils/admin.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';
import type {
  OrgCreateParams,
  OrgListParams,
  ProjectCreateParams,
  ProjectListParams,
  ProjectGetParams,
  ProjectUpdateParams,
  ProjectDeleteParams,
  SessionStartParams,
  SessionEndParams,
  SessionListParams,
} from '../types.js';

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

  async orgCreate(context: AppContext, params: OrgCreateParams & { adminKey?: string }) {
    // Security: Org creation requires admin authentication
    requireAdminKey(params);

    const name = getRequiredParam(params, 'name', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    const input: CreateOrganizationInput = {
      name,
      metadata,
    };

    const org = await context.repos.organizations.create(input);
    return formatTimestamps({ success: true, organization: org });
  },

  async orgList(context: AppContext, params: OrgListParams) {
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const organizations = await context.repos.organizations.list({ limit, offset });
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

  async projectCreate(context: AppContext, params: ProjectCreateParams & { adminKey?: string }) {
    // Security: Project creation requires admin authentication
    requireAdminKey(params);

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

    const project = await context.repos.projects.create(input);
    return formatTimestamps({ success: true, project });
  },

  async projectList(context: AppContext, params: ProjectListParams) {
    const orgId = getOptionalParam(params, 'orgId', isString);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const projects = await context.repos.projects.list({ orgId }, { limit, offset });
    return formatTimestamps({
      projects,
      meta: {
        returnedCount: projects.length,
      },
    });
  },

  async projectGet(context: AppContext, params: ProjectGetParams) {
    const id = getOptionalParam(params, 'id', isString);
    const name = getOptionalParam(params, 'name', isString);
    const orgId = getOptionalParam(params, 'orgId', isString);

    if (!id && !name) {
      throw createValidationError(
        'id or name',
        'is required',
        'Provide either project id or name to look up'
      );
    }

    let project;
    if (id) {
      project = await context.repos.projects.getById(id);
    } else if (name) {
      project = await context.repos.projects.getByName(name, orgId);
    }

    if (!project) {
      throw createNotFoundError('Project', id ?? name);
    }

    return formatTimestamps({ project });
  },

  async projectUpdate(context: AppContext, params: ProjectUpdateParams & { adminKey?: string }) {
    // Security: Project update requires admin authentication
    requireAdminKey(params);

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

    const project = await context.repos.projects.update(id, input);
    if (!project) {
      throw createNotFoundError('Project', id);
    }

    return formatTimestamps({ success: true, project });
  },

  async projectDelete(context: AppContext, params: ProjectDeleteParams & { adminKey?: string }) {
    // Security: Project deletion requires admin authentication
    requireAdminKey(params);

    const id = getRequiredParam(params, 'id', isString);
    const confirm = getOptionalParam(params, 'confirm', isBoolean);

    if (!confirm) {
      throw createValidationError(
        'confirm',
        'is required for delete operation',
        'Set confirm: true to proceed. WARNING: This will permanently delete the project and cannot be undone.'
      );
    }

    const deleted = await context.repos.projects.delete(id);
    if (!deleted) {
      throw createNotFoundError('Project', id);
    }

    return { success: true, message: `Project ${id} deleted` };
  },

  // ===========================================================================
  // SESSIONS
  // ===========================================================================

  async sessionStart(context: AppContext, params: SessionStartParams) {
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

    const session = await context.repos.sessions.create(input);

    // Fetch critical guidelines for the session's scope
    const criticalGuidelines = getCriticalGuidelinesForSession(projectId ?? null, session.id, context.db);

    return formatTimestamps({
      success: true,
      session,
      criticalGuidelines,
    });
  },

  async sessionEnd(context: AppContext, params: SessionEndParams) {
    const id = getRequiredParam(params, 'id', isString);
    const status = getOptionalParam(params, 'status', isSessionStatus);

    const session = await context.repos.sessions.end(id, (status ?? 'completed') as 'completed' | 'discarded');
    if (!session) {
      throw createNotFoundError('Session', id);
    }

    return formatTimestamps({ success: true, session });
  },

  async sessionList(context: AppContext, params: SessionListParams) {
    const projectId = getOptionalParam(params, 'projectId', isString);
    const status = getOptionalParam(params, 'status', isSessionStatus);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const sessions = await context.repos.sessions.list({ projectId, status }, { limit, offset });
    return formatTimestamps({
      sessions,
      meta: {
        returnedCount: sessions.length,
      },
    });
  },
};
