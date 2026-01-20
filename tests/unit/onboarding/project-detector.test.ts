/**
 * Unit tests for Project Detector Service
 *
 * Tests project info extraction from package.json, .git/config, and directory name.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  ProjectDetectorService,
  createProjectDetectorService,
} from '../../../src/services/onboarding/project-detector.js';

// Mock fs functions
vi.mock('node:fs', () => {
  const mockExistsSync = vi.fn();
  const mockReadFileSync = vi.fn();
  return {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

describe('ProjectDetectorService', () => {
  const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
  const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('detectProjectInfo', () => {
    it('should extract name and description from package.json', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          name: 'my-awesome-project',
          description: 'An awesome project',
          version: '1.0.0',
        });
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/workspace');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('my-awesome-project');
      expect(result?.description).toBe('An awesome project');
      expect(result?.version).toBe('1.0.0');
      expect(result?.source).toBe('package.json');
    });

    it('should extract scoped package name correctly', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          name: '@myorg/my-project',
          description: 'A scoped package',
        });
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/workspace');

      expect(result?.name).toBe('@myorg/my-project');
      expect(result?.source).toBe('package.json');
    });

    it('should extract repo name from .git/config', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return false;
        if (path.includes('.git/config')) return true;
        if (path.includes('.git')) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('.git/config')) {
          return `[remote "origin"]
  url = https://github.com/myuser/my-git-repo.git
  fetch = +refs/heads/*:refs/remotes/origin/*`;
        }
        throw new Error('File not found');
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/workspace');

      expect(result?.name).toBe('my-git-repo');
      expect(result?.source).toBe('git');
    });

    it('should handle SSH git URLs', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return false;
        if (path.includes('.git/config')) return true;
        if (path.includes('.git')) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('.git/config')) {
          return `[remote "origin"]
  url = git@github.com:myuser/ssh-repo.git
  fetch = +refs/heads/*:refs/remotes/origin/*`;
        }
        throw new Error('File not found');
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/workspace');

      expect(result?.name).toBe('ssh-repo');
      expect(result?.source).toBe('git');
    });

    it('should use directory name as fallback', async () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/my-fallback-project');

      expect(result?.name).toBe('my-fallback-project');
      expect(result?.source).toBe('directory');
    });

    it('should handle missing package.json name field', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        if (path.includes('.git')) return false;
        return false;
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          description: 'No name field',
          version: '1.0.0',
        });
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/fallback-dir');

      // Should fall back to directory name
      expect(result?.name).toBe('fallback-dir');
      expect(result?.source).toBe('directory');
    });

    it('should handle malformed package.json gracefully', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return 'not valid json {';
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/my-project');

      // Should fall back to directory name
      expect(result?.name).toBe('my-project');
      expect(result?.source).toBe('directory');
    });

    it('should handle unreadable git config gracefully', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return false;
        if (path.includes('.git')) return true;
        return false;
      });

      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/my-project');

      // Should fall back to directory name
      expect(result?.name).toBe('my-project');
      expect(result?.source).toBe('directory');
    });

    it('should prefer package.json over git', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json') || path.includes('.git');
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return JSON.stringify({
            name: 'package-name',
            description: 'From package.json',
          });
        }
        if (path.includes('.git/config')) {
          return `[remote "origin"]
  url = https://github.com/myuser/git-name.git`;
        }
        throw new Error('File not found');
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/workspace');

      expect(result?.name).toBe('package-name');
      expect(result?.source).toBe('package.json');
    });

    it('should handle empty directory path', async () => {
      mockExistsSync.mockReturnValue(false);

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('');

      // Should handle empty path without crashing
      expect(result).not.toBeNull();
    });

    it('should trim .git suffix from repository names', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return false;
        if (path.includes('.git')) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('.git/config')) {
          return `[remote "origin"]
  url = https://github.com/myuser/repo-with-git.git`;
        }
        throw new Error('File not found');
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/workspace');

      expect(result?.name).toBe('repo-with-git');
      expect(result?.name).not.toContain('.git');
    });

    it('should handle git URLs without .git suffix', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) return false;
        if (path.includes('.git')) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('.git/config')) {
          return `[remote "origin"]
  url = https://github.com/myuser/repo-no-suffix`;
        }
        throw new Error('File not found');
      });

      const service = createProjectDetectorService();
      const result = await service.detectProjectInfo('/test/workspace');

      expect(result?.name).toBe('repo-no-suffix');
    });
  });

  describe('createProjectDetectorService', () => {
    it('should create a service instance', () => {
      const service = createProjectDetectorService();
      expect(service).toBeDefined();
      expect(typeof service.detectProjectInfo).toBe('function');
    });
  });
});
