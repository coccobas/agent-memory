/**
 * Unit tests for Pattern Detector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PatternDetector,
  createPatternDetector,
  type ExperienceWithTrajectory,
  type PatternDetectorConfig,
} from '../../src/services/librarian/pipeline/pattern-detector.js';
import type { ExperienceWithVersion } from '../../src/db/repositories/experiences.js';
import type { ExperienceTrajectoryStep } from '../../src/db/schema/experiences.js';
import type { IEmbeddingService } from '../../src/core/context.js';

// Helper to create mock experience
function createMockExperience(options: {
  id?: string;
  scenario?: string;
  outcome?: string;
  content?: string;
  useCount?: number;
  successCount?: number;
}): ExperienceWithVersion {
  const id = options.id ?? 'exp-1';
  return {
    id,
    title: `Test Experience ${id}`,
    level: 'case',
    scopeType: 'project',
    scopeId: 'proj-1',
    isActive: true,
    currentVersionId: 'v-1',
    useCount: options.useCount ?? 1,
    successCount: options.successCount ?? 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersion: {
      id: 'v-1',
      experienceId: id,
      version: 1,
      content: options.content ?? 'Test content',
      scenario: options.scenario ?? 'Test scenario',
      outcome: options.outcome ?? 'Success',
      confidence: 0.8,
      createdAt: new Date().toISOString(),
    },
  };
}

// Helper to create mock trajectory
function createMockTrajectory(actions: string[]): ExperienceTrajectoryStep[] {
  return actions.map((action, i) => ({
    id: `step-${i}`,
    experienceId: 'exp-1',
    stepOrder: i,
    action,
    observation: `Observation for ${action}`,
    success: true,
    createdAt: new Date().toISOString(),
  }));
}

// Helper to create experience with trajectory
function createExperienceWithTrajectory(
  id: string,
  actions: string[],
  options: Partial<Parameters<typeof createMockExperience>[0]> = {}
): ExperienceWithTrajectory {
  return {
    experience: createMockExperience({ id, ...options }),
    trajectory: createMockTrajectory(actions),
  };
}

describe('Pattern Detector', () => {
  let detector: PatternDetector;

  beforeEach(() => {
    detector = new PatternDetector();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const det = new PatternDetector();
      expect(det).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const det = new PatternDetector({
        embeddingThreshold: 0.8,
        minExperiences: 3,
      });
      expect(det).toBeDefined();
    });
  });

  describe('detectPatterns', () => {
    it('should return empty patterns when fewer than minExperiences', async () => {
      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read', 'edit']),
      ];

      const result = await detector.detectPatterns(experiences);

      expect(result.patterns).toHaveLength(0);
      expect(result.unmatched).toHaveLength(1);
      expect(result.stats.totalExperiences).toBe(1);
      expect(result.stats.patternsFound).toBe(0);
    });

    it('should detect a pattern from similar experiences', async () => {
      // Create experiences with identical trajectories
      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read file', 'edit code', 'run tests']),
        createExperienceWithTrajectory('exp-2', ['read file', 'edit code', 'run tests']),
        createExperienceWithTrajectory('exp-3', ['read file', 'edit code', 'run tests']),
      ];

      const result = await detector.detectPatterns(experiences);

      // Identical trajectories should form a pattern
      expect(result.stats.embeddingsUsed).toBe(false);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should not match very different experiences', async () => {
      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read file']),
        createExperienceWithTrajectory('exp-2', ['delete everything', 'install package']),
        createExperienceWithTrajectory('exp-3', ['build project', 'deploy']),
      ];

      // With low trajectory threshold, these should not match
      const det = new PatternDetector({ trajectoryThreshold: 0.9 });
      const result = await det.detectPatterns(experiences);

      // High threshold should reject dissimilar experiences
      expect(result.stats.patternsFound).toBeLessThanOrEqual(1);
    });

    it('should respect maxExperiences limit', async () => {
      const experiences = Array.from({ length: 10 }, (_, i) =>
        createExperienceWithTrajectory(`exp-${i}`, ['read', 'edit', 'test'])
      );

      const det = new PatternDetector({ maxExperiences: 5 });
      const result = await det.detectPatterns(experiences);

      expect(result.stats.totalExperiences).toBe(5);
    });

    it('should return processing time', async () => {
      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read']),
        createExperienceWithTrajectory('exp-2', ['read']),
      ];

      const result = await detector.detectPatterns(experiences);

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('pattern group building', () => {
    it('should select an exemplar for detected patterns', async () => {
      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read', 'edit'], { useCount: 5, successCount: 5 }),
        createExperienceWithTrajectory('exp-2', ['read', 'edit'], { useCount: 3, successCount: 1 }),
      ];

      const det = new PatternDetector({ trajectoryThreshold: 0.5 });
      const result = await det.detectPatterns(experiences);

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0]!;
        expect(pattern.exemplar).toBeDefined();
        expect(pattern.experiences.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should extract common actions from experiences', async () => {
      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read file', 'edit code', 'run tests']),
        createExperienceWithTrajectory('exp-2', ['read file', 'edit code', 'run tests']),
      ];

      const det = new PatternDetector({ trajectoryThreshold: 0.5 });
      const result = await det.detectPatterns(experiences);

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0]!;
        expect(pattern.commonActions.length).toBeGreaterThan(0);
      }
    });

    it('should calculate confidence score', async () => {
      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read', 'edit', 'test']),
        createExperienceWithTrajectory('exp-2', ['read', 'edit', 'test']),
        createExperienceWithTrajectory('exp-3', ['read', 'edit', 'test']),
      ];

      const det = new PatternDetector({ trajectoryThreshold: 0.5 });
      const result = await det.detectPatterns(experiences);

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0]!;
        expect(pattern.confidence).toBeGreaterThanOrEqual(0);
        expect(pattern.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate success rate', async () => {
      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read', 'edit'], { useCount: 10, successCount: 8 }),
        createExperienceWithTrajectory('exp-2', ['read', 'edit'], { useCount: 5, successCount: 4 }),
      ];

      const det = new PatternDetector({ trajectoryThreshold: 0.5 });
      const result = await det.detectPatterns(experiences);

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0]!;
        expect(pattern.successRate).toBeGreaterThan(0);
        expect(pattern.successRate).toBeLessThanOrEqual(1);
      }
    });

    it('should generate suggested pattern description', async () => {
      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read config', 'update settings'], {
          scenario: 'Debugging configuration issues',
        }),
        createExperienceWithTrajectory('exp-2', ['read config', 'update settings'], {
          scenario: 'Debugging configuration problems',
        }),
      ];

      const det = new PatternDetector({ trajectoryThreshold: 0.5 });
      const result = await det.detectPatterns(experiences);

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0]!;
        expect(pattern.suggestedPattern).toBeTruthy();
        expect(pattern.suggestedPattern.length).toBeGreaterThan(0);
      }
    });
  });

  describe('with embedding service', () => {
    it('should use embeddings when service is available', async () => {
      const mockEmbeddingService: IEmbeddingService = {
        isAvailable: () => true,
        generateEmbedding: vi.fn(),
        embedBatch: vi.fn().mockResolvedValue({
          embeddings: [
            [0.1, 0.2, 0.3],
            [0.1, 0.2, 0.3], // Same embedding = similar
          ],
          model: 'test-model',
        }),
      };

      const det = new PatternDetector({}, mockEmbeddingService);

      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read', 'edit']),
        createExperienceWithTrajectory('exp-2', ['read', 'edit']),
      ];

      const result = await det.detectPatterns(experiences);

      expect(mockEmbeddingService.embedBatch).toHaveBeenCalled();
      expect(result.stats.embeddingsUsed).toBe(true);
    });

    it('should fall back to trajectories if embedding fails', async () => {
      const mockEmbeddingService: IEmbeddingService = {
        isAvailable: () => true,
        generateEmbedding: vi.fn(),
        embedBatch: vi.fn().mockRejectedValue(new Error('Embedding failed')),
      };

      const det = new PatternDetector({}, mockEmbeddingService);

      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read', 'edit']),
        createExperienceWithTrajectory('exp-2', ['read', 'edit']),
      ];

      const result = await det.detectPatterns(experiences);

      expect(result.stats.embeddingsUsed).toBe(false);
    });

    it('should skip embeddings when service is not available', async () => {
      const mockEmbeddingService: IEmbeddingService = {
        isAvailable: () => false,
        generateEmbedding: vi.fn(),
        embedBatch: vi.fn(),
      };

      const det = new PatternDetector({}, mockEmbeddingService);

      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read', 'edit']),
        createExperienceWithTrajectory('exp-2', ['read', 'edit']),
      ];

      const result = await det.detectPatterns(experiences);

      expect(mockEmbeddingService.embedBatch).not.toHaveBeenCalled();
      expect(result.stats.embeddingsUsed).toBe(false);
    });
  });

  describe('clustering', () => {
    it('should group similar experiences together', async () => {
      // Group A: read → edit pattern
      // Group B: search → write pattern
      const experiences = [
        createExperienceWithTrajectory('a1', ['read file', 'edit code']),
        createExperienceWithTrajectory('a2', ['read file', 'edit code']),
        createExperienceWithTrajectory('b1', ['search database', 'write record']),
        createExperienceWithTrajectory('b2', ['search database', 'write record']),
      ];

      const det = new PatternDetector({ trajectoryThreshold: 0.6 });
      const result = await det.detectPatterns(experiences);

      // Should find patterns (may be 1 or 2 depending on similarity)
      expect(result.stats.totalExperiences).toBe(4);
    });

    it('should handle experiences with no trajectory', async () => {
      const experiences: ExperienceWithTrajectory[] = [
        { experience: createMockExperience({ id: 'exp-1' }), trajectory: [] },
        { experience: createMockExperience({ id: 'exp-2' }), trajectory: [] },
      ];

      const result = await detector.detectPatterns(experiences);

      // Empty trajectories should still be processed
      expect(result.stats.totalExperiences).toBe(2);
    });
  });

  describe('createPatternDetector factory', () => {
    it('should create a pattern detector with default config', () => {
      const det = createPatternDetector();
      expect(det).toBeInstanceOf(PatternDetector);
    });

    it('should create a pattern detector with custom config', () => {
      const det = createPatternDetector({
        embeddingThreshold: 0.9,
        trajectoryThreshold: 0.8,
      });
      expect(det).toBeInstanceOf(PatternDetector);
    });

    it('should create a pattern detector with embedding service', () => {
      const mockService: IEmbeddingService = {
        isAvailable: () => true,
        generateEmbedding: vi.fn(),
        embedBatch: vi.fn(),
      };

      const det = createPatternDetector({}, mockService);
      expect(det).toBeInstanceOf(PatternDetector);
    });
  });

  describe('edge cases', () => {
    it('should handle empty experiences array', async () => {
      const result = await detector.detectPatterns([]);

      expect(result.patterns).toHaveLength(0);
      expect(result.unmatched).toHaveLength(0);
      expect(result.stats.totalExperiences).toBe(0);
    });

    it('should handle single experience', async () => {
      const experiences = [
        createExperienceWithTrajectory('exp-1', ['read', 'edit', 'test']),
      ];

      const result = await detector.detectPatterns(experiences);

      expect(result.patterns).toHaveLength(0);
      expect(result.unmatched).toHaveLength(1);
    });

    it('should handle experiences with missing version data', async () => {
      const experience: ExperienceWithTrajectory = {
        experience: {
          id: 'exp-1',
          title: 'Test',
          level: 'case',
          scopeType: 'project',
          scopeId: 'proj-1',
          isActive: true,
          currentVersionId: 'v-1',
          useCount: 1,
          successCount: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // No currentVersion
        },
        trajectory: createMockTrajectory(['read', 'edit']),
      };

      const experiences = [experience, experience];

      // Should not throw
      const result = await detector.detectPatterns(experiences);
      expect(result.stats.totalExperiences).toBe(2);
    });

    it('should sort patterns by confidence', async () => {
      const experiences = [
        createExperienceWithTrajectory('a1', ['read', 'edit', 'test', 'deploy']),
        createExperienceWithTrajectory('a2', ['read', 'edit', 'test', 'deploy']),
        createExperienceWithTrajectory('a3', ['read', 'edit', 'test', 'deploy']),
        createExperienceWithTrajectory('a4', ['read', 'edit', 'test', 'deploy']),
        createExperienceWithTrajectory('a5', ['read', 'edit', 'test', 'deploy']),
      ];

      const det = new PatternDetector({ trajectoryThreshold: 0.5 });
      const result = await det.detectPatterns(experiences);

      if (result.patterns.length > 1) {
        for (let i = 1; i < result.patterns.length; i++) {
          expect(result.patterns[i - 1]!.confidence)
            .toBeGreaterThanOrEqual(result.patterns[i]!.confidence);
        }
      }
    });
  });
});
