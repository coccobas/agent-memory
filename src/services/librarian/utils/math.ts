/**
 * Math Utilities for Librarian Service
 *
 * Provides mathematical functions for similarity calculations
 * and sequence analysis used in pattern detection.
 *
 * NOTE: Non-null assertions are used throughout for array indexing and Map access
 * after bounds checks and existence validation in algorithmic code.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { createValidationError } from '../../../core/errors.js';

// =============================================================================
// JACCARD SIMILARITY
// =============================================================================

/**
 * Calculate Jaccard similarity coefficient between two sets
 *
 * Jaccard Index = |A ∩ B| / |A ∪ B|
 *
 * @param set1 First set of elements
 * @param set2 Second set of elements
 * @returns Similarity score between 0 and 1
 */
export function jaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 1.0; // Empty sets are considered identical
  }

  if (set1.size === 0 || set2.size === 0) {
    return 0.0; // One empty set means no similarity
  }

  // Calculate intersection
  let intersectionSize = 0;
  for (const item of set1) {
    if (set2.has(item)) {
      intersectionSize++;
    }
  }

  // Calculate union size: |A| + |B| - |A ∩ B|
  const unionSize = set1.size + set2.size - intersectionSize;

  return intersectionSize / unionSize;
}

/**
 * Calculate Jaccard similarity from arrays (convenience function)
 */
export function jaccardSimilarityArrays<T>(arr1: T[], arr2: T[]): number {
  return jaccardSimilarity(new Set(arr1), new Set(arr2));
}

// =============================================================================
// LONGEST COMMON SUBSEQUENCE
// =============================================================================

/**
 * Calculate the longest common subsequence (LCS) between two sequences
 *
 * Uses dynamic programming with O(n*m) time and space complexity.
 *
 * @param seq1 First sequence
 * @param seq2 Second sequence
 * @param comparator Optional custom equality comparator
 * @returns The longest common subsequence as an array
 */
