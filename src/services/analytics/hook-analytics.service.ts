/**
 * Hook Analytics Service
 *
 * Service layer for recording and querying Claude Code hook analytics.
 * Wraps the hook metrics repository with additional business logic.
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { IHookMetricsRepository } from '../../db/repositories/hook-metrics.js';
import type {
  ToolExecutionMetricData,
  SubagentMetricData,
  NotificationMetricData,
} from '../../db/schema/hook-metrics.js';
import type {
  ToolStats,
  SubagentStats,
  NotificationStats,
  DashboardData,
  ListMetricsFilter,
} from '../../db/repositories/hook-metrics.js';

const logger = createComponentLogger('hook-analytics');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input for recording a tool execution
 */
export interface RecordToolExecutionParams {
  sessionId?: string;
  projectId?: string;
  toolName: string;
  success: boolean;
  durationMs?: number;
  errorType?: string;
  inputSize?: number;
  outputSize?: number;
  fileType?: string;
  commandCategory?: string;
}

/**
 * Input for recording a subagent completion
 */
export interface RecordSubagentParams {
  sessionId?: string;
  projectId?: string;
  subagentId: string;
  subagentType: string;
  parentSessionId?: string;
  success: boolean;
  durationMs?: number;
  resultSize?: number;
  delegationDepth?: number;
}

/**
 * Input for recording a notification
 */
export interface RecordNotificationParams {
  sessionId?: string;
  projectId?: string;
  type: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category?: string;
}

/**
 * Query options for analytics
 */
export interface AnalyticsQueryOptions {
  sessionId?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
  toolNames?: string[];
  subagentTypes?: string[];
  timeRange?: 'day' | 'week' | 'month' | 'all';
  severity?: 'error' | 'warning' | 'info';
}

/**
 * Configuration for the hook analytics service
 */
export interface HookAnalyticsConfig {
  /** Enable analytics recording (default: true) */
  enabled: boolean;
  /** Maximum metrics to retain per session (default: 1000) */
  maxMetricsPerSession: number;
  /** Metric retention days (default: 30) */
  retentionDays: number;
}

const DEFAULT_CONFIG: HookAnalyticsConfig = {
  enabled: true,
  maxMetricsPerSession: 1000,
  retentionDays: 30,
};

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Hook Analytics Service
 *
 * Records and queries analytics data from Claude Code hooks.
 */
export class HookAnalyticsService {
  private config: HookAnalyticsConfig;
  private repository: IHookMetricsRepository | null = null;

