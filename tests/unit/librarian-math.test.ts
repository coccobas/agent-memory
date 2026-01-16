/**
 * Unit tests for Librarian Math Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  jaccardSimilarity,
  jaccardSimilarityArrays,
  longestCommonSubsequence,
  lcsLength,
  lcsSimilarity,
  cosineSimilarity,
  editDistance,
  editDistanceSimilarity,
  mean,
  standardDeviation,
  weightedMean,
  normalize,
  clamp,
} from '../../src/services/librarian/utils/math.js';

describe('Librarian Math Utilities', () => {
  describe('jaccardSimilarity', () => {
    it('should return 1.0 for identical sets', () => {
      const set1 = new Set([1, 2, 3]);
      const set2 = new Set([1, 2, 3]);
      expect(jaccardSimilarity(set1, set2)).toBe(1.0);
    });

    it('should return 0.0 for disjoint sets', () => {
      const set1 = new Set([1, 2, 3]);
      const set2 = new Set([4, 5, 6]);
      expect(jaccardSimilarity(set1, set2)).toBe(0.0);
    });

    it('should return 1.0 for two empty sets', () => {
      const set1 = new Set<number>();
      const set2 = new Set<number>();
      expect(jaccardSimilarity(set1, set2)).toBe(1.0);
    });

    it('should return 0.0 when one set is empty', () => {
      const set1 = new Set([1, 2, 3]);
      const set2 = new Set<number>();
      expect(jaccardSimilarity(set1, set2)).toBe(0.0);
    });

    it('should calculate correct similarity for partial overlap', () => {
      const set1 = new Set([1, 2, 3]);
      const set2 = new Set([2, 3, 4]);
      // Intersection: {2, 3} = 2
      // Union: {1, 2, 3, 4} = 4
      // Jaccard = 2/4 = 0.5
      expect(jaccardSimilarity(set1, set2)).toBe(0.5);
    });

    it('should work with string sets', () => {
      const set1 = new Set(['a', 'b', 'c']);
      const set2 = new Set(['b', 'c', 'd']);
      expect(jaccardSimilarity(set1, set2)).toBe(0.5);
    });
  });

  describe('jaccardSimilarityArrays', () => {
    it('should work with arrays', () => {
      expect(jaccardSimilarityArrays([1, 2, 3], [2, 3, 4])).toBe(0.5);
    });

    it('should handle duplicate elements in arrays', () => {
      // Duplicates are removed when converting to sets
      expect(jaccardSimilarityArrays([1, 1, 2, 2], [2, 2, 3, 3])).toBe(1 / 3);
    });
  });

  describe('longestCommonSubsequence', () => {
    it('should find LCS of identical sequences', () => {
      const result = longestCommonSubsequence([1, 2, 3], [1, 2, 3]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return empty for completely different sequences', () => {
      const result = longestCommonSubsequence([1, 2, 3], [4, 5, 6]);
      expect(result).toEqual([]);
    });

    it('should handle empty sequences', () => {
      expect(longestCommonSubsequence([], [1, 2, 3])).toEqual([]);
      expect(longestCommonSubsequence([1, 2, 3], [])).toEqual([]);
      expect(longestCommonSubsequence([], [])).toEqual([]);
    });

    it('should find correct LCS for interleaved sequences', () => {
      // LCS of [1, 2, 3, 4] and [2, 4, 3] should be [2, 3] or [2, 4]
      const result = longestCommonSubsequence([1, 2, 3, 4], [2, 4, 3]);
      expect(result.length).toBe(2);
    });

    it('should work with custom comparator', () => {
      const seq1 = [{ id: 1 }, { id: 2 }];
      const seq2 = [{ id: 2 }, { id: 3 }];
      const result = longestCommonSubsequence(seq1, seq2, (a, b) => a.id === b.id);
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(2);
    });

    it('should work with string sequences', () => {
      const result = longestCommonSubsequence(['a', 'b', 'c', 'd'], ['b', 'c', 'e']);
      expect(result).toEqual(['b', 'c']);
    });
  });

  describe('lcsLength', () => {
    it('should return correct length for various sequences', () => {
      expect(lcsLength([1, 2, 3], [1, 2, 3])).toBe(3);
      expect(lcsLength([1, 2, 3], [4, 5, 6])).toBe(0);
      expect(lcsLength([1, 2, 3, 4], [2, 4, 3])).toBe(2);
    });

    it('should handle empty sequences', () => {
      expect(lcsLength([], [1, 2, 3])).toBe(0);
      expect(lcsLength([1, 2, 3], [])).toBe(0);
    });
  });

  describe('lcsSimilarity', () => {
    it('should return 1.0 for identical sequences', () => {
      expect(lcsSimilarity([1, 2, 3], [1, 2, 3])).toBe(1.0);
    });

    it('should return 0.0 for completely different sequences', () => {
      expect(lcsSimilarity([1, 2, 3], [4, 5, 6])).toBe(0.0);
    });

    it('should return 1.0 for two empty sequences', () => {
      expect(lcsSimilarity([], [])).toBe(1.0);
    });

    it('should return 0.0 when one sequence is empty', () => {
      expect(lcsSimilarity([1, 2, 3], [])).toBe(0.0);
    });

    it('should calculate correct similarity for partial match', () => {
      // LCS of [1, 2, 3] and [2, 3, 4] is [2, 3], length 2
      // Similarity = 2 * 2 / (3 + 3) = 4/6 = 0.666...
      const similarity = lcsSimilarity([1, 2, 3], [2, 3, 4]);
      expect(similarity).toBeCloseTo(0.667, 2);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 5);
    });

    it('should return 1.0 for parallel vectors', () => {
      expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1.0, 5);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
    });

    it('should return -1.0 for opposite vectors', () => {
      expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1.0, 5);
    });

    it('should return 0.0 for zero vectors', () => {
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0.0);
    });

    it('should throw for vectors of different dimensions', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
    });

    it('should return 0.0 for empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0.0);
    });
  });

  describe('editDistance', () => {
    it('should return 0 for identical sequences', () => {
      expect(editDistance([1, 2, 3], [1, 2, 3])).toBe(0);
    });

    it('should return length of non-empty sequence when other is empty', () => {
      expect(editDistance([1, 2, 3], [])).toBe(3);
      expect(editDistance([], [1, 2, 3])).toBe(3);
    });

    it('should calculate correct distance for single substitution', () => {
      expect(editDistance([1, 2, 3], [1, 5, 3])).toBe(1);
    });

    it('should calculate correct distance for insertions', () => {
      expect(editDistance([1, 3], [1, 2, 3])).toBe(1);
    });

    it('should calculate correct distance for deletions', () => {
      expect(editDistance([1, 2, 3], [1, 3])).toBe(1);
    });

    it('should calculate correct distance for complex edits', () => {
      // "kitten" -> "sitting" requires 3 edits
      const kitten = ['k', 'i', 't', 't', 'e', 'n'];
      const sitting = ['s', 'i', 't', 't', 'i', 'n', 'g'];
      expect(editDistance(kitten, sitting)).toBe(3);
    });

    it('should work with custom comparator', () => {
      const seq1 = [{ id: 1 }, { id: 2 }];
      const seq2 = [{ id: 1 }, { id: 3 }];
      expect(editDistance(seq1, seq2, (a, b) => a.id === b.id)).toBe(1);
    });
  });

  describe('editDistanceSimilarity', () => {
    it('should return 1.0 for identical sequences', () => {
      expect(editDistanceSimilarity([1, 2, 3], [1, 2, 3])).toBe(1.0);
    });

    it('should return 0.0 for completely different sequences of same length', () => {
      expect(editDistanceSimilarity([1, 2, 3], [4, 5, 6])).toBe(0.0);
    });

    it('should return 1.0 for two empty sequences', () => {
      expect(editDistanceSimilarity([], [])).toBe(1.0);
    });

    it('should calculate correct similarity for partial match', () => {
      // [1, 2, 3] and [1, 5, 3] - 1 substitution, max length 3
      // Similarity = 1 - 1/3 = 0.666...
      expect(editDistanceSimilarity([1, 2, 3], [1, 5, 3])).toBeCloseTo(0.667, 2);
    });
  });

  describe('mean', () => {
    it('should calculate correct mean', () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should return 0 for empty array', () => {
      expect(mean([])).toBe(0);
    });

    it('should handle single element', () => {
      expect(mean([5])).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(mean([-2, -1, 0, 1, 2])).toBe(0);
    });
  });

  describe('standardDeviation', () => {
    it('should return 0 for constant values', () => {
      expect(standardDeviation([5, 5, 5, 5])).toBe(0);
    });

    it('should return 0 for single element', () => {
      expect(standardDeviation([5])).toBe(0);
    });

    it('should return 0 for empty array', () => {
      expect(standardDeviation([])).toBe(0);
    });

    it('should calculate correct standard deviation', () => {
      // [2, 4, 4, 4, 5, 5, 7, 9] - mean is 5, std dev is 2
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      expect(standardDeviation(values)).toBeCloseTo(2, 1);
    });
  });

  describe('weightedMean', () => {
    it('should calculate correct weighted mean', () => {
      // Values: [1, 2, 3], Weights: [1, 2, 3]
      // Weighted sum: 1*1 + 2*2 + 3*3 = 14
      // Weight sum: 1 + 2 + 3 = 6
      // Result: 14/6 = 2.333...
      expect(weightedMean([1, 2, 3], [1, 2, 3])).toBeCloseTo(2.333, 2);
    });

    it('should return 0 for empty arrays', () => {
      expect(weightedMean([], [])).toBe(0);
    });

    it('should return 0 when all weights are 0', () => {
      expect(weightedMean([1, 2, 3], [0, 0, 0])).toBe(0);
    });

    it('should throw for mismatched lengths', () => {
      expect(() => weightedMean([1, 2, 3], [1, 2])).toThrow();
    });

    it('should handle equal weights', () => {
      expect(weightedMean([1, 2, 3], [1, 1, 1])).toBe(2);
    });
  });

  describe('normalize', () => {
    it('should normalize value to 0-1 range', () => {
      expect(normalize(5, 0, 10)).toBe(0.5);
      expect(normalize(0, 0, 10)).toBe(0);
      expect(normalize(10, 0, 10)).toBe(1);
    });

    it('should clamp values outside range', () => {
      expect(normalize(-5, 0, 10)).toBe(0);
      expect(normalize(15, 0, 10)).toBe(1);
    });

    it('should return 0.5 when min equals max', () => {
      expect(normalize(5, 5, 5)).toBe(0.5);
    });

    it('should handle negative ranges', () => {
      expect(normalize(0, -10, 10)).toBe(0.5);
    });
  });

  describe('clamp', () => {
    it('should return value when within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should return min when value is below', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should return max when value is above', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should handle edge cases', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });

    it('should handle negative ranges', () => {
      expect(clamp(0, -10, -5)).toBe(-5);
      expect(clamp(-15, -10, -5)).toBe(-10);
    });
  });
});
