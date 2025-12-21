/**
 * File Sync Service
 *
 * Core file syncing logic for syncing rules from files to IDE-specific directories
 */

import { homedir } from 'node:os';

// Re-export from modular files
import { loadIgnorePatterns, shouldIgnore } from './file-sync/ignore.js';
import { findMarkdownFiles } from './file-sync/discovery.js';
import {
  convertToMdc,
  concatenateForSingleMd,
  extractContentFromMdc as extractContentFromMdcInternal,
} from './file-sync/markdown.js';
import { createBackup, cleanupBackups } from './file-sync/backup.js';

// Re-export types
export type { SyncOptions, SyncStats, FileOperation, SyncResult } from './file-sync/types.js';

// Re-export core sync functions
export {
  IDE_DESTINATIONS,
  SINGLE_MD_IDES,
  USER_DESTINATIONS,
  resolveUserRulesDir,
  resolveDestinationDirForIde,
  filterSelectedFiles,
  syncSingleMdIde,
  syncMultiFileIde,
  getDestinationPath,
  deleteOrphanedFiles,
  syncForIDE,
} from './file-sync/sync-core.js';

// Re-export ops functions
export { upsertSyncFile } from './file-sync/sync-ops.js';

export { getCursorDatabasePath, syncToCursorInternalDatabase } from './file-sync/cursor-db.js';
export {
  generateCriticalGuidelinesMarkdown,
  syncCriticalGuidelinesToClaude,
  syncCriticalGuidelinesToCursor,
  syncCriticalGuidelines,
  type CriticalGuidelinesSyncOptions,
  type CriticalGuidelinesSyncResult,
} from './file-sync/critical-guidelines.js';

/**
 * Get user's home directory
 */
export function getUserHomeDir(): string {
  return homedir();
}

export { loadIgnorePatterns, shouldIgnore, findMarkdownFiles, convertToMdc, concatenateForSingleMd };

export { createBackup, cleanupBackups };

/**
 * Extract content from .mdc file, stripping frontmatter
 */
export function extractContentFromMdc(content: string): string {
  return extractContentFromMdcInternal(content);
}

// Cursor DB + critical guidelines helpers live in `src/services/file-sync/*` and are re-exported above.
