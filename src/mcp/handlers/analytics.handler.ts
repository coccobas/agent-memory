/**
 * Analytics handlers for usage statistics and trends
 *
 * Provides insights into system usage patterns from audit log data.
 */

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

/**
 * Get usage statistics
 */
export function getUsageStatsHandler(params: AnalyticsGetStatsParams): {
  stats: ReturnType<typeof getUsageStats>;
  filters: {
    scopeType?: ScopeType;
    scopeId?: string;
    startDate?: string;
    endDate?: string;
  };
} {
  const stats = getUsageStats({
    scopeType: params.scopeType,
    scopeId: params.scopeId,
    startDate: params.startDate,
    endDate: params.endDate,
  });

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
export function getTrendsHandler(params: AnalyticsGetTrendsParams): {
  trends: ReturnType<typeof getTrends>;
  filters: {
    scopeType?: ScopeType;
    scopeId?: string;
    startDate?: string;
    endDate?: string;
  };
} {
  const trends = getTrends({
    scopeType: params.scopeType,
    scopeId: params.scopeId,
    startDate: params.startDate,
    endDate: params.endDate,
  });

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
  params: AnalyticsGetSubtaskStatsParams
): ReturnType<typeof getSubtaskStats> {
  return getSubtaskStats({
    projectId: params.projectId,
    subtaskType: params.subtaskType,
  });
}

/**
 * Calculate error correlation between two agents
 */
export function getErrorCorrelationHandler(
  params: AnalyticsGetErrorCorrelationParams
): ReturnType<typeof calculateErrorCorrelation> {
  if (!params.agentA || !params.agentB) {
    throw new Error('agentA and agentB are required');
  }

  return calculateErrorCorrelation({
    agentA: params.agentA,
    agentB: params.agentB,
    timeWindow: params.timeWindow,
  });
}

/**
 * Detect low diversity across all agent pairs in a project
 */
export function getLowDiversityHandler(
  params: AnalyticsGetLowDiversityParams & { projectId?: string }
): ReturnType<typeof detectLowDiversity> {
  const projectId = params.projectId ?? params.scopeId;
  if (!projectId) {
    throw new Error('projectId is required');
  }

  return detectLowDiversity(projectId);
}

export const analyticsHandlers = {
  get_stats: getUsageStatsHandler,
  get_trends: getTrendsHandler,
  get_subtask_stats: getSubtaskStatsHandler,
  get_error_correlation: getErrorCorrelationHandler,
  get_low_diversity: getLowDiversityHandler,
};
