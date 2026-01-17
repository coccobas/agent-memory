/**
 * Graph Backfill Scheduler Service
 *
 * Provides automated graph backfill scheduling using node-cron.
 * Runs the backfill process on a configurable schedule.
 */

import cron from 'node-cron';
import { createComponentLogger } from '../../utils/logger.js';
import type { GraphBackfillService } from './backfill.service.js';
import type { BackfillRequest, BackfillResult } from './backfill-types.js';
import type { ScopeType } from '../../db/schema.js';

const logger = createComponentLogger('graph-backfill-scheduler');

// =============================================================================
// TYPES
// =============================================================================

export interface GraphBackfillSchedulerConfig {
  /** Cron expression for scheduled backfill (e.g., "0 6 * * *" for daily at 6am) */
  schedule: string;
  /** Enable/disable the scheduler */
  enabled: boolean;
  /** Default scope type for scheduled backfill */
  defaultScopeType?: ScopeType;
  /** Default scope ID for scheduled backfill */
  defaultScopeId?: string;
  /** Max entries per scheduled run */
  maxEntriesPerRun: number;
}

export interface GraphBackfillSchedulerStatus {
  /** Whether the scheduler is currently running */
  running: boolean;
  /** The cron schedule expression (null if not running) */
  schedule: string | null;
  /** Next scheduled run time (null if not running) */
  nextRun: string | null;
  /** Last run result */
  lastRun?: {
    completedAt: string;
    success: boolean;
    totalNodesCreated?: number;
    totalEdgesCreated?: number;
    error?: string;
  };
}

// =============================================================================
// SCHEDULER STATE
// =============================================================================

let scheduledTask: cron.ScheduledTask | null = null;
let currentConfig: GraphBackfillSchedulerConfig | null = null;
let backfillServiceRef: GraphBackfillService | null = null;
let lastRunResult: GraphBackfillSchedulerStatus['lastRun'] | undefined;

// =============================================================================
// SCHEDULER FUNCTIONS
// =============================================================================

/**
 * Start the graph backfill scheduler with the given configuration.
 */
export function startGraphBackfillScheduler(
  config: GraphBackfillSchedulerConfig,
  backfillService: GraphBackfillService
): boolean {
  // Stop any existing scheduler first
  if (scheduledTask) {
    stopGraphBackfillScheduler();
  }

  // Check if scheduler should run
  if (!config.enabled) {
    logger.info('Graph backfill scheduler disabled via configuration');
    return false;
  }

  if (!config.schedule || config.schedule.trim() === '') {
    logger.info('Graph backfill scheduler disabled: no schedule configured');
    return false;
  }

  // Validate cron expression
  if (!cron.validate(config.schedule)) {
    logger.error(
      { schedule: config.schedule },
      'Invalid cron expression for graph backfill scheduler'
    );
    return false;
  }

  currentConfig = config;
  backfillServiceRef = backfillService;

  // Schedule the backfill task
  scheduledTask = cron.schedule(config.schedule, async () => {
    logger.info('Running scheduled graph backfill');
    const startTime = Date.now();

    try {
      const request: BackfillRequest = {
        scopeType: config.defaultScopeType,
        scopeId: config.defaultScopeId,
        maxEntries: config.maxEntriesPerRun,
        initiatedBy: 'graph-backfill-scheduler',
      };

      const result = await backfillService.backfill(request);

      lastRunResult = {
        completedAt: new Date().toISOString(),
        success: true,
        totalNodesCreated: result.totalNodesCreated,
        totalEdgesCreated: result.totalEdgesCreated,
      };

      logger.info(
        {
          runId: result.runId,
          totalNodesCreated: result.totalNodesCreated,
          totalEdgesCreated: result.totalEdgesCreated,
          durationMs: Date.now() - startTime,
        },
        'Scheduled graph backfill completed successfully'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      lastRunResult = {
        completedAt: new Date().toISOString(),
        success: false,
        error: errorMessage,
      };

      logger.error(
        { error: errorMessage, durationMs: Date.now() - startTime },
        'Scheduled graph backfill failed'
      );
    }
  });

  logger.info(
    { schedule: config.schedule, scopeType: config.defaultScopeType },
    'Graph backfill scheduler started'
  );
  return true;
}

/**
 * Stop the graph backfill scheduler.
 */
export function stopGraphBackfillScheduler(): void {
  if (scheduledTask) {
    void scheduledTask.stop();
    scheduledTask = null;
    logger.info('Graph backfill scheduler stopped');
  }
  currentConfig = null;
  backfillServiceRef = null;
}

/**
 * Get the current scheduler status.
 */
export function getGraphBackfillSchedulerStatus(): GraphBackfillSchedulerStatus {
  const running = scheduledTask !== null;

  return {
    running,
    schedule: running && currentConfig ? currentConfig.schedule : null,
    nextRun: running ? getNextRunTime() : null,
    lastRun: lastRunResult,
  };
}

/**
 * Calculate the next run time based on the cron schedule.
 */
function getNextRunTime(): string | null {
  if (!currentConfig?.schedule) return null;

  try {
    const now = new Date();
    const parts = currentConfig.schedule.split(' ');

    // For simple cases, calculate next occurrence
    if (parts.length >= 5) {
      const [minute = '*', hour = '*', dayOfMonth = '*', month = '*', dayOfWeek = '*'] = parts;

      // Handle daily at specific time
      if (
        minute !== '*' &&
        hour !== '*' &&
        dayOfMonth === '*' &&
        month === '*' &&
        dayOfWeek === '*'
      ) {
        const nextRun = new Date(now);
        nextRun.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        return nextRun.toISOString();
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Trigger an immediate backfill run (outside of schedule).
 */
export async function triggerImmediateBackfill(
  request?: Partial<BackfillRequest>
): Promise<BackfillResult | null> {
  if (!backfillServiceRef) {
    logger.warn('Cannot trigger backfill: backfill service not available');
    return null;
  }

  if (!currentConfig) {
    logger.warn('Cannot trigger backfill: scheduler not configured');
    return null;
  }

  const fullRequest: BackfillRequest = {
    scopeType: request?.scopeType ?? currentConfig.defaultScopeType,
    scopeId: request?.scopeId ?? currentConfig.defaultScopeId,
    maxEntries: request?.maxEntries ?? currentConfig.maxEntriesPerRun,
    initiatedBy: request?.initiatedBy ?? 'manual-trigger',
    dryRun: request?.dryRun,
    runId: request?.runId,
  };

  return backfillServiceRef.backfill(fullRequest);
}

/**
 * Check if the scheduler is running.
 */
export function isGraphBackfillSchedulerRunning(): boolean {
  return scheduledTask !== null;
}
