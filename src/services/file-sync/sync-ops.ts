/**
 * File sync operations - upsert, delete, backup handling
 */

import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createBackup, cleanupBackups } from './backup.js';

import type { SyncOptions, SyncStats, FileOperation } from './types.js';

// ============================================================================
// CORE WRITE OPERATIONS - shared by all file sync modules
// ============================================================================

export interface WriteWithVerifyOptions {
  verify?: boolean;
  backup?: boolean;
}

export type WriteResult =
  | { action: 'skip'; reason: 'identical' }
  | { action: 'would_create' }
  | { action: 'would_update' }
  | { action: 'created' }
  | { action: 'updated' };

/**
 * Core file write operation with verify/backup support.
 * Used by upsertSyncFile and syncCriticalGuidelinesToFile to prevent drift.
 *
 * Returns the action taken, allowing callers to handle stats/logging as needed.
 */
export async function writeFileWithVerifyBackup(
  destPath: string,
  content: string,
  options: WriteWithVerifyOptions
): Promise<WriteResult> {
  const destExists = existsSync(destPath);

  // Check if content is identical - skip if unchanged
  if (destExists) {
    const existingContent = await readFile(destPath, 'utf-8');
    if (existingContent === content) {
      return { action: 'skip', reason: 'identical' };
    }
  }

  // Verify mode - report what would happen without writing
  if (options.verify) {
    return destExists ? { action: 'would_update' } : { action: 'would_create' };
  }

  // Ensure directory exists
  const dir = dirname(destPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  // Create backup if requested and file exists
  if (options.backup && destExists) {
    await createBackup(destPath);
    await cleanupBackups(destPath);
  }

  // Write the file
  await writeFile(destPath, content, 'utf-8');

  return destExists ? { action: 'updated' } : { action: 'created' };
}

// ============================================================================
// HIGHER-LEVEL SYNC OPERATIONS
// ============================================================================

export interface UpsertParams {
  source?: string;
  dest: string;
  content: string;
  options: SyncOptions;
  stats: SyncStats;
  operations: FileOperation[];
}

/**
 * Upsert a file with verify/backup support.
 * Uses writeFileWithVerifyBackup for core logic, handles stats/operations tracking.
 */
export async function upsertSyncFile(params: UpsertParams): Promise<void> {
  const { source, dest, content, options, stats, operations } = params;

  const result = await writeFileWithVerifyBackup(dest, content, {
    verify: options.verify,
    backup: options.backup,
  });

  const baseOperation = source ? { source, dest } : { dest };

  switch (result.action) {
    case 'skip':
      stats.skipped++;
      operations.push({ type: 'skip', ...baseOperation, message: 'File is identical, skipping' });
      break;
    case 'would_create':
      stats.added++;
      operations.push({ type: 'add', ...baseOperation, message: 'Would add file' });
      break;
    case 'would_update':
      stats.updated++;
      operations.push({ type: 'update', ...baseOperation, message: 'Would update file' });
      break;
    case 'created':
      stats.added++;
      operations.push({ type: 'add', ...baseOperation, message: 'File added' });
      break;
    case 'updated':
      stats.updated++;
      operations.push({ type: 'update', ...baseOperation, message: 'File updated' });
      break;
  }
}

export interface DeleteOrphanedParams {
  destDir: string;
  sourceDir: string;
  options: SyncOptions;
  syncedFiles: Set<string>;
  stats: SyncStats;
  operations: FileOperation[];
}

/**
 * Delete orphaned files that no longer have a source equivalent
 */
export async function deleteOrphanedFiles(params: DeleteOrphanedParams): Promise<void> {
  const { destDir, sourceDir, options, syncedFiles, stats, operations } = params;
  const { relative, join } = await import('node:path');
  const { findAllRuleFiles } = await import('./walk.js');

  try {
    if (!existsSync(destDir)) {
      return;
    }

    const allDestFiles = await findAllRuleFiles(destDir);

    for (const destFile of allDestFiles) {
      if (syncedFiles.has(destFile)) continue;

      const destRelative = relative(destDir, destFile);
      const sourceRelative = destRelative.replace(/\.mdc$/, '.md');
      const sourceEquivalent = join(sourceDir, sourceRelative);

      if (existsSync(sourceEquivalent)) continue;

      if (options.verify) {
        stats.deleted++;
        operations.push({
          type: 'delete',
          dest: destFile,
          message: 'Would delete orphaned file',
        });
      } else {
        await unlink(destFile);
        stats.deleted++;
        operations.push({
          type: 'delete',
          dest: destFile,
          message: 'Orphaned file deleted',
        });
      }
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
      stats.errors++;
      operations.push({
        type: 'error',
        message: `Error checking for orphaned files: ${error.message}`,
      });
    }
  }
}
