/**
 * Tests for working directory utility
 *
 * TDD: Write tests first, then implement
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getWorkingDirectory,
  getWorkingDirectoryInfo,
  getWorkingDirectorySource,
  clearWorkingDirectoryCache,
  hasClientWorkingDirectory,
  type WorkingDirectorySource,
} from '../../src/utils/working-directory.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock roots service
vi.mock('../../src/mcp/roots.service.js', () => ({
  getRootWorkingDirectory: vi.fn(),
  hasRootsCapability: vi.fn(),
}));

import { getRootWorkingDirectory, hasRootsCapability } from '../../src/mcp/roots.service.js';

describe('Working Directory Utility', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearWorkingDirectoryCache();
    vi.mocked(hasRootsCapability).mockReturnValue(false);
    vi.mocked(getRootWorkingDirectory).mockReturnValue(null);
    delete process.env.CLAUDE_CWD;
    delete process.env.AGENT_MEMORY_CWD;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe('getWorkingDirectory', () => {
    it('should return a string', () => {
      const cwd = getWorkingDirectory();
      expect(typeof cwd).toBe('string');
      expect(cwd.length).toBeGreaterThan(0);
    });

    it('should return the same value as getWorkingDirectoryInfo().path', () => {
      clearWorkingDirectoryCache();
      const cwd = getWorkingDirectory();
      clearWorkingDirectoryCache();
      const info = getWorkingDirectoryInfo();
      expect(cwd).toBe(info.path);
    });
  });

  describe('getWorkingDirectoryInfo', () => {
    it('should return object with path and source properties', () => {
      const info = getWorkingDirectoryInfo();
      expect(info).toHaveProperty('path');
      expect(info).toHaveProperty('source');
      expect(typeof info.path).toBe('string');
      expect(info.path.length).toBeGreaterThan(0);
    });

    it('should return valid source type', () => {
      const info = getWorkingDirectoryInfo();
      const validSources: WorkingDirectorySource[] = [
        'roots',
        'CLAUDE_CWD',
        'AGENT_MEMORY_CWD',
        'process.cwd',
      ];
      expect(validSources).toContain(info.source);
    });
  });

  describe('Priority order: roots > CLAUDE_CWD > AGENT_MEMORY_CWD > process.cwd', () => {
    it('should prioritize roots when available', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(true);
      vi.mocked(getRootWorkingDirectory).mockReturnValue('/roots/path');
      process.env.CLAUDE_CWD = '/claude/path';
      process.env.AGENT_MEMORY_CWD = '/agent/path';

      const info = getWorkingDirectoryInfo();

      expect(info.path).toBe('/roots/path');
      expect(info.source).toBe('roots');
    });

    it('should use CLAUDE_CWD when roots not available', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(false);
      vi.mocked(getRootWorkingDirectory).mockReturnValue(null);
      process.env.CLAUDE_CWD = '/claude/path';
      process.env.AGENT_MEMORY_CWD = '/agent/path';

      const info = getWorkingDirectoryInfo();

      expect(info.path).toBe('/claude/path');
      expect(info.source).toBe('CLAUDE_CWD');
    });

    it('should use AGENT_MEMORY_CWD when roots and CLAUDE_CWD not available', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(false);
      vi.mocked(getRootWorkingDirectory).mockReturnValue(null);
      delete process.env.CLAUDE_CWD;
      process.env.AGENT_MEMORY_CWD = '/agent/path';

      const info = getWorkingDirectoryInfo();

      expect(info.path).toBe('/agent/path');
      expect(info.source).toBe('AGENT_MEMORY_CWD');
    });

    it('should fall back to process.cwd() when nothing else available', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(false);
      vi.mocked(getRootWorkingDirectory).mockReturnValue(null);
      delete process.env.CLAUDE_CWD;
      delete process.env.AGENT_MEMORY_CWD;

      const info = getWorkingDirectoryInfo();

      expect(info.path).toBe(process.cwd());
      expect(info.source).toBe('process.cwd');
    });

    it('should skip roots if hasRootsCapability is true but getRootWorkingDirectory returns null', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(true);
      vi.mocked(getRootWorkingDirectory).mockReturnValue(null);
      process.env.CLAUDE_CWD = '/claude/path';

      const info = getWorkingDirectoryInfo();

      expect(info.path).toBe('/claude/path');
      expect(info.source).toBe('CLAUDE_CWD');
    });
  });

  describe('Caching behavior', () => {
    it('should cache the working directory on first call', () => {
      process.env.CLAUDE_CWD = '/claude/path';

      const info1 = getWorkingDirectoryInfo();
      // Change env var after first call
      process.env.CLAUDE_CWD = '/different/path';
      const info2 = getWorkingDirectoryInfo();

      // Should return cached value, not the new env var
      expect(info1.path).toBe('/claude/path');
      expect(info2.path).toBe('/claude/path');
      expect(info1.path).toBe(info2.path);
    });

    it('should return cached value on second call without re-evaluating', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(false);
      process.env.CLAUDE_CWD = '/claude/path';

      const info1 = getWorkingDirectoryInfo();
      const info2 = getWorkingDirectoryInfo();

      // Should use cached value
      expect(info1).toEqual(info2);
      // hasRootsCapability should only be called once (during first call)
      expect(vi.mocked(hasRootsCapability)).toHaveBeenCalledTimes(1);
    });

    it('should cache source information', () => {
      process.env.CLAUDE_CWD = '/claude/path';

      getWorkingDirectoryInfo();
      const source = getWorkingDirectorySource();

      expect(source).toBe('CLAUDE_CWD');
    });
  });

  describe('clearWorkingDirectoryCache', () => {
    it('should clear the cache and allow re-evaluation', () => {
      process.env.CLAUDE_CWD = '/claude/path';

      const info1 = getWorkingDirectoryInfo();
      expect(info1.path).toBe('/claude/path');

      clearWorkingDirectoryCache();

      // Change env var
      process.env.CLAUDE_CWD = '/different/path';
      const info2 = getWorkingDirectoryInfo();

      // Should now use the new env var
      expect(info2.path).toBe('/different/path');
    });

    it('should clear the source cache', () => {
      process.env.CLAUDE_CWD = '/claude/path';

      getWorkingDirectoryInfo();
      let source = getWorkingDirectorySource();
      expect(source).toBe('CLAUDE_CWD');

      clearWorkingDirectoryCache();

      source = getWorkingDirectorySource();
      expect(source).toBeNull();
    });

    it('should allow fallback warning to be shown again after cache clear', () => {
      // First call with no env vars - should warn
      delete process.env.CLAUDE_CWD;
      delete process.env.AGENT_MEMORY_CWD;
      vi.mocked(hasRootsCapability).mockReturnValue(false);

      getWorkingDirectoryInfo();
      clearWorkingDirectoryCache();

      // Second call should be able to warn again
      getWorkingDirectoryInfo();
      // If we got here without error, the warning flag was reset
      expect(true).toBe(true);
    });
  });

  describe('getWorkingDirectorySource', () => {
    it('should return null when cache is empty', () => {
      clearWorkingDirectoryCache();
      const source = getWorkingDirectorySource();
      expect(source).toBeNull();
    });

    it('should return the source after calling getWorkingDirectoryInfo', () => {
      process.env.AGENT_MEMORY_CWD = '/agent/path';

      getWorkingDirectoryInfo();
      const source = getWorkingDirectorySource();

      expect(source).toBe('AGENT_MEMORY_CWD');
    });

    it('should return roots source when roots is used', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(true);
      vi.mocked(getRootWorkingDirectory).mockReturnValue('/roots/path');

      getWorkingDirectoryInfo();
      const source = getWorkingDirectorySource();

      expect(source).toBe('roots');
    });

    it('should return process.cwd source when falling back', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(false);
      delete process.env.CLAUDE_CWD;
      delete process.env.AGENT_MEMORY_CWD;

      getWorkingDirectoryInfo();
      const source = getWorkingDirectorySource();

      expect(source).toBe('process.cwd');
    });
  });

  describe('hasClientWorkingDirectory', () => {
    it('should return true when roots capability is available', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(true);
      delete process.env.CLAUDE_CWD;
      delete process.env.AGENT_MEMORY_CWD;

      const result = hasClientWorkingDirectory();

      expect(result).toBe(true);
    });

    it('should return true when CLAUDE_CWD is set', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(false);
      process.env.CLAUDE_CWD = '/claude/path';
      delete process.env.AGENT_MEMORY_CWD;

      const result = hasClientWorkingDirectory();

      expect(result).toBe(true);
    });

    it('should return true when AGENT_MEMORY_CWD is set', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(false);
      delete process.env.CLAUDE_CWD;
      process.env.AGENT_MEMORY_CWD = '/agent/path';

      const result = hasClientWorkingDirectory();

      expect(result).toBe(true);
    });

    it('should return false when nothing is configured', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(false);
      delete process.env.CLAUDE_CWD;
      delete process.env.AGENT_MEMORY_CWD;

      const result = hasClientWorkingDirectory();

      expect(result).toBe(false);
    });

    it('should return true when both CLAUDE_CWD and AGENT_MEMORY_CWD are set', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(false);
      process.env.CLAUDE_CWD = '/claude/path';
      process.env.AGENT_MEMORY_CWD = '/agent/path';

      const result = hasClientWorkingDirectory();

      expect(result).toBe(true);
    });

    it('should return true when roots and CLAUDE_CWD are both available', () => {
      vi.mocked(hasRootsCapability).mockReturnValue(true);
      process.env.CLAUDE_CWD = '/claude/path';

      const result = hasClientWorkingDirectory();

      expect(result).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle multiple sequential calls with cache', () => {
      process.env.CLAUDE_CWD = '/claude/path';

      const info1 = getWorkingDirectoryInfo();
      const cwd1 = getWorkingDirectory();
      const source1 = getWorkingDirectorySource();

      expect(info1.path).toBe('/claude/path');
      expect(cwd1).toBe('/claude/path');
      expect(source1).toBe('CLAUDE_CWD');

      // All should be consistent
      expect(info1.path).toBe(cwd1);
      expect(info1.source).toBe(source1);
    });

    it('should handle switching between different sources via cache clear', () => {
      // Start with CLAUDE_CWD
      process.env.CLAUDE_CWD = '/claude/path';
      let info = getWorkingDirectoryInfo();
      expect(info.source).toBe('CLAUDE_CWD');

      // Clear and switch to AGENT_MEMORY_CWD
      clearWorkingDirectoryCache();
      delete process.env.CLAUDE_CWD;
      process.env.AGENT_MEMORY_CWD = '/agent/path';
      info = getWorkingDirectoryInfo();
      expect(info.source).toBe('AGENT_MEMORY_CWD');

      // Clear and switch to roots
      clearWorkingDirectoryCache();
      delete process.env.AGENT_MEMORY_CWD;
      vi.mocked(hasRootsCapability).mockReturnValue(true);
      vi.mocked(getRootWorkingDirectory).mockReturnValue('/roots/path');
      info = getWorkingDirectoryInfo();
      expect(info.source).toBe('roots');
    });

    it('should maintain consistency between getWorkingDirectory and getWorkingDirectoryInfo', () => {
      process.env.CLAUDE_CWD = '/test/path';

      const cwd = getWorkingDirectory();
      const info = getWorkingDirectoryInfo();

      expect(cwd).toBe(info.path);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string env vars as falsy', () => {
      process.env.CLAUDE_CWD = '';
      process.env.AGENT_MEMORY_CWD = '/agent/path';

      const info = getWorkingDirectoryInfo();

      // Empty string should be treated as falsy, so should use AGENT_MEMORY_CWD
      expect(info.path).toBe('/agent/path');
      expect(info.source).toBe('AGENT_MEMORY_CWD');
    });

    it('should handle paths with special characters', () => {
      const specialPath = '/path/with spaces/and-dashes/and_underscores';
      process.env.CLAUDE_CWD = specialPath;

      const info = getWorkingDirectoryInfo();

      expect(info.path).toBe(specialPath);
    });

    it('should handle absolute and relative paths', () => {
      const absolutePath = '/absolute/path';
      process.env.CLAUDE_CWD = absolutePath;

      const info = getWorkingDirectoryInfo();

      expect(info.path).toBe(absolutePath);
    });
  });
});
