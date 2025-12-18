/**
 * File Sync Service
 *
 * Core file syncing logic for syncing rules from files to IDE-specific directories
 */

import { readdir, readFile, writeFile, mkdir, unlink, copyFile } from 'node:fs/promises';
import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { join, dirname, relative, extname, basename, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import Database from 'better-sqlite3';

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

export interface SyncOptions {
  verify?: boolean;
  backup?: boolean;
  userLevel?: boolean;
  userDir?: string;
}

export interface SyncStats {
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: number;
}

export interface FileOperation {
  type: 'add' | 'update' | 'delete' | 'skip' | 'error';
  source?: string;
  dest?: string;
  message: string;
}

export interface SyncResult {
  stats: SyncStats;
  operations: FileOperation[];
}

/**
 * Get user's home directory
 */
export function getUserHomeDir(): string {
  return homedir();
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

  const homeDir = getUserHomeDir();
  return join(homeDir, userDestination);
}

/**
 * Load ignore patterns from .rulesignore file
 */
export function loadIgnorePatterns(projectRoot: string): string[] {
  const ignoreFiles = [
    join(projectRoot, '.rulesignore'),
    join(projectRoot, 'rules', '.rulesignore'),
  ];

  const patterns: string[] = [];

  for (const ignoreFile of ignoreFiles) {
    if (existsSync(ignoreFile)) {
      const content = readFileSync(ignoreFile, 'utf-8');
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      patterns.push(...lines);
    }
  }

  // Default patterns if no ignore file found
  if (patterns.length === 0) {
    return ['README.md', '*.tmp', '*.bak'];
  }

  return patterns;
}

/**
 * Check if a file matches any ignore pattern
 */
export function shouldIgnore(filePath: string, patterns: string[]): boolean {
  const fileName = basename(filePath);
  const relativePath = filePath.replace(/^.*rules\//, '');

  for (const pattern of patterns) {
    // Simple glob pattern matching
    const regex = new RegExp(
      '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );

    if (regex.test(fileName) || regex.test(relativePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively find all .md files in a directory
 */
export async function findMarkdownFiles(
  dir: string,
  ignorePatterns: string[],
  baseDir: string = dir
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        const subFiles = await findMarkdownFiles(fullPath, ignorePatterns, baseDir);
        files.push(...subFiles);
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        // Check if file should be ignored
        if (!shouldIgnore(fullPath, ignorePatterns)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Directory might not exist or be inaccessible
    if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  return files;
}

/**
 * Convert .md to .mdc for Cursor (add frontmatter if missing)
 */
export function convertToMdc(content: string, sourcePath: string): string {
  // Check if content already has frontmatter
  if (content.trim().startsWith('---')) {
    return content;
  }

  // Extract filename without extension for description
  const fileName = basename(sourcePath, '.md');
  const description = fileName.replace(/[-_]/g, ' ');

  // Add basic frontmatter
  return `---
description: ${description}
---

${content}`;
}

/**
 * Concatenate multiple markdown files into a single file for Claude Code
 * Only includes the core file content to keep it lean
 */
export function concatenateForSingleMd(
  files: Map<string, string>,
  _ide: string
): string {
  const parts: string[] = [
    '# Agent Memory Rules',
    '',
    '> Auto-generated by `npm run sync-rules`. Do not edit directly.',
    '',
    '## Quick Reference',
    '',
    'For detailed information, see the modular rule files in `rules/`:',
    '- `auto-memory-reference.md` - Tool parameters and schemas',
    '- `auto-memory-examples.md` - Usage examples',
    '- `auto-memory-strategies.md` - Optimization strategies',
    '- `auto-memory-advanced.md` - Advanced features',
    '',
  ];

  // Only include core file for Claude (keep it lean, ~400 lines)
  const coreFile = [...files.entries()].find(([name]) => name.includes('core'));

  if (coreFile) {
    let content = coreFile[1];
    // Remove frontmatter if present
    if (content.startsWith('---')) {
      const endIndex = content.indexOf('---', 3);
      if (endIndex !== -1) {
        content = content.slice(endIndex + 3).trim();
      }
    }
    parts.push(content);
  }

  return parts.join('\n');
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

/**
 * Create backup of existing file
 */
export async function createBackup(filePath: string): Promise<string> {
  const timestamp = Date.now();
  const backupPath = `${filePath}.backup.${timestamp}`;
  await copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * Clean up old backups (keep last N)
 */
export async function cleanupBackups(filePath: string, keepCount: number = 3): Promise<void> {
  try {
    const dir = dirname(filePath);
    const baseName = basename(filePath);
    const entries = await readdir(dir);

    const backups = entries
      .filter((entry) => entry.startsWith(`${baseName}.backup.`))
      .map((entry) => {
        const match = entry.match(/\.backup\.(\d+)$/);
        return {
          name: entry,
          timestamp: match && match[1] ? parseInt(match[1], 10) : 0,
          path: join(dir, entry),
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    // Delete old backups beyond keepCount
    for (let i = keepCount; i < backups.length; i++) {
      const backup = backups[i];
      if (backup) {
        await unlink(backup.path);
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Sync files for a single IDE
 */
export async function syncForIDE(
  ide: string,
  sourceDir: string,
  outputDir: string,
  options: SyncOptions,
  ignorePatterns: string[],
  selectedFiles?: Set<string>
): Promise<SyncResult> {
  const stats: SyncStats = {
    added: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    errors: 0,
  };
  const operations: FileOperation[] = [];

  // Determine destination directory based on userLevel flag
  let destDir: string;
  if (options.userLevel) {
    destDir = options.userDir ? resolve(options.userDir) : resolveUserRulesDir(ide);
  } else {
    const ideDestination = IDE_DESTINATIONS[ide];
    if (!ideDestination) {
      throw new Error(`Unknown IDE: ${ide}`);
    }
    destDir = join(outputDir, ideDestination);
  }

  // Find all source files
  const sourceFiles = await findMarkdownFiles(sourceDir, ignorePatterns, sourceDir);

  // Filter to selected files if specified
  const filesToSync = selectedFiles
    ? sourceFiles.filter((file) => {
        const fileName = basename(file);
        const fileNameWithoutExt = basename(file, '.md');
        return (
          selectedFiles.has(fileName) ||
          selectedFiles.has(fileNameWithoutExt) ||
          selectedFiles.has(relative(sourceDir, file))
        );
      })
    : sourceFiles;

  // Handle single-md IDEs (like Claude Code) differently
  const singleMdFileName = SINGLE_MD_IDES[ide];
  if (singleMdFileName) {
    // Read all files into a map
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

    // Concatenate into single file
    const destContent = concatenateForSingleMd(filesMap, ide);
    const destPath = join(destDir, singleMdFileName);

    // Ensure destination directory exists
    if (!options.verify) {
      await mkdir(destDir, { recursive: true });
    }

    const destExists = existsSync(destPath);

    if (destExists) {
      const existingContent = await readFile(destPath, 'utf-8');
      if (existingContent === destContent) {
        stats.skipped++;
        operations.push({
          type: 'skip',
          dest: destPath,
          message: 'File is identical, skipping',
        });
      } else {
        if (options.verify) {
          stats.updated++;
          operations.push({
            type: 'update',
            dest: destPath,
            message: 'Would update file',
          });
        } else {
          if (options.backup) {
            await createBackup(destPath);
            await cleanupBackups(destPath);
          }
          await writeFile(destPath, destContent, 'utf-8');
          stats.updated++;
          operations.push({
            type: 'update',
            dest: destPath,
            message: 'File updated',
          });
        }
      }
    } else {
      if (options.verify) {
        stats.added++;
        operations.push({
          type: 'add',
          dest: destPath,
          message: 'Would add file',
        });
      } else {
        await writeFile(destPath, destContent, 'utf-8');
        stats.added++;
        operations.push({
          type: 'add',
          dest: destPath,
          message: 'File added',
        });
      }
    }

    return { stats, operations };
  }

  // Track which files we've synced
  const syncedFiles = new Set<string>();

  // Copy/update files (for multi-file IDEs like Cursor, VSCode, etc.)
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

      // Ensure destination directory exists
      if (!options.verify) {
        await mkdir(dirname(destPath), { recursive: true });
      }

      const sourceContent = await readFile(sourceFile, 'utf-8');
      const destContent =
        ide === 'cursor' ? convertToMdc(sourceContent, sourceFile) : sourceContent;

      const destExists = existsSync(destPath);

      if (destExists) {
        // Check if file needs updating
        const destFileContent = await readFile(destPath, 'utf-8');
        if (destFileContent === destContent) {
          stats.skipped++;
          operations.push({
            type: 'skip',
            source: sourceFile,
            dest: destPath,
            message: 'File is identical, skipping',
          });
          continue;
        }

        if (options.verify) {
          stats.updated++;
          operations.push({
            type: 'update',
            source: sourceFile,
            dest: destPath,
            message: 'Would update file',
          });
        } else {
          // Create backup if requested
          if (options.backup) {
            await createBackup(destPath);
            await cleanupBackups(destPath);
          }

          await writeFile(destPath, destContent, 'utf-8');
          stats.updated++;
          operations.push({
            type: 'update',
            source: sourceFile,
            dest: destPath,
            message: 'File updated',
          });
        }
      } else {
        if (options.verify) {
          stats.added++;
          operations.push({
            type: 'add',
            source: sourceFile,
            dest: destPath,
            message: 'Would add file',
          });
        } else {
          await writeFile(destPath, destContent, 'utf-8');
          stats.added++;
          operations.push({
            type: 'add',
            source: sourceFile,
            dest: destPath,
            message: 'File added',
          });
        }
      }
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

  // Find all files in destination directory (both .md and .mdc)
  async function findAllFiles(dir: string, baseDir: string = dir): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await findAllFiles(fullPath, baseDir);
          files.push(...subFiles);
        } else if (
          entry.isFile() &&
          (extname(entry.name) === '.md' || extname(entry.name) === '.mdc')
        ) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  // Full sync: delete orphaned files
  if (!selectedFiles) {
    try {
      if (!existsSync(destDir)) {
        // Destination doesn't exist yet, nothing to delete
        return { stats, operations };
      }

      const allDestFiles = await findAllFiles(destDir, destDir);

      for (const destFile of allDestFiles) {
        if (!syncedFiles.has(destFile)) {
          // Check if this file corresponds to a source file
          const destRelative = relative(destDir, destFile);
          // Convert .mdc back to .md for comparison
          const sourceRelative = destRelative.replace(/\.mdc$/, '.md');
          const sourceEquivalent = join(sourceDir, sourceRelative);

          if (!existsSync(sourceEquivalent)) {
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
        }
      }
    } catch (error) {
      // Destination directory might not exist yet, which is fine
      if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
        stats.errors++;
        operations.push({
          type: 'error',
          message: `Error checking for orphaned files: ${error.message}`,
        });
      }
    }
  }

  return { stats, operations };
}

/**
 * Extract content from .mdc file, stripping frontmatter
 */
export function extractContentFromMdc(content: string): string {
  // Check if content has frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (frontmatterMatch && frontmatterMatch[2]) {
    return frontmatterMatch[2].trim();
  }
  return content.trim();
}

/**
 * Get Cursor database path based on platform
 */
export function getCursorDatabasePath(): string {
  const homeDir = getUserHomeDir();

  if (platform() === 'darwin') {
    return join(
      homeDir,
      'Library',
      'Application Support',
      'Cursor',
      'User',
      'globalStorage',
      'state.vscdb'
    );
  } else if (platform() === 'win32') {
    const appData = process.env.APPDATA || join(homeDir, 'AppData', 'Roaming');
    return join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  } else {
    // Linux
    return join(homeDir, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
}

/**
 * Update Cursor's internal user rules from .mdc files
 * WARNING: This directly modifies Cursor's internal database. Use with caution.
 * Cursor must be closed when running this function.
 */
export async function syncToCursorInternalDatabase(
  rulesDir: string,
  options: { backup?: boolean } = {}
): Promise<{ success: boolean; message: string }> {
  try {
    // Read all .mdc files from rules directory FIRST (before checking Cursor database)
    // This allows proper error handling for directory issues
    const mdcFiles: string[] = [];
    try {
      const entries = await readdir(rulesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && extname(entry.name) === '.mdc') {
          mdcFiles.push(join(rulesDir, entry.name));
        }
      }
    } catch (error) {
      // Directory might not exist - return error immediately
      return {
        success: false,
        message: `Cannot read directory ${rulesDir}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (mdcFiles.length === 0) {
      return {
        success: false,
        message: `No .mdc files found in ${rulesDir}`,
      };
    }

    // Now check Cursor database path (only after directory validation)
    const dbPath = getCursorDatabasePath();

    if (!existsSync(dbPath)) {
      return {
        success: false,
        message: `Cursor database not found at ${dbPath}. Make sure Cursor is installed.`,
      };
    }

    // Check if Cursor is running (basic check - database might be locked)
    // We'll let the database operations fail if it's locked

    if (mdcFiles.length === 0) {
      return {
        success: false,
        message: `No .mdc files found in ${rulesDir}`,
      };
    }

    // Extract content from each file
    const rulesContents: string[] = [];
    for (const filePath of mdcFiles) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const extractedContent = extractContentFromMdc(content);
        if (extractedContent) {
          rulesContents.push(extractedContent);
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    if (rulesContents.length === 0) {
      return {
        success: false,
        message: 'No valid content found in .mdc files',
      };
    }

    // Combine all rules into a single text
    const combinedRules = rulesContents.join('\n\n---\n\n');

    // Backup database if requested
    if (options.backup) {
      const backupPath = `${dbPath}.backup.${Date.now()}`;
      copyFileSync(dbPath, backupPath);
    }

    // Open database and update
    const db = new Database(dbPath);

    try {
      // Update or insert the user rules
      db.prepare(
        `INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('aicontext.personalContext', ?)`
      ).run(combinedRules);

      db.close();

      return {
        success: true,
        message: `Successfully updated Cursor user rules with ${rulesContents.length} rule(s). Restart Cursor to see changes.`,
      };
    } catch (dbError) {
      db.close();
      throw dbError;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to update Cursor database: ${errorMsg}. Make sure Cursor is closed.`,
    };
  }
}

// =============================================================================
// CRITICAL GUIDELINES SYNC
// =============================================================================

import { getCriticalGuidelinesForScope } from './critical-guidelines.service.js';

export interface CriticalGuidelinesSyncOptions {
  projectId?: string;
  sessionId?: string;
  backup?: boolean;
  verify?: boolean;
}

export interface CriticalGuidelinesSyncResult {
  success: boolean;
  filesWritten: string[];
  errors: string[];
  message: string;
}

/**
 * Generate markdown content for critical guidelines
 */
export function generateCriticalGuidelinesMarkdown(
  projectId: string | null,
  sessionId?: string | null
): string {
  const guidelines = getCriticalGuidelinesForScope(projectId, sessionId);

  if (guidelines.length === 0) {
    return `# Critical Guidelines (Auto-synced from Agent Memory)

> No critical guidelines found. Guidelines with priority >= 90 will appear here.

---
> Last synced: ${new Date().toISOString()}
`;
  }

  let content = `# Critical Guidelines (Auto-synced from Agent Memory)

## MUST FOLLOW - Priority 90+

These guidelines are critical and must be followed in all interactions.
Before making file modifications, call \`memory_verify pre_check\` to verify compliance.

`;

  for (const guideline of guidelines) {
    content += `### ${guideline.name} (Priority: ${guideline.priority})\n\n`;
    content += `${guideline.content}\n\n`;

    if (guideline.rationale) {
      content += `**Rationale:** ${guideline.rationale}\n\n`;
    }

    if (guideline.examples) {
      if (guideline.examples.bad && guideline.examples.bad.length > 0) {
        content += `**Bad examples:**\n`;
        for (const bad of guideline.examples.bad) {
          content += `- \`${bad}\`\n`;
        }
        content += '\n';
      }

      if (guideline.examples.good && guideline.examples.good.length > 0) {
        content += `**Good examples:**\n`;
        for (const good of guideline.examples.good) {
          content += `- \`${good}\`\n`;
        }
        content += '\n';
      }
    }

    content += '---\n\n';
  }

  content += `> Last synced: ${new Date().toISOString()}\n`;
  content += `> Total critical guidelines: ${guidelines.length}\n`;
  content += `> Source: Agent Memory Database\n`;

  return content;
}

/**
 * Sync critical guidelines to Cursor rules directory
 */
export async function syncCriticalGuidelinesToCursor(
  projectPath: string,
  options: CriticalGuidelinesSyncOptions = {}
): Promise<CriticalGuidelinesSyncResult> {
  const filesWritten: string[] = [];
  const errors: string[] = [];

  try {
    const destDir = join(projectPath, '.cursor', 'rules');
    const destFile = join(destDir, 'critical-guidelines.md');

    // Generate content
    const content = generateCriticalGuidelinesMarkdown(
      options.projectId ?? null,
      options.sessionId
    );

    if (options.verify) {
      return {
        success: true,
        filesWritten: [destFile],
        errors: [],
        message: `Would write critical guidelines to ${destFile}`,
      };
    }

    // Create directory if it doesn't exist
    if (!existsSync(destDir)) {
      await mkdir(destDir, { recursive: true });
    }

    // Backup existing file if requested
    if (options.backup && existsSync(destFile)) {
      const backupFile = `${destFile}.backup.${Date.now()}`;
      copyFileSync(destFile, backupFile);
    }

    // Write the file
    await writeFile(destFile, content, 'utf-8');
    filesWritten.push(destFile);

    return {
      success: true,
      filesWritten,
      errors,
      message: `Successfully synced critical guidelines to ${destFile}`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);
    return {
      success: false,
      filesWritten,
      errors,
      message: `Failed to sync critical guidelines: ${errorMsg}`,
    };
  }
}

/**
 * Sync critical guidelines to Claude Code CLAUDE.md file
 */
export async function syncCriticalGuidelinesToClaude(
  projectPath: string,
  options: CriticalGuidelinesSyncOptions = {}
): Promise<CriticalGuidelinesSyncResult> {
  const filesWritten: string[] = [];
  const errors: string[] = [];

  try {
    const destDir = join(projectPath, '.claude');
    const destFile = join(destDir, 'critical-guidelines.md');

    // Generate content
    const content = generateCriticalGuidelinesMarkdown(
      options.projectId ?? null,
      options.sessionId
    );

    if (options.verify) {
      return {
        success: true,
        filesWritten: [destFile],
        errors: [],
        message: `Would write critical guidelines to ${destFile}`,
      };
    }

    // Create directory if it doesn't exist
    if (!existsSync(destDir)) {
      await mkdir(destDir, { recursive: true });
    }

    // Backup existing file if requested
    if (options.backup && existsSync(destFile)) {
      const backupFile = `${destFile}.backup.${Date.now()}`;
      copyFileSync(destFile, backupFile);
    }

    // Write the file
    await writeFile(destFile, content, 'utf-8');
    filesWritten.push(destFile);

    return {
      success: true,
      filesWritten,
      errors,
      message: `Successfully synced critical guidelines to ${destFile}`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);
    return {
      success: false,
      filesWritten,
      errors,
      message: `Failed to sync critical guidelines: ${errorMsg}`,
    };
  }
}

/**
 * Sync critical guidelines to any supported IDE
 */
export async function syncCriticalGuidelines(
  projectPath: string,
  ide: string,
  options: CriticalGuidelinesSyncOptions = {}
): Promise<CriticalGuidelinesSyncResult> {
  switch (ide.toLowerCase()) {
    case 'cursor':
      return syncCriticalGuidelinesToCursor(projectPath, options);
    case 'claude':
      return syncCriticalGuidelinesToClaude(projectPath, options);
    case 'vscode': {
      // VSCode uses similar structure to Cursor
      const filesWritten: string[] = [];
      const errors: string[] = [];

      try {
        const destDir = join(projectPath, '.vscode');
        const destFile = join(destDir, 'critical-guidelines.md');

        const content = generateCriticalGuidelinesMarkdown(
          options.projectId ?? null,
          options.sessionId
        );

        if (options.verify) {
          return {
            success: true,
            filesWritten: [destFile],
            errors: [],
            message: `Would write critical guidelines to ${destFile}`,
          };
        }

        if (!existsSync(destDir)) {
          await mkdir(destDir, { recursive: true });
        }

        if (options.backup && existsSync(destFile)) {
          const backupFile = `${destFile}.backup.${Date.now()}`;
          copyFileSync(destFile, backupFile);
        }

        await writeFile(destFile, content, 'utf-8');
        filesWritten.push(destFile);

        return {
          success: true,
          filesWritten,
          errors,
          message: `Successfully synced critical guidelines to ${destFile}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(errorMsg);
        return {
          success: false,
          filesWritten,
          errors,
          message: `Failed to sync critical guidelines: ${errorMsg}`,
        };
      }
    }
    default:
      return {
        success: false,
        filesWritten: [],
        errors: [`Unsupported IDE: ${ide}`],
        message: `Unsupported IDE: ${ide}. Supported: cursor, claude, vscode`,
      };
  }
}
