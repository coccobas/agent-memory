/**
 * Entity Boost Scaling Tests (P1)
 *
 * Tests edge cases in entity boost calculations:
 * - Overflow prevention
 * - Normalization edge cases
 * - Boost cap enforcement
 * - Penalty floor enforcement
 * - Feedback multiplier boundaries
 */

import { describe, it, expect } from 'vitest';

describe('Entity Boost Scaling - Edge Cases', () => {
  describe('computeBoostMultiplier', () => {
    it('should return 1.0 for no feedback', () => {
      const feedback = { upvotes: 0, downvotes: 0 };
      const multiplier = computeBoostMultiplier(feedback);
      expect(multiplier).toBe(1.0);
    });

    it('should increase multiplier for positive feedback', () => {
      const feedback = { upvotes: 10, downvotes: 0 };
      const multiplier = computeBoostMultiplier(feedback);
      expect(multiplier).toBeGreaterThan(1.0);
    });

    it('should decrease multiplier for negative feedback', () => {
      const feedback = { upvotes: 0, downvotes: 10 };
      const multiplier = computeBoostMultiplier(feedback);
      expect(multiplier).toBeLessThan(1.0);
    });

    it('should cap boost multiplier at maximum', () => {
      const feedback = { upvotes: 10000, downvotes: 0 };
      const multiplier = computeBoostMultiplier(feedback);
      expect(multiplier).toBeLessThanOrEqual(BOOST_CAP);
    });

    it('should floor penalty multiplier at minimum', () => {
      const feedback = { upvotes: 0, downvotes: 10000 };
      const multiplier = computeBoostMultiplier(feedback);
      expect(multiplier).toBeGreaterThanOrEqual(PENALTY_FLOOR);
    });

    it('should handle equal upvotes and downvotes', () => {
      const feedback = { upvotes: 50, downvotes: 50 };
      const multiplier = computeBoostMultiplier(feedback);
      // Should be close to 1.0
      expect(multiplier).toBeCloseTo(1.0, 1);
    });

    it('should handle very large numbers without overflow', () => {
      const feedback = { upvotes: Number.MAX_SAFE_INTEGER, downvotes: 0 };
      const multiplier = computeBoostMultiplier(feedback);
      expect(Number.isFinite(multiplier)).toBe(true);
      expect(multiplier).toBeLessThanOrEqual(BOOST_CAP);
    });

    it('should handle negative values (invalid input)', () => {
      const feedback = { upvotes: -5, downvotes: -3 };
      const multiplier = computeBoostMultiplier(feedback);
      // Should handle gracefully - treat as 0
      expect(multiplier).toBe(1.0);
    });

    it('should handle NaN values', () => {
      const feedback = { upvotes: NaN, downvotes: 0 };
      const multiplier = computeBoostMultiplier(feedback);
      expect(Number.isFinite(multiplier)).toBe(true);
    });
  });

  describe('normalizeEntityScore', () => {
    it('should normalize score to 0-1 range', () => {
      const rawScore = 150;
      const maxScore = 200;
      const normalized = normalizeEntityScore(rawScore, maxScore);
      expect(normalized).toBe(0.75);
    });

    it('should handle zero max score', () => {
      const rawScore = 100;
      const maxScore = 0;
      const normalized = normalizeEntityScore(rawScore, maxScore);
      // Should not divide by zero
      expect(Number.isFinite(normalized)).toBe(true);
    });

    it('should handle score greater than max', () => {
      const rawScore = 250;
      const maxScore = 200;
      const normalized = normalizeEntityScore(rawScore, maxScore);
      // Should clamp to 1.0
      expect(normalized).toBeLessThanOrEqual(1.0);
    });

    it('should handle negative raw score', () => {
      const rawScore = -50;
      const maxScore = 200;
      const normalized = normalizeEntityScore(rawScore, maxScore);
      // Should clamp to 0
      expect(normalized).toBeGreaterThanOrEqual(0);
    });

    it('should handle very small scores', () => {
      const rawScore = 0.0001;
      const maxScore = 100;
      const normalized = normalizeEntityScore(rawScore, maxScore);
      expect(normalized).toBeGreaterThan(0);
      expect(normalized).toBeLessThan(0.001);
    });

    it('should handle equal raw and max', () => {
      const rawScore = 100;
      const maxScore = 100;
      const normalized = normalizeEntityScore(rawScore, maxScore);
      expect(normalized).toBe(1.0);
    });
  });

  describe('applyBoostToScore', () => {
    it('should apply boost correctly', () => {
      const score = 0.5;
      const boost = 1.5;
      const result = applyBoostToScore(score, boost);
      expect(result).toBeCloseTo(0.75, 5);
    });

    it('should cap boosted score at 1.0', () => {
      const score = 0.8;
      const boost = 2.0;
      const result = applyBoostToScore(score, boost);
      expect(result).toBeLessThanOrEqual(1.0);
    });

    it('should not go below 0', () => {
      const score = 0.2;
      const boost = 0.1;
      const result = applyBoostToScore(score, boost);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero score', () => {
      const score = 0;
      const boost = 2.0;
      const result = applyBoostToScore(score, boost);
      expect(result).toBe(0);
    });

    it('should handle zero boost', () => {
      const score = 0.5;
      const boost = 0;
      const result = applyBoostToScore(score, boost);
      expect(result).toBe(0);
    });

    it('should handle NaN boost', () => {
      const score = 0.5;
      const boost = NaN;
      const result = applyBoostToScore(score, boost);
      // Should return original or 0
      expect(Number.isFinite(result)).toBe(true);
    });

    it('should handle Infinity boost', () => {
      const score = 0.5;
      const boost = Infinity;
      const result = applyBoostToScore(score, boost);
      // Should cap at 1.0
      expect(result).toBeLessThanOrEqual(1.0);
    });
  });

  describe('computeDecayMultiplier', () => {
    it('should return 1.0 for age=0', () => {
      const ageInDays = 0;
      const multiplier = computeDecayMultiplier(ageInDays);
      expect(multiplier).toBe(1.0);
    });

    it('should decay over time', () => {
      const age30 = computeDecayMultiplier(30);
      const age90 = computeDecayMultiplier(90);
      expect(age90).toBeLessThan(age30);
    });

    it('should not go below minimum', () => {
      const ageInDays = 10000; // Very old
      const multiplier = computeDecayMultiplier(ageInDays);
      expect(multiplier).toBeGreaterThanOrEqual(DECAY_MINIMUM);
    });

    it('should handle negative age', () => {
      const ageInDays = -10;
      const multiplier = computeDecayMultiplier(ageInDays);
      // Should treat as 0 or error gracefully
      expect(multiplier).toBeLessThanOrEqual(1.0);
    });

    it('should handle fractional days', () => {
      const ageInDays = 0.5;
      const multiplier = computeDecayMultiplier(ageInDays);
      expect(multiplier).toBeLessThan(1.0);
      expect(multiplier).toBeGreaterThan(0.9);
    });

    it('should handle Infinity age', () => {
      const ageInDays = Infinity;
      const multiplier = computeDecayMultiplier(ageInDays);
      expect(Number.isFinite(multiplier)).toBe(true);
      expect(multiplier).toBeGreaterThanOrEqual(DECAY_MINIMUM);
    });
  });

  describe('computeEntityRelevance', () => {
    it('should combine multiple factors correctly', () => {
      const factors = {
        semanticScore: 0.8,
        feedbackMultiplier: 1.2,
        decayMultiplier: 0.9,
        priorityBoost: 1.1,
      };

      const relevance = computeEntityRelevance(factors);
      expect(relevance).toBeGreaterThan(0);
      expect(relevance).toBeLessThanOrEqual(1);
    });

    it('should handle all factors at 1.0', () => {
      const factors = {
        semanticScore: 0.5,
        feedbackMultiplier: 1.0,
        decayMultiplier: 1.0,
        priorityBoost: 1.0,
      };

      const relevance = computeEntityRelevance(factors);
      expect(relevance).toBeCloseTo(0.5, 5);
    });

    it('should handle zero semantic score', () => {
      const factors = {
        semanticScore: 0,
        feedbackMultiplier: 2.0,
        decayMultiplier: 1.0,
        priorityBoost: 1.5,
      };

      const relevance = computeEntityRelevance(factors);
      expect(relevance).toBe(0);
    });

    it('should cap final result', () => {
      const factors = {
        semanticScore: 0.9,
        feedbackMultiplier: 2.0, // Will be capped
        decayMultiplier: 1.0,
        priorityBoost: 2.0, // Will compound
      };

      const relevance = computeEntityRelevance(factors);
      expect(relevance).toBeLessThanOrEqual(1.0);
    });

    it('should floor final result', () => {
      const factors = {
        semanticScore: 0.1,
        feedbackMultiplier: 0.1, // Will be floored
        decayMultiplier: 0.1,
        priorityBoost: 0.1,
      };

      const relevance = computeEntityRelevance(factors);
      expect(relevance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('batchNormalizeScores', () => {
    it('should normalize batch to sum to 1', () => {
      const scores = [0.5, 0.3, 0.8, 0.2];
      const normalized = batchNormalizeScores(scores);

      const sum = normalized.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should handle single score', () => {
      const scores = [0.5];
      const normalized = batchNormalizeScores(scores);

      expect(normalized.length).toBe(1);
      expect(normalized[0]).toBe(1.0);
    });

    it('should handle empty array', () => {
      const scores: number[] = [];
      const normalized = batchNormalizeScores(scores);

      expect(normalized).toEqual([]);
    });

    it('should handle all zeros', () => {
      const scores = [0, 0, 0];
      const normalized = batchNormalizeScores(scores);

      // Should handle gracefully - equal distribution or zeros
      normalized.forEach((s) => expect(Number.isFinite(s)).toBe(true));
    });

    it('should handle negative scores', () => {
      const scores = [-0.5, 0.3, 0.8];
      const normalized = batchNormalizeScores(scores);

      // Negatives should be clamped or handled
      normalized.forEach((s) => expect(s).toBeGreaterThanOrEqual(0));
    });

    it('should handle very large scores', () => {
      const scores = [1e10, 1e10, 1e10];
      const normalized = batchNormalizeScores(scores);

      const sum = normalized.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should preserve relative ordering', () => {
      const scores = [0.5, 0.8, 0.3];
      const normalized = batchNormalizeScores(scores);

      // Order should be preserved
      expect(normalized[1]).toBeGreaterThan(normalized[0]);
      expect(normalized[0]).toBeGreaterThan(normalized[2]);
    });
  });

  describe('Precision and Rounding', () => {
    it('should maintain precision for small differences', () => {
      const score1 = 0.123456789;
      const score2 = 0.123456788;

      expect(score1).not.toBe(score2);
      expect(Math.abs(score1 - score2)).toBeGreaterThan(0);
    });

    it('should handle floating point edge cases', () => {
      const score = 0.1 + 0.2; // Famous floating point issue
      const expected = 0.3;

      // Should be close enough for practical purposes
      expect(score).toBeCloseTo(expected, 10);
    });

    it('should round consistently', () => {
      const scores = [0.12345, 0.54321, 0.99999];
      const rounded = scores.map((s) => roundScore(s, 3));

      expect(rounded[0]).toBe(0.123);
      expect(rounded[1]).toBe(0.543);
      expect(rounded[2]).toBe(1.0); // Should round up
    });
  });

  describe('Overflow Prevention', () => {
    it('should handle multiplication overflow', () => {
      const a = Number.MAX_VALUE;
      const b = 2;
      const result = safeMultiply(a, b);

      expect(Number.isFinite(result)).toBe(true);
    });

    it('should handle addition overflow', () => {
      const a = Number.MAX_VALUE;
      const b = Number.MAX_VALUE;
      const result = safeAdd(a, b);

      expect(Number.isFinite(result)).toBe(true);
    });

    it('should handle division by very small number', () => {
      const a = 1;
      const b = Number.MIN_VALUE;
      const result = safeDivide(a, b);

      expect(Number.isFinite(result)).toBe(true);
    });
  });
});

// =============================================================================
// Constants
// =============================================================================

const BOOST_CAP = 2.0;
const PENALTY_FLOOR = 0.1;
const DECAY_MINIMUM = 0.1;

// =============================================================================
// Helper functions for testing
// =============================================================================

interface Feedback {
  upvotes: number;
  downvotes: number;
}

function computeBoostMultiplier(feedback: Feedback): number {
  // Handle invalid inputs
  const upvotes = Math.max(0, feedback.upvotes) || 0;
  const downvotes = Math.max(0, feedback.downvotes) || 0;

  if (Number.isNaN(upvotes) || Number.isNaN(downvotes)) {
    return 1.0;
  }

  if (upvotes === 0 && downvotes === 0) {
    return 1.0;
  }

  // Wilson score lower bound approximation
  const total = upvotes + downvotes;
  const positive = upvotes / total;

  // Simple boost: 1 + (positive - 0.5) * scale
  const scale = Math.min(Math.log10(total + 1), 1) * 2;
  let multiplier = 1 + (positive - 0.5) * scale;

  // Cap and floor
  multiplier = Math.max(PENALTY_FLOOR, Math.min(BOOST_CAP, multiplier));

  return multiplier;
}

function normalizeEntityScore(rawScore: number, maxScore: number): number {
  if (maxScore <= 0 || !Number.isFinite(maxScore)) {
    return 0;
  }

  const normalized = rawScore / maxScore;
  return Math.max(0, Math.min(1, normalized));
}

function applyBoostToScore(score: number, boost: number): number {
  if (!Number.isFinite(boost)) {
    return score;
  }

  const boosted = score * boost;
  return Math.max(0, Math.min(1, boosted));
}

function computeDecayMultiplier(ageInDays: number): number {
  if (!Number.isFinite(ageInDays) || ageInDays < 0) {
    return 1.0;
  }

  // Exponential decay with half-life of 90 days
  const halfLife = 90;
  const decay = Math.pow(0.5, ageInDays / halfLife);

  return Math.max(DECAY_MINIMUM, decay);
}

interface RelevanceFactors {
  semanticScore: number;
  feedbackMultiplier: number;
  decayMultiplier: number;
  priorityBoost: number;
}

function computeEntityRelevance(factors: RelevanceFactors): number {
  const { semanticScore, feedbackMultiplier, decayMultiplier, priorityBoost } = factors;

  // Clamp multipliers
  const clampedFeedback = Math.max(PENALTY_FLOOR, Math.min(BOOST_CAP, feedbackMultiplier));
  const clampedDecay = Math.max(DECAY_MINIMUM, Math.min(1, decayMultiplier));
  const clampedPriority = Math.max(0.5, Math.min(2, priorityBoost));

  const relevance = semanticScore * clampedFeedback * clampedDecay * clampedPriority;

  return Math.max(0, Math.min(1, relevance));
}

function batchNormalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  if (scores.length === 1) return [1.0];

  // Clamp negative values
  const clamped = scores.map((s) => Math.max(0, s));

  const sum = clamped.reduce((a, b) => a + b, 0);

  if (sum === 0) {
    // Equal distribution
    return clamped.map(() => 1 / clamped.length);
  }

  return clamped.map((s) => s / sum);
}

function roundScore(score: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(score * factor) / factor;
}

function safeMultiply(a: number, b: number): number {
  const result = a * b;
  if (!Number.isFinite(result)) {
    return a > 0 && b > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
  }
  return result;
}

function safeAdd(a: number, b: number): number {
  const result = a + b;
  if (!Number.isFinite(result)) {
    return result > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
  }
  return result;
}

function safeDivide(a: number, b: number): number {
  if (b === 0 || Math.abs(b) < Number.MIN_VALUE * 100) {
    return a >= 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
  }
  const result = a / b;
  if (!Number.isFinite(result)) {
    return a >= 0 === b >= 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
  }
  return result;
}
