/**
 * Tests for Adaptive Weights Calculator
 *
 * TDD: Tests written first to define expected behavior.
 *
 * The calculator learns optimal type weights per intent from outcome data,
 * blending learned weights with static defaults based on confidence.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AdaptiveWeightsCalculator,
  STATIC_INTENT_WEIGHTS,
  clampWeight,
  computeConfidence,
  blendWeights,
} from '../../../../src/services/prioritization/calculators/adaptive-weights.calculator.js';
import type {
  AdaptiveWeightsConfig,
  IntentTypeOutcomeData,
  AdaptiveTypeWeights,
} from '../../../../src/services/prioritization/types.js';
import type { QueryIntent } from '../../../../src/services/query-rewrite/types.js';

describe('Adaptive Weights Calculator', () => {
  describe('STATIC_INTENT_WEIGHTS', () => {
    it('should have weights for all intents', () => {
      const intents: QueryIntent[] = [
        'lookup',
        'how_to',
        'debug',
        'explore',
        'compare',
        'configure',
      ];

      for (const intent of intents) {
        expect(STATIC_INTENT_WEIGHTS[intent]).toBeDefined();
      }
    });

    it('should have weights for all entry types per intent', () => {
      const types = ['guideline', 'knowledge', 'tool', 'experience'] as const;

      for (const weights of Object.values(STATIC_INTENT_WEIGHTS)) {
        for (const type of types) {
          expect(weights[type]).toBeDefined();
          expect(typeof weights[type]).toBe('number');
        }
      }
    });

    it('should have reasonable weight values (0.5 to 2.0 range)', () => {
      for (const weights of Object.values(STATIC_INTENT_WEIGHTS)) {
        for (const weight of Object.values(weights)) {
          expect(weight).toBeGreaterThanOrEqual(0.5);
          expect(weight).toBeLessThanOrEqual(2.0);
        }
      }
    });
  });

  describe('clampWeight', () => {
    it('should return value unchanged when in range', () => {
      expect(clampWeight(1.0)).toBe(1.0);
      expect(clampWeight(1.5)).toBe(1.5);
      expect(clampWeight(0.8)).toBe(0.8);
    });

    it('should clamp values below minimum to 0.5', () => {
      expect(clampWeight(0.3)).toBe(0.5);
      expect(clampWeight(0)).toBe(0.5);
      expect(clampWeight(-1)).toBe(0.5);
    });

    it('should clamp values above maximum to 2.0', () => {
      expect(clampWeight(2.5)).toBe(2.0);
      expect(clampWeight(3.0)).toBe(2.0);
      expect(clampWeight(100)).toBe(2.0);
    });
  });

  describe('computeConfidence', () => {
    it('should return 0.1 for 10 samples', () => {
      expect(computeConfidence(10)).toBe(0.1);
    });

    it('should return 1.0 for 100+ samples', () => {
      expect(computeConfidence(100)).toBe(1.0);
      expect(computeConfidence(200)).toBe(1.0);
    });

    it('should scale linearly between 10 and 100', () => {
      expect(computeConfidence(50)).toBe(0.5);
      expect(computeConfidence(75)).toBe(0.75);
    });

    it('should return 0 for less than 10 samples', () => {
      expect(computeConfidence(5)).toBe(0);
      expect(computeConfidence(0)).toBe(0);
    });
  });

  describe('blendWeights', () => {
    const staticWeights: AdaptiveTypeWeights = {
      guideline: 1.0,
      knowledge: 1.0,
      tool: 1.0,
      experience: 1.0,
    };

    const learnedWeights: AdaptiveTypeWeights = {
      guideline: 1.2,
      knowledge: 1.4,
      tool: 0.8,
      experience: 1.6,
    };

    it('should return static weights when confidence is 0', () => {
      const result = blendWeights(learnedWeights, staticWeights, 0);

      expect(result.guideline).toBe(1.0);
      expect(result.knowledge).toBe(1.0);
      expect(result.tool).toBe(1.0);
      expect(result.experience).toBe(1.0);
    });

    it('should return learned weights when confidence is 1', () => {
      const result = blendWeights(learnedWeights, staticWeights, 1);

      expect(result.guideline).toBe(1.2);
      expect(result.knowledge).toBe(1.4);
      expect(result.tool).toBe(0.8);
      expect(result.experience).toBe(1.6);
    });

    it('should blend 50/50 when confidence is 0.5', () => {
      const result = blendWeights(learnedWeights, staticWeights, 0.5);

      // (0.5 * learned) + (0.5 * static)
      expect(result.guideline).toBe(1.1); // (0.5 * 1.2) + (0.5 * 1.0)
      expect(result.knowledge).toBe(1.2); // (0.5 * 1.4) + (0.5 * 1.0)
      expect(result.tool).toBe(0.9); // (0.5 * 0.8) + (0.5 * 1.0)
      expect(result.experience).toBe(1.3); // (0.5 * 1.6) + (0.5 * 1.0)
    });

    it('should clamp blended weights to valid range', () => {
      const extremeLearnedWeights: AdaptiveTypeWeights = {
        guideline: 3.0, // Would exceed 2.0
        knowledge: 0.2, // Would go below 0.5
        tool: 1.0,
        experience: 1.0,
      };

      const result = blendWeights(extremeLearnedWeights, staticWeights, 1);

      expect(result.guideline).toBe(2.0); // Clamped to max
      expect(result.knowledge).toBe(0.5); // Clamped to min
    });
  });

  describe('AdaptiveWeightsCalculator', () => {
    let calculator: AdaptiveWeightsCalculator;
    let mockGetOutcomes: ReturnType<typeof vi.fn>;

    const defaultConfig: AdaptiveWeightsConfig = {
      enabled: true,
      minSamplesForAdaptation: 10,
      learningRate: 0.1,
      lookbackDays: 30,
    };

    beforeEach(() => {
      mockGetOutcomes = vi.fn();
      calculator = new AdaptiveWeightsCalculator(defaultConfig, mockGetOutcomes);
    });

    describe('calculateWeights', () => {
      it('should return static weights when < minSamples', async () => {
        mockGetOutcomes.mockResolvedValue({
          totalSamples: 5,
          byType: [],
        });

        const result = await calculator.calculateWeights('lookup', 'scope-123');

        expect(result).toEqual(STATIC_INTENT_WEIGHTS.lookup);
      });

      it('should calculate weights from success rates', async () => {
        mockGetOutcomes.mockResolvedValue({
          totalSamples: 100,
          byType: [
            { entryType: 'knowledge', successRate: 0.8, totalRetrievals: 50 },
            { entryType: 'guideline', successRate: 0.6, totalRetrievals: 30 },
            { entryType: 'tool', successRate: 0.4, totalRetrievals: 15 },
            { entryType: 'experience', successRate: 0.9, totalRetrievals: 5 },
          ],
        });

        const result = await calculator.calculateWeights('lookup', 'scope-123');
        const staticWeights = STATIC_INTENT_WEIGHTS.lookup;

        // Higher success rate → positive adjustment from static baseline
        // knowledge: 0.8 success → +0.06 adjustment (above 0.5 neutral)
        expect(result.knowledge).toBeGreaterThan(staticWeights.knowledge);
        // guideline: 0.6 success → +0.02 adjustment
        expect(result.guideline).toBeGreaterThan(staticWeights.guideline);
        // tool: 0.4 success → -0.02 adjustment (below 0.5 neutral)
        expect(result.tool).toBeLessThan(staticWeights.tool);
        // experience: 0.9 success → +0.08 adjustment
        expect(result.experience).toBeGreaterThan(staticWeights.experience);
      });

      it('should apply learning rate (0.1) for gradual adaptation', async () => {
        // With 100 samples, confidence is 1.0, so full learning rate applies
        mockGetOutcomes.mockResolvedValue({
          totalSamples: 100,
          byType: [
            { entryType: 'knowledge', successRate: 1.0, totalRetrievals: 100 },
            { entryType: 'guideline', successRate: 0.5, totalRetrievals: 100 },
            { entryType: 'tool', successRate: 0.5, totalRetrievals: 100 },
            { entryType: 'experience', successRate: 0.5, totalRetrievals: 100 },
          ],
        });

        const result = await calculator.calculateWeights('lookup', 'scope-123');
        const staticWeight = STATIC_INTENT_WEIGHTS.lookup.knowledge;

        // Learning rate 0.1 means max 10% change per calculation
        // 100% success rate would push toward max weight, but limited by learning rate
        expect(result.knowledge).toBeGreaterThan(staticWeight);
        expect(result.knowledge).toBeLessThanOrEqual(staticWeight * 1.1 + 0.1); // Roughly 10% increase
      });

      it('should respect lookback window (30 days)', async () => {
        mockGetOutcomes.mockResolvedValue({
          totalSamples: 0,
          byType: [],
        });

        await calculator.calculateWeights('lookup', 'scope-123');

        expect(mockGetOutcomes).toHaveBeenCalledWith('lookup', 'scope-123', 30);
      });

      it('should calculate confidence from sample count', async () => {
        // 50 samples → 0.5 confidence
        mockGetOutcomes.mockResolvedValue({
          totalSamples: 50,
          byType: [
            { entryType: 'knowledge', successRate: 0.9, totalRetrievals: 50 },
            { entryType: 'guideline', successRate: 0.5, totalRetrievals: 50 },
            { entryType: 'tool', successRate: 0.5, totalRetrievals: 50 },
            { entryType: 'experience', successRate: 0.5, totalRetrievals: 50 },
          ],
        });

        const result = await calculator.calculateWeights('lookup', 'scope-123');

        // With 50% confidence, weights should be 50% static, 50% learned
        // The result should be between static and fully learned
        const staticWeight = STATIC_INTENT_WEIGHTS.lookup.knowledge;
        expect(result.knowledge).toBeGreaterThanOrEqual(staticWeight);
      });

      it('should blend learned and static by confidence', async () => {
        // 10 samples → 0.1 confidence (10% learned, 90% static)
        mockGetOutcomes.mockResolvedValue({
          totalSamples: 10,
          byType: [
            { entryType: 'knowledge', successRate: 1.0, totalRetrievals: 10 },
            { entryType: 'guideline', successRate: 0.0, totalRetrievals: 10 },
            { entryType: 'tool', successRate: 0.5, totalRetrievals: 10 },
            { entryType: 'experience', successRate: 0.5, totalRetrievals: 10 },
          ],
        });

        const result = await calculator.calculateWeights('lookup', 'scope-123');

        // With only 10% confidence, weights should be very close to static
        const staticKnowledge = STATIC_INTENT_WEIGHTS.lookup.knowledge;
        const diff = Math.abs(result.knowledge - staticKnowledge);

        // Should be within 10% of static (due to 10% confidence)
        expect(diff).toBeLessThanOrEqual(0.2);
      });

      it('should handle empty outcome data', async () => {
        mockGetOutcomes.mockResolvedValue({
          totalSamples: 0,
          byType: [],
        });

        const result = await calculator.calculateWeights('lookup', 'scope-123');

        expect(result).toEqual(STATIC_INTENT_WEIGHTS.lookup);
      });

      it('should clamp weights to [0.5, 2.0] range', async () => {
        // Extreme success rates
        mockGetOutcomes.mockResolvedValue({
          totalSamples: 1000,
          byType: [
            { entryType: 'knowledge', successRate: 1.0, totalRetrievals: 1000 },
            { entryType: 'guideline', successRate: 0.0, totalRetrievals: 1000 },
            { entryType: 'tool', successRate: 0.5, totalRetrievals: 1000 },
            { entryType: 'experience', successRate: 0.5, totalRetrievals: 1000 },
          ],
        });

        const result = await calculator.calculateWeights('lookup', 'scope-123');

        expect(result.knowledge).toBeLessThanOrEqual(2.0);
        expect(result.knowledge).toBeGreaterThanOrEqual(0.5);
        expect(result.guideline).toBeLessThanOrEqual(2.0);
        expect(result.guideline).toBeGreaterThanOrEqual(0.5);
      });

      it('should return static weights when disabled', async () => {
        const disabledCalc = new AdaptiveWeightsCalculator(
          { ...defaultConfig, enabled: false },
          mockGetOutcomes
        );

        mockGetOutcomes.mockResolvedValue({
          totalSamples: 100,
          byType: [{ entryType: 'knowledge', successRate: 0.9, totalRetrievals: 100 }],
        });

        const result = await disabledCalc.calculateWeights('lookup', 'scope-123');

        expect(result).toEqual(STATIC_INTENT_WEIGHTS.lookup);
        expect(mockGetOutcomes).not.toHaveBeenCalled();
      });
    });

    describe('getStaticWeights', () => {
      it('should return static weights for known intent', () => {
        const result = calculator.getStaticWeights('lookup');
        expect(result).toEqual(STATIC_INTENT_WEIGHTS.lookup);
      });

      it('should return explore weights for unknown intent', () => {
        const result = calculator.getStaticWeights('unknown_intent' as QueryIntent);
        expect(result).toEqual(STATIC_INTENT_WEIGHTS.explore);
      });
    });
  });
});
