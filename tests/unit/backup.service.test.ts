import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Stats } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import {
  createDatabaseBackup,
  listBackups,
  cleanupBackups,
  restoreFromBackup,
} from '../../src/services/backup.service.js';
import * as container from '../../src/core/container.js';
import { config } from '../../src/config/index.js';

// =============================================================================
// TEST SETUP AND MOCKS
// =============================================================================

// Mock the filesystem operations
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof fs>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    readdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    statSync: vi.fn(),
  };
});

// Track the mock instance to return from new Database()
const mockDatabaseState = { instance: null as ReturnType<typeof createMockDatabase> | null };

// Mock better-sqlite3 constructor - use a class for proper constructor behavior
vi.mock('better-sqlite3', () => {
  // Use a class so vitest doesn't warn about vi.fn() implementation
  class MockDatabase {
    open = true;
    close = vi.fn();
    pragma = vi.fn(() => [{ integrity_check: 'ok' }]);
    backup = vi.fn().mockResolvedValue(undefined);
    prepare = vi.fn();
    exec = vi.fn();

    constructor() {
      // If a test has set a custom mock instance, use that
      // Access via globalThis to work with vitest hoisting
      const state = (globalThis as Record<string, unknown>).__mockDatabaseState as
        | typeof mockDatabaseState
        | undefined;
      if (state?.instance) {
        return state.instance as unknown as MockDatabase;
      }
    }
  }
  return { default: MockDatabase };
});

// Helper to set the mock Database instance for a test
function setMockDatabaseInstance(instance: ReturnType<typeof createMockDatabase>) {
  (globalThis as Record<string, unknown>).__mockDatabaseState = { instance };
}

// Clear mock state helper
function clearMockDatabaseInstance() {
  (globalThis as Record<string, unknown>).__mockDatabaseState = { instance: null };
}

// Mock container module
vi.mock('../../src/core/container.js', () => ({
  isDatabaseInitialized: vi.fn(),
  getSqlite: vi.fn(),
}));

// Don't mock config - let it load naturally and we'll work with the real paths
// The filesystem operations are mocked anyway

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockStats(size: number, mtime: Date): Stats {
  return {
    size,
    mtime,
    isFile: () => true,
    isDirectory: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    blksize: 0,
    blocks: 0,
    atimeMs: 0,
    mtimeMs: mtime.getTime(),
    ctimeMs: 0,
    birthtimeMs: 0,
    atime: new Date(),
    ctime: new Date(),
    birthtime: new Date(),
  } as Stats;
}

