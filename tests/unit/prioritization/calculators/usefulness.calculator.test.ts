/**
 * Tests for Usefulness Calculator
 *
 * TDD: Tests written first to define expected behavior.
 *
 * The calculator scores entries based on their historical success:
 * - Retrieval volume → confidence in the score
 * - Success rate → how often this entry led to good outcomes
 * - Recency → boost for recent successes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UsefulnessCalculator,
  calculateRecencyBoost,
  normalizeScore,
} from '../../../../src/services/prioritization/calculators/usefulness.calculator.js';
import type {
  UsefulnessConfig,
  UsefulnessMetrics,
} from '../../../../src/services/prioritization/types.js';

describe('Usefulness Calculator', () => {
  describe('calculateRecencyBoost', () => {
    it('should return 1.0 for success yesterday', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const boost = calculateRecencyBoost(yesterday);

      expect(boost).toBeCloseTo(1.0, 1);
    });

    it('should return ~0.5 for success 15 days ago', () => {
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const boost = calculateRecencyBoost(fifteenDaysAgo);

      expect(boost).toBeGreaterThan(0.4);
      expect(boost).toBeLessThan(0.6);
    });

    it('should return ~0 for success 30+ days ago', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const boost = calculateRecencyBoost(thirtyDaysAgo);

      expect(boost).toBeLessThanOrEqual(0.1);
    });

    it('should return 0 for null last success', () => {
      const boost = calculateRecencyBoost(null);
      expect(boost).toBe(0);
    });

    it('should return 0 for invalid date', () => {
      const boost = calculateRecencyBoost('invalid-date');
      expect(boost).toBe(0);
    });
  });

  describe('normalizeScore', () => {
    it('should return value unchanged when in range [0, 1]', () => {
      expect(normalizeScore(0.5)).toBe(0.5);
      expect(normalizeScore(0)).toBe(0);
      expect(normalizeScore(1)).toBe(1);
    });

    it('should clamp values below 0 to 0', () => {
      expect(normalizeScore(-0.5)).toBe(0);
      expect(normalizeScore(-1)).toBe(0);
    });

    it('should clamp values above 1 to 1', () => {
      expect(normalizeScore(1.5)).toBe(1);
      expect(normalizeScore(2)).toBe(1);
    });
  });

  describe('UsefulnessCalculator', () => {
    let calculator: UsefulnessCalculator;
    let mockGetMetrics: ReturnType<typeof vi.fn>;

    const defaultConfig: UsefulnessConfig = {
      enabled: true,
      retrievalWeight: 0.3,
      successWeight: 0.5,
      recencyWeight: 0.2,
    };

    beforeEach(() => {
      mockGetMetrics = vi.fn();
      calculator = new UsefulnessCalculator(defaultConfig, mockGetMetrics);
    });

    describe('calculateScores', () => {
      it('should return 0.5 (neutral) for new entries with no retrievals', async () => {
        mockGetMetrics.mockResolvedValue(
          new Map([
            [
              'entry-1',
              {
                entryId: 'entry-1',
                retrievalCount: 0,
                successCount: 0,
                lastSuccessAt: null,
                lastAccessAt: null,
              },
            ],
          ])
        );

        const result = await calculator.calculateScores(['entry-1']);

        expect(result.get('entry-1')).toBe(0.5);
      });

      it('should return 0.5 for entries with only 1 retrieval', async () => {
        mockGetMetrics.mockResolvedValue(
          new Map([
            [
              'entry-1',
              {
                entryId: 'entry-1',
                retrievalCount: 1,
                successCount: 1,
                lastSuccessAt: new Date().toISOString(),
                lastAccessAt: new Date().toISOString(),
              },
            ],
          ])
        );

        const result = await calculator.calculateScores(['entry-1']);

        // Too few retrievals to trust the success rate
        expect(result.get('entry-1')).toBe(0.5);
      });

      it('should boost entries with 90% success rate', async () => {
        mockGetMetrics.mockResolvedValue(
          new Map([
            [
              'entry-1',
              {
                entryId: 'entry-1',
                retrievalCount: 100,
                successCount: 90,
                lastSuccessAt: new Date().toISOString(),
                lastAccessAt: new Date().toISOString(),
              },
            ],
          ])
        );

        const result = await calculator.calculateScores(['entry-1']);

        expect(result.get('entry-1')).toBeGreaterThan(0.8);
      });

      it('should penalize entries with 20% success rate', async () => {
        mockGetMetrics.mockResolvedValue(
          new Map([
            [
              'entry-1',
              {
                entryId: 'entry-1',
                retrievalCount: 100,
                successCount: 20,
                lastSuccessAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
                lastAccessAt: new Date().toISOString(),
              },
            ],
          ])
        );

        const result = await calculator.calculateScores(['entry-1']);

        // With 20% success (0.2), ~0.5 recency, 100% volume:
        // Score = 0.2 * 0.5 + 0.5 * 0.2 + 1.0 * 0.3 = 0.1 + 0.1 + 0.3 = 0.5
        // Lower than high success entries (0.8+)
        expect(result.get('entry-1')).toBeLessThan(0.6);
        expect(result.get('entry-1')).toBeLessThan(0.8); // Much lower than 90% success
      });

      it('should factor retrieval volume into confidence', async () => {
        const now = new Date().toISOString();

        mockGetMetrics.mockResolvedValue(
          new Map([
            [
              'entry-high-volume',
              {
                entryId: 'entry-high-volume',
                retrievalCount: 100, // High volume (full confidence)
                successCount: 70,
                lastSuccessAt: now,
                lastAccessAt: now,
              },
            ],
            [
              'entry-low-volume',
              {
                entryId: 'entry-low-volume',
                retrievalCount: 1, // Only 1 retrieval (below threshold)
                successCount: 1,
                lastSuccessAt: now,
                lastAccessAt: now,
              },
            ],
          ])
        );

        const result = await calculator.calculateScores(['entry-high-volume', 'entry-low-volume']);

        // Entry with only 1 retrieval should be neutral (insufficient data)
        expect(result.get('entry-low-volume')).toBe(0.5);
        // High volume entry should reflect its actual success rate
        expect(result.get('entry-high-volume')).toBeGreaterThan(0.5);
      });

      it('should apply recency boost for recent success', async () => {
        const recentSuccess = new Date().toISOString();
        const oldSuccess = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        mockGetMetrics.mockResolvedValue(
          new Map([
            [
              'entry-recent',
              {
                entryId: 'entry-recent',
                retrievalCount: 50,
                successCount: 35, // 70% success
                lastSuccessAt: recentSuccess,
                lastAccessAt: recentSuccess,
              },
            ],
            [
              'entry-old',
              {
                entryId: 'entry-old',
                retrievalCount: 50,
                successCount: 35, // Same 70% success
                lastSuccessAt: oldSuccess,
                lastAccessAt: oldSuccess,
              },
            ],
          ])
        );

        const result = await calculator.calculateScores(['entry-recent', 'entry-old']);

        // Recent success should score higher
        expect(result.get('entry-recent')).toBeGreaterThan(result.get('entry-old')!);
      });

      it('should normalize score to [0, 1] range', async () => {
        // Even with extreme values, score should be clamped
        mockGetMetrics.mockResolvedValue(
          new Map([
            [
              'entry-1',
              {
                entryId: 'entry-1',
                retrievalCount: 1000,
                successCount: 1000, // 100% success
                lastSuccessAt: new Date().toISOString(),
                lastAccessAt: new Date().toISOString(),
              },
            ],
          ])
        );

        const result = await calculator.calculateScores(['entry-1']);

        expect(result.get('entry-1')).toBeLessThanOrEqual(1);
        expect(result.get('entry-1')).toBeGreaterThanOrEqual(0);
      });

      it('should handle entries with only failures', async () => {
        mockGetMetrics.mockResolvedValue(
          new Map([
            [
              'entry-1',
              {
                entryId: 'entry-1',
                retrievalCount: 50,
                successCount: 0, // All failures
                lastSuccessAt: null,
                lastAccessAt: new Date().toISOString(),
              },
            ],
          ])
        );

        const result = await calculator.calculateScores(['entry-1']);

        // With 0% success, 0 recency boost, full volume:
        // Score = 0 * 0.5 + 0 * 0.2 + 1.0 * 0.3 = 0.3
        // Should have a low but valid score
        expect(result.get('entry-1')).toBeGreaterThanOrEqual(0);
        expect(result.get('entry-1')).toBeLessThanOrEqual(0.3);
      });

      it('should batch multiple entries efficiently (single DB query)', async () => {
        mockGetMetrics.mockResolvedValue(new Map());

        await calculator.calculateScores(['entry-1', 'entry-2', 'entry-3']);

        // Should call getMetrics once with all entry IDs
        expect(mockGetMetrics).toHaveBeenCalledTimes(1);
        expect(mockGetMetrics).toHaveBeenCalledWith(['entry-1', 'entry-2', 'entry-3']);
      });

      it('should return empty map for empty input', async () => {
        const result = await calculator.calculateScores([]);

        expect(result.size).toBe(0);
        expect(mockGetMetrics).not.toHaveBeenCalled();
      });

      it('should return 0.5 for entries not in metrics result', async () => {
        mockGetMetrics.mockResolvedValue(new Map()); // No metrics returned

        const result = await calculator.calculateScores(['entry-1']);

        expect(result.get('entry-1')).toBe(0.5);
      });

      it('should return all 0.5 when disabled', async () => {
        const disabledCalc = new UsefulnessCalculator(
          { ...defaultConfig, enabled: false },
          mockGetMetrics
        );

        const result = await disabledCalc.calculateScores(['entry-1', 'entry-2']);

        expect(result.get('entry-1')).toBe(0.5);
        expect(result.get('entry-2')).toBe(0.5);
        expect(mockGetMetrics).not.toHaveBeenCalled();
      });
    });
  });
});
