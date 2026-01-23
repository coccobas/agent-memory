import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Recommender } from '../../../src/services/librarian/pipeline/recommender.js';
import type { PatternGroup } from '../../../src/services/librarian/pipeline/pattern-detector.js';
import type { QualityGateResult } from '../../../src/services/librarian/pipeline/quality-gate.js';
import type { IExtractionService } from '../../../src/core/context.js';

function createMockExtractionService(response?: {
  entries: Array<{ type: string; content: string }>;
}): IExtractionService {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    getProvider: vi.fn().mockReturnValue('ollama'),
    extract: vi.fn().mockResolvedValue({
      entries: response?.entries ?? [],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'ollama',
      processingTimeMs: 100,
    }),
  };
}

function createMockPattern(experienceCount: number = 3): PatternGroup {
  const experiences = Array.from({ length: experienceCount }, (_, i) => ({
    experience: {
      id: `exp-${i}`,
      title: `Fixed bug ${i}`,
      category: 'debugging',
      currentVersion: {
        scenario: 'Build was failing with timeout error',
        outcome: 'success',
        content: 'Increased timeout and added retry logic',
      },
    },
    trajectory: [
      { action: 'Read error logs', observation: 'Found timeout error' },
      { action: 'Check configuration', observation: 'Timeout was too low' },
      { action: 'Increase timeout', observation: 'Build passed' },
    ],
  }));

  return {
    exemplar: experiences[0],
    experiences,
    confidence: 0.85,
  } as PatternGroup;
}

function createMockQualityResult(): QualityGateResult {
  return {
    disposition: 'review',
    adjustedConfidence: 0.82,
    checks: [
      { name: 'similarity', passed: true, score: 0.85 },
      { name: 'pattern_size', passed: true, score: 1.0 },
    ],
  };
}

describe('Recommender', () => {
  describe('LLM synthesis', () => {
    it('should use LLM-synthesized content when extraction service is available', async () => {
      const extractionService = createMockExtractionService({
        entries: [
          {
            type: 'knowledge',
            content: JSON.stringify({
              title: 'Handle timeouts with retry and backoff',
              pattern: 'When encountering timeout errors, increase timeout and add retry logic',
              when_to_apply: 'When builds or API calls fail with timeout errors',
              when_not_to_apply:
                'When the timeout is already at maximum or retries would cause data corruption',
            }),
          },
        ],
      });

      const recommender = new Recommender({ extractionService });
      const pattern = createMockPattern();
      const quality = createMockQualityResult();
      const evaluations = new Map<PatternGroup, QualityGateResult>([[pattern, quality]]);

      const result = await recommender.generateRecommendations([pattern], evaluations, {
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].input.title).toBe('Handle timeouts with retry and backoff');
      expect(result.recommendations[0].input.pattern).toContain('timeout errors');
      expect(result.recommendations[0].input.applicability).toContain('timeout');
      expect(extractionService.extract).toHaveBeenCalled();
    });

    it('should fall back to heuristics when LLM returns invalid JSON', async () => {
      const extractionService = createMockExtractionService({
        entries: [{ type: 'knowledge', content: 'This is not valid JSON' }],
      });

      const recommender = new Recommender({ extractionService });
      const pattern = createMockPattern();
      const quality = createMockQualityResult();
      const evaluations = new Map<PatternGroup, QualityGateResult>([[pattern, quality]]);

      const result = await recommender.generateRecommendations([pattern], evaluations, {
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].input.title).toContain('Pattern:');
      expect(extractionService.extract).toHaveBeenCalled();
    });

    it('should fall back to heuristics when extraction service is unavailable', async () => {
      const extractionService = createMockExtractionService();
      (extractionService.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const recommender = new Recommender({ extractionService });
      const pattern = createMockPattern();
      const quality = createMockQualityResult();
      const evaluations = new Map<PatternGroup, QualityGateResult>([[pattern, quality]]);

      const result = await recommender.generateRecommendations([pattern], evaluations, {
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].input.title).toContain('Pattern:');
      expect(extractionService.extract).not.toHaveBeenCalled();
    });

    it('should fall back to heuristics when extraction service throws', async () => {
      const extractionService = createMockExtractionService();
      (extractionService.extract as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('LLM unavailable')
      );

      const recommender = new Recommender({ extractionService });
      const pattern = createMockPattern();
      const quality = createMockQualityResult();
      const evaluations = new Map<PatternGroup, QualityGateResult>([[pattern, quality]]);

      const result = await recommender.generateRecommendations([pattern], evaluations, {
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].input.title).toContain('Pattern:');
    });

    it('should work without extraction service (heuristics only)', async () => {
      const recommender = new Recommender();
      const pattern = createMockPattern();
      const quality = createMockQualityResult();
      const evaluations = new Map<PatternGroup, QualityGateResult>([[pattern, quality]]);

      const result = await recommender.generateRecommendations([pattern], evaluations, {
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].input.title).toBeDefined();
      expect(result.recommendations[0].input.pattern).toBeDefined();
    });
  });

  describe('setExtractionService', () => {
    it('should allow setting extraction service after construction', async () => {
      const recommender = new Recommender();
      const extractionService = createMockExtractionService({
        entries: [
          {
            type: 'knowledge',
            content: JSON.stringify({
              title: 'Late-bound LLM title',
              pattern: 'Pattern from late-bound service',
              when_to_apply: 'Always',
              when_not_to_apply: 'Never',
            }),
          },
        ],
      });

      recommender.setExtractionService(extractionService);

      const pattern = createMockPattern();
      const quality = createMockQualityResult();
      const evaluations = new Map<PatternGroup, QualityGateResult>([[pattern, quality]]);

      const result = await recommender.generateRecommendations([pattern], evaluations, {
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.recommendations[0].input.title).toBe('Late-bound LLM title');
      expect(extractionService.extract).toHaveBeenCalled();
    });
  });

  describe('generateRecommendations', () => {
    it('should categorize patterns by disposition', async () => {
      const recommender = new Recommender();
      const pattern1 = createMockPattern();
      const pattern2 = createMockPattern();
      const pattern3 = createMockPattern();

      const evaluations = new Map<PatternGroup, QualityGateResult>([
        [pattern1, { disposition: 'review', adjustedConfidence: 0.8, checks: [] }],
        [pattern2, { disposition: 'auto_promote', adjustedConfidence: 0.95, checks: [] }],
        [pattern3, { disposition: 'reject', adjustedConfidence: 0.5, checks: [] }],
      ]);

      const result = await recommender.generateRecommendations(
        [pattern1, pattern2, pattern3],
        evaluations,
        { scopeType: 'project', scopeId: 'test-project' }
      );

      expect(result.recommendations).toHaveLength(1);
      expect(result.autoPromoted).toHaveLength(1);
      expect(result.rejected).toHaveLength(1);
      expect(result.stats.reviewQueued).toBe(1);
      expect(result.stats.autoPromoted).toBe(1);
      expect(result.stats.rejected).toBe(1);
    });

    it('should include source experience IDs in recommendation', async () => {
      const recommender = new Recommender();
      const pattern = createMockPattern(4);
      const quality = createMockQualityResult();
      const evaluations = new Map<PatternGroup, QualityGateResult>([[pattern, quality]]);

      const result = await recommender.generateRecommendations([pattern], evaluations, {
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.recommendations[0].input.sourceExperienceIds).toHaveLength(4);
      expect(result.recommendations[0].input.patternCount).toBe(4);
    });
  });
});
