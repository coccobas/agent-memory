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
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('scopes');
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
    const criticalGuidelines = getCriticalGuidelinesForSession(
      projectId ?? null,
      session.id,
      context.db
    );

    return formatTimestamps({
      success: true,
      session,
      criticalGuidelines,
    });
  },

  async sessionEnd(context: AppContext, params: SessionEndParams) {
    const id = getRequiredParam(params, 'id', isString);
    const status = getOptionalParam(params, 'status', isSessionStatus);

    const session = await context.repos.sessions.end(
      id,
      (status ?? 'completed') as 'completed' | 'discarded'
    );
    if (!session) {
      throw createNotFoundError('Session', id);
    }

    // Trigger capture service on session end (non-blocking)
    const captureService = context.services.capture;
    if (captureService && status !== 'discarded') {
      captureService.onSessionEnd(id).then(result => {
        if (result.experiences.experiences.length > 0 || result.knowledge.knowledge.length > 0) {
          logger.info(
            {
              sessionId: id,
              experiencesExtracted: result.experiences.experiences.length,
              knowledgeExtracted: result.knowledge.knowledge.length,
              guidelinesExtracted: result.knowledge.guidelines.length,
              toolsExtracted: result.knowledge.tools.length,
            },
            'Session capture completed'
          );
        }
      }).catch(error => {
        logger.error(
          { sessionId: id, error: error instanceof Error ? error.message : String(error) },
          'Session capture failed'
        );
      });
    }

    // Record task outcome for RL feedback (non-blocking)
    recordSessionOutcome(id, status ?? 'completed', context.services.feedback);

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

/**
 * Record session outcome for RL feedback collection
 *
 * Infers outcome type from session status and links all retrievals
 * from the session to this outcome.
 */
function recordSessionOutcome(
  sessionId: string,
  status: 'active' | 'paused' | 'completed' | 'discarded',
  feedbackService: import('../../services/feedback/index.js').FeedbackService
): void {

  // Fire-and-forget async recording
  setImmediate(async () => {
    try {
      // Infer outcome type from session status
      const outcomeType = inferOutcomeFromStatus(status);

      // Record the outcome
      const outcomeId = await feedbackService.recordOutcome({
        sessionId,
        outcomeType,
        outcomeSignal: 'session_status',
        confidence: getConfidenceForStatus(status),
      });

      // Link all unlinked retrievals from this session to the outcome
      const retrievals = await feedbackService.getUnlinkedRetrievals(sessionId);
      if (retrievals.length > 0) {
        await feedbackService.linkRetrievalsToOutcome(
          outcomeId,
          retrievals.map(r => r.id)
        );
        logger.debug(
          { sessionId, outcomeId, linkedRetrievals: retrievals.length },
          'Linked retrievals to session outcome'
        );
      }
    } catch (error) {
      logger.error(
        { sessionId, error: error instanceof Error ? error.message : String(error) },
        'Failed to record session outcome for RL feedback'
      );
    }
  });
}

/**
 * Infer outcome type from session status
 */
function inferOutcomeFromStatus(
  status: 'active' | 'paused' | 'completed' | 'discarded'
): 'success' | 'failure' | 'partial' | 'unknown' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'discarded':
      return 'failure';
    case 'paused':
      return 'partial';
    default:
      return 'unknown';
  }
}

/**
 * Get confidence level for status-based outcome inference
 */
function getConfidenceForStatus(
  status: 'active' | 'paused' | 'completed' | 'discarded'
): number {
  // Session status is a moderate signal - not explicit user feedback
  switch (status) {
    case 'completed':
      return 0.7;  // Completed sessions likely successful
    case 'discarded':
      return 0.8;  // Discarded is a stronger signal of failure
    case 'paused':
      return 0.5;  // Paused is ambiguous
    default:
      return 0.3;
  }
}
