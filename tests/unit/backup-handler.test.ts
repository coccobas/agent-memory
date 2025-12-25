import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { backupHandlers } from '../../src/mcp/handlers/backup.handler.js';
import * as backupService from '../../src/services/backup.service.js';
import * as adminUtil from '../../src/utils/admin.js';

vi.mock('../../src/services/backup.service.js');
vi.mock('../../src/utils/admin.js');
vi.mock('../../src/config/index.js', () => ({
  config: {
    paths: {
      backup: '/test/backup/path',
    },
  },
}));

describe('Backup Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminUtil.requireAdminKey).mockImplementation(() => {});
  });

  describe('create', () => {
    it('should create a backup', async () => {
      vi.mocked(backupService.createDatabaseBackup).mockResolvedValue({
        success: true,
        message: 'Backup created',
        backupPath: '/test/backup/file.db',
        timestamp: '2024-01-01T00:00:00Z',
      });

      const result = await backupHandlers.create({ admin_key: 'key' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Backup created');
      expect(result.backupPath).toBe('/test/backup/file.db');
      expect(result.backupDirectory).toBe('/test/backup/path');
    });

    it('should pass custom name to backup service', async () => {
      vi.mocked(backupService.createDatabaseBackup).mockResolvedValue({
        success: true,
        message: 'Backup created',
        backupPath: '/test/backup/custom-name.db',
        timestamp: '2024-01-01T00:00:00Z',
      });

      await backupHandlers.create({ admin_key: 'key', name: 'custom-name' });

      expect(backupService.createDatabaseBackup).toHaveBeenCalledWith('custom-name');
    });

    it('should require admin key', async () => {
      vi.mocked(adminUtil.requireAdminKey).mockImplementation(() => {
        throw new Error('Admin key required');
      });

      await expect(backupHandlers.create({})).rejects.toThrow('Admin key required');
    });
  });

  describe('list', () => {
    it('should list backups', () => {
      const mockBackups = [
        { filename: 'backup1.db', path: '/path/backup1.db', size: 1024, createdAt: new Date('2024-01-01') },
        { filename: 'backup2.db', path: '/path/backup2.db', size: 2048, createdAt: new Date('2024-01-02') },
      ];

      vi.mocked(backupService.listBackups).mockReturnValue(mockBackups);

      const result = backupHandlers.list({ admin_key: 'key' });

      expect(result.success).toBe(true);
      expect(result.backups).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.backupDirectory).toBe('/test/backup/path');
    });

    it('should format backup sizes', () => {
      const mockBackups = [
        { filename: 'backup.db', path: '/path/backup.db', size: 1536, createdAt: new Date() },
      ];

      vi.mocked(backupService.listBackups).mockReturnValue(mockBackups);

      const result = backupHandlers.list({ admin_key: 'key' });

      expect(result.backups[0]!.sizeHuman).toBe('1.5 KB');
    });

    it('should format ISO dates', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      const mockBackups = [
        { filename: 'backup.db', path: '/path/backup.db', size: 0, createdAt: date },
      ];

      vi.mocked(backupService.listBackups).mockReturnValue(mockBackups);

      const result = backupHandlers.list({ admin_key: 'key' });

      expect(result.backups[0]!.createdAt).toBe(date.toISOString());
    });

    it('should return empty list when no backups', () => {
      vi.mocked(backupService.listBackups).mockReturnValue([]);

      const result = backupHandlers.list({ admin_key: 'key' });

      expect(result.success).toBe(true);
      expect(result.backups).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should cleanup old backups', () => {
      vi.mocked(backupService.cleanupBackups).mockReturnValue({
        deleted: ['old1.db', 'old2.db'],
        kept: ['new1.db', 'new2.db', 'new3.db'],
      });

      const result = backupHandlers.cleanup({ admin_key: 'key' });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.keptCount).toBe(3);
    });

    it('should use default keepCount of 5', () => {
      vi.mocked(backupService.cleanupBackups).mockReturnValue({
        deleted: [],
        kept: [],
      });

      backupHandlers.cleanup({ admin_key: 'key' });

      expect(backupService.cleanupBackups).toHaveBeenCalledWith(5);
    });

    it('should use custom keepCount', () => {
      vi.mocked(backupService.cleanupBackups).mockReturnValue({
        deleted: [],
        kept: [],
      });

      backupHandlers.cleanup({ admin_key: 'key', keepCount: 10 });

      expect(backupService.cleanupBackups).toHaveBeenCalledWith(10);
    });
  });

  describe('restore', () => {
    it('should restore from backup', async () => {
      vi.mocked(backupService.restoreFromBackup).mockResolvedValue({
        success: true,
        message: 'Restored successfully',
      });

      const result = await backupHandlers.restore({ admin_key: 'key', filename: 'backup.db' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Restored successfully');
    });

    it('should require filename', async () => {
      const result = await backupHandlers.restore({ admin_key: 'key' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('filename is required');
    });

    it('should handle empty filename', async () => {
      const result = await backupHandlers.restore({ admin_key: 'key', filename: '' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('filename is required');
    });

    it('should handle restore failure', async () => {
      vi.mocked(backupService.restoreFromBackup).mockResolvedValue({
        success: false,
        message: 'Backup file not found',
      });

      const result = await backupHandlers.restore({ admin_key: 'key', filename: 'missing.db' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Backup file not found');
    });
  });
});
