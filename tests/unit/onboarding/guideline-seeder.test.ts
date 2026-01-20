/**
 * Unit tests for Guideline Seeder Service
 *
 * Tests guideline template selection and seeding based on tech stack.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GuidelineSeederService,
  createGuidelineSeederService,
} from '../../../src/services/onboarding/guideline-seeder.js';
import type { TechStackInfo, GuidelineTemplate } from '../../../src/services/onboarding/types.js';

describe('GuidelineSeederService', () => {
  const mockGuidelineRepo = {
    findByName: vi.fn(),
    create: vi.fn(),
    bulkCreate: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deactivate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGuidelineRepo.findByName.mockResolvedValue(null);
    mockGuidelineRepo.create.mockImplementation(async (data) => ({
      id: `guid-${Date.now()}`,
      ...data,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mockGuidelineRepo.bulkCreate.mockImplementation(async (entries) =>
      entries.map((e: unknown, i: number) => ({
        id: `guid-${i}`,
        ...(e as Record<string, unknown>),
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
    );
  });

  describe('getGuidelinesForTechStack', () => {
    it('should return TypeScript guidelines for TypeScript projects', () => {
      const techStack: TechStackInfo = {
        languages: [
          { name: 'TypeScript', category: 'language', confidence: 0.9, source: 'tsconfig' },
        ],
        frameworks: [],
        runtimes: [],
        tools: [],
      };

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const guidelines = service.getGuidelinesForTechStack(techStack);

      const tsGuideline = guidelines.find((g) => g.name.includes('typescript'));
      expect(tsGuideline).toBeDefined();
    });

    it('should return React guidelines for React projects', () => {
      const techStack: TechStackInfo = {
        languages: [],
        frameworks: [{ name: 'React', category: 'framework', confidence: 0.9, source: 'deps' }],
        runtimes: [],
        tools: [],
      };

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const guidelines = service.getGuidelinesForTechStack(techStack);

      const reactGuideline = guidelines.find((g) => g.category === 'react');
      expect(reactGuideline).toBeDefined();
    });

    it('should combine multiple tech stack guidelines', () => {
      const techStack: TechStackInfo = {
        languages: [
          { name: 'TypeScript', category: 'language', confidence: 0.9, source: 'tsconfig' },
        ],
        frameworks: [{ name: 'React', category: 'framework', confidence: 0.9, source: 'deps' }],
        runtimes: [
          { name: 'Node.js', category: 'runtime', confidence: 0.8, source: 'package.json' },
        ],
        tools: [],
      };

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const guidelines = service.getGuidelinesForTechStack(techStack);

      // Should have TS, React, and Node guidelines
      expect(guidelines.some((g) => g.category === 'typescript')).toBe(true);
      expect(guidelines.some((g) => g.category === 'react')).toBe(true);
      expect(guidelines.some((g) => g.category === 'nodejs')).toBe(true);
    });

    it('should always include general guidelines', () => {
      const techStack: TechStackInfo = {
        languages: [],
        frameworks: [],
        runtimes: [],
        tools: [],
      };

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const guidelines = service.getGuidelinesForTechStack(techStack);

      // Should have at least the general guidelines
      expect(guidelines.length).toBeGreaterThan(0);
      expect(
        guidelines.some((g) => g.category === 'testing' || g.category === 'code-quality')
      ).toBe(true);
    });

    it('should not duplicate guidelines when multiple stacks share them', () => {
      const techStack: TechStackInfo = {
        languages: [
          { name: 'TypeScript', category: 'language', confidence: 0.9, source: 'tsconfig' },
        ],
        frameworks: [
          { name: 'Next.js', category: 'framework', confidence: 0.9, source: 'deps' }, // Implies React
          { name: 'React', category: 'framework', confidence: 0.8, source: 'deps' },
        ],
        runtimes: [],
        tools: [],
      };

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const guidelines = service.getGuidelinesForTechStack(techStack);

      // Check for no duplicates
      const names = guidelines.map((g) => g.name);
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });

    it('should return Python guidelines for Python projects', () => {
      const techStack: TechStackInfo = {
        languages: [
          { name: 'Python', category: 'language', confidence: 0.9, source: 'requirements' },
        ],
        frameworks: [],
        runtimes: [],
        tools: [],
      };

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const guidelines = service.getGuidelinesForTechStack(techStack);

      const pythonGuideline = guidelines.find((g) => g.category === 'python');
      expect(pythonGuideline).toBeDefined();
    });

    it('should return Rust guidelines for Rust projects', () => {
      const techStack: TechStackInfo = {
        languages: [{ name: 'Rust', category: 'language', confidence: 0.9, source: 'Cargo.toml' }],
        frameworks: [],
        runtimes: [],
        tools: [],
      };

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const guidelines = service.getGuidelinesForTechStack(techStack);

      const rustGuideline = guidelines.find((g) => g.category === 'rust');
      expect(rustGuideline).toBeDefined();
    });

    it('should return Go guidelines for Go projects', () => {
      const techStack: TechStackInfo = {
        languages: [{ name: 'Go', category: 'language', confidence: 0.9, source: 'go.mod' }],
        frameworks: [],
        runtimes: [],
        tools: [],
      };

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const guidelines = service.getGuidelinesForTechStack(techStack);

      const goGuideline = guidelines.find((g) => g.category === 'go');
      expect(goGuideline).toBeDefined();
    });

    it('should sort guidelines by priority', () => {
      const techStack: TechStackInfo = {
        languages: [
          { name: 'TypeScript', category: 'language', confidence: 0.9, source: 'tsconfig' },
        ],
        frameworks: [{ name: 'React', category: 'framework', confidence: 0.9, source: 'deps' }],
        runtimes: [],
        tools: [],
      };

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const guidelines = service.getGuidelinesForTechStack(techStack);

      // Check that guidelines are sorted by priority (descending)
      for (let i = 1; i < guidelines.length; i++) {
        expect(guidelines[i - 1].priority).toBeGreaterThanOrEqual(guidelines[i].priority);
      }
    });
  });

  describe('seedGuidelines', () => {
    it('should skip existing guidelines with same name', async () => {
      // Mock that one guideline already exists
      mockGuidelineRepo.findByName.mockImplementation(async (name: string) => {
        if (name === 'tdd-workflow') {
          return { id: 'existing-guid', name: 'tdd-workflow', content: 'existing' };
        }
        return null;
      });

      const guidelines: GuidelineTemplate[] = [
        { name: 'tdd-workflow', content: 'Test first', category: 'testing', priority: 75 },
        { name: 'small-functions', content: 'Keep small', category: 'code-quality', priority: 70 },
      ];

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const result = await service.seedGuidelines('proj-123', guidelines, 'agent-1');

      expect(result.skipped).toContainEqual({
        name: 'tdd-workflow',
        reason: 'guideline with this name already exists',
      });
      expect(result.created.length).toBe(1);
      expect(result.created[0].name).toBe('small-functions');
    });

    it('should use bulk_add for efficiency', async () => {
      const guidelines: GuidelineTemplate[] = [
        { name: 'guideline-1', content: 'Content 1', category: 'test', priority: 80 },
        { name: 'guideline-2', content: 'Content 2', category: 'test', priority: 70 },
        { name: 'guideline-3', content: 'Content 3', category: 'test', priority: 60 },
      ];

      const service = createGuidelineSeederService(mockGuidelineRepo);
      await service.seedGuidelines('proj-123', guidelines, 'agent-1');

      // Should call bulkCreate once, not create 3 times
      expect(mockGuidelineRepo.bulkCreate).toHaveBeenCalledTimes(1);
    });

    it('should return errors for failed creations', async () => {
      mockGuidelineRepo.bulkCreate.mockRejectedValue(new Error('Database error'));

      const guidelines: GuidelineTemplate[] = [
        { name: 'guideline-1', content: 'Content 1', category: 'test', priority: 80 },
      ];

      const service = createGuidelineSeederService(mockGuidelineRepo);
      const result = await service.seedGuidelines('proj-123', guidelines, 'agent-1');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('Database error');
    });

    it('should set correct scope for created guidelines', async () => {
      const guidelines: GuidelineTemplate[] = [
        { name: 'test-guideline', content: 'Test', category: 'test', priority: 80 },
      ];

      const service = createGuidelineSeederService(mockGuidelineRepo);
      await service.seedGuidelines('proj-123', guidelines, 'agent-1');

      expect(mockGuidelineRepo.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            scopeType: 'project',
            scopeId: 'proj-123',
            createdBy: 'agent-1',
          }),
        ])
      );
    });

    it('should return empty results for empty guidelines array', async () => {
      const service = createGuidelineSeederService(mockGuidelineRepo);
      const result = await service.seedGuidelines('proj-123', [], 'agent-1');

      expect(result.created).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });

  describe('createGuidelineSeederService', () => {
    it('should create a service instance', () => {
      const service = createGuidelineSeederService(mockGuidelineRepo);
      expect(service).toBeDefined();
      expect(typeof service.getGuidelinesForTechStack).toBe('function');
      expect(typeof service.seedGuidelines).toBe('function');
    });
  });
});
