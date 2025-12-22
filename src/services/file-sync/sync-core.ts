/**
 * Core sync logic for IDE file synchronization
 */

import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname, basename, relative, resolve, extname } from 'node:path';
import { homedir } from 'node:os';

import { convertToMdc, concatenateForSingleMd } from './markdown.js';
import { upsertSyncFile, deleteOrphanedFiles } from './sync-ops.js';
import type { SyncOptions, SyncStats, FileOperation, SyncResult } from './types.js';
import { findMarkdownFiles } from './discovery.js';

// IDE destination mapping for project-level
export const IDE_DESTINATIONS: Record<string, string> = {
  cursor: '.cursor/rules',
  claude: '.claude',
  vscode: '.vscode/rules',
  intellij: '.idea/codeStyles',
  sublime: '.sublime',
  neovim: '.nvim',
  emacs: '.emacs.d',
  antigravity: '.agent/rules',
  generic: '.ide-rules',
};

// IDEs that use single consolidated file instead of multiple files
export const SINGLE_MD_IDES: Record<string, string> = {
  claude: 'CLAUDE.md',
};

// IDE destination mapping for user-level (relative to home directory)
export const USER_DESTINATIONS: Record<string, string> = {
  cursor: '.cursor/rules',
  claude: '.claude',
  vscode: '.vscode/rules',
  intellij: '.IntelliJIdea/config/codeStyles',
  sublime: '.sublime',
  neovim: '.config/nvim',
  emacs: '.emacs.d',
  antigravity: '.agent/rules',
  generic: '.ide-rules',
};

function getUserHomeDirForRules(): string {
  // In unit tests, writing to the real home directory may be blocked by sandboxing.
  // Use a deterministic, repo-local home dir so user-level sync is still testable.
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined;
  return isTest ? resolve(process.cwd(), 'data/test-home') : homedir();
}

/**
 * Resolve user-level rules directory for an IDE
 */
export function resolveUserRulesDir(ide: string, customDir?: string): string {
  if (customDir) {
    return resolve(customDir);
  }

  const userDestination = USER_DESTINATIONS[ide];
  if (!userDestination) {
    throw new Error(`Unknown IDE: ${ide}`);
  }

  const homeDir = getUserHomeDirForRules();
  return join(homeDir, userDestination);
}

/**
 * Resolve destination directory for an IDE
 */
export function resolveDestinationDirForIde(
  ide: string,
  outputDir: string,
  options: SyncOptions
): string {
  if (options.userLevel) {
    return options.userDir ? resolve(options.userDir) : resolveUserRulesDir(ide);
  }

  const ideDestination = IDE_DESTINATIONS[ide];
  if (!ideDestination) {
    throw new Error(`Unknown IDE: ${ide}`);
  }
  return join(outputDir, ideDestination);
}

/**
 * Filter source files by selected files set
 */
export function filterSelectedFiles(
  sourceFiles: string[],
  sourceDir: string,
  selectedFiles?: Set<string> | string[]
): string[] {
  if (!selectedFiles) return sourceFiles;

  const selectedSet = Array.isArray(selectedFiles) ? new Set(selectedFiles) : selectedFiles;
  if (selectedSet.size === 0) return sourceFiles;

  return sourceFiles.filter((file) => {
    const fileName = basename(file);
    const fileNameWithoutExt = basename(file, '.md');
    return (
      selectedSet.has(fileName) ||
      selectedSet.has(fileNameWithoutExt) ||
      selectedSet.has(relative(sourceDir, file))
    );
  });
}

export interface SyncSingleMdParams {
  ide: string;
  destDir: string;
  filesToSync: string[];
  options: SyncOptions;
  stats: SyncStats;
  operations: FileOperation[];
}

/**
 * Sync files to a single consolidated markdown file (e.g., Claude's CLAUDE.md)
 */
