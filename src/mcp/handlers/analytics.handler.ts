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
  HookAnalyticsParams,
} from '../types.js';
import { getHookAnalyticsService } from '../../services/analytics/index.js';
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

/**
 * Convert timeRange to startDate/endDate
 */
function parseTimeRange(timeRange?: string): { startDate?: string; endDate?: string } {
  if (!timeRange || timeRange === 'all') {
    return {};
  }

  const now = new Date();
  const endDate = now.toISOString();
  let startDate: string;

  switch (timeRange) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      break;
    default:
      return {};
  }

  return { startDate, endDate };
}

/**
 * Get tool execution statistics from hook analytics
 */
export async function getToolStatsHandler(
  _context: AppContext,
  params: HookAnalyticsParams
): Promise<{
  stats: Awaited<ReturnType<ReturnType<typeof getHookAnalyticsService>['getToolStats']>>;
  filters: HookAnalyticsParams;
}> {
  const analyticsService = getHookAnalyticsService();
  const { startDate, endDate } = params.timeRange
    ? parseTimeRange(params.timeRange)
    : { startDate: params.startDate, endDate: params.endDate };

  const stats = await analyticsService.getToolStats({
    sessionId: params.sessionId,
    projectId: params.projectId,
    startDate,
    endDate,
    toolNames: params.toolNames,
  });

  return {
    stats,
    filters: {
      sessionId: params.sessionId,
      projectId: params.projectId,
      startDate,
      endDate,
      toolNames: params.toolNames,
    },
  };
}

/**
 * Get subagent completion statistics from hook analytics
 */
export async function getSubagentStatsHandler(
  _context: AppContext,
  params: HookAnalyticsParams
): Promise<{
  stats: Awaited<ReturnType<ReturnType<typeof getHookAnalyticsService>['getSubagentStats']>>;
  filters: HookAnalyticsParams;
}> {
  const analyticsService = getHookAnalyticsService();
  const { startDate, endDate } = params.timeRange
    ? parseTimeRange(params.timeRange)
    : { startDate: params.startDate, endDate: params.endDate };

  const stats = await analyticsService.getSubagentStats({
    sessionId: params.sessionId,
    projectId: params.projectId,
    startDate,
    endDate,
    subagentTypes: params.subagentTypes,
  });

  return {
    stats,
    filters: {
      sessionId: params.sessionId,
      projectId: params.projectId,
      startDate,
      endDate,
      subagentTypes: params.subagentTypes,
    },
  };
}

/**
 * Get notification statistics from hook analytics
 */
export async function getNotificationStatsHandler(
  _context: AppContext,
  params: HookAnalyticsParams
): Promise<{
  stats: Awaited<ReturnType<ReturnType<typeof getHookAnalyticsService>['getNotificationStats']>>;
  filters: HookAnalyticsParams;
}> {
  const analyticsService = getHookAnalyticsService();
  const { startDate, endDate } = params.timeRange
    ? parseTimeRange(params.timeRange)
    : { startDate: params.startDate, endDate: params.endDate };

  const stats = await analyticsService.getNotificationStats({
    sessionId: params.sessionId,
    projectId: params.projectId,
    startDate,
    endDate,
    severity: params.severity,
  });

  return {
    stats,
    filters: {
      sessionId: params.sessionId,
      projectId: params.projectId,
      startDate,
      endDate,
      severity: params.severity,
    },
  };
}

/**
 * Get aggregated dashboard data from hook analytics
 */
export async function getDashboardHandler(
  _context: AppContext,
  params: HookAnalyticsParams
): Promise<{
  dashboard: Awaited<ReturnType<ReturnType<typeof getHookAnalyticsService>['getDashboard']>>;
  filters: HookAnalyticsParams;
  _emptyState?: {
    message: string;
    reason: string;
    howToPopulate: string[];
  };
}> {
  const analyticsService = getHookAnalyticsService();
  const { startDate, endDate } = params.timeRange
    ? parseTimeRange(params.timeRange)
    : { startDate: params.startDate, endDate: params.endDate };

  const dashboard = await analyticsService.getDashboard({
    projectId: params.projectId,
    startDate,
    endDate,
  });

  // Detect empty state and provide helpful guidance
  const isEmpty =
    dashboard.toolStats.totalExecutions === 0 &&
    dashboard.subagentStats.totalInvocations === 0 &&
    dashboard.notificationStats.total === 0;

  const result: {
    dashboard: typeof dashboard;
    filters: HookAnalyticsParams;
    _emptyState?: {
      message: string;
      reason: string;
      howToPopulate: string[];
    };
  } = {
    dashboard,
    filters: {
      projectId: params.projectId,
      startDate,
      endDate,
      timeRange: params.timeRange,
    },
  };

  if (isEmpty) {
    result._emptyState = {
      message: 'No analytics data collected yet',
      reason: 'Hook analytics requires instrumentation from Claude Code hooks to populate data.',
      howToPopulate: [
        '1. Configure Claude Code hooks in your project (.claude/hooks/)',
        '2. Hooks automatically record: tool executions, subagent completions, notifications',
        '3. Use the CLI with hooks enabled to start collecting data',
        '4. Data appears after hook events are triggered during normal usage',
      ],
    };
  }

  return result;
}

export const analyticsHandlers = {
  get_stats: getUsageStatsHandler,
  get_trends: getTrendsHandler,
  get_subtask_stats: getSubtaskStatsHandler,
  get_error_correlation: getErrorCorrelationHandler,
  get_low_diversity: getLowDiversityHandler,
  // Hook analytics handlers
  get_tool_stats: getToolStatsHandler,
  get_subagent_stats: getSubagentStatsHandler,
  get_notification_stats: getNotificationStatsHandler,
  get_dashboard: getDashboardHandler,
};
