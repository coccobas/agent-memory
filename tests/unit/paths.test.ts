import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizePath,
  toLongPath,
  getCanonicalPath,
  pathsEqual,
  getRelativePath,
  isPathSafe,
} from '../../src/utils/paths.js';
import * as fs from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    realpathSync: vi.fn(),
  };
});

describe('paths utilities', () => {
  describe('normalizePath', () => {
    it('should normalize relative paths', () => {
      const result = normalizePath('./test');
      expect(result).toContain('test');
      expect(result).not.toContain('./');
    });

    it('should normalize paths with ..', () => {
      const result = normalizePath('/foo/bar/../baz');
      expect(result).toContain('/foo/baz');
    });

    it('should resolve absolute paths', () => {
      const result = normalizePath('/absolute/path');
      expect(result).toBe('/absolute/path');
    });

    it('should handle paths with multiple separators', () => {
      const result = normalizePath('/foo//bar///baz');
      expect(result).not.toContain('//');
    });
  });

  describe('toLongPath', () => {
    it('should return same path on non-Windows', () => {
      // On macOS/Linux, should return the resolved path
      const result = toLongPath('/some/path');
      expect(result).toContain('/some/path');
    });

    it('should handle relative paths', () => {
      const result = toLongPath('./relative');
      expect(result).toContain('relative');
    });
  });

  describe('getCanonicalPath', () => {
    const mockRealpathSync = vi.mocked(fs.realpathSync);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return realpath when symlink resolution succeeds', () => {
      mockRealpathSync.mockReturnValue('/real/path');

      const result = getCanonicalPath('/some/symlink');
      expect(result).toBe('/real/path');
      expect(mockRealpathSync).toHaveBeenCalledWith('/some/symlink');
    });

    it('should return resolved path when realpath fails', () => {
      mockRealpathSync.mockImplementation(() => {
        throw new Error('No such file');
      });

      const result = getCanonicalPath('/nonexistent/path');
      expect(result).toContain('/nonexistent/path');
    });
  });

  describe('pathsEqual', () => {
    it('should return true for identical paths', () => {
      expect(pathsEqual('/foo/bar', '/foo/bar')).toBe(true);
    });

    it('should return true for equivalent paths', () => {
      expect(pathsEqual('/foo/bar/../baz', '/foo/baz')).toBe(true);
    });

    it('should return false for different paths', () => {
      expect(pathsEqual('/foo/bar', '/foo/baz')).toBe(false);
    });

    it('should handle relative paths', () => {
      const cwd = process.cwd();
      expect(pathsEqual('./test', `${cwd}/test`)).toBe(true);
    });
  });

  describe('getRelativePath', () => {
    it('should return relative path with forward slashes', () => {
      const result = getRelativePath('/foo', '/foo/bar/baz');
      expect(result).toBe('bar/baz');
    });

    it('should handle parent directory traversal', () => {
      const result = getRelativePath('/foo/bar', '/foo/baz');
      expect(result).toBe('../baz');
    });

    it('should return empty for same path', () => {
      const result = getRelativePath('/foo/bar', '/foo/bar');
      expect(result).toBe('');
    });

    it('should handle deeply nested paths', () => {
      const result = getRelativePath('/a', '/a/b/c/d/e');
      expect(result).toBe('b/c/d/e');
    });
  });

  describe('isPathSafe', () => {
    it('should return false for paths with null bytes', () => {
      expect(isPathSafe('/foo\0bar')).toBe(false);
    });

    it('should return true for valid absolute paths', () => {
      expect(isPathSafe('/foo/bar')).toBe(true);
    });

    it('should return true for valid relative paths', () => {
      expect(isPathSafe('./foo/bar')).toBe(true);
    });

    it('should validate against allowed root', () => {
      expect(isPathSafe('/allowed/subdir', '/allowed')).toBe(true);
      expect(isPathSafe('/other/path', '/allowed')).toBe(false);
    });

    it('should prevent directory traversal outside root', () => {
      expect(isPathSafe('/allowed/../other', '/allowed')).toBe(false);
    });

    it('should allow traversal within root', () => {
      expect(isPathSafe('/allowed/foo/../bar', '/allowed')).toBe(true);
    });

    it('should return true for paths without root specified', () => {
      expect(isPathSafe('/any/path')).toBe(true);
      expect(isPathSafe('../relative')).toBe(true);
    });
  });
});
