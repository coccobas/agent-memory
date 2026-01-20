/**
 * Unit tests for Doc Scanner Service
 *
 * Tests documentation file discovery and reading.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  DocScannerService,
  createDocScannerService,
} from '../../../src/services/onboarding/doc-scanner.js';

// Mock fs functions
vi.mock('node:fs', () => {
  const mockExistsSync = vi.fn();
  const mockReadFileSync = vi.fn();
  const mockStatSync = vi.fn();
  return {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    statSync: mockStatSync,
  };
});

describe('DocScannerService', () => {
  const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
  const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
  const mockStatSync = statSync as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('scanForDocs', () => {
    it('should find README.md in project root', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('README.md');
      });

      mockStatSync.mockImplementation(() => ({
        size: 1024,
        isFile: () => true,
      }));

      const service = createDocScannerService();
      const result = await service.scanForDocs('/test/workspace');

      const readme = result.find((d) => d.type === 'readme');
      expect(readme).toBeDefined();
      expect(readme?.filename).toBe('README.md');
      expect(readme?.size).toBe(1024);
    });

    it('should find CLAUDE.md in project root', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('CLAUDE.md');
      });

      mockStatSync.mockImplementation(() => ({
        size: 2048,
        isFile: () => true,
      }));

      const service = createDocScannerService();
      const result = await service.scanForDocs('/test/workspace');

      const claudeMd = result.find((d) => d.type === 'claude');
      expect(claudeMd).toBeDefined();
      expect(claudeMd?.filename).toBe('CLAUDE.md');
    });

    it('should find CLAUDE.md in .claude directory', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.claude/CLAUDE.md');
      });

      mockStatSync.mockImplementation(() => ({
        size: 512,
        isFile: () => true,
      }));

      const service = createDocScannerService();
      const result = await service.scanForDocs('/test/workspace');

      const claudeMd = result.find((d) => d.type === 'claude');
      expect(claudeMd).toBeDefined();
      expect(claudeMd?.path).toContain('.claude');
    });

    it('should find .cursorrules file', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('.cursorrules');
      });

      mockStatSync.mockImplementation(() => ({
        size: 768,
        isFile: () => true,
      }));

      const service = createDocScannerService();
      const result = await service.scanForDocs('/test/workspace');

      const cursorrules = result.find((d) => d.type === 'cursorrules');
      expect(cursorrules).toBeDefined();
      expect(cursorrules?.filename).toBe('.cursorrules');
    });

    it('should find CONTRIBUTING.md', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('CONTRIBUTING.md');
      });

      mockStatSync.mockImplementation(() => ({
        size: 3000,
        isFile: () => true,
      }));

      const service = createDocScannerService();
      const result = await service.scanForDocs('/test/workspace');

      const contributing = result.find((d) => d.type === 'contributing');
      expect(contributing).toBeDefined();
    });

    it('should return empty array when no docs found', async () => {
      mockExistsSync.mockReturnValue(false);

      const service = createDocScannerService();
      const result = await service.scanForDocs('/test/workspace');

      expect(result).toEqual([]);
    });

    it('should handle stat errors gracefully', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('README.md');
      });

      mockStatSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const service = createDocScannerService();
      const result = await service.scanForDocs('/test/workspace');

      // Should not crash, but doc should not be included
      expect(Array.isArray(result)).toBe(true);
    });

    it('should find multiple docs at once', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path.includes('README.md') || path.includes('CLAUDE.md') || path.includes('.cursorrules')
        );
      });

      mockStatSync.mockImplementation((path: string) => ({
        size: path.includes('README') ? 1000 : path.includes('CLAUDE') ? 2000 : 500,
        isFile: () => true,
      }));

      const service = createDocScannerService();
      const result = await service.scanForDocs('/test/workspace');

      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('readDoc', () => {
    it('should read file contents', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 100, isFile: () => true });
      mockReadFileSync.mockReturnValue('# My Project\n\nDescription here.');

      const service = createDocScannerService();
      const content = await service.readDoc('/test/workspace/README.md');

      expect(content).toBe('# My Project\n\nDescription here.');
    });

    it('should return null for non-existent files', async () => {
      mockExistsSync.mockReturnValue(false);

      const service = createDocScannerService();
      const content = await service.readDoc('/test/workspace/NONEXISTENT.md');

      expect(content).toBeNull();
    });

    it('should handle read errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 100, isFile: () => true });
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const service = createDocScannerService();
      const content = await service.readDoc('/test/workspace/README.md');

      expect(content).toBeNull();
    });

    it('should truncate files exceeding max size', async () => {
      const largeContent = 'x'.repeat(200000); // 200KB

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 200000, isFile: () => true });
      mockReadFileSync.mockReturnValue(largeContent);

      const service = createDocScannerService();
      const content = await service.readDoc('/test/workspace/LARGE.md', 1000);

      expect(content).not.toBeNull();
      expect(content!.length).toBeLessThanOrEqual(1000 + 100); // Allow for truncation notice
    });

    it('should add truncation notice when file is truncated', async () => {
      const largeContent = 'x'.repeat(200000);

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 200000, isFile: () => true });
      mockReadFileSync.mockReturnValue(largeContent);

      const service = createDocScannerService();
      const content = await service.readDoc('/test/workspace/LARGE.md', 500);

      expect(content).toContain('[truncated - file exceeds size limit]');
    });

    it('should use default max size when not specified', async () => {
      const mediumContent = 'y'.repeat(50000);

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 50000, isFile: () => true });
      mockReadFileSync.mockReturnValue(mediumContent);

      const service = createDocScannerService();
      const content = await service.readDoc('/test/workspace/MEDIUM.md');

      // Default is 100KB, so 50KB should not be truncated
      expect(content).toBe(mediumContent);
    });
  });

  describe('createDocScannerService', () => {
    it('should create a service instance', () => {
      const service = createDocScannerService();
      expect(service).toBeDefined();
      expect(typeof service.scanForDocs).toBe('function');
      expect(typeof service.readDoc).toBe('function');
    });
  });
});
