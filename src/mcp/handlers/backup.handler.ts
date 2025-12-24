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
import { requireAdminKey } from '../../utils/admin.js';

/**
 * Create a database backup
 */
async function create(params: Record<string, unknown>) {
  requireAdminKey(params);
  const name = typeof params.name === 'string' ? params.name : undefined;
  const result = await createDatabaseBackup(name);
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
function list(params: Record<string, unknown>) {
  requireAdminKey(params);
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
function cleanup(params: Record<string, unknown>) {
  requireAdminKey(params);
  const keepCount = typeof params.keepCount === 'number' ? params.keepCount : 5;
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
async function restore(params: Record<string, unknown>) {
  requireAdminKey(params);
  const filename = typeof params.filename === 'string' ? params.filename : '';
  if (!filename) {
    return {
      success: false,
      message: 'filename is required',
    };
  }

  const result = await restoreFromBackup(filename);
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
