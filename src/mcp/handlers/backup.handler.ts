/**
 * Backup Handler
 *
 * Handles database backup operations via MCP
 */

import {
  createDatabaseBackup,
  listBackups,
  cleanupBackups,
  restoreFromBackup,
} from '../../services/backup.service.js';
import { config } from '../../config/index.js';

interface BackupCreateParams {
  name?: string;
}

interface BackupCleanupParams {
  keepCount?: number;
}

interface BackupRestoreParams {
  filename: string;
}

/**
 * Create a database backup
 */
function create(params: BackupCreateParams) {
  const result = createDatabaseBackup(params.name);
  return {
    success: result.success,
    message: result.message,
    backupPath: result.backupPath,
    timestamp: result.timestamp,
    backupDirectory: config.paths.backup,
  };
}

/**
 * List all backups
 */
function list() {
  const backups = listBackups();
  return {
    success: true,
    backups: backups.map((b) => ({
      filename: b.filename,
      path: b.path,
      size: b.size,
      sizeHuman: formatBytes(b.size),
      createdAt: b.createdAt.toISOString(),
    })),
    backupDirectory: config.paths.backup,
    count: backups.length,
  };
}

/**
 * Cleanup old backups
 */
function cleanup(params: BackupCleanupParams) {
  const keepCount = params.keepCount ?? 5;
  const result = cleanupBackups(keepCount);
  return {
    success: true,
    deleted: result.deleted,
    kept: result.kept,
    deletedCount: result.deleted.length,
    keptCount: result.kept.length,
  };
}

/**
 * Restore from a backup
 */
function restore(params: BackupRestoreParams) {
  if (!params.filename) {
    return {
      success: false,
      message: 'filename is required',
    };
  }

  const result = restoreFromBackup(params.filename);
  return {
    success: result.success,
    message: result.message,
  };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const backupHandlers = {
  create,
  list,
  cleanup,
  restore,
};
