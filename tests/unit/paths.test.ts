import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sep, join } from 'node:path';
import {
  normalizePath,
  toLongPath,
  getCanonicalPath,
  pathsEqual,
  getRelativePath,
  isPathSafe,
} from '../../src/utils/paths.js';

describe('paths utilities', () => {
  describe('normalizePath', () => {
    it('should normalize absolute paths', () => {
      const path = '/Users/test/file.txt';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      expect(typeof normalized).toBe('string');
    });

    it('should normalize relative paths', () => {
      const path = './src/utils/paths.ts';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      expect(typeof normalized).toBe('string');
      // Should be converted to absolute
      expect(normalized.includes('src')).toBe(true);
    });

    it('should handle paths with .. segments', () => {
      const path = '/Users/test/../file.txt';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      // .. should be resolved
      expect(normalized.includes('..')).toBe(false);
    });

    it('should handle paths with . segments', () => {
      const path = '/Users/./test/./file.txt';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
    });

    it('should convert to lowercase on Windows', () => {
      // This test needs to check the actual platform
      const originalPlatform = process.platform;

      // Only test Windows-specific behavior on Windows
      if (process.platform === 'win32') {
        const path = 'C:\\Users\\Test\\File.TXT';
        const normalized = normalizePath(path);

        expect(normalized).toBe(normalized.toLowerCase());
      } else {
        // On non-Windows, case should be preserved
        const path = '/Users/Test/File.TXT';
        const normalized = normalizePath(path);

        // Case is preserved on Unix
        expect(normalized).toContain('File.TXT');
      }
    });

    it('should handle empty string', () => {
      const path = '';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      expect(typeof normalized).toBe('string');
    });

    it('should handle current directory', () => {
      const path = '.';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      expect(typeof normalized).toBe('string');
    });

    it('should handle parent directory', () => {
      const path = '..';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      expect(typeof normalized).toBe('string');
    });

    it('should produce consistent results for equivalent paths', () => {
      const path1 = './src/utils/../utils/paths.ts';
      const path2 = './src/utils/paths.ts';

      const norm1 = normalizePath(path1);
      const norm2 = normalizePath(path2);

      expect(norm1).toBe(norm2);
    });
  });

  describe('toLongPath', () => {
    it('should return path unchanged on non-Windows', () => {
      if (process.platform !== 'win32') {
        const path = '/a/very/long/path/that/would/exceed/260/characters';
        const result = toLongPath(path);

        expect(result).toBe(path);
      }
    });

    it('should handle short paths on Windows', () => {
      if (process.platform === 'win32') {
        const path = 'C:\\Users\\test\\file.txt';
        const result = toLongPath(path);

        // Short path shouldn't get \\?\ prefix
        expect(result.startsWith('\\\\?\\')).toBe(false);
      }
    });

    it('should add prefix for long paths on Windows', () => {
      if (process.platform === 'win32') {
        // Create a path > 260 chars
        const longPath = 'C:\\' + 'a'.repeat(300);
        const result = toLongPath(longPath);

        expect(result.startsWith('\\\\?\\')).toBe(true);
      }
    });

    it('should not duplicate prefix on Windows', () => {
      if (process.platform === 'win32') {
        const longPath = '\\\\?\\C:\\' + 'a'.repeat(300);
        const result = toLongPath(longPath);

        // Should not have double \\?\\ prefix
        expect(result.startsWith('\\\\?\\\\\\?\\')).toBe(false);
      }
    });

    it('should resolve relative paths', () => {
      const path = './test.txt';
      const result = toLongPath(path);

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle empty string', () => {
      const path = '';
      const result = toLongPath(path);

      expect(typeof result).toBe('string');
    });
  });

  describe('getCanonicalPath', () => {
    it('should resolve symlinks when they exist', () => {
      // Test with current directory which should always exist
      const path = '.';
      const canonical = getCanonicalPath(path);

      expect(canonical).toBeTruthy();
      expect(typeof canonical).toBe('string');
    });

    it('should fallback to resolve for non-existent paths', () => {
      const path = '/this/path/definitely/does/not/exist/anywhere';
      const canonical = getCanonicalPath(path);

      expect(canonical).toBeTruthy();
      expect(typeof canonical).toBe('string');
      // Should still return a path
      expect(canonical.includes('not')).toBe(true);
    });

    it('should handle relative paths', () => {
      const path = './src';
      const canonical = getCanonicalPath(path);

      expect(canonical).toBeTruthy();
      expect(typeof canonical).toBe('string');
    });

    it('should handle parent directory references', () => {
      const path = '../';
      const canonical = getCanonicalPath(path);

      expect(canonical).toBeTruthy();
      expect(typeof canonical).toBe('string');
    });

    it('should handle current file', () => {
      const path = __filename;
      const canonical = getCanonicalPath(path);

      expect(canonical).toBeTruthy();
      expect(typeof canonical).toBe('string');
    });

    it('should handle empty string', () => {
      const path = '';
      const canonical = getCanonicalPath(path);

      expect(canonical).toBeTruthy();
      expect(typeof canonical).toBe('string');
    });
  });

  describe('pathsEqual', () => {
    it('should return true for identical paths', () => {
      const path = '/Users/test/file.txt';
      expect(pathsEqual(path, path)).toBe(true);
    });

    it('should return true for equivalent relative paths', () => {
      const path1 = './src/utils/paths.ts';
      const path2 = './src/utils/paths.ts';
      expect(pathsEqual(path1, path2)).toBe(true);
    });

    it('should return true for paths that resolve to same location', () => {
      const path1 = './src/utils/../utils/paths.ts';
      const path2 = './src/utils/paths.ts';
      expect(pathsEqual(path1, path2)).toBe(true);
    });

    it('should return false for different paths', () => {
      const path1 = '/Users/test/file1.txt';
      const path2 = '/Users/test/file2.txt';
      expect(pathsEqual(path1, path2)).toBe(false);
    });

    it('should handle case sensitivity based on platform', () => {
      if (process.platform === 'win32') {
        // Windows is case-insensitive
        const path1 = 'C:\\Users\\Test\\File.txt';
        const path2 = 'C:\\Users\\test\\file.txt';
        expect(pathsEqual(path1, path2)).toBe(true);
      } else {
        // Unix is case-sensitive
        const path1 = '/Users/Test/File.txt';
        const path2 = '/Users/test/file.txt';
        expect(pathsEqual(path1, path2)).toBe(false);
      }
    });

    it('should handle empty strings', () => {
      expect(pathsEqual('', '')).toBe(true);
    });

    it('should handle . and current working directory', () => {
      const result = pathsEqual('.', '.');
      expect(result).toBe(true);
    });

    it('should normalize before comparing', () => {
      const path1 = '/Users/test/./file.txt';
      const path2 = '/Users/test/file.txt';
      expect(pathsEqual(path1, path2)).toBe(true);
    });
  });

  describe('getRelativePath', () => {
    it('should return relative path between two paths', () => {
      const from = '/Users/test';
      const to = '/Users/test/subdir/file.txt';
      const rel = getRelativePath(from, to);

      expect(rel).toBeTruthy();
      expect(rel).toContain('subdir');
      expect(rel).toContain('file.txt');
    });

    it('should use forward slashes regardless of platform', () => {
      const from = '/Users/test';
      const to = '/Users/test/subdir/file.txt';
      const rel = getRelativePath(from, to);

      expect(rel.includes('/')).toBe(true);
      // Should not contain backslashes
      expect(rel.includes('\\')).toBe(false);
    });

    it('should handle going up directories', () => {
      const from = '/Users/test/deep/nested';
      const to = '/Users/test/file.txt';
      const rel = getRelativePath(from, to);

      expect(rel).toBeTruthy();
      expect(rel.includes('..')).toBe(true);
    });

    it('should handle same directory', () => {
      const from = '/Users/test';
      const to = '/Users/test';
      const rel = getRelativePath(from, to);

      expect(rel).toBe('');
    });

    it('should handle relative from paths', () => {
      const from = './src';
      const to = './src/utils/paths.ts';
      const rel = getRelativePath(from, to);

      expect(rel).toBeTruthy();
      expect(typeof rel).toBe('string');
    });

    it('should handle relative to paths', () => {
      const from = '/Users/test';
      const to = './file.txt';
      const rel = getRelativePath(from, to);

      expect(rel).toBeTruthy();
      expect(typeof rel).toBe('string');
    });

    it('should normalize separators to forward slash', () => {
      const from = join('/Users', 'test');
      const to = join('/Users', 'test', 'subdir', 'file.txt');
      const rel = getRelativePath(from, to);

      // Should always use forward slashes
      const hasBackslash = rel.includes('\\');
      expect(hasBackslash).toBe(false);
    });
  });

  describe('isPathSafe', () => {
    it('should return true for safe paths without root', () => {
      const path = '/Users/test/file.txt';
      expect(isPathSafe(path)).toBe(true);
    });

    it('should return false for paths with null bytes', () => {
      const path = '/Users/test\0/file.txt';
      expect(isPathSafe(path)).toBe(false);
    });

    it('should return true for path within allowed root', () => {
      const path = '/Users/test/project/file.txt';
      const root = '/Users/test/project';
      expect(isPathSafe(path, root)).toBe(true);
    });

    it('should return false for path outside allowed root', () => {
      const path = '/Users/other/file.txt';
      const root = '/Users/test/project';
      expect(isPathSafe(path, root)).toBe(false);
    });

    it('should handle directory traversal attempts', () => {
      const path = '/Users/test/project/../../../etc/passwd';
      const root = '/Users/test/project';
      expect(isPathSafe(path, root)).toBe(false);
    });

    it('should allow paths within root even with . segments', () => {
      const path = '/Users/test/project/./subdir/./file.txt';
      const root = '/Users/test/project';
      expect(isPathSafe(path, root)).toBe(true);
    });

    it('should handle relative paths with root', () => {
      const path = './subdir/file.txt';
      const root = process.cwd();
      const result = isPathSafe(path, root);

      expect(typeof result).toBe('boolean');
    });

    it('should handle empty path', () => {
      const path = '';
      expect(isPathSafe(path)).toBe(true);
    });

    it('should handle root as current directory', () => {
      const path = './file.txt';
      const root = '.';
      const result = isPathSafe(path, root);

      expect(typeof result).toBe('boolean');
    });

    it('should catch path resolution errors', () => {
      // Invalid path that might throw during resolve
      const invalidPath = '\0invalid';
      expect(isPathSafe(invalidPath)).toBe(false);
    });

    it('should normalize paths before comparison', () => {
      const path = '/Users/test/project/subdir/../file.txt';
      const root = '/Users/test/project';
      expect(isPathSafe(path, root)).toBe(true);
    });

    it('should handle case sensitivity based on platform', () => {
      if (process.platform === 'win32') {
        // Windows: case-insensitive, should work
        const path = 'C:\\Users\\Test\\File.txt';
        const root = 'C:\\users\\test';
        expect(isPathSafe(path, root)).toBe(true);
      } else {
        // Unix: case-sensitive
        const path = '/Users/Test/File.txt';
        const root = '/Users/test';
        // Different case = different directory on Unix
        expect(isPathSafe(path, root)).toBe(false);
      }
    });

    it('should reject paths trying to escape via symlink-like patterns', () => {
      const path = '/Users/test/project/subdir/../../../../../../etc/passwd';
      const root = '/Users/test/project';
      expect(isPathSafe(path, root)).toBe(false);
    });

    it('should allow exact root path', () => {
      const path = '/Users/test/project';
      const root = '/Users/test/project';
      expect(isPathSafe(path, root)).toBe(true);
    });

    it('should handle root without trailing slash', () => {
      const path = '/Users/test/project/file.txt';
      const root = '/Users/test/project';
      expect(isPathSafe(path, root)).toBe(true);
    });

    it('should handle root with trailing slash', () => {
      const path = '/Users/test/project/file.txt';
      const root = '/Users/test/project/';
      expect(isPathSafe(path, root)).toBe(true);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle very long paths', () => {
      const longPath = '/Users/' + 'a'.repeat(500) + '/file.txt';
      const normalized = normalizePath(longPath);

      expect(normalized).toBeTruthy();
      expect(typeof normalized).toBe('string');
    });

    it('should handle paths with special characters', () => {
      const path = '/Users/test/file with spaces.txt';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      expect(normalized.includes('spaces')).toBe(true);
    });

    it('should handle paths with unicode characters', () => {
      const path = '/Users/test/文件.txt';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      expect(typeof normalized).toBe('string');
    });

    it('should handle multiple consecutive slashes', () => {
      const path = '/Users//test///file.txt';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      // Should normalize to single slashes
      expect(normalized.includes('//')).toBe(false);
    });

    it('should handle paths with trailing slash', () => {
      const path = '/Users/test/';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      expect(typeof normalized).toBe('string');
    });

    it('should handle root directory', () => {
      const path = '/';
      const normalized = normalizePath(path);

      expect(normalized).toBeTruthy();
      expect(typeof normalized).toBe('string');
    });
  });
});
