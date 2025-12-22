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
} from '../types.js';

export const memoryAnalyticsDescriptor: ToolDescriptor = {
  name: 'memory_analytics',
  description:
    'Get usage analytics and trends from audit log. Actions: get_stats, get_trends, get_subtask_stats, get_error_correlation, get_low_diversity',
  commonParams: {
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string', description: 'Scope ID to filter by' },
    startDate: { type: 'string', description: 'Start date filter (ISO timestamp)' },
    endDate: { type: 'string', description: 'End date filter (ISO timestamp)' },
    projectId: { type: 'string', description: 'Project ID for subtask stats' },
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
  },
  actions: {
    get_stats: {
      handler: (p) => analyticsHandlers.get_stats(p as unknown as AnalyticsGetStatsParams),
    },
    get_trends: {
      handler: (p) => analyticsHandlers.get_trends(p as unknown as AnalyticsGetTrendsParams),
    },
    get_subtask_stats: {
      handler: (p) =>
        analyticsHandlers.get_subtask_stats(p as unknown as AnalyticsGetSubtaskStatsParams),
    },
    get_error_correlation: {
      handler: (p) =>
        analyticsHandlers.get_error_correlation(p as unknown as AnalyticsGetErrorCorrelationParams),
    },
    get_low_diversity: {
      handler: (p) =>
        analyticsHandlers.get_low_diversity(p as unknown as AnalyticsGetLowDiversityParams),
    },
  },
};
