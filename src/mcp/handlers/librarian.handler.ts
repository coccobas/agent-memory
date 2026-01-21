/**
 * Librarian MCP Handler
 *
 * Handles MCP requests for the Librarian Agent.
 */

import type { AppContext } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';
import { createComponentLogger } from '../../utils/logger.js';
import { getLibrarianSchedulerStatus } from '../../services/librarian/scheduler.service.js';
import { generateId } from '../../db/repositories/base.js';
import { formatError } from '../errors.js';
import {
  getOptionalParam,
  isScopeType,
  isRecommendationStatus,
  isString,
  isNumber,
  isBoolean,
} from '../../utils/type-guards.js';
import type { IContextDetectionService } from '../../services/context-detection.service.js';
import type { ScopeType } from '../../db/schema/types.js';

const logger = createComponentLogger('librarian-handler');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of scope resolution for librarian operations
 */
export interface ResolvedScope {
  scopeType: ScopeType;
  scopeId: string | undefined;
  warning?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get librarian service from context
 */
function getLibrarianServiceFromContext(context: AppContext) {
  return context.services.librarian;
}

/**
 * Resolve effective scope for librarian operations.
 *
 * When scopeType='project' and no scopeId is provided, uses the context detection
 * service to resolve the projectId from the active session or cwd.
 *
 * This ensures maintenance operations always run on the correct project,
 * preventing issues from stale context detection.
 *
 * @param contextDetection - Optional context detection service
 * @param scopeType - The requested scope type
 * @param scopeId - The explicit scope ID (if provided)
 * @returns Resolved scope with potentially resolved scopeId
 */
export async function resolveEffectiveScope(
  contextDetection: IContextDetectionService | undefined,
  scopeType: ScopeType,
  scopeId: string | undefined
): Promise<ResolvedScope> {
  // If no context detection service, fall back to original behavior
  if (!contextDetection) {
    return {
      scopeType,
      scopeId,
    };
  }

  // Try to resolve the project scope using context detection
  try {
    const resolved = await contextDetection.resolveProjectScope(scopeType, scopeId);
    return {
      scopeType,
      scopeId: resolved.projectId || undefined,
      warning: resolved.warning,
    };
  } catch {
    // If resolution fails (e.g., no active session), fall back to original behavior
    logger.debug(
      { scopeType, scopeId },
      'Context detection failed for scope resolution, using fallback'
    );
    return {
      scopeType,
      scopeId,
    };
  }
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Run pattern detection analysis
 */
const analyze: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const rawScopeType = getOptionalParam(params, 'scopeType', isScopeType) ?? 'project';
  const rawScopeId = getOptionalParam(params, 'scopeId', isString);
  const lookbackDays = getOptionalParam(params, 'lookbackDays', isNumber);
  const dryRun = getOptionalParam(params, 'dryRun', isBoolean);

  // Resolve effective scope using session binding
  const contextDetection = context.services.contextDetection;
  const resolved = await resolveEffectiveScope(contextDetection, rawScopeType, rawScopeId);
  const { scopeType, scopeId, warning: scopeWarning } = resolved;

  logger.info(
    { scopeType, scopeId, lookbackDays, dryRun, scopeWarning },
    'Starting librarian analysis'
  );

  try {
    const result = await service.analyze({
      scopeType,
      scopeId,
      lookbackDays,
      dryRun,
      runId: generateId(),
      initiatedBy: 'mcp-handler',
    });

    return {
      success: true,
      ...(scopeWarning && { warning: scopeWarning }),
      analysis: {
        runId: result.runId,
        dryRun: result.dryRun,
        timing: result.timing,
        stats: result.stats,
        recommendations: result.generatedRecommendations.map((rec) => ({
          title: rec.input.title,
          confidence: rec.input.confidence,
          patternCount: rec.input.patternCount,
          type: rec.input.type,
        })),
      },
    };
  } catch (error) {
    logger.error({ error }, 'Librarian analysis failed');
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * Get librarian status
 */
const status: ContextAwareHandler = async (context, _params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  try {
    const serviceStatus = await service.getStatus();
    const schedulerStatus = getLibrarianSchedulerStatus();

    return {
      success: true,
      status: {
        service: {
          enabled: serviceStatus.enabled,
          config: serviceStatus.config,
          pendingRecommendations: serviceStatus.pendingRecommendations,
          lastAnalysis: serviceStatus.lastAnalysis,
        },
        scheduler: schedulerStatus,
      },
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * List pending recommendations
 */
const list_recommendations: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const store = service.getRecommendationStore();
  const statusFilter = getOptionalParam(params, 'status', isRecommendationStatus);
  const minConfidence = getOptionalParam(params, 'minConfidence', isNumber);
  const limit = getOptionalParam(params, 'limit', isNumber);
  const offset = getOptionalParam(params, 'offset', isNumber);
  const rawScopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const rawScopeId = getOptionalParam(params, 'scopeId', isString);

  // Resolve effective scope using session binding (only when scopeType is provided)
  let scopeType = rawScopeType;
  let scopeId = rawScopeId;
  let scopeWarning: string | undefined;

  if (rawScopeType) {
    const contextDetection = context.services.contextDetection;
    const resolved = await resolveEffectiveScope(contextDetection, rawScopeType, rawScopeId);
    scopeType = resolved.scopeType;
    scopeId = resolved.scopeId;
    scopeWarning = resolved.warning;
  }

  try {
    const recommendations = await store.list(
      {
        status: statusFilter ?? 'pending',
        minConfidence,
        scopeType,
        scopeId,
        inherit: true,
      },
      { limit, offset }
    );

    const count = await store.count({
      status: statusFilter ?? 'pending',
      scopeType,
      scopeId,
    });

    return {
      success: true,
      ...(scopeWarning && { warning: scopeWarning }),
      recommendations: recommendations.map((rec) => ({
        id: rec.id,
        title: rec.title,
        type: rec.type,
        status: rec.status,
        confidence: rec.confidence,
        patternCount: rec.patternCount,
        createdAt: rec.createdAt,
        expiresAt: rec.expiresAt,
      })),
      total: count,
      limit,
      offset,
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * Show recommendation details
 */
const show_recommendation: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = getOptionalParam(params, 'recommendationId', isString);
  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    const recommendation = await store.getById(recommendationId, true);

    if (!recommendation) {
      return {
        success: false,
        error: 'Recommendation not found',
      };
    }

    return {
      success: true,
      recommendation: {
        ...recommendation,
        // JSON.parse returns unknown - parse string array from DB
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        sourceExperienceIds: JSON.parse(recommendation.sourceExperienceIds),
      },
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * Approve a recommendation and perform the actual promotion
 */
const approve: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const promotionService = context.services.experiencePromotion;
  if (!promotionService) {
    return {
      success: false,
      error: 'Experience promotion service not available',
    };
  }

  const recommendationId = getOptionalParam(params, 'recommendationId', isString);
  const reviewedBy = getOptionalParam(params, 'reviewedBy', isString);
  const notes = getOptionalParam(params, 'notes', isString);

  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    // Fetch the recommendation to get its details
    const recommendation = await store.getById(recommendationId);
    if (!recommendation) {
      return {
        success: false,
        error: 'Recommendation not found',
      };
    }

    if (!recommendation.exemplarExperienceId) {
      return {
        success: false,
        error: 'Recommendation has no exemplar experience to promote',
      };
    }

    // Perform the actual promotion
    const promotionResult = await promotionService.promote(recommendation.exemplarExperienceId, {
      toLevel: recommendation.type as 'strategy' | 'skill',
      pattern: recommendation.pattern ?? undefined,
      applicability: recommendation.applicability ?? undefined,
      contraindications: recommendation.contraindications ?? undefined,
      reason: recommendation.rationale ?? undefined,
      promotedBy: reviewedBy ?? 'mcp-handler',
    });

    // Approve the recommendation with the promotion results
    const updated = await store.approve(
      recommendationId,
      reviewedBy ?? 'mcp-handler',
      promotionResult.experience.id,
      promotionResult.createdTool?.id,
      notes
    );

    if (!updated) {
      return {
        success: false,
        error: 'Failed to update recommendation after promotion',
      };
    }

    logger.info(
      {
        recommendationId,
        reviewedBy,
        promotedExperienceId: promotionResult.experience.id,
        createdToolId: promotionResult.createdTool?.id,
      },
      'Recommendation approved and promotion completed'
    );

    return {
      success: true,
      recommendation: updated,
      promotedExperience: promotionResult.experience,
      createdTool: promotionResult.createdTool,
      message: 'Recommendation approved and experience promoted successfully.',
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * Reject a recommendation
 */
const reject: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = getOptionalParam(params, 'recommendationId', isString);
  const reviewedBy = getOptionalParam(params, 'reviewedBy', isString);
  const notes = getOptionalParam(params, 'notes', isString);

  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    const updated = await store.reject(recommendationId, reviewedBy ?? 'mcp-handler', notes);

    if (!updated) {
      return {
        success: false,
        error: 'Recommendation not found',
      };
    }

    logger.info({ recommendationId, reviewedBy }, 'Recommendation rejected');

    return {
      success: true,
      recommendation: updated,
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * Run maintenance tasks (consolidation, forgetting, graph backfill, latent population, tag refinement, semantic edge inference)
 */
const run_maintenance: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  if (!service.hasMaintenanceOrchestrator()) {
    return {
      success: false,
      error: 'Maintenance orchestrator not initialized. Ensure librarian is properly configured.',
    };
  }

  const rawScopeType = getOptionalParam(params, 'scopeType', isScopeType) ?? 'project';
  const rawScopeId = getOptionalParam(params, 'scopeId', isString);
  const dryRun = getOptionalParam(params, 'dryRun', isBoolean) ?? false;
  const initiatedBy = getOptionalParam(params, 'initiatedBy', isString) ?? 'mcp-handler';

  // Resolve effective scope using session binding
  const contextDetection = context.services.contextDetection;
  const resolved = await resolveEffectiveScope(contextDetection, rawScopeType, rawScopeId);
  const { scopeType, scopeId, warning: scopeWarning } = resolved;

  // Parse tasks array if provided
  type MaintenanceTask =
    | 'consolidation'
    | 'forgetting'
    | 'graphBackfill'
    | 'latentPopulation'
    | 'tagRefinement'
    | 'semanticEdgeInference';
  let tasks: MaintenanceTask[] | undefined;
  if (params.tasks && Array.isArray(params.tasks)) {
    const validTasks = [
      'consolidation',
      'forgetting',
      'graphBackfill',
      'latentPopulation',
      'tagRefinement',
      'semanticEdgeInference',
    ];
    tasks = (params.tasks as string[]).filter((t): t is MaintenanceTask => validTasks.includes(t));
  }

  logger.info({ scopeType, scopeId, tasks, dryRun, scopeWarning }, 'Starting maintenance run');

  try {
    const result = await service.runMaintenance({
      scopeType,
      scopeId,
      tasks,
      dryRun,
      initiatedBy,
    });

    return {
      success: true,
      ...(scopeWarning && { warning: scopeWarning }),
      maintenance: {
        runId: result.runId,
        dryRun: result.dryRun,
        timing: result.timing,
        consolidation: result.consolidation,
        forgetting: result.forgetting,
        graphBackfill: result.graphBackfill,
        latentPopulation: result.latentPopulation,
        tagRefinement: result.tagRefinement,
        semanticEdgeInference: result.semanticEdgeInference,
        healthAfter: result.healthAfter,
      },
    };
  } catch (error) {
    logger.error({ error }, 'Maintenance run failed');
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * Skip a recommendation (defer for later)
 */
const skip: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = getOptionalParam(params, 'recommendationId', isString);
  const reviewedBy = getOptionalParam(params, 'reviewedBy', isString);
  const notes = getOptionalParam(params, 'notes', isString);

  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    const updated = await store.skip(recommendationId, reviewedBy ?? 'mcp-handler', notes);

    if (!updated) {
      return {
        success: false,
        error: 'Recommendation not found',
      };
    }

    logger.info({ recommendationId, reviewedBy }, 'Recommendation skipped');

    return {
      success: true,
      recommendation: updated,
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

// Export all handlers
export const librarianHandlers = {
  analyze,
  status,
  list_recommendations,
  show_recommendation,
  approve,
  reject,
  skip,
  run_maintenance,
};
