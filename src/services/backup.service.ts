/**
 * Backup Service
 *
 * Handles database backups to the configured backup directory.
 * Uses better-sqlite3's backup() API for WAL-consistent backups.
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, basename, resolve, relative, isAbsolute } from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config/index.js';
import { isDatabaseInitialized, getSqlite } from '../core/container.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('backup');

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
 * Create a backup of the database to the configured backup directory.
 * Uses better-sqlite3's backup() API for WAL-consistent backups when available.
 */
export async function createDatabaseBackup(customName?: string): Promise<BackupResult> {
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

    // Security: Validate customName if provided
    if (customName) {
      // Only allow alphanumeric, dots, hyphens, underscores
      const sanitized = customName.replace(/[^a-zA-Z0-9._-]/g, '');
      if (!sanitized || sanitized !== customName || customName.includes('..')) {
        return {
          success: false,
          message: 'Invalid backup name: only alphanumeric, dots, hyphens, and underscores allowed',
        };
      }
    }

    const backupFilename = customName ? `${customName}.db` : `${dbBasename}-backup-${timestamp}.db`;
    const backupPath = join(backupDir, backupFilename);

    // Use better-sqlite3's backup() API for WAL-consistent backups
    // This is the safe way to backup a database with WAL mode enabled
    if (config.dbType === 'sqlite' && isDatabaseInitialized()) {
      try {
        const sqlite = getSqlite();

        if (sqlite && sqlite.open) {
          // Use the backup() API which handles WAL correctly
          await sqlite.backup(backupPath);
          logger.debug({ backupPath }, 'Database backed up using better-sqlite3 backup() API');

          // Verify backup integrity
          const backupDb = new Database(backupPath, { readonly: true });
          try {
            const integrity = backupDb.pragma('integrity_check') as Array<{
              integrity_check: string;
            }>;
            if (integrity[0]?.integrity_check !== 'ok') {
              backupDb.close();
              unlinkSync(backupPath);
              return {
                success: false,
                message: 'Backup integrity check failed',
              };
            }
          } finally {
            backupDb.close();
          }

          return {
            success: true,
            backupPath,
            message: 'Database backed up successfully (WAL-safe)',
            timestamp,
          };
        }
      } catch (backupError) {
        // If backup() API fails, fall back to checkpoint + copy
        logger.warn(
          { error: backupError instanceof Error ? backupError.message : String(backupError) },
          'better-sqlite3 backup() failed, falling back to checkpoint + copy'
        );
      }
    }

    // Fallback: Force WAL checkpoint before copying (less safe but works)
    // This ensures all WAL changes are flushed to the main database file
    if (config.dbType === 'sqlite' && isDatabaseInitialized()) {
      try {
        const sqlite = getSqlite();
        if (sqlite && sqlite.open) {
          // TRUNCATE mode: checkpoint and truncate the WAL file
          sqlite.pragma('wal_checkpoint(TRUNCATE)');
          logger.debug('WAL checkpoint completed before backup');
        }
      } catch (checkpointError) {
        // Bug #252 fix: Log checkpoint errors instead of silently ignoring
        // Continue with backup as checkpoint is optimization, not required
        logger.warn(
          {
            error: checkpointError instanceof Error ? checkpointError.message : String(checkpointError),
          },
          'WAL checkpoint failed before backup - backup will continue but may include uncommitted WAL data'
        );
      }
    }

    // Copy database file (fallback method)
    copyFileSync(dbPath, backupPath);

    return {
      success: true,
      backupPath,
      message: 'Database backed up successfully',
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
export async function restoreFromBackup(backupFilename: string): Promise<BackupResult> {
  try {
    const backupDir = config.paths.backup;
    const dbPath = config.database.path;

    // Security: Validate backupFilename to prevent path traversal
    const safeFilename = basename(backupFilename);
    if (safeFilename !== backupFilename || backupFilename.includes('..')) {
      return {
        success: false,
        message: 'Invalid backup filename: path traversal not allowed',
      };
    }

    const backupPath = join(backupDir, safeFilename);

    // Double-check resolved path stays within backupDir
    const resolvedPath = resolve(backupPath);
    const resolvedBackupDir = resolve(backupDir);
    const relPath = relative(resolvedBackupDir, resolvedPath);
    if (relPath.startsWith('..') || isAbsolute(relPath)) {
      return {
        success: false,
        message: 'Invalid backup filename: path traversal not allowed',
      };
    }

    // Verify backup exists
    if (!existsSync(backupPath)) {
      return {
        success: false,
        message: `Backup not found: ${safeFilename}`,
      };
    }

    // Create a safety backup of current database before restoring
    if (existsSync(dbPath)) {
      const safetyBackup = await createDatabaseBackup('pre-restore-safety');
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
