/**
 * Unit tests for File Sync Service
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import {
  loadIgnorePatterns,
  shouldIgnore,
  findMarkdownFiles,
  convertToMdc,
  getDestinationPath,
  createBackup,
  cleanupBackups,
  syncForIDE,
  getUserHomeDir,
  resolveUserRulesDir,
  extractContentFromMdc,
  getCursorDatabasePath,
  IDE_DESTINATIONS,
  USER_DESTINATIONS,
} from '../../src/services/file-sync.service.js';

const TEST_SOURCE_DIR = './data/test-file-sync/rules';
const TEST_OUTPUT_DIR = './data/test-file-sync/output';
const TEST_PROJECT_ROOT = './data/test-file-sync';

function cleanupTestDirs() {
  if (existsSync('./data/test-file-sync')) {
    rmSync('./data/test-file-sync', { recursive: true, force: true });
  }
}

describe('File Sync Service', () => {
  beforeAll(() => {
    cleanupTestDirs();

    // Create test directories
    mkdirSync(TEST_SOURCE_DIR, { recursive: true });
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    cleanupTestDirs();
  });

  describe('loadIgnorePatterns', () => {
    it('should load patterns from .rulesignore file', () => {
      const ignoreFile = join(TEST_PROJECT_ROOT, '.rulesignore');
      writeFileSync(ignoreFile, 'test-file.md\n*.tmp\n# comment\n\nignored.md', 'utf-8');

      const patterns = loadIgnorePatterns(TEST_PROJECT_ROOT);

      expect(patterns).toContain('test-file.md');
      expect(patterns).toContain('*.tmp');
      expect(patterns).toContain('ignored.md');
      expect(patterns).not.toContain('# comment');
      expect(patterns).not.toContain('');

      // Cleanup
      rmSync(ignoreFile);
    });

    it('should load patterns from rules/.rulesignore file', () => {
      const ignoreFile = join(TEST_PROJECT_ROOT, 'rules', '.rulesignore');
      mkdirSync(dirname(ignoreFile), { recursive: true });
      writeFileSync(ignoreFile, 'rules-ignore.md', 'utf-8');

      const patterns = loadIgnorePatterns(TEST_PROJECT_ROOT);

      expect(patterns).toContain('rules-ignore.md');

      // Cleanup
      rmSync(ignoreFile);
      if (existsSync(join(TEST_PROJECT_ROOT, 'rules'))) {
        try {
          rmSync(join(TEST_PROJECT_ROOT, 'rules'), { recursive: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('should use default patterns if no ignore file found', () => {
      const patterns = loadIgnorePatterns('./nonexistent-directory');

      expect(patterns).toEqual(['README.md', '*.tmp', '*.bak']);
    });

    it('should filter out comments and empty lines', () => {
      const ignoreFile = join(TEST_PROJECT_ROOT, '.rulesignore');
      writeFileSync(
        ignoreFile,
        '# This is a comment\n\npattern1.md\n# Another comment\npattern2.md\n',
        'utf-8'
      );

      const patterns = loadIgnorePatterns(TEST_PROJECT_ROOT);

      expect(patterns).toContain('pattern1.md');
      expect(patterns).toContain('pattern2.md');
      expect(patterns).not.toContain('# This is a comment');
      expect(patterns).not.toContain('# Another comment');
      expect(patterns.every((p) => p.length > 0)).toBe(true);

      // Cleanup
      rmSync(ignoreFile);
    });
  });

  describe('shouldIgnore', () => {
    it('should match exact filenames', () => {
      const patterns = ['README.md', 'test.md'];
      expect(shouldIgnore('/path/to/rules/README.md', patterns)).toBe(true);
      expect(shouldIgnore('/path/to/rules/test.md', patterns)).toBe(true);
      expect(shouldIgnore('/path/to/rules/other.md', patterns)).toBe(false);
    });

    it('should match glob patterns with *', () => {
      const patterns = ['*.tmp', 'test-*.md'];
      expect(shouldIgnore('/path/to/rules/file.tmp', patterns)).toBe(true);
      expect(shouldIgnore('/path/to/rules/test-123.md', patterns)).toBe(true);
      expect(shouldIgnore('/path/to/rules/other-123.md', patterns)).toBe(false);
    });

    it('should match relative paths', () => {
      const patterns = ['subdir/*.md'];
      expect(shouldIgnore('/path/to/rules/subdir/file.md', patterns)).toBe(true);
    });

    it('should handle special regex characters in patterns', () => {
      const patterns = ['file.extension', 'file*.md'];
      expect(shouldIgnore('/path/to/rules/file.extension', patterns)).toBe(true);
      expect(shouldIgnore('/path/to/rules/file123.md', patterns)).toBe(true);
    });

    it('should return false if no patterns match', () => {
      const patterns = ['*.tmp'];
      expect(shouldIgnore('/path/to/rules/test.md', patterns)).toBe(false);
    });
  });

  describe('findMarkdownFiles', () => {
    it('should find all .md files recursively', async () => {
      // Ensure directory exists
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      // Create test files
      writeFileSync(join(TEST_SOURCE_DIR, 'file1.md'), '# File 1', 'utf-8');
      writeFileSync(join(TEST_SOURCE_DIR, 'file2.md'), '# File 2', 'utf-8');
      const subDir = join(TEST_SOURCE_DIR, 'subdir');
      mkdirSync(subDir, { recursive: true });
      writeFileSync(join(subDir, 'file3.md'), '# File 3', 'utf-8');

      const files = await findMarkdownFiles(TEST_SOURCE_DIR, []);

      expect(files.length).toBeGreaterThanOrEqual(3);
      expect(files.some((f) => f.includes('file1.md'))).toBe(true);
      expect(files.some((f) => f.includes('file2.md'))).toBe(true);
      expect(files.some((f) => f.includes('file3.md'))).toBe(true);

      // Cleanup
      rmSync(join(TEST_SOURCE_DIR, 'file1.md'));
      rmSync(join(TEST_SOURCE_DIR, 'file2.md'));
      rmSync(subDir, { recursive: true });
    });

    it('should respect ignore patterns', async () => {
      // Ensure directory exists
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      // Create test files
      writeFileSync(join(TEST_SOURCE_DIR, 'keep.md'), '# Keep', 'utf-8');
      writeFileSync(join(TEST_SOURCE_DIR, 'README.md'), '# Readme', 'utf-8');
      writeFileSync(join(TEST_SOURCE_DIR, 'test.tmp'), 'temp', 'utf-8');

      const patterns = ['README.md', '*.tmp'];
      const files = await findMarkdownFiles(TEST_SOURCE_DIR, patterns);

      expect(files.some((f) => f.includes('keep.md'))).toBe(true);
      expect(files.some((f) => f.includes('README.md'))).toBe(false);

      // Cleanup
      rmSync(join(TEST_SOURCE_DIR, 'keep.md'));
      rmSync(join(TEST_SOURCE_DIR, 'README.md'));
      rmSync(join(TEST_SOURCE_DIR, 'test.tmp'));
    });

    it('should handle subdirectories', async () => {
      const subDir1 = join(TEST_SOURCE_DIR, 'subdir1');
      const subDir2 = join(TEST_SOURCE_DIR, 'subdir2', 'nested');
      mkdirSync(subDir1, { recursive: true });
      mkdirSync(subDir2, { recursive: true });

      writeFileSync(join(subDir1, 'file1.md'), '# File 1', 'utf-8');
      writeFileSync(join(subDir2, 'file2.md'), '# File 2', 'utf-8');

      const files = await findMarkdownFiles(TEST_SOURCE_DIR, []);

      expect(files.some((f) => f.includes('subdir1/file1.md'))).toBe(true);
      expect(files.some((f) => f.includes('file2.md'))).toBe(true);

      // Cleanup
      rmSync(subDir1, { recursive: true });
      rmSync(join(TEST_SOURCE_DIR, 'subdir2'), { recursive: true });
    });

    it('should handle empty directories', async () => {
      // Ensure parent directory exists
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const emptyDir = join(TEST_SOURCE_DIR, 'empty');
      mkdirSync(emptyDir, { recursive: true });

      const files = await findMarkdownFiles(emptyDir, []);

      expect(files).toEqual([]);

      // Cleanup
      rmSync(emptyDir, { recursive: true, force: true });
    });

    it('should ignore non-.md files', async () => {
      // Ensure directory exists
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      writeFileSync(join(TEST_SOURCE_DIR, 'file.txt'), 'text', 'utf-8');
      writeFileSync(join(TEST_SOURCE_DIR, 'file.js'), 'javascript', 'utf-8');
      writeFileSync(join(TEST_SOURCE_DIR, 'file.md'), '# markdown', 'utf-8');

      const files = await findMarkdownFiles(TEST_SOURCE_DIR, []);

      expect(files.length).toBe(1);
      expect(files[0]).toContain('file.md');

      // Cleanup
      rmSync(join(TEST_SOURCE_DIR, 'file.txt'));
      rmSync(join(TEST_SOURCE_DIR, 'file.js'));
      rmSync(join(TEST_SOURCE_DIR, 'file.md'));
    });
  });

  describe('convertToMdc', () => {
    it('should add frontmatter if missing', () => {
      const content = '# Test Rule\n\nThis is a test.';
      const sourcePath = '/path/to/test-rule.md';
      const result = convertToMdc(content, sourcePath);

      expect(result).toContain('---');
      expect(result).toContain('description: test rule');
      expect(result).toContain('# Test Rule');
    });

    it('should preserve existing frontmatter', () => {
      const content = `---
description: Existing description
globs: ["**/*.ts"]
---

