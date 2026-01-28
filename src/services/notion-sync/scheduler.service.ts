import cron from 'node-cron';
import { createComponentLogger } from '../../utils/logger.js';
import { loadNotionSyncConfig } from './config.js';
import { createNotionSyncService } from './sync.service.js';
import { createNotionClient } from './client.js';
import type { ITaskRepository } from '../../db/repositories/tasks.js';

const logger = createComponentLogger('notion-sync-scheduler');

export interface NotionSyncSchedulerConfig {
  schedule: string;
  enabled: boolean;
  configPath?: string;
}

export interface NotionSyncSchedulerStatus {
  running: boolean;
  schedule: string | null;
  nextRun: Date | null;
  lastRun: Date | null;
  lastRunSuccess: boolean | null;
  lastRunError: string | null;
}

let scheduledTask: cron.ScheduledTask | null = null;
let syncInProgress = false;

const status: NotionSyncSchedulerStatus = {
  running: false,
  schedule: null,
  nextRun: null,
  lastRun: null,
  lastRunSuccess: null,
  lastRunError: null,
};

export function startNotionSyncScheduler(
  config: NotionSyncSchedulerConfig,
  taskRepo: ITaskRepository
): boolean {
  if (scheduledTask) {
    stopNotionSyncScheduler();
  }

  if (!config.enabled) {
    logger.info('Notion sync scheduler disabled via configuration');
    return false;
  }

  if (!config.schedule || config.schedule.trim() === '') {
    logger.info('Notion sync scheduler disabled: no schedule configured');
    return false;
  }

  if (!cron.validate(config.schedule)) {
    logger.error(
      { schedule: config.schedule },
      'Invalid cron expression for Notion sync scheduler'
    );
    return false;
  }

  try {
    scheduledTask = cron.schedule(config.schedule, async () => {
      if (syncInProgress) {
        logger.warn('Skipping scheduled sync: previous sync still in progress');
        return;
      }

      logger.info('Running scheduled Notion sync');
      syncInProgress = true;
      status.lastRun = new Date();
      const startTime = Date.now();

      try {
        const syncConfig = loadNotionSyncConfig(config.configPath);
        const client = createNotionClient();
        const syncService = createNotionSyncService({ notionClient: client, taskRepo });

        for (const dbConfig of syncConfig.databases) {
          if (!dbConfig.syncEnabled) continue;

          const result = await syncService.syncDatabase(dbConfig);
          logger.info(
            {
              databaseId: dbConfig.notionDatabaseId,
              synced: result.syncedCount,
              created: result.createdCount,
              updated: result.updatedCount,
              durationMs: Date.now() - startTime,
            },
            'Database sync completed'
          );
        }

        status.lastRunSuccess = true;
        status.lastRunError = null;
      } catch (error) {
        status.lastRunSuccess = false;
        status.lastRunError = error instanceof Error ? error.message : String(error);
        logger.error(
          {
            error: status.lastRunError,
            durationMs: Date.now() - startTime,
          },
          'Scheduled Notion sync failed'
        );
      } finally {
        syncInProgress = false;
      }
    });
  } catch (scheduleError) {
    logger.error(
      {
        schedule: config.schedule,
        error: scheduleError instanceof Error ? scheduleError.message : String(scheduleError),
      },
      'Failed to schedule Notion sync task'
    );
    return false;
  }

  status.running = true;
  status.schedule = config.schedule;

  logger.info({ schedule: config.schedule }, 'Notion sync scheduler started');

  return true;
}

export function stopNotionSyncScheduler(): void {
  if (scheduledTask) {
    void scheduledTask.stop();
    scheduledTask = null;
    status.running = false;
    status.schedule = null;
    status.nextRun = null;
    logger.info('Notion sync scheduler stopped');
  }
}

export function getNotionSyncSchedulerStatus(): NotionSyncSchedulerStatus {
  return { ...status };
}

export function isNotionSyncSchedulerRunning(): boolean {
  return status.running;
}