export async function syncSingleMdIde(params: SyncSingleMdParams): Promise<void> {
  const { ide, destDir, filesToSync, options, stats, operations } = params;

  const singleMdFileName = SINGLE_MD_IDES[ide];
  if (!singleMdFileName) {
    throw new Error(`IDE does not support single-md sync: ${ide}`);
  }

  const filesMap = new Map<string, string>();
  for (const sourceFile of filesToSync) {
    try {
      const content = await readFile(sourceFile, 'utf-8');
      filesMap.set(basename(sourceFile), content);
    } catch (error) {
      stats.errors++;
      operations.push({
        type: 'error',
        source: sourceFile,
        message: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const destContent = concatenateForSingleMd(filesMap, ide);
  const destPath = join(destDir, singleMdFileName);

  if (!options.verify) {
    await mkdir(destDir, { recursive: true });
  }

  await upsertSyncFile({
    dest: destPath,
    content: destContent,
    options,
    stats,
    operations,
  });
}

export interface SyncMultiFileParams {
  ide: string;
  sourceDir: string;
  outputDir: string;
  filesToSync: string[];
  options: SyncOptions;
  stats: SyncStats;
  operations: FileOperation[];
  syncedFiles: Set<string>;
}

/**
 * Sync multiple files to individual destination files
 */
export async function syncMultiFileIde(params: SyncMultiFileParams): Promise<void> {
  const { ide, sourceDir, outputDir, filesToSync, options, stats, operations, syncedFiles } =
    params;

  for (const sourceFile of filesToSync) {
    try {
      const destPath = getDestinationPath(
        sourceFile,
        sourceDir,
        ide,
        outputDir,
        options.userLevel,
        options.userDir
      );
      syncedFiles.add(destPath);

      if (!options.verify) {
        await mkdir(dirname(destPath), { recursive: true });
      }

      const sourceContent = await readFile(sourceFile, 'utf-8');
      const destContent =
        ide === 'cursor' ? convertToMdc(sourceContent, sourceFile) : sourceContent;

      await upsertSyncFile({
        source: sourceFile,
        dest: destPath,
        content: destContent,
        options,
        stats,
        operations,
      });
    } catch (error) {
      stats.errors++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      operations.push({
        type: 'error',
        source: sourceFile,
        message: `Error: ${errorMsg}`,
      });
    }
  }
}

/**
 * Get destination path for a source file
 */
export function getDestinationPath(
  sourcePath: string,
  sourceDir: string,
  ide: string,
  outputDir: string,
  userLevel?: boolean,
  userDir?: string
): string {
  const relativePath = relative(sourceDir, sourcePath);
  const fileName = basename(relativePath);
  const dir = dirname(relativePath);

  // Convert .md to .mdc for Cursor
  const ext = ide === 'cursor' ? '.mdc' : extname(fileName);
  const baseName = basename(fileName, '.md');
  const newFileName = baseName + ext;

  let destDir: string;

  if (userLevel) {
    // For user-level, resolveUserRulesDir already gives us the full path including IDE-specific directory
    destDir = userDir ? resolve(userDir) : resolveUserRulesDir(ide);
  } else {
    // For project-level, append IDE destination to output directory
    const ideDestination = IDE_DESTINATIONS[ide];
    if (!ideDestination) {
      throw new Error(`Unknown IDE: ${ide}`);
    }
    destDir = join(outputDir, ideDestination);
  }
  const destPath = dir === '.' ? join(destDir, newFileName) : join(destDir, dir, newFileName);

  return destPath;
}

export { deleteOrphanedFiles };

/**
 * Sync files for a single IDE
 */
export async function syncForIDE(
  ide: string,
  sourceDir: string,
  outputDir: string,
  options: SyncOptions,
  ignorePatterns: string[],
  selectedFiles?: Set<string> | string[]
): Promise<SyncResult> {
  const stats: SyncStats = {
    added: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    errors: 0,
  };
  const operations: FileOperation[] = [];

  const destDir = resolveDestinationDirForIde(ide, outputDir, options);

  // Find all source files
  const sourceFiles = await findMarkdownFiles(sourceDir, ignorePatterns, sourceDir);

  const filesToSync = filterSelectedFiles(sourceFiles, sourceDir, selectedFiles);

  // Handle single-md IDEs (like Claude Code) differently
  const singleMdFileName = SINGLE_MD_IDES[ide];
  if (singleMdFileName) {
    await syncSingleMdIde({ ide, destDir, filesToSync, options, stats, operations });
    return { stats, operations };
  }

  // Track which files we've synced
  const syncedFiles = new Set<string>();

  await syncMultiFileIde({
    ide,
    sourceDir,
    outputDir,
    filesToSync,
    options,
    stats,
    operations,
    syncedFiles,
  });

  // Full sync: delete orphaned files
  if (!selectedFiles) {
    await deleteOrphanedFiles({ destDir, sourceDir, options, syncedFiles, stats, operations });
  }

  return { stats, operations };
}
