/**
 * Unit tests for Tech Stack Detector Service
 *
 * Tests detection of languages, frameworks, and runtimes from project files.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  TechStackDetectorService,
  createTechStackDetectorService,
} from '../../../src/services/onboarding/tech-stack-detector.js';

// Mock fs functions
vi.mock('node:fs', () => {
  const mockExistsSync = vi.fn();
  const mockReadFileSync = vi.fn();
  return {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

describe('TechStackDetectorService', () => {
  const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
  const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('detectTechStack', () => {
    it('should detect TypeScript from devDependencies', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          devDependencies: {
            typescript: '^5.0.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const tsItem = result.languages.find((l) => l.name === 'TypeScript');
      expect(tsItem).toBeDefined();
      expect(tsItem?.confidence).toBeGreaterThan(0.7);
      expect(tsItem?.source).toContain('devDependencies');
    });

    it('should detect TypeScript from tsconfig.json', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('tsconfig.json');
      });

      mockReadFileSync.mockImplementation(() => {
        throw new Error('Not used');
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const tsItem = result.languages.find((l) => l.name === 'TypeScript');
      expect(tsItem).toBeDefined();
      expect(tsItem?.source).toContain('tsconfig.json');
    });

    it('should detect React from dependencies', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          dependencies: {
            react: '^18.0.0',
            'react-dom': '^18.0.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const reactItem = result.frameworks.find((f) => f.name === 'React');
      expect(reactItem).toBeDefined();
      expect(reactItem?.confidence).toBeGreaterThan(0.8);
    });

    it('should detect Vue from dependencies', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          dependencies: {
            vue: '^3.0.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const vueItem = result.frameworks.find((f) => f.name === 'Vue');
      expect(vueItem).toBeDefined();
    });

    it('should detect Angular from dependencies', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          dependencies: {
            '@angular/core': '^16.0.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const angularItem = result.frameworks.find((f) => f.name === 'Angular');
      expect(angularItem).toBeDefined();
    });

    it('should detect Python from requirements.txt', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('requirements.txt');
      });

      mockReadFileSync.mockImplementation(() => {
        throw new Error('Not used');
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const pythonItem = result.languages.find((l) => l.name === 'Python');
      expect(pythonItem).toBeDefined();
      expect(pythonItem?.source).toContain('requirements.txt');
    });

    it('should detect Python from pyproject.toml', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('pyproject.toml');
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const pythonItem = result.languages.find((l) => l.name === 'Python');
      expect(pythonItem).toBeDefined();
    });

    it('should detect Rust from Cargo.toml', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('Cargo.toml');
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const rustItem = result.languages.find((l) => l.name === 'Rust');
      expect(rustItem).toBeDefined();
      expect(rustItem?.source).toContain('Cargo.toml');
    });

    it('should detect Go from go.mod', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('go.mod');
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const goItem = result.languages.find((l) => l.name === 'Go');
      expect(goItem).toBeDefined();
    });

    it('should detect Node.js runtime from package.json', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          engines: {
            node: '>=18.0.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const nodeItem = result.runtimes.find((r) => r.name === 'Node.js');
      expect(nodeItem).toBeDefined();
    });

    it('should detect Jest testing framework', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          devDependencies: {
            jest: '^29.0.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const jestItem = result.tools.find((t) => t.name === 'Jest');
      expect(jestItem).toBeDefined();
    });

    it('should detect Vitest testing framework', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          devDependencies: {
            vitest: '^1.0.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const vitestItem = result.tools.find((t) => t.name === 'Vitest');
      expect(vitestItem).toBeDefined();
    });

    it('should return confidence scores between 0 and 1', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path.includes('package.json') ||
          path.includes('tsconfig.json') ||
          path.includes('Cargo.toml')
        );
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          dependencies: { react: '^18.0.0' },
          devDependencies: { typescript: '^5.0.0' },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const allItems = [
        ...result.languages,
        ...result.frameworks,
        ...result.runtimes,
        ...result.tools,
      ];

      for (const item of allItems) {
        expect(item.confidence).toBeGreaterThanOrEqual(0);
        expect(item.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should return empty arrays when no tech stack detected', async () => {
      mockExistsSync.mockReturnValue(false);

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      expect(result.languages).toEqual([]);
      expect(result.frameworks).toEqual([]);
      expect(result.runtimes).toEqual([]);
      expect(result.tools).toEqual([]);
    });

    it('should handle malformed package.json gracefully', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return 'not valid json';
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      // Should not crash and return empty or partial results
      expect(result).toBeDefined();
      expect(Array.isArray(result.languages)).toBe(true);
    });

    it('should detect Next.js from dependencies', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          dependencies: {
            next: '^14.0.0',
            react: '^18.0.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const nextItem = result.frameworks.find((f) => f.name === 'Next.js');
      expect(nextItem).toBeDefined();
    });

    it('should detect Express.js from dependencies', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          dependencies: {
            express: '^4.18.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const expressItem = result.frameworks.find((f) => f.name === 'Express');
      expect(expressItem).toBeDefined();
    });

    it('should detect ESLint from devDependencies', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          devDependencies: {
            eslint: '^8.0.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const eslintItem = result.tools.find((t) => t.name === 'ESLint');
      expect(eslintItem).toBeDefined();
    });

    it('should detect Prettier from devDependencies', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify({
          devDependencies: {
            prettier: '^3.0.0',
          },
        });
      });

      const service = createTechStackDetectorService();
      const result = await service.detectTechStack('/test/workspace');

      const prettierItem = result.tools.find((t) => t.name === 'Prettier');
      expect(prettierItem).toBeDefined();
    });
  });

  describe('createTechStackDetectorService', () => {
    it('should create a service instance', () => {
      const service = createTechStackDetectorService();
      expect(service).toBeDefined();
      expect(typeof service.detectTechStack).toBe('function');
    });
  });
});
