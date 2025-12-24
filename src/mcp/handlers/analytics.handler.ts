/**
 * Analytics handlers for usage statistics and trends
 *
 * Provides insights into system usage patterns from audit log data.
 * Context-aware handlers that receive AppContext for dependency injection.
 */

import type { AppContext } from '../../core/context.js';
import { getUsageStats, getTrends, getSubtaskStats } from '../../services/analytics.service.js';
import {
  calculateErrorCorrelation,
  detectLowDiversity,
} from '../../services/error-correlation.service.js';
import type { ScopeType } from '../../db/schema.js';
import type {
  AnalyticsGetStatsParams,
  AnalyticsGetTrendsParams,
  AnalyticsGetSubtaskStatsParams,
  AnalyticsGetErrorCorrelationParams,
  AnalyticsGetLowDiversityParams,
} from '../types.js';
import { createValidationError } from '../../core/errors.js';

/**
 * Get usage statistics
 */
export function getUsageStatsHandler(
  context: AppContext,
  params: AnalyticsGetStatsParams
): {
  stats: ReturnType<typeof getUsageStats>;
  filters: {
    scopeType?: ScopeType;
    scopeId?: string;
    startDate?: string;
    endDate?: string;
  };
} {
  const stats = getUsageStats(
    {
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      startDate: params.startDate,
      endDate: params.endDate,
    },
    context.db
  );

  return {
    stats,
    filters: {
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      startDate: params.startDate,
      endDate: params.endDate,
    },
  };
}

/**
 * Get trend data over time
 */
export function getTrendsHandler(
  context: AppContext,
  params: AnalyticsGetTrendsParams
): {
  trends: ReturnType<typeof getTrends>;
  filters: {
    scopeType?: ScopeType;
    scopeId?: string;
    startDate?: string;
    endDate?: string;
  };
} {
  const trends = getTrends(
    {
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      startDate: params.startDate,
      endDate: params.endDate,
    },
    context.db
  );

  return {
    trends,
    filters: {
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      startDate: params.startDate,
      endDate: params.endDate,
    },
  };
}

/**
 * Get subtask execution analytics
 */
export function getSubtaskStatsHandler(
  context: AppContext,
  params: AnalyticsGetSubtaskStatsParams
): ReturnType<typeof getSubtaskStats> {
  return getSubtaskStats(
    {
      projectId: params.projectId,
      subtaskType: params.subtaskType,
    },
    context.db
  );
}

/**
 * Calculate error correlation between two agents
 */
export function getErrorCorrelationHandler(
  context: AppContext,
  params: AnalyticsGetErrorCorrelationParams
): ReturnType<typeof calculateErrorCorrelation> {
  if (!params.agentA || !params.agentB) {
    throw createValidationError(
      'agentA and agentB',
      'are required',
      'Provide both agent IDs to calculate error correlation'
    );
  }

  return calculateErrorCorrelation(
    {
      agentA: params.agentA,
      agentB: params.agentB,
      timeWindow: params.timeWindow,
    },
    context.db
  );
}

/**
 * Detect low diversity across all agent pairs in a project
 */
export function getLowDiversityHandler(
  context: AppContext,
  params: AnalyticsGetLowDiversityParams & { projectId?: string }
): ReturnType<typeof detectLowDiversity> {
  const projectId = params.projectId ?? params.scopeId;
  if (!projectId) {
    throw createValidationError(
      'projectId',
      'is required',
      'Provide projectId or scopeId to detect low diversity'
    );
  }

  return detectLowDiversity(projectId, context.db);
}

export const analyticsHandlers = {
  get_stats: getUsageStatsHandler,
  get_trends: getTrendsHandler,
  get_subtask_stats: getSubtaskStatsHandler,
  get_error_correlation: getErrorCorrelationHandler,
  get_low_diversity: getLowDiversityHandler,
};