function createMockDatabase(options?: { backupFails?: boolean; integrityOk?: boolean }) {
  return {
    open: true,
    close: vi.fn(),
    backup: options?.backupFails
      ? vi.fn().mockRejectedValue(new Error('Backup API failed'))
      : vi.fn().mockResolvedValue(undefined),
    pragma: vi.fn((cmd: string) => {
      if (cmd === 'integrity_check') {
        return [{ integrity_check: options?.integrityOk !== false ? 'ok' : 'corrupted' }];
      }
      if (cmd === 'wal_checkpoint(TRUNCATE)') {
        return undefined;
      }
      return undefined;
    }),
    prepare: vi.fn(),
    exec: vi.fn(),
  } as unknown as Database.Database;
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe('Backup Service', () => {
  beforeEach(() => {
    // Reset all mocks to clear implementations, not just call counts
    vi.resetAllMocks();
    clearMockDatabaseInstance();

    // Reset fs mocks to default non-throwing behavior
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // createDatabaseBackup Tests
  // ===========================================================================

  describe('createDatabaseBackup', () => {
    describe('Success Cases', () => {
      it('should create backup successfully using backup() API', async () => {
        // Setup
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockDb = createMockDatabase();
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        // Set mock Database instance for integrity check
        const mockBackupDb = createMockDatabase({ integrityOk: true });
        setMockDatabaseInstance(mockBackupDb);

        // Execute
        const result = await createDatabaseBackup();

        // Assert
        expect(result.success).toBe(true);
        expect(result.backupPath).toBeDefined();
        expect(result.backupPath).toMatch(/backups\/memory-backup-.*\.db$/);
        expect(result.message).toBe('Database backed up successfully (WAL-safe)');
        expect(result.timestamp).toBeDefined();
        expect(mockDb.backup).toHaveBeenCalledWith(result.backupPath);
        expect(mockBackupDb.pragma).toHaveBeenCalledWith('integrity_check');
        expect(mockBackupDb.close).toHaveBeenCalled();
      });

      it('should create backup with custom name', async () => {
        // Setup
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockDb = createMockDatabase();
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        const mockBackupDb = createMockDatabase({ integrityOk: true });
        setMockDatabaseInstance(mockBackupDb);

        // Execute
        const result = await createDatabaseBackup('my-custom-backup');

        // Assert
        expect(result.success).toBe(true);
        expect(result.backupPath).toMatch(/backups\/my-custom-backup\.db$/);
        expect(result.message).toBe('Database backed up successfully (WAL-safe)');
      });

      it('should fallback to checkpoint + copy when backup() API fails', async () => {
        // Setup
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockDb = createMockDatabase({ backupFails: true });
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        // Execute
        const result = await createDatabaseBackup();

        // Assert
        expect(result.success).toBe(true);
        expect(result.backupPath).toBeDefined();
        expect(result.message).toBe('Database backed up successfully');
        expect(mockDb.backup).toHaveBeenCalled(); // Attempted
        expect(mockDb.pragma).toHaveBeenCalledWith('wal_checkpoint(TRUNCATE)');
        expect(fs.copyFileSync).toHaveBeenCalledWith(
          expect.stringMatching(/memory\.db$/),
          result.backupPath
        );
      });

      it('should use copyFileSync when database not initialized', async () => {
        // Setup
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(false);

        // Execute
        const result = await createDatabaseBackup();

        // Assert
        expect(result.success).toBe(true);
        expect(result.backupPath).toBeDefined();
        expect(result.message).toBe('Database backed up successfully');
        expect(fs.copyFileSync).toHaveBeenCalledWith(
          expect.stringMatching(/memory\.db$/),
          result.backupPath
        );
      });

      it('should create backup directory if it does not exist', async () => {
        // Setup
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p);
          // Check for database path (absolute path ending with memory.db)
          if (pathStr.includes('memory.db')) return true;
          // Check for backup directory (absolute path ending with backups)
          if (pathStr.includes('backups') && !pathStr.includes('.db')) return false;
          return false;
        });
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(false);

        // Execute
        const result = await createDatabaseBackup();

        // Assert
        expect(result.success).toBe(true);
        expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringMatching(/backups$/), {
          recursive: true,
        });
        expect(fs.copyFileSync).toHaveBeenCalled();
      });
    });

    describe('Security and Validation', () => {
      it('should reject path traversal in custom name', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);

        const result = await createDatabaseBackup('../../../etc/passwd');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Invalid backup name');
        expect(result.message).toContain(
          'only alphanumeric, dots, hyphens, and underscores allowed'
        );
      });

      it('should reject custom name with special characters', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);

        const result = await createDatabaseBackup('backup;rm -rf /');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Invalid backup name');
      });

      it('should reject custom name with double dots', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);

        const result = await createDatabaseBackup('..backup');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Invalid backup name');
      });

      it('should accept valid alphanumeric custom names', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockDb = createMockDatabase();
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        const mockBackupDb = createMockDatabase({ integrityOk: true });
        setMockDatabaseInstance(mockBackupDb);

        const result = await createDatabaseBackup('backup-2024-12-25_v1.0');

        expect(result.success).toBe(true);
        expect(result.backupPath).toMatch(/backups\/backup-2024-12-25_v1\.0\.db$/);
      });

      it('should sanitize custom name by removing invalid characters', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);

        const result = await createDatabaseBackup('backup@#$%123');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Invalid backup name');
      });
    });

    describe('Error Handling', () => {
      it('should handle database not found', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const result = await createDatabaseBackup();

        expect(result.success).toBe(false);
        expect(result.message).toContain('Database not found at');
        expect(result.message).toContain('memory.db');
      });

      it('should handle backup integrity check failure', async () => {
        // Setup
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockDb = createMockDatabase();
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        // Set mock backup DB with failed integrity check
        const mockBackupDb = createMockDatabase({ integrityOk: false });
        setMockDatabaseInstance(mockBackupDb);

        // Execute
        const result = await createDatabaseBackup();

        // Assert
        expect(result.success).toBe(false);
        expect(result.message).toBe('Backup integrity check failed');
        expect(fs.unlinkSync).toHaveBeenCalled(); // Should delete corrupt backup
        expect(mockBackupDb.close).toHaveBeenCalled();
      });

      it('should handle copyFileSync errors', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(false);
        vi.mocked(fs.copyFileSync).mockImplementation(() => {
          throw new Error('Permission denied');
        });

        const result = await createDatabaseBackup();

        expect(result.success).toBe(false);
        expect(result.message).toContain('Backup failed');
        expect(result.message).toContain('Permission denied');
      });

      it('should handle mkdirSync errors gracefully', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p);
          // Check for database path (absolute path ending with memory.db)
          if (pathStr.includes('memory.db')) return true;
          // Check for backup directory (absolute path ending with backups)
          if (pathStr.includes('backups') && !pathStr.includes('.db')) return false;
          return false;
        });
        vi.mocked(fs.mkdirSync).mockImplementation(() => {
          throw new Error('Permission denied');
        });

        const result = await createDatabaseBackup();

        expect(result.success).toBe(false);
        expect(result.message).toContain('Backup failed');
      });

      it('should handle getSqlite returning null', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(null as any);

        // Reset copyFileSync to clear any previous calls
        vi.mocked(fs.copyFileSync).mockClear();

        const result = await createDatabaseBackup();

        // Should fallback to copy method
        expect(result.success).toBe(true);
        expect(fs.copyFileSync).toHaveBeenCalled();
      });

      it('should handle checkpoint pragma errors gracefully', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockDb = createMockDatabase({ backupFails: true });
        mockDb.pragma = vi.fn(() => {
          throw new Error('Checkpoint failed');
        });
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        const result = await createDatabaseBackup();

        // Should continue with backup even if checkpoint fails
        expect(result.success).toBe(true);
        expect(fs.copyFileSync).toHaveBeenCalled();
      });
    });

    describe('Timestamp Generation', () => {
      it('should generate ISO timestamp in backup filename', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(false);

        const result = await createDatabaseBackup();

        expect(result.success).toBe(true);
        expect(result.backupPath).toMatch(/memory-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
        expect(result.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
      });

      it('should sanitize colons and dots from timestamp', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(false);

        const result = await createDatabaseBackup();

        expect(result.success).toBe(true);
        // Filename should not contain colons or dots (except .db extension)
        const filename = path.basename(result.backupPath!);
        const filenameWithoutExt = filename.replace('.db', '');
        expect(filenameWithoutExt).not.toContain(':');
        expect(filenameWithoutExt).not.toContain('.');
      });
    });
  });

  // ===========================================================================
  // listBackups Tests
  // ===========================================================================

  describe('listBackups', () => {
    it('should return empty array when backup directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = listBackups();

      expect(result).toEqual([]);
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });

    it('should list all .db files in backup directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'backup1.db',
        'backup2.db',
        'readme.txt',
        'backup3.db',
      ] as any);

      const now = new Date();
      vi.mocked(fs.statSync).mockReturnValue(createMockStats(1024, now));

      const result = listBackups();

      expect(result).toHaveLength(3);
      expect(result[0]?.filename).toBe('backup1.db');
      expect(result[1]?.filename).toBe('backup2.db');
      expect(result[2]?.filename).toBe('backup3.db');
    });

    it('should include file size and timestamps', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['backup1.db'] as any);

      const testDate = new Date('2024-12-25T10:00:00Z');
      vi.mocked(fs.statSync).mockReturnValue(createMockStats(2048, testDate));

      const result = listBackups();

      expect(result).toHaveLength(1);
      expect(result[0]?.filename).toBe('backup1.db');
      expect(result[0]?.path).toMatch(/backups\/backup1\.db$/); // Match path ending with relative path
      expect(result[0]?.size).toBe(2048);
      expect(result[0]?.createdAt).toEqual(testDate);
    });

    it('should sort backups by creation date (newest first)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['backup1.db', 'backup2.db', 'backup3.db'] as any);

      const date1 = new Date('2024-12-23T10:00:00Z');
      const date2 = new Date('2024-12-25T10:00:00Z'); // Newest
      const date3 = new Date('2024-12-24T10:00:00Z');

      vi.mocked(fs.statSync).mockImplementation((filePath) => {
        if (filePath.toString().includes('backup1.db')) return createMockStats(1024, date1);
        if (filePath.toString().includes('backup2.db')) return createMockStats(1024, date2);
        if (filePath.toString().includes('backup3.db')) return createMockStats(1024, date3);
        throw new Error('Unexpected file');
      });

      const result = listBackups();

      expect(result).toHaveLength(3);
      expect(result[0]?.filename).toBe('backup2.db'); // Newest
      expect(result[1]?.filename).toBe('backup3.db');
      expect(result[2]?.filename).toBe('backup1.db'); // Oldest
    });

    it('should handle empty backup directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);

      const result = listBackups();

      expect(result).toEqual([]);
    });

    it('should ignore non-.db files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'backup.db',
        'backup.sql',
        'backup.txt',
        'notes.md',
        '.DS_Store',
      ] as any);

      const now = new Date();
      vi.mocked(fs.statSync).mockReturnValue(createMockStats(1024, now));

      const result = listBackups();

      expect(result).toHaveLength(1);
      expect(result[0]?.filename).toBe('backup.db');
    });

    it('should handle different file sizes', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['small.db', 'large.db'] as any);

      const now = new Date();
      vi.mocked(fs.statSync).mockImplementation((filePath) => {
        if (filePath.toString().includes('small.db')) return createMockStats(512, now);
        if (filePath.toString().includes('large.db')) return createMockStats(1024 * 1024, now);
        throw new Error('Unexpected file');
      });

      const result = listBackups();

      expect(result).toHaveLength(2);
      expect(result[0]?.size).toBe(512);
      expect(result[1]?.size).toBe(1024 * 1024);
    });
  });

  // ===========================================================================
  // cleanupBackups Tests
  // ===========================================================================

  describe('cleanupBackups', () => {
    it('should keep specified number of backups', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'backup1.db',
        'backup2.db',
        'backup3.db',
        'backup4.db',
        'backup5.db',
      ] as any);

      // Create dates in descending order (backup5 is newest)
      const dates = [
        new Date('2024-12-21T10:00:00Z'),
        new Date('2024-12-22T10:00:00Z'),
        new Date('2024-12-23T10:00:00Z'),
        new Date('2024-12-24T10:00:00Z'),
        new Date('2024-12-25T10:00:00Z'),
      ];

      vi.mocked(fs.statSync).mockImplementation((filePath) => {
        const filename = path.basename(filePath.toString());
        const index = parseInt(filename.replace('backup', '').replace('.db', '')) - 1;
        return createMockStats(1024, dates[index]!);
      });

      const result = cleanupBackups(3);

      expect(result.kept).toHaveLength(3);
      expect(result.deleted).toHaveLength(2);
      expect(result.kept).toContain('backup5.db'); // Newest
      expect(result.kept).toContain('backup4.db');
      expect(result.kept).toContain('backup3.db');
      expect(result.deleted).toContain('backup2.db');
      expect(result.deleted).toContain('backup1.db'); // Oldest
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });

    it('should use default keepCount of 5', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'b1.db',
        'b2.db',
        'b3.db',
        'b4.db',
        'b5.db',
        'b6.db',
        'b7.db',
      ] as any);

      const now = new Date();
      vi.mocked(fs.statSync).mockReturnValue(createMockStats(1024, now));

      const result = cleanupBackups();

      expect(result.kept).toHaveLength(5);
      expect(result.deleted).toHaveLength(2);
    });

    it('should handle fewer backups than keepCount', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['backup1.db', 'backup2.db'] as any);

      const now = new Date();
      vi.mocked(fs.statSync).mockReturnValue(createMockStats(1024, now));

      const result = cleanupBackups(5);

      expect(result.kept).toHaveLength(2);
      expect(result.deleted).toHaveLength(0);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should handle empty backup directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = cleanupBackups(5);

      expect(result.kept).toHaveLength(0);
      expect(result.deleted).toHaveLength(0);
    });

    it('should ignore deletion errors', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['backup1.db', 'backup2.db', 'backup3.db'] as any);

      const dates = [
        new Date('2024-12-23T10:00:00Z'),
        new Date('2024-12-24T10:00:00Z'),
        new Date('2024-12-25T10:00:00Z'),
      ];

      vi.mocked(fs.statSync).mockImplementation((filePath) => {
        const filename = path.basename(filePath.toString());
        const index = parseInt(filename.replace('backup', '').replace('.db', '')) - 1;
        return createMockStats(1024, dates[index]!);
      });

      // First unlinkSync succeeds, second fails
      vi.mocked(fs.unlinkSync)
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {
          throw new Error('Permission denied');
        });

      const result = cleanupBackups(1);

      // Should still report attempted deletions
      expect(result.kept).toHaveLength(1);
      expect(result.kept).toContain('backup3.db'); // Newest kept
    });

    it('should delete oldest backups first', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['old.db', 'new.db', 'middle.db'] as any);

      vi.mocked(fs.statSync).mockImplementation((filePath) => {
        const filename = path.basename(filePath.toString());
        if (filename === 'old.db') return createMockStats(1024, new Date('2024-12-20T10:00:00Z'));
        if (filename === 'new.db') return createMockStats(1024, new Date('2024-12-25T10:00:00Z'));
        if (filename === 'middle.db')
          return createMockStats(1024, new Date('2024-12-23T10:00:00Z'));
        throw new Error('Unexpected file');
      });

      const result = cleanupBackups(2);

      expect(result.kept).toHaveLength(2);
      expect(result.kept).toContain('new.db');
      expect(result.kept).toContain('middle.db');
      expect(result.deleted).toHaveLength(1);
      expect(result.deleted).toContain('old.db');
    });

    it('should handle keepCount of 0', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['backup1.db', 'backup2.db'] as any);

      const now = new Date();
      vi.mocked(fs.statSync).mockReturnValue(createMockStats(1024, now));

      const result = cleanupBackups(0);

      expect(result.kept).toHaveLength(0);
      expect(result.deleted).toHaveLength(2);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // restoreFromBackup Tests
  // ===========================================================================

  describe('restoreFromBackup', () => {
    describe('Success Cases', () => {
      it('should restore database from backup successfully', async () => {
        // Setup: Backup exists, database exists (for safety backup)
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = p.toString();
          // All paths should exist for this test
          return true;
        });

        // Mock successful safety backup creation
        const mockDb = createMockDatabase();
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        const mockBackupDb = createMockDatabase({ integrityOk: true });
        setMockDatabaseInstance(mockBackupDb);

        // Execute
        const result = await restoreFromBackup('backup1.db');

        // Assert
        expect(result.success).toBe(true);
        expect(result.message).toBe('Database restored from backup1.db');
        expect(fs.copyFileSync).toHaveBeenCalled();
      });

      it('should create safety backup before restoring', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockDb = createMockDatabase();
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        const mockBackupDb = createMockDatabase({ integrityOk: true });
        setMockDatabaseInstance(mockBackupDb);

        await restoreFromBackup('backup1.db');

        // Safety backup should be created with 'pre-restore-safety' name
        expect(mockDb.backup).toHaveBeenCalledWith(
          expect.stringMatching(/backups\/pre-restore-safety\.db$/)
        );
      });

      it('should restore even when current database does not exist', async () => {
        // Mock existsSync to return false for the database file (checked by path including memory.db)
        // and true for backup files
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = p.toString();
          if (pathStr.includes('backup1.db')) return true;
          if (pathStr.includes('memory.db')) return false; // No current DB
          if (pathStr.includes('backups') || pathStr.includes('backup')) return true;
          return false;
        });

        const result = await restoreFromBackup('backup1.db');

        expect(result.success).toBe(true);
        expect(result.message).toBe('Database restored from backup1.db');
        // Should skip safety backup when current DB doesn't exist
        expect(fs.copyFileSync).toHaveBeenCalled();
      });
    });

    describe('Security and Validation', () => {
      it('should reject path traversal attempts with ../', async () => {
        const result = await restoreFromBackup('../../../etc/passwd');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Invalid backup filename: path traversal not allowed');
        expect(fs.copyFileSync).not.toHaveBeenCalled();
      });

      it('should reject path traversal with absolute paths', async () => {
        const result = await restoreFromBackup('/etc/passwd');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Invalid backup filename: path traversal not allowed');
      });

      it('should reject filenames containing ..', async () => {
        const result = await restoreFromBackup('..backup.db');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Invalid backup filename: path traversal not allowed');
      });

      it('should sanitize filename to prevent directory traversal', async () => {
        const result = await restoreFromBackup('subdir/../../backup.db');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Invalid backup filename: path traversal not allowed');
      });

      it('should use basename to prevent path injection', async () => {
        // Even if we try to inject a path, basename should extract just the filename
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockDb = createMockDatabase();
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        const mockBackupDb = createMockDatabase({ integrityOk: true });
        setMockDatabaseInstance(mockBackupDb);

        const result = await restoreFromBackup('backup.db');

        expect(result.success).toBe(true);
        // Should resolve to backup directory + basename only
        expect(fs.copyFileSync).toHaveBeenCalledWith(
          expect.stringMatching(/backups\/backup\.db$/),
          expect.stringMatching(/memory\.db$/)
        );
      });
    });

    describe('Error Handling', () => {
      it('should handle backup file not found', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const result = await restoreFromBackup('nonexistent.db');

        expect(result.success).toBe(false);
        expect(result.message).toBe('Backup not found: nonexistent.db');
        expect(fs.copyFileSync).not.toHaveBeenCalled();
      });

      it('should handle safety backup creation failure', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockDb = createMockDatabase({ backupFails: true });
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        // Mock copyFileSync to also fail so we use the backup() path
        vi.mocked(fs.copyFileSync).mockImplementation(() => {
          throw new Error('Copy failed');
        });

        const result = await restoreFromBackup('backup1.db');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Failed to create safety backup');
      });

      it('should handle restore copyFileSync errors', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = p.toString();
          if (pathStr.includes('backup1.db')) return true;
          if (pathStr.includes('memory.db')) return false; // No safety backup needed
          if (pathStr.includes('backups') || pathStr.includes('backup')) return true;
          return false;
        });

        vi.mocked(fs.copyFileSync).mockImplementation(() => {
          throw new Error('Disk full');
        });

        const result = await restoreFromBackup('backup1.db');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Restore failed');
        expect(result.message).toContain('Disk full');
      });

      it('should handle errors during restore copy', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          if (p.toString().includes('backup.db')) return true;
          if (p === 'memory.db') return false; // No safety backup needed
          if (p === 'backups') return true;
          return false;
        });

        vi.mocked(fs.copyFileSync).mockImplementation(() => {
          throw new Error('Permission denied during restore');
        });

        const result = await restoreFromBackup('backup.db');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Restore failed');
        expect(result.message).toContain('Permission denied during restore');
      });
    });

    describe('Edge Cases', () => {
      it('should handle backups with complex but valid names', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          // Backup file exists, current db exists (needs safety backup)
          return true;
        });
        const mockDb = createMockDatabase();
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        const mockBackupDb = createMockDatabase({ integrityOk: true });
        setMockDatabaseInstance(mockBackupDb);

        const result = await restoreFromBackup('memory-backup-2024-12-25T10-30-45-123Z.db');

        expect(result.success).toBe(true);
        expect(fs.copyFileSync).toHaveBeenCalledWith(
          expect.stringMatching(/backups\/memory-backup-2024-12-25T10-30-45-123Z\.db$/),
          expect.stringMatching(/memory\.db$/)
        );
      });

      it('should handle backup filenames with special allowed characters', async () => {
        vi.mocked(fs.existsSync).mockImplementation(() => true);
        const mockDb = createMockDatabase();
        vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
        vi.mocked(container.getSqlite).mockReturnValue(mockDb);

        const mockBackupDb = createMockDatabase({ integrityOk: true });
        setMockDatabaseInstance(mockBackupDb);

        const result = await restoreFromBackup('backup_v1.2.3-final.db');

        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Integration Scenarios
  // ===========================================================================

  describe('Integration Scenarios', () => {
    it('should create backup, list it, and restore from it', async () => {
      // Step 1: Create backup
      vi.mocked(fs.existsSync).mockImplementation(() => true);
      const mockDb = createMockDatabase();
      vi.mocked(container.isDatabaseInitialized).mockReturnValue(true);
      vi.mocked(container.getSqlite).mockReturnValue(mockDb);

      const mockBackupDb = createMockDatabase({ integrityOk: true });
      setMockDatabaseInstance(mockBackupDb);

      const createResult = await createDatabaseBackup('test-backup');
      expect(createResult.success).toBe(true);

      // Step 2: List backups
      vi.mocked(fs.readdirSync).mockReturnValue(['test-backup.db'] as any);
      const now = new Date();
      vi.mocked(fs.statSync).mockReturnValue(createMockStats(1024, now));

      const backups = listBackups();
      expect(backups).toHaveLength(1);
      expect(backups[0]?.filename).toBe('test-backup.db');

      // Step 3: Restore from backup
      const restoreResult = await restoreFromBackup('test-backup.db');
      expect(restoreResult.success).toBe(true);
    });

    it('should create multiple backups and cleanup old ones', async () => {
      // Create 7 backups
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'b1.db',
        'b2.db',
        'b3.db',
        'b4.db',
        'b5.db',
        'b6.db',
        'b7.db',
      ] as any);

      const baseDate = new Date('2024-12-20T10:00:00Z');
      vi.mocked(fs.statSync).mockImplementation((filePath) => {
        const filename = path.basename(filePath.toString());
        const index = parseInt(filename.replace('b', '').replace('.db', '')) - 1;
        const date = new Date(baseDate.getTime() + index * 24 * 60 * 60 * 1000);
        return createMockStats(1024, date);
      });

      // Cleanup, keeping only 3 most recent
      const cleanupResult = cleanupBackups(3);

      expect(cleanupResult.kept).toHaveLength(3);
      expect(cleanupResult.deleted).toHaveLength(4);
      expect(cleanupResult.kept).toContain('b7.db'); // Most recent
      expect(cleanupResult.kept).toContain('b6.db');
      expect(cleanupResult.kept).toContain('b5.db');
    });
  });
});