# Test Rule

Content here.`;

      const result = convertToMdc(content, '/path/to/test.md');

      expect(result).toBe(content);
      expect(result).toContain('Existing description');
      expect(result).toContain('globs');
    });

    it('should convert filename with dashes to description', () => {
      const content = '# Test';
      const result = convertToMdc(content, '/path/to/my-test-rule.md');

      expect(result).toContain('description: my test rule');
    });

    it('should convert filename with underscores to description', () => {
      const content = '# Test';
      const result = convertToMdc(content, '/path/to/my_test_rule.md');

      expect(result).toContain('description: my test rule');
    });
  });

  describe('getDestinationPath', () => {
    it('should convert .md to .mdc for cursor', () => {
      const sourcePath = join(TEST_SOURCE_DIR, 'test.md');
      const result = getDestinationPath(sourcePath, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);

      expect(result).toContain('.mdc');
      expect(result).toContain('test.mdc');
      expect(result).toContain('.cursor/rules');
    });

    it('should keep .md extension for other IDEs', () => {
      const sourcePath = join(TEST_SOURCE_DIR, 'test.md');
      const result = getDestinationPath(sourcePath, TEST_SOURCE_DIR, 'vscode', TEST_OUTPUT_DIR);

      expect(result).toContain('.md');
      expect(result).toContain('test.md');
      expect(result).toContain('.vscode/rules');
    });

    it('should preserve subdirectory structure', () => {
      const sourcePath = join(TEST_SOURCE_DIR, 'subdir', 'test.md');
      const result = getDestinationPath(sourcePath, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);

      expect(result).toContain('subdir');
      expect(result).toContain('test.mdc');
    });

    it('should use correct IDE destination directory', () => {
      const sourcePath = join(TEST_SOURCE_DIR, 'test.md');

      const cursorPath = getDestinationPath(sourcePath, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);
      expect(cursorPath).toContain(IDE_DESTINATIONS.cursor);

      const vscodePath = getDestinationPath(sourcePath, TEST_SOURCE_DIR, 'vscode', TEST_OUTPUT_DIR);
      expect(vscodePath).toContain(IDE_DESTINATIONS.vscode);
    });
  });

  describe('createBackup and cleanupBackups', () => {
    it('should create backup file with timestamp', async () => {
      const testFile = join(TEST_OUTPUT_DIR, 'test-backup.md');
      writeFileSync(testFile, 'original content', 'utf-8');

      const backupPath = await createBackup(testFile);

      expect(existsSync(backupPath)).toBe(true);
      expect(backupPath).toContain('.backup.');
      expect(backupPath).toMatch(/\.backup\.\d+$/);
      expect(readFileSync(backupPath, 'utf-8')).toBe('original content');

      // Cleanup
      rmSync(backupPath);
      rmSync(testFile);
    });

    it('should cleanup old backups keeping only N most recent', async () => {
      const testFile = join(TEST_OUTPUT_DIR, 'test-cleanup.md');
      writeFileSync(testFile, 'content', 'utf-8');

      // Create multiple backups
      const backup1 = await createBackup(testFile);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
      const backup2 = await createBackup(testFile);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const backup3 = await createBackup(testFile);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const backup4 = await createBackup(testFile);

      expect(existsSync(backup1)).toBe(true);
      expect(existsSync(backup2)).toBe(true);
      expect(existsSync(backup3)).toBe(true);
      expect(existsSync(backup4)).toBe(true);

      // Cleanup keeping only 3
      await cleanupBackups(testFile, 3);

      // Should keep 3 most recent (backup2, backup3, backup4)
      expect(existsSync(backup1)).toBe(false);
      expect(existsSync(backup2)).toBe(true);
      expect(existsSync(backup3)).toBe(true);
      expect(existsSync(backup4)).toBe(true);

      // Cleanup
      rmSync(backup2);
      rmSync(backup3);
      rmSync(backup4);
      rmSync(testFile);
    });

    it('should handle cleanup when no backups exist', async () => {
      const testFile = join(TEST_OUTPUT_DIR, 'no-backups.md');
      writeFileSync(testFile, 'content', 'utf-8');

      // Should not throw
      await expect(cleanupBackups(testFile, 3)).resolves.not.toThrow();

      // Cleanup
      rmSync(testFile);
    });
  });

  describe('syncForIDE', () => {
    it('should copy .md files to .mdc format for cursor', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const sourceFile = join(TEST_SOURCE_DIR, 'test-rule.md');
      writeFileSync(sourceFile, '# Test Rule\n\nContent', 'utf-8');

      const result = await syncForIDE('cursor', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);

      expect(result.stats.added).toBe(1);
      expect(result.stats.errors).toBe(0);

      const destPath = getDestinationPath(sourceFile, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);
      expect(existsSync(destPath)).toBe(true);
      const content = readFileSync(destPath, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('description: test rule');

      // Cleanup
      rmSync(sourceFile);
      rmSync(destPath);
    });

    it('should copy .md files as-is for other IDEs', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const sourceFile = join(TEST_SOURCE_DIR, 'test-rule.md');
      const originalContent = '# Test Rule\n\nContent';
      writeFileSync(sourceFile, originalContent, 'utf-8');

      const result = await syncForIDE('vscode', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);

      expect(result.stats.added).toBe(1);

      const destPath = getDestinationPath(sourceFile, TEST_SOURCE_DIR, 'vscode', TEST_OUTPUT_DIR);
      expect(existsSync(destPath)).toBe(true);
      const content = readFileSync(destPath, 'utf-8');
      expect(content).toBe(originalContent);
      expect(content).not.toContain('---');

      // Cleanup
      rmSync(sourceFile);
      rmSync(destPath);
    });

    it('should skip identical files', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const sourceFile = join(TEST_SOURCE_DIR, 'test-rule.md');
      writeFileSync(sourceFile, '# Test Rule', 'utf-8');

      // First sync
      const result1 = await syncForIDE('cursor', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);
      expect(result1.stats.added).toBe(1);

      // Second sync (should skip)
      const result2 = await syncForIDE('cursor', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);
      expect(result2.stats.skipped).toBe(1);
      expect(result2.stats.updated).toBe(0);

      // Cleanup
      rmSync(sourceFile);
      const destPath = getDestinationPath(sourceFile, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);
      if (existsSync(destPath)) {
        rmSync(destPath);
      }
    });

    it('should update changed files', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const sourceFile = join(TEST_SOURCE_DIR, 'test-rule.md');
      writeFileSync(sourceFile, '# Test Rule v1', 'utf-8');

      // First sync
      await syncForIDE('cursor', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);

      // Update source
      writeFileSync(sourceFile, '# Test Rule v2', 'utf-8');

      // Second sync (should update)
      const result = await syncForIDE('cursor', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);
      expect(result.stats.updated).toBe(1);

      const destPath = getDestinationPath(sourceFile, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);
      const content = readFileSync(destPath, 'utf-8');
      expect(content).toContain('v2');

      // Cleanup
      rmSync(sourceFile);
      rmSync(destPath);
    });

    it('should delete orphaned files in full sync', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const sourceFile = join(TEST_SOURCE_DIR, 'test-rule.md');
      writeFileSync(sourceFile, '# Test Rule', 'utf-8');

      // First sync
      await syncForIDE('cursor', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);

      // Delete source file
      rmSync(sourceFile);

      // Second sync (should delete orphaned destination)
      const result = await syncForIDE('cursor', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);
      expect(result.stats.deleted).toBe(1);

      const destPath = getDestinationPath(sourceFile, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);
      expect(existsSync(destPath)).toBe(false);
    });

    it('should create backups when requested', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const sourceFile = join(TEST_SOURCE_DIR, 'test-rule.md');
      writeFileSync(sourceFile, '# Test Rule v1', 'utf-8');

      // First sync
      await syncForIDE('cursor', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);

      // Update source with backup
      writeFileSync(sourceFile, '# Test Rule v2', 'utf-8');
      const destPath = getDestinationPath(sourceFile, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);

      const result = await syncForIDE(
        'cursor',
        TEST_SOURCE_DIR,
        TEST_OUTPUT_DIR,
        { backup: true },
        []
      );

      expect(result.stats.updated).toBe(1);

      // Check backup exists
      const destDir = dirname(destPath);
      const files = readdirSync(destDir);
      const backupFiles = files.filter((f) => f.startsWith('test-rule.mdc.backup.'));
      expect(backupFiles.length).toBeGreaterThan(0);

      // Cleanup
      rmSync(sourceFile);
      rmSync(destPath);
      for (const backup of backupFiles) {
        rmSync(join(destDir, backup));
      }
    });

    it('should verify without modifying in verify mode', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const sourceFile = join(TEST_SOURCE_DIR, 'test-rule.md');
      writeFileSync(sourceFile, '# Test Rule', 'utf-8');

      const result = await syncForIDE(
        'cursor',
        TEST_SOURCE_DIR,
        TEST_OUTPUT_DIR,
        { verify: true },
        []
      );

      expect(result.stats.added).toBe(1);
      expect(result.operations[0].message).toContain('Would add');

      // File should not exist (verify mode)
      const destPath = getDestinationPath(sourceFile, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);
      expect(existsSync(destPath)).toBe(false);

      // Cleanup
      rmSync(sourceFile);
    });

    it('should sync only selected files', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      writeFileSync(join(TEST_SOURCE_DIR, 'file1.md'), '# File 1', 'utf-8');
      writeFileSync(join(TEST_SOURCE_DIR, 'file2.md'), '# File 2', 'utf-8');
      writeFileSync(join(TEST_SOURCE_DIR, 'file3.md'), '# File 3', 'utf-8');

      const selectedFiles = new Set(['file1.md', 'file2.md']);

      const result = await syncForIDE(
        'cursor',
        TEST_SOURCE_DIR,
        TEST_OUTPUT_DIR,
        {},
        [],
        selectedFiles
      );

      expect(result.stats.added).toBe(2);

      const dest1 = getDestinationPath(
        join(TEST_SOURCE_DIR, 'file1.md'),
        TEST_SOURCE_DIR,
        'cursor',
        TEST_OUTPUT_DIR
      );
      const dest2 = getDestinationPath(
        join(TEST_SOURCE_DIR, 'file2.md'),
        TEST_SOURCE_DIR,
        'cursor',
        TEST_OUTPUT_DIR
      );
      const dest3 = getDestinationPath(
        join(TEST_SOURCE_DIR, 'file3.md'),
        TEST_SOURCE_DIR,
        'cursor',
        TEST_OUTPUT_DIR
      );

      expect(existsSync(dest1)).toBe(true);
      expect(existsSync(dest2)).toBe(true);
      expect(existsSync(dest3)).toBe(false);

      // Cleanup
      rmSync(join(TEST_SOURCE_DIR, 'file1.md'));
      rmSync(join(TEST_SOURCE_DIR, 'file2.md'));
      rmSync(join(TEST_SOURCE_DIR, 'file3.md'));
      if (existsSync(dest1)) rmSync(dest1);
      if (existsSync(dest2)) rmSync(dest2);
    });

    it('should preserve subdirectory structure', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const subDir = join(TEST_SOURCE_DIR, 'subdir');
      mkdirSync(subDir, { recursive: true });
      const sourceFile = join(subDir, 'test.md');
      writeFileSync(sourceFile, '# Test', 'utf-8');

      const result = await syncForIDE('cursor', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);

      expect(result.stats.added).toBe(1);

      const destPath = getDestinationPath(sourceFile, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);
      expect(existsSync(destPath)).toBe(true);
      expect(destPath).toContain('subdir');

      // Cleanup
      rmSync(subDir, { recursive: true });
      rmSync(destPath);
    });

    it('should respect ignore patterns', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      writeFileSync(join(TEST_SOURCE_DIR, 'keep.md'), '# Keep', 'utf-8');
      writeFileSync(join(TEST_SOURCE_DIR, 'ignore.md'), '# Ignore', 'utf-8');

      const ignorePatterns = ['ignore.md'];

      const result = await syncForIDE(
        'cursor',
        TEST_SOURCE_DIR,
        TEST_OUTPUT_DIR,
        {},
        ignorePatterns
      );

      expect(result.stats.added).toBe(1);

      const destKeep = getDestinationPath(
        join(TEST_SOURCE_DIR, 'keep.md'),
        TEST_SOURCE_DIR,
        'cursor',
        TEST_OUTPUT_DIR
      );
      const destIgnore = getDestinationPath(
        join(TEST_SOURCE_DIR, 'ignore.md'),
        TEST_SOURCE_DIR,
        'cursor',
        TEST_OUTPUT_DIR
      );

      expect(existsSync(destKeep)).toBe(true);
      expect(existsSync(destIgnore)).toBe(false);

      // Cleanup
      rmSync(join(TEST_SOURCE_DIR, 'keep.md'));
      rmSync(join(TEST_SOURCE_DIR, 'ignore.md'));
      if (existsSync(destKeep)) rmSync(destKeep);
    });

    it('should not delete files when using selective sync', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const sourceFile = join(TEST_SOURCE_DIR, 'test-rule.md');
      writeFileSync(sourceFile, '# Test Rule', 'utf-8');

      // First sync all files
      await syncForIDE('cursor', TEST_SOURCE_DIR, TEST_OUTPUT_DIR, {}, []);

      // Create another file that will be synced later
      const sourceFile2 = join(TEST_SOURCE_DIR, 'test-rule2.md');
      writeFileSync(sourceFile2, '# Test Rule 2', 'utf-8');

      // Selective sync - should not delete the first file
      const selectedFiles = new Set(['test-rule2.md']);
      const result = await syncForIDE(
        'cursor',
        TEST_SOURCE_DIR,
        TEST_OUTPUT_DIR,
        {},
        [],
        selectedFiles
      );

      expect(result.stats.added).toBe(1);
      expect(result.stats.deleted).toBe(0);

      const dest1 = getDestinationPath(sourceFile, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);
      const dest2 = getDestinationPath(sourceFile2, TEST_SOURCE_DIR, 'cursor', TEST_OUTPUT_DIR);

      // Both should exist
      expect(existsSync(dest1)).toBe(true);
      expect(existsSync(dest2)).toBe(true);

      // Cleanup
      rmSync(sourceFile);
      rmSync(sourceFile2);
      if (existsSync(dest1)) rmSync(dest1);
      if (existsSync(dest2)) rmSync(dest2);
    });

    it('should handle errors gracefully', async () => {
      // Try to sync from non-existent directory - should handle gracefully
      const result = await syncForIDE('cursor', '/nonexistent/dir', TEST_OUTPUT_DIR, {}, []);

      // Should not throw, but may have errors
      expect(result).toBeDefined();
      expect(result.stats).toBeDefined();
    });
  });

  describe('getUserHomeDir', () => {
    it('should return user home directory', () => {
      const homeDir = getUserHomeDir();

      expect(homeDir).toBeTruthy();
      expect(typeof homeDir).toBe('string');
      expect(homeDir.length).toBeGreaterThan(0);
    });
  });

  describe('resolveUserRulesDir', () => {
    it('should resolve default user rules directory for cursor', () => {
      const userDir = resolveUserRulesDir('cursor');

      expect(userDir).toContain(getUserHomeDir());
      expect(userDir).toContain('.cursor/rules');
    });

    it('should resolve default user rules directory for vscode', () => {
      const userDir = resolveUserRulesDir('vscode');

      expect(userDir).toContain(getUserHomeDir());
      expect(userDir).toContain('.vscode/rules');
    });

    it('should resolve custom user directory when provided', () => {
      const customDir = '/custom/path';
      const userDir = resolveUserRulesDir('cursor', customDir);

      expect(userDir).toBe('/custom/path');
    });

    it('should throw error for unknown IDE', () => {
      expect(() => resolveUserRulesDir('unknown-ide')).toThrow('Unknown IDE');
    });
  });

  describe('getDestinationPath with userLevel', () => {
    it('should return user-level path when userLevel is true', () => {
      const sourcePath = join(TEST_SOURCE_DIR, 'test.md');
      const result = getDestinationPath(
        sourcePath,
        TEST_SOURCE_DIR,
        'cursor',
        TEST_OUTPUT_DIR,
        true
      );

      expect(result).toContain(getUserHomeDir());
      expect(result).toContain('.cursor/rules');
      expect(result).toContain('test.mdc');
      expect(result).not.toContain(TEST_OUTPUT_DIR);
    });

    it('should use custom user directory when provided', () => {
      const sourcePath = join(TEST_SOURCE_DIR, 'test.md');
      const customUserDir = '/custom/user/dir';
      const result = getDestinationPath(
        sourcePath,
        TEST_SOURCE_DIR,
        'cursor',
        TEST_OUTPUT_DIR,
        true,
        customUserDir
      );

      expect(result).toContain('/custom/user/dir');
      expect(result).toContain('test.mdc');
    });

    it('should return project-level path when userLevel is false', () => {
      const sourcePath = join(TEST_SOURCE_DIR, 'test.md');
      const result = getDestinationPath(
        sourcePath,
        TEST_SOURCE_DIR,
        'cursor',
        TEST_OUTPUT_DIR,
        false
      );

      // Resolve both for comparison (paths might be relative)
      const resolvedResult = resolve(result);
      const resolvedOutputDir = resolve(TEST_OUTPUT_DIR);
      expect(resolvedResult).toContain(resolvedOutputDir);
      expect(result).toContain('.cursor/rules');
      expect(result).not.toContain(getUserHomeDir());
    });
  });

  describe('syncForIDE with user-level', () => {
    it('should sync to user-level directory when userLevel is true', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const sourceFile = join(TEST_SOURCE_DIR, 'test-rule.md');
      writeFileSync(sourceFile, '# Test Rule\n\nContent', 'utf-8');

      // Calculate destination path and clean up any existing file from previous test runs
      const destPath = getDestinationPath(
        sourceFile,
        TEST_SOURCE_DIR,
        'cursor',
        TEST_OUTPUT_DIR,
        true
      );
      if (existsSync(destPath)) {
        rmSync(destPath);
      }

      const result = await syncForIDE(
        'cursor',
        TEST_SOURCE_DIR,
        TEST_OUTPUT_DIR,
        { userLevel: true },
        []
      );

      expect(result.stats.added).toBe(1);
      expect(result.stats.errors).toBe(0);

      expect(existsSync(destPath)).toBe(true);
      expect(destPath).toContain(getUserHomeDir());
      expect(destPath).toContain('.cursor/rules');

      // Cleanup
      rmSync(sourceFile);
      if (existsSync(destPath)) {
        rmSync(destPath);
      }
    });

    it('should sync to custom user directory when userDir is provided', async () => {
      mkdirSync(TEST_SOURCE_DIR, { recursive: true });
      const customUserDir = join(TEST_OUTPUT_DIR, 'custom-user');
      mkdirSync(customUserDir, { recursive: true });
      const sourceFile = join(TEST_SOURCE_DIR, 'test-rule.md');
      writeFileSync(sourceFile, '# Test Rule\n\nContent', 'utf-8');

      const result = await syncForIDE(
        'cursor',
        TEST_SOURCE_DIR,
        TEST_OUTPUT_DIR,
        { userLevel: true, userDir: customUserDir },
        []
      );

      expect(result.stats.added).toBe(1);

      const destPath = getDestinationPath(
        sourceFile,
        TEST_SOURCE_DIR,
        'cursor',
        TEST_OUTPUT_DIR,
        true,
        customUserDir
      );
      expect(existsSync(destPath)).toBe(true);
      expect(destPath).toContain(customUserDir);

      // Cleanup
      rmSync(sourceFile);
      if (existsSync(destPath)) {
        rmSync(destPath);
      }
      if (existsSync(customUserDir)) {
        rmSync(customUserDir, { recursive: true, force: true });
      }
    });
  });

  describe('extractContentFromMdc', () => {
    it('should extract content from .mdc file with frontmatter', () => {
      const content = `---
