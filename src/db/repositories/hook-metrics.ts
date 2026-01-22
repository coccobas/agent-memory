/**
 * Hook Metrics Repository
 *
 * Handles database operations for Claude Code hook analytics.
 * Stores and retrieves tool execution, subagent, and notification metrics.
 */

import { eq, and, desc, gte, lte } from 'drizzle-orm';
import type { DrizzleDb } from './base.js';
import { generateId } from './base.js';
import type { PaginationOptions } from './base.js';
import {
  hookMetrics,
  type HookMetric,
  type HookMetricType,
  type ToolExecutionMetricData,
  type SubagentMetricData,
  type NotificationMetricData,
} from '../schema.js';

// =============================================================================
// TYPES
// =============================================================================

export interface RecordToolExecutionInput {
  sessionId?: string;
  projectId?: string;
  data: ToolExecutionMetricData;
  timestamp?: string;
}

export interface RecordSubagentInput {
  sessionId?: string;
  projectId?: string;
  data: SubagentMetricData;
  timestamp?: string;
}

export interface RecordNotificationInput {
  sessionId?: string;
  projectId?: string;
  data: NotificationMetricData;
  timestamp?: string;
}

export interface ListMetricsFilter {
  metricType?: HookMetricType;
  sessionId?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
}

export interface ToolStats {
  totalExecutions: number;
  successRate: number;
  avgDurationMs: number;
  byTool: Record<
    string,
    {
      count: number;
      successRate: number;
      avgDurationMs: number;
    }
  >;
  errorDistribution: Record<string, number>;
}

export interface SubagentStats {
  totalInvocations: number;
  successRate: number;
  avgDurationMs: number;
  byType: Record<
    string,
    {
      count: number;
      successRate: number;
      avgDurationMs: number;
    }
  >;
}

export interface NotificationStats {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  errorRate: number;
  topMessages: Array<{ message: string; count: number }>;
}

export interface DashboardData {
  toolStats: ToolStats;
  subagentStats: SubagentStats;
  notificationStats: NotificationStats;
  sessionHealthScore: number;
  timeRange: {
    start: string;
    end: string;
  };
}

export interface IHookMetricsRepository {
  recordToolExecution(input: RecordToolExecutionInput): Promise<HookMetric>;
  recordSubagent(input: RecordSubagentInput): Promise<HookMetric>;
  recordNotification(input: RecordNotificationInput): Promise<HookMetric>;
  list(filter: ListMetricsFilter, options?: PaginationOptions): Promise<HookMetric[]>;
  getToolStats(filter: ListMetricsFilter): Promise<ToolStats>;
  getSubagentStats(filter: ListMetricsFilter): Promise<SubagentStats>;
  getNotificationStats(filter: ListMetricsFilter): Promise<NotificationStats>;
  getDashboard(filter: ListMetricsFilter): Promise<DashboardData>;
  getSessionHealthScore(sessionId: string): Promise<number>;
}

// =============================================================================
// REPOSITORY IMPLEMENTATION
// =============================================================================

