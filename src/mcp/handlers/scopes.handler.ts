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

import type {
  OrgCreateParams,
  OrgListParams,
  ProjectCreateParams,
  ProjectUpdateParams,
  ProjectListParams,
  ProjectGetParams,
  SessionStartParams,
  SessionEndParams,
  SessionListParams,
} from '../types.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export const scopeHandlers = {
  // ===========================================================================
  // ORGANIZATIONS
  // ===========================================================================

  orgCreate(params: Record<string, unknown>) {
    const { name, metadata } = cast<OrgCreateParams>(params);

    if (!name) {
      throw new Error('name is required');
    }

    const input: CreateOrganizationInput = {
      name,
      metadata: metadata,
    };

    const org = organizationRepo.create(input);
    return { success: true, organization: org };
  },

  orgList(params: Record<string, unknown>) {
    const { limit, offset } = cast<OrgListParams>(params);

    const organizations = organizationRepo.list({ limit, offset });
    return {
      organizations,
      meta: {
        returnedCount: organizations.length,
      },
    };
  },

  // ===========================================================================
  // PROJECTS
  // ===========================================================================

  projectCreate(params: Record<string, unknown>) {
    const { name, orgId, description, rootPath, metadata } = cast<ProjectCreateParams>(params);

    if (!name) {
      throw new Error('name is required');
    }

    const input: CreateProjectInput = {
      name,
      orgId,
      description,
      rootPath,
      metadata: metadata,
    };

    const project = projectRepo.create(input);
    return { success: true, project };
  },

  projectList(params: Record<string, unknown>) {
    const { orgId, limit, offset } = cast<ProjectListParams>(params);

    const projects = projectRepo.list({ orgId }, { limit, offset });
    return {
      projects,
      meta: {
        returnedCount: projects.length,
      },
    };
  },

  projectGet(params: Record<string, unknown>) {
    const { id, name, orgId } = cast<ProjectGetParams>(params);

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

    return { project };
  },

  projectUpdate(params: Record<string, unknown>) {
    const { id, name, description, rootPath, metadata } = cast<ProjectUpdateParams>(params);

    if (!id) {
      throw new Error('id is required');
    }

    const input: UpdateProjectInput = {};
    if (name !== undefined) input.name = name;
    if (description !== undefined) input.description = description;
    if (rootPath !== undefined) input.rootPath = rootPath;
    if (metadata !== undefined) input.metadata = metadata;

    const project = projectRepo.update(id, input);
    if (!project) {
      throw new Error('Project not found');
    }

    return { success: true, project };
  },

  // ===========================================================================
  // SESSIONS
  // ===========================================================================

  sessionStart(params: Record<string, unknown>) {
    const { projectId, name, purpose, agentId, metadata } = cast<SessionStartParams>(params);

    const input: CreateSessionInput = {
      projectId,
      name,
      purpose,
      agentId,
      metadata: metadata,
    };

    const session = sessionRepo.create(input);
    return { success: true, session };
  },

  sessionEnd(params: Record<string, unknown>) {
    const { id, status } = cast<SessionEndParams>(params);

    if (!id) {
      throw new Error('id is required');
    }

    const session = sessionRepo.end(id, status ?? 'completed');
    if (!session) {
      throw new Error('Session not found');
    }

    return { success: true, session };
  },

  sessionList(params: Record<string, unknown>) {
    const { projectId, status, limit, offset } = cast<SessionListParams>(params);

    const sessions = sessionRepo.list({ projectId, status }, { limit, offset });
    return {
      sessions,
      meta: {
        returnedCount: sessions.length,
      },
    };
  },
};
