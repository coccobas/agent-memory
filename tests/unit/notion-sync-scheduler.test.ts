import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node-cron', () => {
  const mockScheduledTask = {
    stop: vi.fn(),
  };

  return {
    default: {
      validate: vi.fn(),
      schedule: vi.fn(() => mockScheduledTask),
    },
  };
});

vi.mock('../../src/services/notion-sync/config.js', () => ({
  loadNotionSyncConfig: vi.fn(),
}));

vi.mock('../../src/services/notion-sync/client.js', () => ({
  createNotionClient: vi.fn(),
}));

vi.mock('../../src/services/notion-sync/sync.service.js', () => ({
  createNotionSyncService: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  startNotionSyncScheduler,
  stopNotionSyncScheduler,
  getNotionSyncSchedulerStatus,
  isNotionSyncSchedulerRunning,
  type NotionSyncSchedulerConfig,
} from '../../src/services/notion-sync/scheduler.service.js';
import cron from 'node-cron';
import * as configModule from '../../src/services/notion-sync/config.js';
import * as clientModule from '../../src/services/notion-sync/client.js';
import * as syncModule from '../../src/services/notion-sync/sync.service.js';
import type { ITaskRepository } from '../../src/db/repositories/tasks.js';

const mockCronValidate = vi.mocked(cron.validate);
const mockCronSchedule = vi.mocked(cron.schedule);
const mockLoadNotionSyncConfig = vi.mocked(configModule.loadNotionSyncConfig);
const mockCreateNotionClient = vi.mocked(clientModule.createNotionClient);
const mockCreateNotionSyncService = vi.mocked(syncModule.createNotionSyncService);

const mockTaskRepo: ITaskRepository = {
  create: vi.fn(),
  getById: vi.fn(),
  getByIds: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  deactivate: vi.fn(),
  reactivate: vi.fn(),
  delete: vi.fn(),
  getHistory: vi.fn(),
  getVersion: vi.fn(),
  updateStatus: vi.fn(),
  listByStatus: vi.fn(),
  listBlocked: vi.fn(),
  getSubtasks: vi.fn(),
  addBlocker: vi.fn(),
  removeBlocker: vi.fn(),
};

describe('Notion Sync Scheduler Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopNotionSyncScheduler();
  });

  afterEach(() => {
    stopNotionSyncScheduler();
  });

  describe('startNotionSyncScheduler', () => {
    describe('Configuration validation', () => {
      it('should return false when scheduler is disabled via config', () => {
        const config: NotionSyncSchedulerConfig = {
          schedule: '0 5 * * *',
          enabled: false,
        };

        const result = startNotionSyncScheduler(config, mockTaskRepo);

        expect(result).toBe(false);
        expect(mockCronSchedule).not.toHaveBeenCalled();
      });

      it('should return false when no schedule is configured', () => {
        const config: NotionSyncSchedulerConfig = {
          schedule: '',
          enabled: true,
        };

        const result = startNotionSyncScheduler(config, mockTaskRepo);

        expect(result).toBe(false);
        expect(mockCronSchedule).not.toHaveBeenCalled();
      });

      it('should return false when schedule is only whitespace', () => {
        const config: NotionSyncSchedulerConfig = {
          schedule: '   ',
          enabled: true,
        };

        const result = startNotionSyncScheduler(config, mockTaskRepo);

        expect(result).toBe(false);
        expect(mockCronSchedule).not.toHaveBeenCalled();
      });

      it('should return false for invalid cron expression', () => {
        mockCronValidate.mockReturnValue(false);

        const config: NotionSyncSchedulerConfig = {
          schedule: 'invalid-cron',
          enabled: true,
        };

        const result = startNotionSyncScheduler(config, mockTaskRepo);

        expect(result).toBe(false);
        expect(mockCronValidate).toHaveBeenCalledWith('invalid-cron');
        expect(mockCronSchedule).not.toHaveBeenCalled();
      });
    });

    describe('Scheduler startup', () => {
      it('should start scheduler with valid config', () => {
        mockCronValidate.mockReturnValue(true);

        const config: NotionSyncSchedulerConfig = {
          schedule: '0 5 * * *',
          enabled: true,
        };

        const result = startNotionSyncScheduler(config, mockTaskRepo);

        expect(result).toBe(true);
        expect(mockCronValidate).toHaveBeenCalledWith('0 5 * * *');
        expect(mockCronSchedule).toHaveBeenCalledWith('0 5 * * *', expect.any(Function));
      });

      it('should stop existing scheduler before starting new one', () => {
        mockCronValidate.mockReturnValue(true);

        const config1: NotionSyncSchedulerConfig = {
          schedule: '0 5 * * *',
          enabled: true,
        };

        startNotionSyncScheduler(config1, mockTaskRepo);

        const config2: NotionSyncSchedulerConfig = {
          schedule: '0 6 * * *',
          enabled: true,
        };

        startNotionSyncScheduler(config2, mockTaskRepo);

        expect(mockCronSchedule).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('stopNotionSyncScheduler', () => {
    it('should stop the scheduler when running', () => {
      mockCronValidate.mockReturnValue(true);

      const config: NotionSyncSchedulerConfig = {
        schedule: '0 5 * * *',
        enabled: true,
      };

      startNotionSyncScheduler(config, mockTaskRepo);
      expect(isNotionSyncSchedulerRunning()).toBe(true);

      stopNotionSyncScheduler();
      expect(isNotionSyncSchedulerRunning()).toBe(false);
    });

    it('should be safe to call when not running', () => {
      expect(() => stopNotionSyncScheduler()).not.toThrow();
    });
  });

  describe('getNotionSyncSchedulerStatus', () => {
    it('should return initial status when not started', () => {
      const status = getNotionSyncSchedulerStatus();

      expect(status.running).toBe(false);
      expect(status.schedule).toBeNull();
      expect(status.lastRun).toBeNull();
      expect(status.lastRunSuccess).toBeNull();
      expect(status.lastRunError).toBeNull();
    });

    it('should return running status after start', () => {
      mockCronValidate.mockReturnValue(true);

      const config: NotionSyncSchedulerConfig = {
        schedule: '0 5 * * *',
        enabled: true,
      };

      startNotionSyncScheduler(config, mockTaskRepo);

      const status = getNotionSyncSchedulerStatus();

      expect(status.running).toBe(true);
      expect(status.schedule).toBe('0 5 * * *');
    });

    it('should return stopped status after stop', () => {
      mockCronValidate.mockReturnValue(true);

      const config: NotionSyncSchedulerConfig = {
        schedule: '0 5 * * *',
        enabled: true,
      };

      startNotionSyncScheduler(config, mockTaskRepo);
      stopNotionSyncScheduler();

      const status = getNotionSyncSchedulerStatus();

      expect(status.running).toBe(false);
      expect(status.schedule).toBeNull();
    });
  });

  describe('isNotionSyncSchedulerRunning', () => {
    it('should return false when not started', () => {
      expect(isNotionSyncSchedulerRunning()).toBe(false);
    });

    it('should return true when running', () => {
      mockCronValidate.mockReturnValue(true);

      const config: NotionSyncSchedulerConfig = {
        schedule: '0 5 * * *',
        enabled: true,
      };

      startNotionSyncScheduler(config, mockTaskRepo);

      expect(isNotionSyncSchedulerRunning()).toBe(true);
    });

    it('should return false after stop', () => {
      mockCronValidate.mockReturnValue(true);

      const config: NotionSyncSchedulerConfig = {
        schedule: '0 5 * * *',
        enabled: true,
      };

      startNotionSyncScheduler(config, mockTaskRepo);
      stopNotionSyncScheduler();

      expect(isNotionSyncSchedulerRunning()).toBe(false);
    });
  });

  describe('Scheduled sync execution', () => {
    it('should execute sync when cron triggers', async () => {
      mockCronValidate.mockReturnValue(true);

      const mockSyncDatabase = vi.fn().mockResolvedValue({
        syncedCount: 5,
        createdCount: 3,
        updatedCount: 2,
        deletedCount: 0,
      });

      mockLoadNotionSyncConfig.mockReturnValue({
        databases: [
          {
            notionDatabaseId: 'db-123',
            projectScopeId: 'proj-123',
            syncEnabled: true,
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
        ],
      });

      mockCreateNotionClient.mockReturnValue(
        {} as ReturnType<typeof clientModule.createNotionClient>
      );
      mockCreateNotionSyncService.mockReturnValue({
        syncDatabase: mockSyncDatabase,
        findTaskByNotionPageId: vi.fn(),
        getTrackedNotionPageIds: vi.fn(),
      });

      const config: NotionSyncSchedulerConfig = {
        schedule: '0 5 * * *',
        enabled: true,
        configPath: './test-config.json',
      };

      startNotionSyncScheduler(config, mockTaskRepo);

      const scheduledCallback = mockCronSchedule.mock.calls[0][1] as () => Promise<void>;
      await scheduledCallback();

      expect(mockLoadNotionSyncConfig).toHaveBeenCalledWith('./test-config.json');
      expect(mockCreateNotionClient).toHaveBeenCalled();
      expect(mockCreateNotionSyncService).toHaveBeenCalled();
      expect(mockSyncDatabase).toHaveBeenCalled();
    });

    it('should skip disabled databases', async () => {
      mockCronValidate.mockReturnValue(true);

      const mockSyncDatabase = vi.fn().mockResolvedValue({
        syncedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        deletedCount: 0,
      });

      mockLoadNotionSyncConfig.mockReturnValue({
        databases: [
          {
            notionDatabaseId: 'db-123',
            projectScopeId: 'proj-123',
            syncEnabled: false,
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
        ],
      });

      mockCreateNotionClient.mockReturnValue(
        {} as ReturnType<typeof clientModule.createNotionClient>
      );
      mockCreateNotionSyncService.mockReturnValue({
        syncDatabase: mockSyncDatabase,
        findTaskByNotionPageId: vi.fn(),
        getTrackedNotionPageIds: vi.fn(),
      });

      const config: NotionSyncSchedulerConfig = {
        schedule: '0 5 * * *',
        enabled: true,
      };

      startNotionSyncScheduler(config, mockTaskRepo);

      const scheduledCallback = mockCronSchedule.mock.calls[0][1] as () => Promise<void>;
      await scheduledCallback();

      expect(mockSyncDatabase).not.toHaveBeenCalled();
    });

    it('should handle sync errors gracefully', async () => {
      mockCronValidate.mockReturnValue(true);

      mockLoadNotionSyncConfig.mockImplementation(() => {
        throw new Error('Config file not found');
      });

      const config: NotionSyncSchedulerConfig = {
        schedule: '0 5 * * *',
        enabled: true,
      };

      startNotionSyncScheduler(config, mockTaskRepo);

      const scheduledCallback = mockCronSchedule.mock.calls[0][1] as () => Promise<void>;
      await scheduledCallback();

      const status = getNotionSyncSchedulerStatus();
      expect(status.lastRunSuccess).toBe(false);
      expect(status.lastRunError).toBe('Config file not found');
    });
  });
});