  constructor(config?: Partial<HookAnalyticsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the repository instance (for late binding)
   */
  setRepository(repo: IHookMetricsRepository): void {
    this.repository = repo;
  }

  /**
   * Check if the service is properly configured
   */
  isAvailable(): boolean {
    return this.config.enabled && this.repository !== null;
  }

  /**
   * Get current configuration
   */
  getConfig(): HookAnalyticsConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HookAnalyticsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Record a tool execution metric
   */
  async recordToolExecution(params: RecordToolExecutionParams): Promise<void> {
    if (!this.isAvailable()) {
      logger.debug('Hook analytics not available, skipping tool execution recording');
      return;
    }

    const data: ToolExecutionMetricData = {
      toolName: params.toolName,
      success: params.success,
      durationMs: params.durationMs,
      errorType: params.errorType,
      inputSize: params.inputSize,
      outputSize: params.outputSize,
      fileType: params.fileType,
      commandCategory: params.commandCategory,
    };

    try {
      await this.repository!.recordToolExecution({
        sessionId: params.sessionId,
        projectId: params.projectId,
        data,
      });

      logger.debug(
        {
          sessionId: params.sessionId,
          toolName: params.toolName,
          success: params.success,
          durationMs: params.durationMs,
        },
        'Tool execution metric recorded'
      );
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: params.sessionId,
          toolName: params.toolName,
        },
        'Failed to record tool execution metric (non-fatal)'
      );
    }
  }

  /**
   * Record a subagent completion metric
   */
  async recordSubagentCompletion(params: RecordSubagentParams): Promise<void> {
    if (!this.isAvailable()) {
      logger.debug('Hook analytics not available, skipping subagent recording');
      return;
    }

    const data: SubagentMetricData = {
      subagentId: params.subagentId,
      subagentType: params.subagentType,
      parentSessionId: params.parentSessionId,
      success: params.success,
      durationMs: params.durationMs,
      resultSize: params.resultSize,
      delegationDepth: params.delegationDepth,
    };

    try {
      await this.repository!.recordSubagent({
        sessionId: params.sessionId,
        projectId: params.projectId,
        data,
      });

      logger.debug(
        {
          sessionId: params.sessionId,
          subagentId: params.subagentId,
          subagentType: params.subagentType,
          success: params.success,
        },
        'Subagent completion metric recorded'
      );
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: params.sessionId,
          subagentType: params.subagentType,
        },
        'Failed to record subagent completion metric (non-fatal)'
      );
    }
  }

  /**
   * Record a notification metric
   */
  async recordNotification(params: RecordNotificationParams): Promise<void> {
    if (!this.isAvailable()) {
      logger.debug('Hook analytics not available, skipping notification recording');
      return;
    }

    const data: NotificationMetricData = {
      type: params.type,
      message: params.message,
      severity: params.severity,
      category: params.category,
    };

    try {
      await this.repository!.recordNotification({
        sessionId: params.sessionId,
        projectId: params.projectId,
        data,
      });

      logger.debug(
        {
          sessionId: params.sessionId,
          type: params.type,
          severity: params.severity,
        },
        'Notification metric recorded'
      );
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: params.sessionId,
          type: params.type,
        },
        'Failed to record notification metric (non-fatal)'
      );
    }
  }

  /**
   * Get tool execution statistics
   */
  async getToolStats(options?: AnalyticsQueryOptions): Promise<ToolStats> {
    if (!this.isAvailable()) {
      return {
        totalExecutions: 0,
        successRate: 0,
        avgDurationMs: 0,
        byTool: {},
        errorDistribution: {},
      };
    }

    const filter = this.buildFilter(options);
    return this.repository!.getToolStats(filter);
  }

  /**
   * Get subagent statistics
   */
  async getSubagentStats(options?: AnalyticsQueryOptions): Promise<SubagentStats> {
    if (!this.isAvailable()) {
      return {
        totalInvocations: 0,
        successRate: 0,
        avgDurationMs: 0,
        byType: {},
      };
    }

    const filter = this.buildFilter(options);
    return this.repository!.getSubagentStats(filter);
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(options?: AnalyticsQueryOptions): Promise<NotificationStats> {
    if (!this.isAvailable()) {
      return {
        total: 0,
        byType: {},
        bySeverity: {},
        errorRate: 0,
        topMessages: [],
      };
    }

    const filter = this.buildFilter(options);
    return this.repository!.getNotificationStats(filter);
  }

  /**
   * Get combined dashboard data
   */
  async getDashboard(options?: AnalyticsQueryOptions): Promise<DashboardData> {
    if (!this.isAvailable()) {
      return {
        toolStats: {
          totalExecutions: 0,
          successRate: 0,
          avgDurationMs: 0,
          byTool: {},
          errorDistribution: {},
        },
        subagentStats: {
          totalInvocations: 0,
          successRate: 0,
          avgDurationMs: 0,
          byType: {},
        },
        notificationStats: {
          total: 0,
          byType: {},
          bySeverity: {},
          errorRate: 0,
          topMessages: [],
        },
        sessionHealthScore: 100,
        timeRange: { start: '', end: '' },
      };
    }

    const filter = this.buildFilter(options);
    return this.repository!.getDashboard(filter);
  }

  /**
   * Get session health score (0-100)
   */
  async getSessionHealthScore(sessionId: string): Promise<number> {
    if (!this.isAvailable()) {
      return 100; // Default to healthy when analytics not available
    }

    return this.repository!.getSessionHealthScore(sessionId);
  }

  /**
   * Build filter from query options
   */
  private buildFilter(options?: AnalyticsQueryOptions): ListMetricsFilter {
    const filter: ListMetricsFilter = {};

    if (options?.sessionId) {
      filter.sessionId = options.sessionId;
    }
    if (options?.projectId) {
      filter.projectId = options.projectId;
    }
    if (options?.startDate) {
      filter.startDate = options.startDate;
    }
    if (options?.endDate) {
      filter.endDate = options.endDate;
    }

    // Handle time range shorthand
    if (options?.timeRange && !options.startDate) {
      const now = new Date();
      let start: Date;

      switch (options.timeRange) {
        case 'day':
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          start = new Date(0); // All time
      }

      filter.startDate = start.toISOString();
      filter.endDate = now.toISOString();
    }

    return filter;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let instance: HookAnalyticsService | null = null;

/**
 * Get the singleton HookAnalyticsService instance
 */
export function getHookAnalyticsService(): HookAnalyticsService {
  if (!instance) {
    // Read config from environment
    const envEnabled = process.env.AGENT_MEMORY_HOOK_ANALYTICS_ENABLED;
    const envMaxMetrics = process.env.AGENT_MEMORY_HOOK_MAX_METRICS_PER_SESSION;
    const envRetentionDays = process.env.AGENT_MEMORY_HOOK_RETENTION_DAYS;

    const config: Partial<HookAnalyticsConfig> = {};

    if (envEnabled !== undefined) {
      config.enabled = envEnabled !== 'false' && envEnabled !== '0';
    }
    if (envMaxMetrics) {
      const parsed = parseInt(envMaxMetrics, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        config.maxMetricsPerSession = parsed;
      }
    }
    if (envRetentionDays) {
      const parsed = parseInt(envRetentionDays, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        config.retentionDays = parsed;
      }
    }

    instance = new HookAnalyticsService(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetHookAnalyticsService(): void {
  instance = null;
}
