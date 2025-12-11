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

export interface AnalyticsGetStatsParams {
  scopeType?: ScopeType;
  scopeId?: string;
  startDate?: string; // ISO timestamp
  endDate?: string; // ISO timestamp
}

export interface AnalyticsGetTrendsParams {
  scopeType?: ScopeType;
  scopeId?: string;
  startDate?: string; // ISO timestamp
  endDate?: string; // ISO timestamp
}

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
  params: Record<string, unknown>
): ReturnType<typeof getSubtaskStats> {
  const { projectId, subtaskType, startDate, endDate } = params as {
    projectId?: string;
    subtaskType?: string;
    startDate?: string;
    endDate?: string;
  };

  return getSubtaskStats({
    projectId,
    subtaskType,
    startDate,
    endDate,
  });
}

/**
 * Calculate error correlation between two agents
 */
export function getErrorCorrelationHandler(
  params: Record<string, unknown>
): ReturnType<typeof calculateErrorCorrelation> {
  const { agentA, agentB, timeWindow } = params as {
    agentA: string;
    agentB: string;
    timeWindow?: { start: string; end: string };
  };

  if (!agentA || !agentB) {
    throw new Error('agentA and agentB are required');
  }

  return calculateErrorCorrelation({
    agentA,
    agentB,
    timeWindow,
  });
}

/**
 * Detect low diversity across all agent pairs in a project
 */
export function getLowDiversityHandler(
  params: Record<string, unknown>
): ReturnType<typeof detectLowDiversity> {
  const { projectId } = params as {
    projectId: string;
  };

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


