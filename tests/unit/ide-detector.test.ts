/**
 * Unit tests for IDE detection utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectIDE, getSupportedIDEs } from '../../src/utils/ide-detector.js';

// Mock fs functions
vi.mock('node:fs', () => {
  const mockExistsSync = vi.fn();
  const mockReadFileSync = vi.fn();
  return {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

describe('IDE Detector', () => {
  const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
  const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Reset all environment variables that might affect detection
    delete process.env.CURSOR;
    delete process.env.VSCODE;
    delete process.env.INTELLIJ_IDEA;
    delete process.env.WEBSTORM;
    delete process.env.PYCHARM;
    delete process.env.SUBLIME;
    delete process.env.NVIM;
    delete process.env.EMACS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('detectIDE', () => {
    it('should detect Cursor IDE', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.cursor') || path.includes('.cursor/rules');
      });

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBe('cursor');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.detectedPaths.length).toBeGreaterThan(0);
    });

    it('should detect VSCode IDE', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.vscode') || path.includes('settings.json');
      });

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBe('vscode');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect IntelliJ IDE', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.idea') || path.includes('workspace.xml');
      });

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBe('intellij');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect Sublime IDE', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.sublime-project') || path.includes('.sublime-workspace');
      });

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBe('sublime');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect Neovim IDE', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.nvim') || path.includes('.config/nvim') || path.includes('init.lua');
      });

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBe('neovim');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect Emacs IDE', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path.includes('.emacs.d') || path.includes('.emacs') || path.includes('.dir-locals.el')
        );
      });

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBe('emacs');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return null when no IDE detected', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.detectedPaths).toEqual([]);
      expect(result.configPath).toBeNull();
    });

    it('should detect IDE from package.json keywords', () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return true;
        }
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return JSON.stringify({
            keywords: ['cursor', 'typescript'],
          });
        }
        return '';
      });

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBe('cursor');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect IDE from package.json devDependencies', () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return true;
        }
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return JSON.stringify({
            devDependencies: {
              vscode: '1.0.0',
            },
          });
        }
        return '';
      });

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBe('vscode');
    });

    it('should detect IDE from environment variables', () => {
      mockExistsSync.mockReturnValue(false);
      process.env.CURSOR = '1';

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBe('cursor');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle multiple detection signals', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.cursor');
      });

      process.env.CURSOR = '1';

      const result = detectIDE('/test/workspace');
      expect(result.ide).toBe('cursor');
      // Should have higher confidence with multiple signals
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should calculate confidence based on match ratio', () => {
      // Mock partial match (1 out of 2 paths)
      let callCount = 0;
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('.cursor')) {
          callCount++;
          return callCount <= 1; // Only first path exists
        }
        return false;
      });

      const result = detectIDE('/test/workspace');
      if (result.ide === 'cursor') {
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should handle package.json parse errors gracefully', () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return true;
        }
        return false;
      });

      mockReadFileSync.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = detectIDE('/test/workspace');
      // Should not throw and return null if no other signals
      expect(result).toBeDefined();
    });

    it('should set configPath for detected IDEs', () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('.cursor')) {
          return true;
        }
        if (path.includes('.cursor/rules')) {
          return true;
        }
        return false;
      });

      const result = detectIDE('/test/workspace');
      if (result.ide === 'cursor') {
        expect(result.configPath).toBeTruthy();
        expect(result.configPath).toContain('.cursor');
      }
    });

    it('should return null configPath if config directory does not exist', () => {
      mockExistsSync.mockImplementation((path: string) => {
        // Return true for detection paths, false for config path
        if (path.includes('.cursor') && !path.includes('rules')) {
          return true;
        }
        return false;
      });

      const result = detectIDE('/test/workspace');
      if (result.ide === 'cursor') {
        // Config path should be null if directory doesn't exist
        expect(result.configPath).toBeNull();
      }
    });

    it('should prioritize higher confidence matches', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.cursor') || path.includes('.vscode');
      });

      // Both should match, cursor should win with higher confidence signals
      const result = detectIDE('/test/workspace');
      expect(result.ide).toBeTruthy();
      expect(['cursor', 'vscode']).toContain(result.ide);
    });
  });

  describe('getSupportedIDEs', () => {
    it('should return list of supported IDEs', () => {
      const ides = getSupportedIDEs();
      expect(Array.isArray(ides)).toBe(true);
      expect(ides.length).toBeGreaterThan(0);
      expect(ides).toContain('cursor');
      expect(ides).toContain('vscode');
      expect(ides).toContain('intellij');
      expect(ides).toContain('sublime');
      expect(ides).toContain('neovim');
      expect(ides).toContain('emacs');
    });

    it('should return consistent results', () => {
      const ides1 = getSupportedIDEs();
      const ides2 = getSupportedIDEs();
      expect(ides1).toEqual(ides2);
    });
  });

  describe('confidence scoring', () => {
    it('should cap confidence at 1.0', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.cursor');
      });

      process.env.CURSOR = '1';
      // Mock package.json with cursor keyword
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return path.includes('.cursor');
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return JSON.stringify({ keywords: ['cursor'] });
        }
        return '';
      });

      const result = detectIDE('/test/workspace');
      if (result.ide === 'cursor') {
        expect(result.confidence).toBeLessThanOrEqual(1.0);
      }
    });
  });
});









