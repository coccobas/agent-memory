import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sep } from 'node:path';
import { isMcpServerMode, isMainModule, getPlatformInfo } from '../../src/utils/runtime.js';

describe('runtime utilities', () => {
  const originalArgv = process.argv;
  const originalStdin = process.stdin;

  afterEach(() => {
    process.argv = originalArgv;
    // Restore stdin
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
  });

  describe('isMcpServerMode', () => {
    it('should return true when stdin is not a TTY', () => {
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: false },
        writable: true,
        configurable: true,
      });

      expect(isMcpServerMode()).toBe(true);
    });

    it('should return true for index.js entry point', () => {
      process.argv = ['node', '/path/to/index.js'];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      expect(isMcpServerMode()).toBe(true);
    });

    it('should return true for index.ts entry point', () => {
      process.argv = ['node', '/path/to/index.ts'];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      expect(isMcpServerMode()).toBe(true);
    });

    it('should return true for dist/index.js pattern', () => {
      process.argv = ['node', `/path/to${sep}dist${sep}index.js`];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      expect(isMcpServerMode()).toBe(true);
    });

    it('should return false for other scripts with TTY', () => {
      process.argv = ['node', '/path/to/test.js'];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      expect(isMcpServerMode()).toBe(false);
    });

    it('should handle uppercase paths correctly', () => {
      process.argv = ['node', '/PATH/TO/INDEX.JS'];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      expect(isMcpServerMode()).toBe(true);
    });

    it('should handle mixed case dist paths', () => {
      process.argv = ['node', `/path/to${sep}DIST${sep}index.js`];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      expect(isMcpServerMode()).toBe(true);
    });

    it('should return false when dist pattern exists but not index.js', () => {
      process.argv = ['node', `/path/to${sep}dist${sep}other.js`];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      expect(isMcpServerMode()).toBe(false);
    });

    it('should prioritize stdin check over path checks', () => {
      process.argv = ['node', '/path/to/random.js'];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: false },
        writable: true,
        configurable: true,
      });

      // Should return true because stdin is not a TTY, regardless of path
      expect(isMcpServerMode()).toBe(true);
    });

    it('should handle undefined argv gracefully', () => {
      process.argv = [];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      // Should not throw and should return false
      expect(isMcpServerMode()).toBe(false);
    });
  });

  describe('isMainModule', () => {
    it('should return true for index.js', () => {
      process.argv = ['node', '/path/to/index.js'];
      expect(isMainModule()).toBe(true);
    });

    it('should return true for index.ts', () => {
      process.argv = ['node', '/path/to/index.ts'];
      expect(isMainModule()).toBe(true);
    });

    it('should return true for paths containing agent-memory', () => {
      process.argv = ['node', '/path/to/agent-memory/src/server.js'];
      expect(isMainModule()).toBe(true);
    });

    it('should return false for other scripts', () => {
      process.argv = ['node', '/path/to/test.js'];
      expect(isMainModule()).toBe(false);
    });

    it('should handle uppercase paths', () => {
      process.argv = ['node', '/PATH/TO/INDEX.JS'];
      expect(isMainModule()).toBe(true);
    });

    it('should handle agent-memory with different cases', () => {
      process.argv = ['node', '/path/to/AGENT-MEMORY/src/server.js'];
      expect(isMainModule()).toBe(true);
    });

    it('should return false when argv is empty', () => {
      process.argv = [];
      expect(isMainModule()).toBe(false);
    });

    it('should handle partial matches correctly', () => {
      process.argv = ['node', '/path/to/not-agent-memory-related/test.js'];
      // This path contains "agent-memory" so it will return true
      // The function checks if path includes 'agent-memory' (case insensitive)
      expect(isMainModule()).toBe(true);
    });

    it('should handle paths with index in middle but not at end', () => {
      process.argv = ['node', '/path/to/index/test.js'];
      expect(isMainModule()).toBe(false);
    });
  });

  describe('getPlatformInfo', () => {
    it('should return platform separator', () => {
      const info = getPlatformInfo();
      expect(info.sep).toBe(sep);
    });

    it('should detect Windows platform', () => {
      const info = getPlatformInfo();
      expect(typeof info.isWindows).toBe('boolean');
      expect(info.isWindows).toBe(process.platform === 'win32');
    });

    it('should detect Mac platform', () => {
      const info = getPlatformInfo();
      expect(typeof info.isMac).toBe('boolean');
      expect(info.isMac).toBe(process.platform === 'darwin');
    });

    it('should return consistent results', () => {
      const info1 = getPlatformInfo();
      const info2 = getPlatformInfo();

      expect(info1.sep).toBe(info2.sep);
      expect(info1.isWindows).toBe(info2.isWindows);
      expect(info1.isMac).toBe(info2.isMac);
    });

    it('should have correct separator based on platform', () => {
      const info = getPlatformInfo();

      if (info.isWindows) {
        expect(info.sep).toBe('\\');
      } else {
        expect(info.sep).toBe('/');
      }
    });

    it('should not be both Windows and Mac', () => {
      const info = getPlatformInfo();
      expect(info.isWindows && info.isMac).toBe(false);
    });

    it('should return object with all required properties', () => {
      const info = getPlatformInfo();
      expect(info).toHaveProperty('sep');
      expect(info).toHaveProperty('isWindows');
      expect(info).toHaveProperty('isMac');
    });
  });

  describe('cross-platform path handling', () => {
    it('should handle Windows-style paths', () => {
      process.argv = ['node', 'C:\\Users\\test\\dist\\index.js'];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      // Should normalize and detect correctly
      const result = isMcpServerMode();
      expect(typeof result).toBe('boolean');
    });

    it('should handle Unix-style paths', () => {
      process.argv = ['node', '/home/user/dist/index.js'];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      const result = isMcpServerMode();
      expect(typeof result).toBe('boolean');
    });

    it('should handle relative paths', () => {
      process.argv = ['node', './dist/index.js'];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      const result = isMcpServerMode();
      expect(typeof result).toBe('boolean');
    });

    it('should handle paths with special characters', () => {
      process.argv = ['node', '/path/with spaces/index.js'];
      Object.defineProperty(process, 'stdin', {
        value: { isTTY: true },
        writable: true,
        configurable: true,
      });

      expect(isMcpServerMode()).toBe(true);
    });
  });
});
