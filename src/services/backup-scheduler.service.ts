/**
 * Backup Scheduler Service
 *
 * Provides automated backup scheduling using node-cron.
 * Supports cron expressions for flexible scheduling and automatic cleanup of old backups.
 *
 * Environment Variables:
 *   AGENT_MEMORY_BACKUP_SCHEDULE - Cron expression (e.g., "0 0 * * *" for daily at midnight)
 *   AGENT_MEMORY_BACKUP_RETENTION - Number of backups to keep (default: 5)
 *   AGENT_MEMORY_BACKUP_ENABLED - Enable/disable scheduler (default: true if schedule is set)
 */

import cron from 'node-cron';
import { createDatabaseBackup, cleanupBackups } from './backup.service.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('backup-scheduler');

export interface BackupSchedulerConfig {
  /** Cron expression for scheduled backups (e.g., "0 0 * * *" for daily at midnight) */
  schedule: string;
  /** Number of backups to keep */
  retentionCount: number;
  /** Enable/disable the scheduler */
  enabled: boolean;
}

export interface BackupSchedulerStatus {
  /** Whether the scheduler is currently running */
  running: boolean;
  /** The cron schedule expression (null if not running) */
  schedule: string | null;
  /** Number of backups to retain */
  retentionCount: number;
}

let scheduledTask: cron.ScheduledTask | null = null;
let currentConfig: BackupSchedulerConfig | null = null;

/**
 * Start the backup scheduler with the given configuration.
 *
 * @param config - Scheduler configuration
 * @returns true if scheduler started successfully, false otherwise
 */
export function startBackupScheduler(config: BackupSchedulerConfig): boolean {
  // Stop any existing scheduler first
  if (scheduledTask) {
    stopBackupScheduler();
  }

  // Check if scheduler should run
  if (!config.enabled) {
    logger.info('Backup scheduler disabled via configuration');
    return false;
  }

  if (!config.schedule || config.schedule.trim() === '') {
    logger.info('Backup scheduler disabled: no schedule configured');
    return false;
  }

  // Validate cron expression
  if (!cron.validate(config.schedule)) {
    logger.error({ schedule: config.schedule }, 'Invalid cron expression for backup scheduler');
    return false;
  }

  currentConfig = config;

  // Schedule the backup task
  scheduledTask = cron.schedule(config.schedule, async () => {
    logger.info('Running scheduled backup');
    const startTime = Date.now();

    try {
      // Create backup
      const result = await createDatabaseBackup('scheduled');

      if (result.success) {
        logger.info(
          {
            path: result.backupPath,
            durationMs: Date.now() - startTime,
          },
          'Scheduled backup created successfully'
        );

        // Cleanup old backups
        try {
          const cleanup = await cleanupBackups(config.retentionCount);
          if (cleanup.deleted.length > 0) {
            logger.info(
              {
                deleted: cleanup.deleted.length,
                kept: cleanup.kept.length,
              },
              'Old backups cleaned up'
            );
          }
        } catch (cleanupError) {
          logger.warn(
            { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) },
            'Backup cleanup failed (backup was created successfully)'
          );
        }
      } else {
        logger.error(
          {
            message: result.message,
            durationMs: Date.now() - startTime,
          },
          'Scheduled backup failed'
        );
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
        },
        'Scheduled backup error'
      );
    }
  });

  logger.info(
    {
      schedule: config.schedule,
      retention: config.retentionCount,
    },
    'Backup scheduler started'
  );

  return true;
}

/**
 * Stop the backup scheduler if running.
 */
export function stopBackupScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    currentConfig = null;
    logger.info('Backup scheduler stopped');
  }
}

/**
 * Get the current status of the backup scheduler.
 *
 * @returns Current scheduler status
 */
export function getBackupSchedulerStatus(): BackupSchedulerStatus {
  return {
    running: scheduledTask !== null,
    schedule: currentConfig?.schedule ?? null,
    retentionCount: currentConfig?.retentionCount ?? 0,
  };
}

// Common cron expressions for reference:
// "0 * * * *"     - Every hour (at minute 0)
// "0 0 * * *"     - Daily at midnight
// "0 0 * * 0"     - Weekly on Sunday at midnight
// "0 0 1 * *"     - Monthly on the 1st at midnight
// "0 0/6 * * *"   - Every 6 hours
// "30 2 * * *"    - Daily at 2:30 AM
