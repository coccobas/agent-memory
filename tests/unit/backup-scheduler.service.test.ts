/**
 * Unit tests for backup scheduler service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-cron with factory function
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

// Mock backup service functions
vi.mock('../../src/services/backup.service.js', () => ({
  createDatabaseBackup: vi.fn(),
  cleanupBackups: vi.fn(),
}));

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  startBackupScheduler,
  stopBackupScheduler,
  getBackupSchedulerStatus,
  type BackupSchedulerConfig,
} from '../../src/services/backup-scheduler.service.js';
import cron from 'node-cron';
import * as backupService from '../../src/services/backup.service.js';

// Get references to mocked functions
const mockCronValidate = vi.mocked(cron.validate);
const mockCronSchedule = vi.mocked(cron.schedule);
const mockCreateDatabaseBackup = vi.mocked(backupService.createDatabaseBackup);
const mockCleanupBackups = vi.mocked(backupService.cleanupBackups);

describe('Backup Scheduler Service', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Stop any existing scheduler
    stopBackupScheduler();
  });

  afterEach(() => {
    // Clean up after each test
    stopBackupScheduler();
  });

  describe('startBackupScheduler', () => {
    describe('Configuration validation', () => {
      it('should return false when scheduler is disabled via config', () => {
        const config: BackupSchedulerConfig = {
          schedule: '0 0 * * *',
          retentionCount: 5,
          enabled: false,
        };

        const result = startBackupScheduler(config);

        expect(result).toBe(false);
        expect(mockCronSchedule).not.toHaveBeenCalled();
      });

      it('should return false when no schedule is configured', () => {
        const config: BackupSchedulerConfig = {
          schedule: '',
          retentionCount: 5,
          enabled: true,
        };

        const result = startBackupScheduler(config);

        expect(result).toBe(false);
        expect(mockCronSchedule).not.toHaveBeenCalled();
      });

      it('should return false when schedule is only whitespace', () => {
        const config: BackupSchedulerConfig = {
          schedule: '   ',
          retentionCount: 5,
          enabled: true,
        };

        const result = startBackupScheduler(config);

        expect(result).toBe(false);
        expect(mockCronSchedule).not.toHaveBeenCalled();
      });

      it('should return false for invalid cron expression', () => {
        mockCronValidate.mockReturnValue(false);

        const config: BackupSchedulerConfig = {
          schedule: 'invalid-cron',
          retentionCount: 5,
          enabled: true,
        };

        const result = startBackupScheduler(config);

        expect(result).toBe(false);
        expect(mockCronValidate).toHaveBeenCalledWith('invalid-cron');
        expect(mockCronSchedule).not.toHaveBeenCalled();
      });
    });

    describe('Scheduler startup', () => {
      it('should start scheduler with valid config', () => {
        mockCronValidate.mockReturnValue(true);

        const config: BackupSchedulerConfig = {
          schedule: '0 0 * * *',
          retentionCount: 5,
          enabled: true,
        };

        const result = startBackupScheduler(config);

        expect(result).toBe(true);
        expect(mockCronValidate).toHaveBeenCalledWith('0 0 * * *');
        expect(mockCronSchedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function));
      });

      it('should stop existing scheduler before starting new one', () => {
        mockCronValidate.mockReturnValue(true);

        const config1: BackupSchedulerConfig = {
          schedule: '0 0 * * *',
          retentionCount: 5,
          enabled: true,
        };

        startBackupScheduler(config1);
        const firstTask = mockCronSchedule.mock.results[0]?.value;

        const config2: BackupSchedulerConfig = {
          schedule: '0 * * * *',
          retentionCount: 10,
          enabled: true,
        };

        startBackupScheduler(config2);

        // Verify the first task was stopped
        expect(firstTask.stop).toHaveBeenCalledTimes(1);
      });

      it('should store current config', () => {
        mockCronValidate.mockReturnValue(true);

        const config: BackupSchedulerConfig = {
          schedule: '0 0 * * *',
          retentionCount: 7,
          enabled: true,
        };

        startBackupScheduler(config);

        const status = getBackupSchedulerStatus();
        expect(status.running).toBe(true);
        expect(status.schedule).toBe('0 0 * * *');
        expect(status.retentionCount).toBe(7);
      });

      it('should accept various retention counts', () => {
        mockCronValidate.mockReturnValue(true);

        const retentionCounts = [1, 5, 10, 20, 100];

        retentionCounts.forEach((retentionCount) => {
          const config: BackupSchedulerConfig = {
            schedule: '0 0 * * *',
            retentionCount,
            enabled: true,
          };

          startBackupScheduler(config);
          const status = getBackupSchedulerStatus();
          expect(status.retentionCount).toBe(retentionCount);

          stopBackupScheduler();
        });
      });
    });

    describe('Cron validation', () => {
      const validCronExpressions = [
        '0 0 * * *', // Daily at midnight
        '0 * * * *', // Every hour
        '0 0 * * 0', // Weekly on Sunday
        '0 0 1 * *', // Monthly on the 1st
        '0 0/6 * * *', // Every 6 hours
        '30 2 * * *', // Daily at 2:30 AM
        '*/5 * * * *', // Every 5 minutes
        '0 0 1 1 *', // Yearly on Jan 1st
      ];

      validCronExpressions.forEach((schedule) => {
        it(`should accept valid cron expression: ${schedule}`, () => {
          mockCronValidate.mockReturnValue(true);

          const config: BackupSchedulerConfig = {
            schedule,
            retentionCount: 5,
            enabled: true,
          };

          const result = startBackupScheduler(config);

          expect(result).toBe(true);
          expect(mockCronValidate).toHaveBeenCalledWith(schedule);
        });
      });

      const invalidCronExpressions = [
        'invalid',
        '* * * *', // Missing field
        '60 * * * *', // Invalid minute
        '0 24 * * *', // Invalid hour
        '0 0 32 * *', // Invalid day
        '0 0 * 13 *', // Invalid month
        '0 0 * * 7', // Invalid day of week (depending on implementation)
      ];

      invalidCronExpressions.forEach((schedule) => {
        it(`should reject invalid cron expression: ${schedule}`, () => {
          mockCronValidate.mockReturnValue(false);

          const config: BackupSchedulerConfig = {
            schedule,
            retentionCount: 5,
            enabled: true,
          };

          const result = startBackupScheduler(config);

          expect(result).toBe(false);
          expect(mockCronSchedule).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('stopBackupScheduler', () => {
    it('should stop running scheduler', () => {
      mockCronValidate.mockReturnValue(true);

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);
      expect(getBackupSchedulerStatus().running).toBe(true);

      const scheduledTask = mockCronSchedule.mock.results[0]?.value;
      stopBackupScheduler();

      expect(scheduledTask.stop).toHaveBeenCalledTimes(1);
      expect(getBackupSchedulerStatus().running).toBe(false);
    });

    it('should clear current config', () => {
      mockCronValidate.mockReturnValue(true);

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);
      stopBackupScheduler();

      const status = getBackupSchedulerStatus();
      expect(status.running).toBe(false);
      expect(status.schedule).toBe(null);
      expect(status.retentionCount).toBe(0);
    });

    it('should be idempotent - safe to call multiple times', () => {
      mockCronValidate.mockReturnValue(true);

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);
      const scheduledTask = mockCronSchedule.mock.results[0]?.value;

      stopBackupScheduler();
      stopBackupScheduler();
      stopBackupScheduler();

      expect(scheduledTask.stop).toHaveBeenCalledTimes(1);
      expect(getBackupSchedulerStatus().running).toBe(false);
    });

    it('should be safe to call when no scheduler is running', () => {
      expect(() => stopBackupScheduler()).not.toThrow();
      expect(getBackupSchedulerStatus().running).toBe(false);
    });
  });

  describe('getBackupSchedulerStatus', () => {
    it('should return running: false when not started', () => {
      const status = getBackupSchedulerStatus();

      expect(status.running).toBe(false);
      expect(status.schedule).toBe(null);
      expect(status.retentionCount).toBe(0);
    });

    it('should return running: true when started', () => {
      mockCronValidate.mockReturnValue(true);

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);

      const status = getBackupSchedulerStatus();
      expect(status.running).toBe(true);
    });

    it('should return correct schedule and retentionCount', () => {
      mockCronValidate.mockReturnValue(true);

      const config: BackupSchedulerConfig = {
        schedule: '30 2 * * *',
        retentionCount: 10,
        enabled: true,
      };

      startBackupScheduler(config);

      const status = getBackupSchedulerStatus();
      expect(status.schedule).toBe('30 2 * * *');
      expect(status.retentionCount).toBe(10);
    });

    it('should return null schedule when not running', () => {
      mockCronValidate.mockReturnValue(true);

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);
      stopBackupScheduler();

      const status = getBackupSchedulerStatus();
      expect(status.schedule).toBe(null);
    });

    it('should return updated status after config change', () => {
      mockCronValidate.mockReturnValue(true);

      const config1: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config1);
      let status = getBackupSchedulerStatus();
      expect(status.schedule).toBe('0 0 * * *');
      expect(status.retentionCount).toBe(5);

      const config2: BackupSchedulerConfig = {
        schedule: '0 * * * *',
        retentionCount: 15,
        enabled: true,
      };

      startBackupScheduler(config2);
      status = getBackupSchedulerStatus();
      expect(status.schedule).toBe('0 * * * *');
      expect(status.retentionCount).toBe(15);
    });
  });

  describe('Scheduled backup execution', () => {
    it('should create backup when scheduled task runs', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockResolvedValue({
        success: true,
        backupPath: '/path/to/backup.db',
        message: 'Backup created',
      });

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);

      // Get the scheduled callback function
      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];
      expect(scheduledCallback).toBeDefined();

      // Execute the scheduled task
      await scheduledCallback?.();

      expect(mockCreateDatabaseBackup).toHaveBeenCalledWith('scheduled');
    });

    it('should cleanup old backups after successful backup', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockResolvedValue({
        success: true,
        backupPath: '/path/to/backup.db',
        message: 'Backup created',
      });
      mockCleanupBackups.mockResolvedValue({
        deleted: ['old1.db', 'old2.db'],
        kept: ['new1.db', 'new2.db'],
      });

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 7,
        enabled: true,
      };

      startBackupScheduler(config);

      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];
      await scheduledCallback?.();

      expect(mockCleanupBackups).toHaveBeenCalledWith(7);
    });

    it('should not cleanup if backup fails', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockResolvedValue({
        success: false,
        message: 'Backup failed',
      });

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);

      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];
      await scheduledCallback?.();

      expect(mockCleanupBackups).not.toHaveBeenCalled();
    });

    it('should handle backup failures gracefully', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockRejectedValue(new Error('Database error'));

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);

      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];

      // Should not throw
      await expect(scheduledCallback?.()).resolves.toBeUndefined();

      expect(mockCreateDatabaseBackup).toHaveBeenCalled();
      expect(mockCleanupBackups).not.toHaveBeenCalled();
    });

    it('should handle cleanup failures gracefully', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockResolvedValue({
        success: true,
        backupPath: '/path/to/backup.db',
        message: 'Backup created',
      });
      mockCleanupBackups.mockRejectedValue(new Error('Cleanup error'));

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);

      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];

      // Should not throw even if cleanup fails
      await expect(scheduledCallback?.()).resolves.toBeUndefined();

      expect(mockCreateDatabaseBackup).toHaveBeenCalled();
      expect(mockCleanupBackups).toHaveBeenCalled();
    });

    it('should use correct retention count from config', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockResolvedValue({
        success: true,
        backupPath: '/path/to/backup.db',
        message: 'Backup created',
      });
      mockCleanupBackups.mockResolvedValue({
        deleted: [],
        kept: [],
      });

      const retentionCounts = [1, 5, 10, 20];

      for (const retentionCount of retentionCounts) {
        const config: BackupSchedulerConfig = {
          schedule: '0 0 * * *',
          retentionCount,
          enabled: true,
        };

        startBackupScheduler(config);

        const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];
        await scheduledCallback?.();

        expect(mockCleanupBackups).toHaveBeenCalledWith(retentionCount);

        stopBackupScheduler();
        vi.clearAllMocks();
        mockCronValidate.mockReturnValue(true);
      }
    });

    it('should handle successful cleanup with deletions', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockResolvedValue({
        success: true,
        backupPath: '/path/to/backup.db',
        message: 'Backup created',
      });
      mockCleanupBackups.mockResolvedValue({
        deleted: ['old-backup-1.db', 'old-backup-2.db', 'old-backup-3.db'],
        kept: ['new-backup-1.db', 'new-backup-2.db'],
      });

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 2,
        enabled: true,
      };

      startBackupScheduler(config);

      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];
      await scheduledCallback?.();

      expect(mockCleanupBackups).toHaveBeenCalledWith(2);
      expect(mockCreateDatabaseBackup).toHaveBeenCalledWith('scheduled');
    });

    it('should handle cleanup when no old backups exist', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockResolvedValue({
        success: true,
        backupPath: '/path/to/backup.db',
        message: 'Backup created',
      });
      mockCleanupBackups.mockResolvedValue({
        deleted: [],
        kept: ['backup-1.db'],
      });

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);

      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];
      await scheduledCallback?.();

      expect(mockCleanupBackups).toHaveBeenCalled();
      expect(mockCreateDatabaseBackup).toHaveBeenCalled();
    });
  });

  describe('Edge cases and error scenarios', () => {
    it('should handle starting with zero retention count', () => {
      mockCronValidate.mockReturnValue(true);

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 0,
        enabled: true,
      };

      const result = startBackupScheduler(config);

      expect(result).toBe(true);
      const status = getBackupSchedulerStatus();
      expect(status.retentionCount).toBe(0);
    });

    it('should handle negative retention count', () => {
      mockCronValidate.mockReturnValue(true);

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: -1,
        enabled: true,
      };

      const result = startBackupScheduler(config);

      expect(result).toBe(true);
      const status = getBackupSchedulerStatus();
      expect(status.retentionCount).toBe(-1);
    });

    it('should handle rapid start/stop cycles', () => {
      mockCronValidate.mockReturnValue(true);

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      for (let i = 0; i < 10; i++) {
        startBackupScheduler(config);
        expect(getBackupSchedulerStatus().running).toBe(true);
        stopBackupScheduler();
        expect(getBackupSchedulerStatus().running).toBe(false);
      }
    });

    it('should handle multiple sequential starts', () => {
      mockCronValidate.mockReturnValue(true);

      const config1: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      const config2: BackupSchedulerConfig = {
        schedule: '0 * * * *',
        retentionCount: 10,
        enabled: true,
      };

      const config3: BackupSchedulerConfig = {
        schedule: '*/5 * * * *',
        retentionCount: 15,
        enabled: true,
      };

      startBackupScheduler(config1);
      startBackupScheduler(config2);
      startBackupScheduler(config3);

      const status = getBackupSchedulerStatus();
      expect(status.schedule).toBe('*/5 * * * *');
      expect(status.retentionCount).toBe(15);
    });

    it('should handle backup creation throwing non-Error exception', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockRejectedValue('string error');

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);

      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];

      await expect(scheduledCallback?.()).resolves.toBeUndefined();
    });

    it('should handle cleanup throwing non-Error exception', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockResolvedValue({
        success: true,
        backupPath: '/path/to/backup.db',
        message: 'Backup created',
      });
      mockCleanupBackups.mockRejectedValue('cleanup string error');

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      startBackupScheduler(config);

      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];

      await expect(scheduledCallback?.()).resolves.toBeUndefined();
    });
  });

  describe('Integration scenarios', () => {
    it('should support typical daily backup workflow', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockResolvedValue({
        success: true,
        backupPath: '/backups/memory-backup-2024-12-25.db',
        message: 'Backup created',
        timestamp: '2024-12-25T00:00:00.000Z',
      });
      mockCleanupBackups.mockResolvedValue({
        deleted: ['memory-backup-2024-12-18.db'],
        kept: ['memory-backup-2024-12-19.db', 'memory-backup-2024-12-25.db'],
      });

      const config: BackupSchedulerConfig = {
        schedule: '0 0 * * *', // Daily at midnight
        retentionCount: 7, // Keep 7 days
        enabled: true,
      };

      const started = startBackupScheduler(config);
      expect(started).toBe(true);

      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];
      await scheduledCallback?.();

      expect(mockCreateDatabaseBackup).toHaveBeenCalledWith('scheduled');
      expect(mockCleanupBackups).toHaveBeenCalledWith(7);

      stopBackupScheduler();
      expect(getBackupSchedulerStatus().running).toBe(false);
    });

    it('should support hourly backup workflow', async () => {
      mockCronValidate.mockReturnValue(true);
      mockCreateDatabaseBackup.mockResolvedValue({
        success: true,
        backupPath: '/backups/memory-backup-hourly.db',
        message: 'Backup created',
      });
      mockCleanupBackups.mockResolvedValue({
        deleted: [],
        kept: ['backup1.db', 'backup2.db', 'backup3.db'],
      });

      const config: BackupSchedulerConfig = {
        schedule: '0 * * * *', // Every hour
        retentionCount: 24, // Keep 24 hours
        enabled: true,
      };

      startBackupScheduler(config);

      const scheduledCallback = mockCronSchedule.mock.calls[0]?.[1];
      await scheduledCallback?.();

      expect(mockCleanupBackups).toHaveBeenCalledWith(24);
    });

    it('should handle disabled scheduler that is later enabled', () => {
      mockCronValidate.mockReturnValue(true);

      const disabledConfig: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: false,
      };

      let result = startBackupScheduler(disabledConfig);
      expect(result).toBe(false);
      expect(getBackupSchedulerStatus().running).toBe(false);

      const enabledConfig: BackupSchedulerConfig = {
        schedule: '0 0 * * *',
        retentionCount: 5,
        enabled: true,
      };

      result = startBackupScheduler(enabledConfig);
      expect(result).toBe(true);
      expect(getBackupSchedulerStatus().running).toBe(true);
    });
  });
});
