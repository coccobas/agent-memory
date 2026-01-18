/**
 * Librarian Scheduler Service
 *
 * Provides automated pattern analysis scheduling using node-cron.
 * Runs the librarian analysis pipeline on a configurable schedule.
 */

import cron from 'node-cron';
import { createComponentLogger } from '../../utils/logger.js';
import type { LibrarianService } from './index.js';
import type { AnalysisRequest, AnalysisResult } from './types.js';
import type { ScopeType } from '../../db/schema.js';

const logger = createComponentLogger('librarian-scheduler');

// =============================================================================
// TYPES
// =============================================================================

export interface LibrarianSchedulerConfig {
  /** Cron expression for scheduled analysis (e.g., "0 0 * * *" for daily at midnight) */
  schedule: string;
  /** Enable/disable the scheduler */
  enabled: boolean;
  /** Default scope type for scheduled analysis */
  defaultScopeType: ScopeType;
  /** Default scope ID for scheduled analysis */
  defaultScopeId?: string;
  /** Lookback days for scheduled analysis */
  lookbackDays: number;
}

export interface LibrarianSchedulerStatus {
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
    stats?: AnalysisResult['stats'];
    error?: string;
  };
}

// =============================================================================
// SCHEDULER STATE
// =============================================================================

let scheduledTask: cron.ScheduledTask | null = null;
let currentConfig: LibrarianSchedulerConfig | null = null;
let librarianServiceRef: LibrarianService | null = null;
let lastRunResult: LibrarianSchedulerStatus['lastRun'] | undefined;

// =============================================================================
// SCHEDULER FUNCTIONS
// =============================================================================

/**
 * Start the librarian scheduler with the given configuration.
 */
export function startLibrarianScheduler(
  config: LibrarianSchedulerConfig,
  librarianService: LibrarianService
): boolean {
  // Stop any existing scheduler first
  if (scheduledTask) {
    stopLibrarianScheduler();
  }

  // Check if scheduler should run
  if (!config.enabled) {
    logger.info('Librarian scheduler disabled via configuration');
    return false;
  }

  if (!config.schedule || config.schedule.trim() === '') {
    logger.info('Librarian scheduler disabled: no schedule configured');
    return false;
  }

  // Validate cron expression
  if (!cron.validate(config.schedule)) {
    logger.error({ schedule: config.schedule }, 'Invalid cron expression for librarian scheduler');
    return false;
  }

  currentConfig = config;
  librarianServiceRef = librarianService;

  // Schedule the analysis task
  scheduledTask = cron.schedule(config.schedule, async () => {
    logger.info('Running scheduled librarian analysis');
    const startTime = Date.now();

    try {
      const request: AnalysisRequest = {
        scopeType: config.defaultScopeType,
        scopeId: config.defaultScopeId,
        lookbackDays: config.lookbackDays,
        initiatedBy: 'librarian-scheduler',
      };

      const result = await librarianService.analyze(request);

      lastRunResult = {
        completedAt: new Date().toISOString(),
        success: true,
        stats: result.stats,
      };

      logger.info(
        {
          runId: result.runId,
          stats: result.stats,
          durationMs: Date.now() - startTime,
        },
        'Scheduled librarian analysis completed successfully'
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
        'Scheduled librarian analysis failed'
      );
    }
  });

  logger.info(
    { schedule: config.schedule, scopeType: config.defaultScopeType },
    'Librarian scheduler started'
  );
  return true;
}

/**
 * Stop the librarian scheduler.
 */
export function stopLibrarianScheduler(): void {
  if (scheduledTask) {
    void scheduledTask.stop();
    scheduledTask = null;
    logger.info('Librarian scheduler stopped');
  }
  currentConfig = null;
  librarianServiceRef = null;
}

/**
 * Get the current scheduler status.
 */
export function getLibrarianSchedulerStatus(): LibrarianSchedulerStatus {
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
    // Use node-cron's internal scheduling to estimate next run
    // This is a simplified approximation
    const now = new Date();
    const parts = currentConfig.schedule.split(' ');

    // For simple cases, calculate next occurrence
    // This is a rough approximation - a full implementation would parse the cron expression
    if (parts.length >= 5) {
      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      // Handle daily at specific time
      if (
        minute &&
        hour &&
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
 * Trigger an immediate analysis run (outside of schedule).
 */
export async function triggerImmediateAnalysis(
  request?: Partial<AnalysisRequest>
): Promise<AnalysisResult | null> {
  if (!librarianServiceRef) {
    logger.warn('Cannot trigger analysis: librarian service not available');
    return null;
  }

  if (!currentConfig) {
    logger.warn('Cannot trigger analysis: scheduler not configured');
    return null;
  }

  const fullRequest: AnalysisRequest = {
    scopeType: request?.scopeType ?? currentConfig.defaultScopeType,
    scopeId: request?.scopeId ?? currentConfig.defaultScopeId,
    lookbackDays: request?.lookbackDays ?? currentConfig.lookbackDays,
    initiatedBy: request?.initiatedBy ?? 'manual-trigger',
    dryRun: request?.dryRun,
    runId: request?.runId,
  };

  return librarianServiceRef.analyze(fullRequest);
}

/**
 * Check if the scheduler is running.
 */
export function isLibrarianSchedulerRunning(): boolean {
  return scheduledTask !== null;
}
