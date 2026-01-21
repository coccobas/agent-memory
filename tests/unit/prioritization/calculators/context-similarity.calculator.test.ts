/**
 * Tests for Context Similarity Calculator
 *
 * TDD: Tests written first to define expected behavior.
 *
 * The calculator finds past successful queries similar to the current query
 * and boosts entries that succeeded in those similar contexts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContextSimilarityCalculator,
  aggregateEntrySuccess,
  calculateBoost,
} from '../../../../src/services/prioritization/calculators/context-similarity.calculator.js';
import type {
  ContextSimilarityConfig,
  SuccessfulContext,
} from '../../../../src/services/prioritization/types.js';

describe('Context Similarity Calculator', () => {
  describe('aggregateEntrySuccess', () => {
    it('should return empty map when no similar contexts', () => {
      const result = aggregateEntrySuccess([], ['entry-1', 'entry-2']);

      expect(result.size).toBe(0);
    });

    it('should count success across multiple contexts weighted by similarity', () => {
      const contexts: SuccessfulContext[] = [
        {
          queryEmbedding: [0.1, 0.2],
          successfulEntryIds: ['entry-1', 'entry-2'],
          similarityScore: 0.9,
          occurredAt: new Date().toISOString(),
        },
        {
          queryEmbedding: [0.3, 0.4],
          successfulEntryIds: ['entry-1', 'entry-3'],
          similarityScore: 0.8,
          occurredAt: new Date().toISOString(),
        },
      ];

      const result = aggregateEntrySuccess(contexts, ['entry-1', 'entry-2', 'entry-3']);

      // entry-1: 0.9 + 0.8 = 1.7 (weighted), entry-2: 0.9, entry-3: 0.8
      expect(result.get('entry-1')).toBeCloseTo(1.7);
      expect(result.get('entry-2')).toBeCloseTo(0.9);
      expect(result.get('entry-3')).toBeCloseTo(0.8);
    });

    it('should only count entries in the provided entry list', () => {
      const contexts: SuccessfulContext[] = [
        {
          queryEmbedding: [0.1, 0.2],
          successfulEntryIds: ['entry-1', 'entry-other'],
          similarityScore: 0.9,
          occurredAt: new Date().toISOString(),
        },
      ];

      const result = aggregateEntrySuccess(contexts, ['entry-1']);

      // Weighted by similarity score 0.9
      expect(result.get('entry-1')).toBeCloseTo(0.9);
      expect(result.has('entry-other')).toBe(false);
    });

    it('should weight by similarity score', () => {
      const contexts: SuccessfulContext[] = [
        {
          queryEmbedding: [0.1, 0.2],
          successfulEntryIds: ['entry-1'],
          similarityScore: 0.9, // High similarity
          occurredAt: new Date().toISOString(),
        },
        {
          queryEmbedding: [0.3, 0.4],
          successfulEntryIds: ['entry-2'],
          similarityScore: 0.7, // Lower similarity
          occurredAt: new Date().toISOString(),
        },
      ];

      const result = aggregateEntrySuccess(contexts, ['entry-1', 'entry-2']);

      // Higher similarity should contribute more
      expect(result.get('entry-1')).toBeGreaterThan(result.get('entry-2')!);
    });
  });

  describe('calculateBoost', () => {
    it('should return 1.0 (no boost) for zero success', () => {
      expect(calculateBoost(0, 5, 1.2)).toBe(1.0);
    });

    it('should return boostMultiplier for 100% success rate', () => {
      // 5 successes out of 5 contexts = 100%
      expect(calculateBoost(5, 5, 1.2)).toBe(1.2);
    });

    it('should scale linearly with success rate', () => {
      // 2.5 successes out of 5 = 50%
      // Boost should be 1.0 + 0.5 * (1.2 - 1.0) = 1.1
      expect(calculateBoost(2.5, 5, 1.2)).toBe(1.1);
    });

    it('should never exceed boostMultiplier', () => {
      expect(calculateBoost(10, 5, 1.2)).toBe(1.2);
    });
  });

  describe('ContextSimilarityCalculator', () => {
    let calculator: ContextSimilarityCalculator;
    let mockFindSimilar: ReturnType<typeof vi.fn>;

    const defaultConfig: ContextSimilarityConfig = {
      enabled: true,
      similarityThreshold: 0.7,
      maxContextsToConsider: 50,
      boostMultiplier: 1.2,
    };

    beforeEach(() => {
      mockFindSimilar = vi.fn();
      calculator = new ContextSimilarityCalculator(defaultConfig, mockFindSimilar);
    });

    describe('calculateBoosts', () => {
      it('should find contexts above threshold (0.7)', async () => {
        const queryEmbedding = [0.1, 0.2, 0.3];

        mockFindSimilar.mockResolvedValue([]);

        await calculator.calculateBoosts(queryEmbedding, ['entry-1']);

        expect(mockFindSimilar).toHaveBeenCalledWith(queryEmbedding, 0.7, 50);
      });

      it('should return 1.0 (no boost) when no similar contexts found', async () => {
        mockFindSimilar.mockResolvedValue([]);

        const result = await calculator.calculateBoosts([0.1, 0.2], ['entry-1', 'entry-2']);

        expect(result.get('entry-1')).toBe(1.0);
        expect(result.get('entry-2')).toBe(1.0);
      });

      it('should only consider successful outcomes', async () => {
        // The repository should only return successful contexts
        mockFindSimilar.mockResolvedValue([
          {
            queryEmbedding: [0.1, 0.2],
            successfulEntryIds: ['entry-1'], // Only successful entries
            similarityScore: 0.9,
            occurredAt: new Date().toISOString(),
          },
        ]);

        const result = await calculator.calculateBoosts([0.1, 0.2], ['entry-1', 'entry-2']);

        // entry-1 was successful in similar context
        expect(result.get('entry-1')).toBeGreaterThan(1.0);
        // entry-2 was not successful in any context
        expect(result.get('entry-2')).toBe(1.0);
      });

      it('should respect maxContextsToConsider limit (50)', async () => {
        const queryEmbedding = [0.1, 0.2];

        mockFindSimilar.mockResolvedValue([]);

        await calculator.calculateBoosts(queryEmbedding, ['entry-1']);

        expect(mockFindSimilar).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          50 // maxContextsToConsider
        );
      });

      it('should cap boost at boostMultiplier (1.2)', async () => {
        // Even with many successful contexts, boost should not exceed 1.2
        const manyContexts: SuccessfulContext[] = Array.from({ length: 100 }, (_, i) => ({
          queryEmbedding: [0.1, 0.2],
          successfulEntryIds: ['entry-1'],
          similarityScore: 0.95,
          occurredAt: new Date(Date.now() - i * 1000).toISOString(),
        }));

        mockFindSimilar.mockResolvedValue(manyContexts);

        const result = await calculator.calculateBoosts([0.1, 0.2], ['entry-1']);

        expect(result.get('entry-1')).toBeLessThanOrEqual(1.2);
      });

      it('should return all 1.0 when disabled', async () => {
        const disabledCalc = new ContextSimilarityCalculator(
          { ...defaultConfig, enabled: false },
          mockFindSimilar
        );

        const result = await disabledCalc.calculateBoosts([0.1, 0.2], ['entry-1', 'entry-2']);

        expect(result.get('entry-1')).toBe(1.0);
        expect(result.get('entry-2')).toBe(1.0);
        expect(mockFindSimilar).not.toHaveBeenCalled();
      });

      it('should return 1.0 for empty query embedding', async () => {
        const result = await calculator.calculateBoosts([], ['entry-1']);

        expect(result.get('entry-1')).toBe(1.0);
        expect(mockFindSimilar).not.toHaveBeenCalled();
      });

      it('should return empty map for empty entry list', async () => {
        const result = await calculator.calculateBoosts([0.1, 0.2], []);

        expect(result.size).toBe(0);
        expect(mockFindSimilar).not.toHaveBeenCalled();
      });

      it('should handle missing query embedding gracefully', async () => {
        // @ts-expect-error Testing null/undefined handling
        const result = await calculator.calculateBoosts(null, ['entry-1']);

        expect(result.get('entry-1')).toBe(1.0);
        expect(mockFindSimilar).not.toHaveBeenCalled();
      });

      it('should gracefully degrade when repository throws error', async () => {
        mockFindSimilar.mockRejectedValue(new Error('Database error'));

        const result = await calculator.calculateBoosts([0.1, 0.2], ['entry-1']);

        // Should return neutral boost on error
        expect(result.get('entry-1')).toBe(1.0);
      });
    });
  });
});