export function longestCommonSubsequence<T>(
  seq1: T[],
  seq2: T[],
  comparator: (a: T, b: T) => boolean = (a, b) => a === b
): T[] {
  const m = seq1.length;
  const n = seq2.length;

  if (m === 0 || n === 0) {
    return [];
  }

  // Build the LCS length table
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    // TypeScript doesn't infer type from Array.fill() - explicit annotation needed
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    dp[i] = new Array(n + 1).fill(0);
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s1Item = seq1[i - 1]!;
      const s2Item = seq2[j - 1]!;
      if (comparator(s1Item, s2Item)) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to find the actual LCS
  const lcs: T[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    const s1Item = seq1[i - 1]!;
    const s2Item = seq2[j - 1]!;
    if (comparator(s1Item, s2Item)) {
      lcs.unshift(s1Item);
      i--;
      j--;
    } else if (dp[i - 1]![j]! > dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Calculate the LCS length (without building the actual subsequence)
 *
 * More memory-efficient when you only need the length.
 */
export function lcsLength<T>(
  seq1: T[],
  seq2: T[],
  comparator: (a: T, b: T) => boolean = (a, b) => a === b
): number {
  const m = seq1.length;
  const n = seq2.length;

  if (m === 0 || n === 0) {
    return 0;
  }

  // Use two rows for space optimization
  // TypeScript doesn't infer type from Array.fill() - explicit annotation needed
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  let prevRow: number[] = new Array(n + 1).fill(0);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  let currRow: number[] = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s1Item = seq1[i - 1]!;
      const s2Item = seq2[j - 1]!;
      if (comparator(s1Item, s2Item)) {
        currRow[j] = prevRow[j - 1]! + 1;
      } else {
        currRow[j] = Math.max(prevRow[j]!, currRow[j - 1]!);
      }
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[n]!;
}

/**
 * Calculate LCS-based similarity ratio
 *
 * Similarity = 2 * |LCS| / (|seq1| + |seq2|)
 *
 * @returns Similarity score between 0 and 1
 */
export function lcsSimilarity<T>(
  seq1: T[],
  seq2: T[],
  comparator: (a: T, b: T) => boolean = (a, b) => a === b
): number {
  if (seq1.length === 0 && seq2.length === 0) {
    return 1.0;
  }

  if (seq1.length === 0 || seq2.length === 0) {
    return 0.0;
  }

  const lcsLen = lcsLength(seq1, seq2, comparator);
  return (2 * lcsLen) / (seq1.length + seq2.length);
}

// =============================================================================
// COSINE SIMILARITY
// =============================================================================

/**
 * Calculate cosine similarity between two vectors
 *
 * @param vec1 First vector
 * @param vec2 Second vector
 * @returns Similarity score between -1 and 1
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw createValidationError(
      'vectors',
      `Vectors must have the same dimension (got ${vec1.length} and ${vec2.length})`,
      'Ensure both vectors have equal length'
    );
  }

  if (vec1.length === 0) {
    return 0.0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    const v1 = vec1[i]!;
    const v2 = vec2[i]!;

    // Bug #238 fix: Check for NaN/Infinity in vector components
    // NaN propagates silently through calculations causing wrong results
    if (!Number.isFinite(v1) || !Number.isFinite(v2)) {
      return 0.0; // Return 0 similarity for invalid vectors
    }

    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);

  if (magnitude === 0) {
    return 0.0;
  }

  // Bug #238 fix: Final guard against NaN/Infinity in result
  const result = dotProduct / magnitude;
  return Number.isFinite(result) ? result : 0.0;
}

// =============================================================================
// EDIT DISTANCE (LEVENSHTEIN)
// =============================================================================

/**
 * Calculate Levenshtein edit distance between two sequences
 *
 * @param seq1 First sequence
 * @param seq2 Second sequence
 * @param comparator Optional custom equality comparator
 * @returns Minimum number of edits (insert, delete, substitute) needed
 */
export function editDistance<T>(
  seq1: T[],
  seq2: T[],
  comparator: (a: T, b: T) => boolean = (a, b) => a === b
): number {
  const m = seq1.length;
  const n = seq2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rows for space optimization
  let prevRow: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  // TypeScript doesn't infer type from Array.fill() - explicit annotation needed
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  let currRow: number[] = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;

    for (let j = 1; j <= n; j++) {
      const s1Item = seq1[i - 1]!;
      const s2Item = seq2[j - 1]!;
      if (comparator(s1Item, s2Item)) {
        currRow[j] = prevRow[j - 1]!;
      } else {
        currRow[j] =
          1 +
          Math.min(
            prevRow[j]!, // delete
            currRow[j - 1]!, // insert
            prevRow[j - 1]! // substitute
          );
      }
    }

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[n]!;
}

/**
 * Calculate normalized edit distance similarity
 *
 * Similarity = 1 - (editDistance / maxLength)
 *
 * @returns Similarity score between 0 and 1
 */
export function editDistanceSimilarity<T>(
  seq1: T[],
  seq2: T[],
  comparator: (a: T, b: T) => boolean = (a, b) => a === b
): number {
  if (seq1.length === 0 && seq2.length === 0) {
    return 1.0;
  }

  const maxLen = Math.max(seq1.length, seq2.length);
  const distance = editDistance(seq1, seq2, comparator);

  return 1 - distance / maxLen;
}

// =============================================================================
// STATISTICAL UTILITIES
// =============================================================================

/**
 * Calculate the mean of an array of numbers
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate the standard deviation of an array of numbers
 */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;

  const avg = mean(values);
  const squaredDiffs = values.map((val) => Math.pow(val - avg, 2));
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Calculate the weighted mean of values
 */
export function weightedMean(values: number[], weights: number[]): number {
  if (values.length !== weights.length) {
    throw createValidationError(
      'weights',
      `Values and weights must have the same length (got ${values.length} and ${weights.length})`,
      'Ensure values and weights arrays have equal length'
    );
  }

  if (values.length === 0) return 0;

  let weightedSum = 0;
  let weightSum = 0;

  for (let i = 0; i < values.length; i++) {
    weightedSum += values[i]! * weights[i]!;
    weightSum += weights[i]!;
  }

  if (weightSum === 0) return 0;

  return weightedSum / weightSum;
}

/**
 * Normalize a value to a 0-1 range given min and max bounds
 * Bug #237 fix: Handle NaN/Infinity from subnormal float operations
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  // Bug #237 fix: Check for invalid inputs that could cause precision issues
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 0.5; // Safe default for invalid inputs
  }
  const result = (value - min) / (max - min);
  // Ensure result is finite and within bounds
  if (!Number.isFinite(result)) return 0.5;
  return Math.max(0, Math.min(1, result));
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
