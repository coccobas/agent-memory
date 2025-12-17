/**
 * Backup Service
 *
 * Handles database backups to the configured backup directory
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { config } from '../config/index.js';

export interface BackupResult {
  success: boolean;
  backupPath?: string;
  message: string;
  timestamp?: string;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  createdAt: Date;
}

/**
 * Create a backup of the database to the configured backup directory
 */
export function createDatabaseBackup(customName?: string): BackupResult {
  try {
    const dbPath = config.database.path;
    const backupDir = config.paths.backup;

    // Verify database exists
    if (!existsSync(dbPath)) {
      return {
        success: false,
        message: `Database not found at ${dbPath}`,
      };
    }

    // Ensure backup directory exists
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    // Generate backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dbBasename = basename(dbPath, '.db');
    const backupFilename = customName
      ? `${customName}.db`
      : `${dbBasename}-backup-${timestamp}.db`;
    const backupPath = join(backupDir, backupFilename);

    // Copy database file
    copyFileSync(dbPath, backupPath);

    return {
      success: true,
      backupPath,
      message: `Database backed up successfully`,
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      message: `Backup failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * List all backups in the backup directory
 */
export function listBackups(): BackupInfo[] {
  const backupDir = config.paths.backup;

  if (!existsSync(backupDir)) {
    return [];
  }

  const files = readdirSync(backupDir);
  const backups: BackupInfo[] = [];

  for (const file of files) {
    if (file.endsWith('.db')) {
      const filePath = join(backupDir, file);
      const stats = statSync(filePath);
      backups.push({
        filename: file,
        path: filePath,
        size: stats.size,
        createdAt: stats.mtime,
      });
    }
  }

  // Sort by creation date, newest first
  return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Delete old backups, keeping only the most recent N
 */
export function cleanupBackups(keepCount: number = 5): { deleted: string[]; kept: string[] } {
  const backups = listBackups();
  const deleted: string[] = [];
  const kept: string[] = [];

  for (let i = 0; i < backups.length; i++) {
    const backup = backups[i];
    if (backup) {
      if (i < keepCount) {
        kept.push(backup.filename);
      } else {
        try {
          unlinkSync(backup.path);
          deleted.push(backup.filename);
        } catch {
          // Ignore deletion errors
        }
      }
    }
  }

  return { deleted, kept };
}

/**
 * Restore database from a backup
 */
export function restoreFromBackup(backupFilename: string): BackupResult {
  try {
    const backupDir = config.paths.backup;
    const dbPath = config.database.path;
    const backupPath = join(backupDir, backupFilename);

    // Verify backup exists
    if (!existsSync(backupPath)) {
      return {
        success: false,
        message: `Backup not found: ${backupFilename}`,
      };
    }

    // Create a safety backup of current database before restoring
    if (existsSync(dbPath)) {
      const safetyBackup = createDatabaseBackup('pre-restore-safety');
      if (!safetyBackup.success) {
        return {
          success: false,
          message: `Failed to create safety backup: ${safetyBackup.message}`,
        };
      }
    }

    // Copy backup to database location
    copyFileSync(backupPath, dbPath);

    return {
      success: true,
      message: `Database restored from ${backupFilename}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Restore failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