description: Test Rule
globs: ["**/*.ts"]
alwaysApply: true
---

# Test Rule

This is the actual content.
`;

      const extracted = extractContentFromMdc(content);

      expect(extracted).not.toContain('---');
      expect(extracted).not.toContain('description: Test Rule');
      expect(extracted).toContain('# Test Rule');
      expect(extracted).toContain('This is the actual content');
    });

    it('should return content as-is if no frontmatter', () => {
      const content = '# Test Rule\n\nNo frontmatter here.';

      const extracted = extractContentFromMdc(content);

      expect(extracted).toBe(content.trim());
    });
  });

  describe('getCursorDatabasePath', () => {
    it('should return correct path format', () => {
      const path = getCursorDatabasePath();

      expect(path).toContain('Cursor');
      expect(path).toContain('globalStorage');
      expect(path).toContain('state.vscdb');
      expect(typeof path).toBe('string');
      expect(path.length).toBeGreaterThan(0);
    });
  });

  describe('syncToCursorInternalDatabase', () => {
    it('should handle non-existent directory gracefully', async () => {
      const { syncToCursorInternalDatabase } =
        await import('../../src/services/file-sync.service.js');

      // Use a non-existent directory - should return error about not being able to read directory
      const result = await syncToCursorInternalDatabase('/nonexistent/dir');

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Cannot read directory|No .mdc files/);
    });

    it('should handle directory with no .mdc files', async () => {
      const { syncToCursorInternalDatabase } =
        await import('../../src/services/file-sync.service.js');
      const emptyDir = join(TEST_OUTPUT_DIR, 'empty-rules');
      mkdirSync(emptyDir, { recursive: true });

      const result = await syncToCursorInternalDatabase(emptyDir);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No .mdc files');

      // Cleanup
      rmSync(emptyDir, { recursive: true, force: true });
    });
  });
});







