/**
 * memory_analytics tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { analyticsHandlers } from '../handlers/analytics.handler.js';
import type {
  AnalyticsGetStatsParams,
  AnalyticsGetTrendsParams,
  AnalyticsGetSubtaskStatsParams,
  AnalyticsGetErrorCorrelationParams,
  AnalyticsGetLowDiversityParams,
  HookAnalyticsParams,
} from '../types.js';

export const memoryAnalyticsDescriptor: ToolDescriptor = {
  name: 'memory_analytics',
  visibility: 'advanced',
  description:
    'Get usage analytics and trends from audit log. Actions: get_stats, get_trends, get_subtask_stats, get_error_correlation, get_low_diversity, get_tool_stats, get_subagent_stats, get_notification_stats, get_dashboard',
  commonParams: {
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string', description: 'Scope ID to filter by' },
    startDate: { type: 'string', description: 'Start date filter (ISO timestamp)' },
    endDate: { type: 'string', description: 'End date filter (ISO timestamp)' },
    projectId: { type: 'string', description: 'Project ID for subtask stats' },
    sessionId: { type: 'string', description: 'Session ID for hook analytics' },
    subtaskType: { type: 'string', description: 'Filter by subtask type' },
    agentA: { type: 'string', description: 'First agent ID for correlation' },
    agentB: { type: 'string', description: 'Second agent ID for correlation' },
    timeWindow: {
      type: 'object',
      description: 'Time window for correlation analysis',
      properties: {
        start: { type: 'string' },
        end: { type: 'string' },
      },
    },
    timeRange: {
      type: 'string',
      enum: ['day', 'week', 'month', 'all'],
      description: 'Time range for hook analytics (alternative to startDate/endDate)',
    },
    toolNames: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by specific tool names (for get_tool_stats)',
    },
    subagentTypes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by subagent types (for get_subagent_stats)',
    },
    severity: {
      type: 'string',
      enum: ['error', 'warning', 'info'],
      description: 'Filter by notification severity (for get_notification_stats)',
    },
  },
  actions: {
    get_stats: {
      contextHandler: (ctx, p) =>
        analyticsHandlers.get_stats(ctx, p as unknown as AnalyticsGetStatsParams),
    },
    get_trends: {
      contextHandler: (ctx, p) =>
        analyticsHandlers.get_trends(ctx, p as unknown as AnalyticsGetTrendsParams),
    },
    get_subtask_stats: {
      contextHandler: (ctx, p) =>
        analyticsHandlers.get_subtask_stats(ctx, p as unknown as AnalyticsGetSubtaskStatsParams),
    },
    get_error_correlation: {
      contextHandler: (ctx, p) =>
        analyticsHandlers.get_error_correlation(
          ctx,
          p as unknown as AnalyticsGetErrorCorrelationParams
        ),
    },
    get_low_diversity: {
      contextHandler: (ctx, p) =>
        analyticsHandlers.get_low_diversity(ctx, p as unknown as AnalyticsGetLowDiversityParams),
    },
    // Hook analytics actions
    get_tool_stats: {
      contextHandler: (ctx, p) =>
        analyticsHandlers.get_tool_stats(ctx, p as unknown as HookAnalyticsParams),
    },
    get_subagent_stats: {
      contextHandler: (ctx, p) =>
        analyticsHandlers.get_subagent_stats(ctx, p as unknown as HookAnalyticsParams),
    },
    get_notification_stats: {
      contextHandler: (ctx, p) =>
        analyticsHandlers.get_notification_stats(ctx, p as unknown as HookAnalyticsParams),
    },
    get_dashboard: {
      contextHandler: (ctx, p) =>
        analyticsHandlers.get_dashboard(ctx, p as unknown as HookAnalyticsParams),
    },
  },
};
