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
} from '../../utils/type-guards.js';

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
    return { success: true, organization: org };
  },

  orgList(params: Record<string, unknown>) {
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

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
    return { success: true, project };
  },

  projectList(params: Record<string, unknown>) {
    const orgId = getOptionalParam(params, 'orgId', isString);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const projects = projectRepo.list({ orgId }, { limit, offset });
    return {
      projects,
      meta: {
        returnedCount: projects.length,
      },
    };
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

    return { project };
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

    return { success: true, project };
  },

  // ===========================================================================
  // SESSIONS
  // ===========================================================================

  sessionStart(params: Record<string, unknown>) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ed4dad30-4ac8-4940-ab0c-6f851ddd4464', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'scopes.handler.ts:149',
        message: 'sessionStart entry',
        data: { params: params },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'A',
      }),
    }).catch(() => {});
    // #endregion
    const projectId = getOptionalParam(params, 'projectId', isString);
    const name = getOptionalParam(params, 'name', isString);
    const purpose = getOptionalParam(params, 'purpose', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ed4dad30-4ac8-4940-ab0c-6f851ddd4464', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'scopes.handler.ts:156',
        message: 'Parameters extracted',
        data: {
          projectId: projectId,
          name: name,
          purpose: purpose,
          agentId: agentId,
          hasMetadata: !!metadata,
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'A',
      }),
    }).catch(() => {});
    // #endregion

    // #region agent log
    if (projectId) {
      fetch('http://127.0.0.1:7242/ingest/ed4dad30-4ac8-4940-ab0c-6f851ddd4464', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'scopes.handler.ts:160',
          message: 'Checking if project exists',
          data: { projectId: projectId },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'B',
        }),
      }).catch(() => {});
      const project = projectRepo.getById(projectId);
      fetch('http://127.0.0.1:7242/ingest/ed4dad30-4ac8-4940-ab0c-6f851ddd4464', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'scopes.handler.ts:163',
          message: 'Project lookup result',
          data: { projectId: projectId, projectExists: !!project, projectData: project },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'B',
        }),
      }).catch(() => {});
    }
    // #endregion

    const input: CreateSessionInput = {
      projectId,
      name,
      purpose,
      agentId,
      metadata,
    };

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ed4dad30-4ac8-4940-ab0c-6f851ddd4464', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'scopes.handler.ts:172',
        message: 'Before sessionRepo.create',
        data: { input: input },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'C',
      }),
    }).catch(() => {});
    // #endregion
    try {
      const session = sessionRepo.create(input);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ed4dad30-4ac8-4940-ab0c-6f851ddd4464', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'scopes.handler.ts:175',
          message: 'sessionRepo.create succeeded',
          data: { sessionId: session?.id },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'C',
        }),
      }).catch(() => {});
      // #endregion
      return { success: true, session };
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ed4dad30-4ac8-4940-ab0c-6f851ddd4464', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'scopes.handler.ts:178',
          message: 'sessionRepo.create failed',
          data: {
            errorMessage: error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : 'unknown',
            errorStack: error instanceof Error ? error.stack : undefined,
            input: input,
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'C',
        }),
      }).catch(() => {});
      // #endregion
      throw error;
    }
  },

  sessionEnd(params: Record<string, unknown>) {
    const id = getRequiredParam(params, 'id', isString);
    const status = getOptionalParam(params, 'status', isSessionStatus);

    const session = sessionRepo.end(id, (status ?? 'completed') as 'completed' | 'discarded');
    if (!session) {
      throw new Error('Session not found');
    }

    return { success: true, session };
  },

  sessionList(params: Record<string, unknown>) {
    const projectId = getOptionalParam(params, 'projectId', isString);
    const status = getOptionalParam(params, 'status', isSessionStatus);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const sessions = sessionRepo.list({ projectId, status }, { limit, offset });
    return {
      sessions,
      meta: {
        returnedCount: sessions.length,
      },
    };
  },
};
