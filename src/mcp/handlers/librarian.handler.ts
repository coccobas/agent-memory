/**
 * Librarian MCP Handler
 *
 * Handles MCP requests for the Librarian Agent.
 */

import type { AppContext } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';
import type { ScopeType } from '../../db/schema.js';
import type { RecommendationStatus } from '../../db/schema/recommendations.js';
import { createComponentLogger } from '../../utils/logger.js';
import { getLibrarianService, initializeLibrarianService } from '../../services/librarian/index.js';
import {
  getLibrarianSchedulerStatus,
} from '../../services/librarian/scheduler.service.js';
import { generateId } from '../../db/repositories/base.js';

const logger = createComponentLogger('librarian-handler');

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get or initialize the librarian service
 */
function getOrInitLibrarianService(context: AppContext) {
  let service = getLibrarianService();
  if (!service && context.sqlite) {
    service = initializeLibrarianService({ db: context.db, sqlite: context.sqlite });
  }
  return service;
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Run pattern detection analysis
 */
const analyze: ContextAwareHandler = async (context, params) => {
  const service = getOrInitLibrarianService(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const scopeType = (params.scopeType as ScopeType) ?? 'project';
  const scopeId = params.scopeId as string | undefined;
  const lookbackDays = params.lookbackDays as number | undefined;
  const dryRun = params.dryRun as boolean | undefined;

  logger.info({ scopeType, scopeId, lookbackDays, dryRun }, 'Starting librarian analysis');

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
      analysis: {
        runId: result.runId,
        dryRun: result.dryRun,
        timing: result.timing,
        stats: result.stats,
        recommendations: result.generatedRecommendations.map(rec => ({
          title: rec.input.title,
          confidence: rec.input.confidence,
          patternCount: rec.input.patternCount,
          type: rec.input.type,
        })),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Librarian analysis failed');
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Get librarian status
 */
const status: ContextAwareHandler = async (context, _params) => {
  const service = getOrInitLibrarianService(context);

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * List pending recommendations
 */
const list_recommendations: ContextAwareHandler = async (context, params) => {
  const service = getOrInitLibrarianService(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const store = service.getRecommendationStore();
  const statusFilter = params.status as RecommendationStatus | undefined;
  const minConfidence = params.minConfidence as number | undefined;
  const limit = params.limit as number | undefined;
  const offset = params.offset as number | undefined;
  const scopeType = params.scopeType as ScopeType | undefined;
  const scopeId = params.scopeId as string | undefined;

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
      recommendations: recommendations.map(rec => ({
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Show recommendation details
 */
const show_recommendation: ContextAwareHandler = async (context, params) => {
  const service = getOrInitLibrarianService(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = params.recommendationId as string;
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
        sourceExperienceIds: JSON.parse(recommendation.sourceExperienceIds),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Approve a recommendation
 */
const approve: ContextAwareHandler = async (context, params) => {
  const service = getOrInitLibrarianService(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = params.recommendationId as string;
  const reviewedBy = params.reviewedBy as string | undefined;
  const notes = params.notes as string | undefined;

  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    const updated = await store.approve(
      recommendationId,
      reviewedBy ?? 'mcp-handler',
      undefined, // promotedExperienceId - would be set after actual promotion
      undefined, // promotedToolId - would be set after actual promotion
      notes
    );

    if (!updated) {
      return {
        success: false,
        error: 'Recommendation not found',
      };
    }

    logger.info({ recommendationId, reviewedBy }, 'Recommendation approved');

    return {
      success: true,
      recommendation: updated,
      message: 'Recommendation approved. TODO: Implement actual promotion logic.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Reject a recommendation
 */
const reject: ContextAwareHandler = async (context, params) => {
  const service = getOrInitLibrarianService(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = params.recommendationId as string;
  const reviewedBy = params.reviewedBy as string | undefined;
  const notes = params.notes as string | undefined;

  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    const updated = await store.reject(
      recommendationId,
      reviewedBy ?? 'mcp-handler',
      notes
    );

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Skip a recommendation (defer for later)
 */
const skip: ContextAwareHandler = async (context, params) => {
  const service = getOrInitLibrarianService(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = params.recommendationId as string;
  const reviewedBy = params.reviewedBy as string | undefined;
  const notes = params.notes as string | undefined;

  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    const updated = await store.skip(
      recommendationId,
      reviewedBy ?? 'mcp-handler',
      notes
    );

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
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
};