export function createHookMetricsRepository(db: DrizzleDb): IHookMetricsRepository {
  /**
   * Build where conditions from filter
   */
  function buildWhereConditions(filter: ListMetricsFilter) {
    const conditions = [];

    if (filter.metricType) {
      conditions.push(eq(hookMetrics.metricType, filter.metricType));
    }
    if (filter.sessionId) {
      conditions.push(eq(hookMetrics.sessionId, filter.sessionId));
    }
    if (filter.projectId) {
      conditions.push(eq(hookMetrics.projectId, filter.projectId));
    }
    if (filter.startDate) {
      conditions.push(gte(hookMetrics.timestamp, filter.startDate));
    }
    if (filter.endDate) {
      conditions.push(lte(hookMetrics.timestamp, filter.endDate));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  return {
    /**
     * Record a tool execution metric
     */
    async recordToolExecution(input: RecordToolExecutionInput): Promise<HookMetric> {
      const id = generateId();
      const timestamp = input.timestamp ?? new Date().toISOString();

      const result = db
        .insert(hookMetrics)
        .values({
          id,
          metricType: 'tool_execution',
          sessionId: input.sessionId ?? null,
          projectId: input.projectId ?? null,
          data: JSON.stringify(input.data),
          timestamp,
        })
        .returning()
        .get();

      return result;
    },

    /**
     * Record a subagent completion metric
     */
    async recordSubagent(input: RecordSubagentInput): Promise<HookMetric> {
      const id = generateId();
      const timestamp = input.timestamp ?? new Date().toISOString();

      const result = db
        .insert(hookMetrics)
        .values({
          id,
          metricType: 'subagent',
          sessionId: input.sessionId ?? null,
          projectId: input.projectId ?? null,
          data: JSON.stringify(input.data),
          timestamp,
        })
        .returning()
        .get();

      return result;
    },

    /**
     * Record a notification metric
     */
    async recordNotification(input: RecordNotificationInput): Promise<HookMetric> {
      const id = generateId();
      const timestamp = input.timestamp ?? new Date().toISOString();

      const result = db
        .insert(hookMetrics)
        .values({
          id,
          metricType: 'notification',
          sessionId: input.sessionId ?? null,
          projectId: input.projectId ?? null,
          data: JSON.stringify(input.data),
          timestamp,
        })
        .returning()
        .get();

      return result;
    },

    /**
     * List metrics with filtering
     */
    async list(filter: ListMetricsFilter, options?: PaginationOptions): Promise<HookMetric[]> {
      const whereConditions = buildWhereConditions(filter);
      const limit = options?.limit ?? 100;
      const offset = options?.offset ?? 0;

      let query = db
        .select()
        .from(hookMetrics)
        .orderBy(desc(hookMetrics.timestamp))
        .limit(limit)
        .offset(offset);

      if (whereConditions) {
        query = query.where(whereConditions) as typeof query;
      }

      return query.all();
    },

    /**
     * Get tool execution statistics
     */
    async getToolStats(filter: ListMetricsFilter): Promise<ToolStats> {
      const metrics = await this.list(
        { ...filter, metricType: 'tool_execution' },
        { limit: 10000 }
      );

      if (metrics.length === 0) {
        return {
          totalExecutions: 0,
          successRate: 0,
          avgDurationMs: 0,
          byTool: {},
          errorDistribution: {},
        };
      }

      const byTool: Record<string, { count: number; successCount: number; totalDuration: number }> =
        {};
      const errorDistribution: Record<string, number> = {};
      let totalSuccess = 0;
      let totalDuration = 0;
      let durationCount = 0;

      for (const metric of metrics) {
        const data = JSON.parse(metric.data) as ToolExecutionMetricData;

        // Aggregate by tool
        if (!byTool[data.toolName]) {
          byTool[data.toolName] = { count: 0, successCount: 0, totalDuration: 0 };
        }
        byTool[data.toolName]!.count++;
        if (data.success) {
          byTool[data.toolName]!.successCount++;
          totalSuccess++;
        }
        if (data.durationMs !== undefined) {
          byTool[data.toolName]!.totalDuration += data.durationMs;
          totalDuration += data.durationMs;
          durationCount++;
        }

        // Error distribution
        if (!data.success && data.errorType) {
          errorDistribution[data.errorType] = (errorDistribution[data.errorType] ?? 0) + 1;
        }
      }

      const toolStats: ToolStats['byTool'] = {};
      for (const [toolName, stats] of Object.entries(byTool)) {
        toolStats[toolName] = {
          count: stats.count,
          successRate: stats.count > 0 ? stats.successCount / stats.count : 0,
          avgDurationMs: stats.count > 0 ? stats.totalDuration / stats.count : 0,
        };
      }

      return {
        totalExecutions: metrics.length,
        successRate: metrics.length > 0 ? totalSuccess / metrics.length : 0,
        avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
        byTool: toolStats,
        errorDistribution,
      };
    },

    /**
     * Get subagent statistics
     */
    async getSubagentStats(filter: ListMetricsFilter): Promise<SubagentStats> {
      const metrics = await this.list({ ...filter, metricType: 'subagent' }, { limit: 10000 });

      if (metrics.length === 0) {
        return {
          totalInvocations: 0,
          successRate: 0,
          avgDurationMs: 0,
          byType: {},
        };
      }

      const byType: Record<string, { count: number; successCount: number; totalDuration: number }> =
        {};
      let totalSuccess = 0;
      let totalDuration = 0;
      let durationCount = 0;

      for (const metric of metrics) {
        const data = JSON.parse(metric.data) as SubagentMetricData;

        // Aggregate by type
        if (!byType[data.subagentType]) {
          byType[data.subagentType] = { count: 0, successCount: 0, totalDuration: 0 };
        }
        byType[data.subagentType]!.count++;
        if (data.success) {
          byType[data.subagentType]!.successCount++;
          totalSuccess++;
        }
        if (data.durationMs !== undefined) {
          byType[data.subagentType]!.totalDuration += data.durationMs;
          totalDuration += data.durationMs;
          durationCount++;
        }
      }

      const typeStats: SubagentStats['byType'] = {};
      for (const [typeName, stats] of Object.entries(byType)) {
        typeStats[typeName] = {
          count: stats.count,
          successRate: stats.count > 0 ? stats.successCount / stats.count : 0,
          avgDurationMs: stats.count > 0 ? stats.totalDuration / stats.count : 0,
        };
      }

      return {
        totalInvocations: metrics.length,
        successRate: metrics.length > 0 ? totalSuccess / metrics.length : 0,
        avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
        byType: typeStats,
      };
    },

    /**
     * Get notification statistics
     */
    async getNotificationStats(filter: ListMetricsFilter): Promise<NotificationStats> {
      const metrics = await this.list({ ...filter, metricType: 'notification' }, { limit: 10000 });

      if (metrics.length === 0) {
        return {
          total: 0,
          byType: {},
          bySeverity: {},
          errorRate: 0,
          topMessages: [],
        };
      }

      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      const messageCount: Record<string, number> = {};
      let errorCount = 0;

      for (const metric of metrics) {
        const data = JSON.parse(metric.data) as NotificationMetricData;

        // Count by type
        byType[data.type] = (byType[data.type] ?? 0) + 1;

        // Count by severity
        bySeverity[data.severity] = (bySeverity[data.severity] ?? 0) + 1;
        if (data.severity === 'error') {
          errorCount++;
        }

        // Count messages (truncate for grouping)
        const truncatedMessage = data.message.slice(0, 100);
        messageCount[truncatedMessage] = (messageCount[truncatedMessage] ?? 0) + 1;
      }

      // Get top messages
      const topMessages = Object.entries(messageCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([message, count]) => ({ message, count }));

      return {
        total: metrics.length,
        byType,
        bySeverity,
        errorRate: metrics.length > 0 ? errorCount / metrics.length : 0,
        topMessages,
      };
    },

    /**
     * Get combined dashboard data
     */
    async getDashboard(filter: ListMetricsFilter): Promise<DashboardData> {
      const [toolStats, subagentStats, notificationStats] = await Promise.all([
        this.getToolStats(filter),
        this.getSubagentStats(filter),
        this.getNotificationStats(filter),
      ]);

      // Calculate session health score (0-100)
      // Based on: tool success rate, notification error rate
      const toolSuccessWeight = 0.7;
      const notificationWeight = 0.3;
      const sessionHealthScore =
        toolStats.successRate * toolSuccessWeight * 100 +
        (1 - notificationStats.errorRate) * notificationWeight * 100;

      return {
        toolStats,
        subagentStats,
        notificationStats,
        sessionHealthScore: Math.round(sessionHealthScore),
        timeRange: {
          start: filter.startDate ?? '',
          end: filter.endDate ?? new Date().toISOString(),
        },
      };
    },

    /**
     * Get health score for a specific session
     */
    async getSessionHealthScore(sessionId: string): Promise<number> {
      const dashboard = await this.getDashboard({ sessionId });
      return dashboard.sessionHealthScore;
    },
  };
}
