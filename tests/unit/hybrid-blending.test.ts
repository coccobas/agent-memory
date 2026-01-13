/**
 * Hybrid Blending Tests (P1)
 *
 * Tests edge cases in hybrid search blending:
 * - Missing FTS scores
 * - Alpha boundary values (0, 1)
 * - Score normalization edge cases
 * - RRF (Reciprocal Rank Fusion) edge cases
 */

import { describe, it, expect } from 'vitest';

describe('Hybrid Blending - Edge Cases', () => {
  describe('computeHybridScore', () => {
    it('should handle alpha=0 (pure FTS)', () => {
      const semanticScore = 0.9;
      const ftsScore = 0.5;
      const alpha = 0;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      expect(hybrid).toBeCloseTo(ftsScore, 5);
    });

    it('should handle alpha=1 (pure semantic)', () => {
      const semanticScore = 0.9;
      const ftsScore = 0.5;
      const alpha = 1;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      expect(hybrid).toBeCloseTo(semanticScore, 5);
    });

    it('should handle alpha=0.5 (equal blend)', () => {
      const semanticScore = 0.8;
      const ftsScore = 0.4;
      const alpha = 0.5;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      expect(hybrid).toBeCloseTo(0.6, 5); // (0.8 + 0.4) / 2
    });

    it('should handle missing FTS score (undefined)', () => {
      const semanticScore = 0.9;
      const ftsScore = undefined;
      const alpha = 0.7;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      // With missing FTS, should fall back to semantic only
      expect(hybrid).toBeCloseTo(semanticScore, 5);
    });

    it('should handle missing semantic score (undefined)', () => {
      const semanticScore = undefined;
      const ftsScore = 0.6;
      const alpha = 0.7;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      // With missing semantic, should fall back to FTS only
      expect(hybrid).toBeCloseTo(ftsScore, 5);
    });

    it('should handle both scores missing', () => {
      const semanticScore = undefined;
      const ftsScore = undefined;
      const alpha = 0.7;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      expect(hybrid).toBe(0);
    });

    it('should handle NaN semantic score', () => {
      const semanticScore = NaN;
      const ftsScore = 0.5;
      const alpha = 0.7;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      // NaN should be treated as missing
      expect(hybrid).toBeCloseTo(ftsScore, 5);
    });

    it('should handle NaN FTS score', () => {
      const semanticScore = 0.8;
      const ftsScore = NaN;
      const alpha = 0.7;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      // NaN should be treated as missing
      expect(hybrid).toBeCloseTo(semanticScore, 5);
    });

    it('should handle zero scores correctly', () => {
      const semanticScore = 0;
      const ftsScore = 0;
      const alpha = 0.5;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      expect(hybrid).toBe(0);
    });

    it('should handle score > 1.0', () => {
      const semanticScore = 1.2; // Invalid but might happen
      const ftsScore = 0.8;
      const alpha = 0.5;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      // Should clamp or handle gracefully
      expect(hybrid).toBeLessThanOrEqual(1.0);
    });

    it('should handle negative scores', () => {
      const semanticScore = -0.1; // Invalid but might happen
      const ftsScore = 0.8;
      const alpha = 0.5;

      const hybrid = computeHybridScore(semanticScore, ftsScore, alpha);
      // Should clamp or handle gracefully
      expect(hybrid).toBeGreaterThanOrEqual(0);
    });
  });

  describe('RRF (Reciprocal Rank Fusion)', () => {
    it('should compute RRF for single list', () => {
      const ranks = [1]; // First position
      const k = 60; // Standard constant

      const rrf = computeRRF(ranks, k);
      expect(rrf).toBeCloseTo(1 / (k + 1), 5);
    });

    it('should combine RRF from multiple lists', () => {
      const semanticRank = 1;
      const ftsRank = 2;
      const k = 60;

      const rrf = computeCombinedRRF(semanticRank, ftsRank, k);
      const expected = 1 / (k + 1) + 1 / (k + 2);
      expect(rrf).toBeCloseTo(expected, 5);
    });

    it('should handle item only in semantic results', () => {
      const semanticRank = 5;
      const ftsRank = undefined; // Not in FTS results
      const k = 60;

      const rrf = computeCombinedRRF(semanticRank, ftsRank, k);
      expect(rrf).toBeCloseTo(1 / (k + 5), 5);
    });

    it('should handle item only in FTS results', () => {
      const semanticRank = undefined; // Not in semantic results
      const ftsRank = 3;
      const k = 60;

      const rrf = computeCombinedRRF(semanticRank, ftsRank, k);
      expect(rrf).toBeCloseTo(1 / (k + 3), 5);
    });

    it('should handle zero rank (edge case)', () => {
      const ranks = [0]; // Invalid rank
      const k = 60;

      const rrf = computeRRF(ranks, k);
      // Should handle gracefully - either treat as rank 1 or return 0
      expect(Number.isFinite(rrf)).toBe(true);
    });

    it('should handle very large rank', () => {
      const semanticRank = 10000;
      const ftsRank = 10000;
      const k = 60;

      const rrf = computeCombinedRRF(semanticRank, ftsRank, k);
      // Should still produce a valid, small score
      expect(rrf).toBeGreaterThan(0);
      expect(rrf).toBeLessThan(0.01);
    });

    it('should handle k=0 (edge case)', () => {
      const ranks = [1, 2, 3];
      const k = 0;

      const rrf = computeRRF(ranks, k);
      // k=0 means RRF(1) = 1/1 = 1
      expect(rrf).toBeCloseTo(1 + 0.5 + 0.333, 2);
    });
  });

  describe('Score Normalization', () => {
    it('should normalize scores to 0-1 range', () => {
      const scores = [0.5, 1.0, 0.2, 0.8];
      const normalized = normalizeScores(scores);

      expect(Math.min(...normalized)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...normalized)).toBeLessThanOrEqual(1);
    });

    it('should handle all identical scores', () => {
      const scores = [0.5, 0.5, 0.5, 0.5];
      const normalized = normalizeScores(scores);

      // All same -> all should be 0.5 or some default
      normalized.forEach((s) => expect(s).toBeCloseTo(0.5, 5));
    });

    it('should handle single score', () => {
      const scores = [0.7];
      const normalized = normalizeScores(scores);

      expect(normalized.length).toBe(1);
      expect(normalized[0]).toBe(0.7); // Should stay the same or default
    });

    it('should handle empty scores array', () => {
      const scores: number[] = [];
      const normalized = normalizeScores(scores);

      expect(normalized).toEqual([]);
    });

    it('should handle scores with NaN', () => {
      const scores = [0.5, NaN, 0.8];
      const normalized = normalizeScores(scores);

      // NaN should be handled (filtered or defaulted)
      expect(normalized.every((s) => !Number.isNaN(s))).toBe(true);
    });

    it('should handle scores exceeding 1.0', () => {
      const scores = [0.5, 1.5, 0.8, 2.0];
      const normalized = normalizeScores(scores);

      expect(Math.max(...normalized)).toBeLessThanOrEqual(1);
    });

    it('should handle negative scores', () => {
      const scores = [-0.5, 0.5, 0.8];
      const normalized = normalizeScores(scores);

      expect(Math.min(...normalized)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Blending Strategy Selection', () => {
    it('should select linear blend for small result sets', () => {
      const resultCount = 10;
      const strategy = selectBlendingStrategy(resultCount);
      expect(strategy).toBe('linear');
    });

    it('should select RRF for large result sets', () => {
      const resultCount = 1000;
      const strategy = selectBlendingStrategy(resultCount);
      expect(strategy).toBe('rrf');
    });

    it('should handle boundary at threshold', () => {
      const threshold = 100; // Assumed threshold
      const strategy = selectBlendingStrategy(threshold);
      // Should be consistent at boundary
      expect(['linear', 'rrf']).toContain(strategy);
    });

    it('should handle zero results', () => {
      const resultCount = 0;
      const strategy = selectBlendingStrategy(resultCount);
      expect(strategy).toBe('linear'); // Default to simple
    });
  });

  describe('Weight Calculation Edge Cases', () => {
    it('should handle zero total weight', () => {
      const weights = { semantic: 0, fts: 0, graph: 0 };
      const normalized = normalizeWeights(weights);

      // Should handle gracefully - equal distribution or all zeros
      expect(Number.isFinite(normalized.semantic)).toBe(true);
      expect(Number.isFinite(normalized.fts)).toBe(true);
    });

    it('should normalize weights to sum to 1', () => {
      const weights = { semantic: 2, fts: 3, graph: 5 };
      const normalized = normalizeWeights(weights);

      const sum = normalized.semantic + normalized.fts + normalized.graph;
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should handle negative weights', () => {
      const weights = { semantic: -1, fts: 2, graph: 1 };
      const normalized = normalizeWeights(weights);

      // Negative weights should be clamped to 0
      expect(normalized.semantic).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large weights', () => {
      const weights = { semantic: 1e10, fts: 1e10, graph: 1e10 };
      const normalized = normalizeWeights(weights);

      const sum = normalized.semantic + normalized.fts + normalized.graph;
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should handle Infinity weight', () => {
      const weights = { semantic: Infinity, fts: 1, graph: 1 };
      const normalized = normalizeWeights(weights);

      // Should handle gracefully
      expect(Number.isFinite(normalized.semantic)).toBe(true);
      expect(Number.isFinite(normalized.fts)).toBe(true);
    });
  });
});

// =============================================================================
// Helper functions for testing
// =============================================================================

function computeHybridScore(
  semanticScore: number | undefined,
  ftsScore: number | undefined,
  alpha: number
): number {
  // Handle invalid inputs
  const validSemantic = semanticScore !== undefined && !Number.isNaN(semanticScore);
  const validFts = ftsScore !== undefined && !Number.isNaN(ftsScore);

  if (!validSemantic && !validFts) {
    return 0;
  }

  if (!validSemantic) {
    return Math.max(0, Math.min(1, ftsScore!));
  }

  if (!validFts) {
    return Math.max(0, Math.min(1, semanticScore!));
  }

  // Clamp inputs
  const clampedSemantic = Math.max(0, Math.min(1, semanticScore!));
  const clampedFts = Math.max(0, Math.min(1, ftsScore!));

  // Linear blend
  const hybrid = alpha * clampedSemantic + (1 - alpha) * clampedFts;
  return Math.max(0, Math.min(1, hybrid));
}

function computeRRF(ranks: number[], k: number): number {
  return ranks.reduce((sum, rank) => {
    // Handle invalid rank
    const validRank = rank > 0 ? rank : 1;
    return sum + 1 / (k + validRank);
  }, 0);
}

function computeCombinedRRF(
  semanticRank: number | undefined,
  ftsRank: number | undefined,
  k: number
): number {
  let score = 0;

  if (semanticRank !== undefined && semanticRank > 0) {
    score += 1 / (k + semanticRank);
  }

  if (ftsRank !== undefined && ftsRank > 0) {
    score += 1 / (k + ftsRank);
  }

  return score;
}

function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];

  // Filter out NaN values
  const validScores = scores.map((s) => (Number.isNaN(s) ? 0 : s));

  const min = Math.min(...validScores);
  const max = Math.max(...validScores);

  // If all same, return as-is (clamped)
  if (max === min) {
    return validScores.map((s) => Math.max(0, Math.min(1, s)));
  }

  // Min-max normalization
  return validScores.map((s) => {
    const clamped = Math.max(min, Math.min(max, s));
    return (clamped - min) / (max - min);
  });
}

function selectBlendingStrategy(resultCount: number): 'linear' | 'rrf' {
  const threshold = 100;
  return resultCount >= threshold ? 'rrf' : 'linear';
}

interface Weights {
  semantic: number;
  fts: number;
  graph: number;
}

function normalizeWeights(weights: Weights): Weights {
  // Clamp negative and infinite values
  const clampedSemantic = Number.isFinite(weights.semantic) ? Math.max(0, weights.semantic) : 0;
  const clampedFts = Number.isFinite(weights.fts) ? Math.max(0, weights.fts) : 0;
  const clampedGraph = Number.isFinite(weights.graph) ? Math.max(0, weights.graph) : 0;

  const total = clampedSemantic + clampedFts + clampedGraph;

  if (total === 0) {
    // Return equal weights or zeros
    return { semantic: 1 / 3, fts: 1 / 3, graph: 1 / 3 };
  }

  return {
    semantic: clampedSemantic / total,
    fts: clampedFts / total,
    graph: clampedGraph / total,
  };
}
