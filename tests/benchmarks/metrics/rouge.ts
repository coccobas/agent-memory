/**
 * ROUGE (Recall-Oriented Understudy for Gisting Evaluation) Implementation
 *
 * Implements ROUGE-1, ROUGE-2, and ROUGE-L for evaluating text similarity.
 * Used primarily for summarization quality assessment.
 *
 * @see https://aclanthology.org/W04-1013.pdf (original ROUGE paper)
 */

import type { ROUGEScores, ROUGEVariantScore } from './metric-types.js';

// =============================================================================
// TOKENIZATION
// =============================================================================

/**
 * Tokenize text into words (lowercased, punctuation removed)
 *
 * @param text Text to tokenize
 * @returns Array of lowercase tokens
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
    .split(/\s+/)               // Split on whitespace
    .filter(token => token.length > 0);
}

/**
 * Get n-grams from token array
 *
 * @param tokens Array of tokens
 * @param n Size of n-gram (1 for unigrams, 2 for bigrams, etc.)
 * @returns Map of n-gram strings to their counts
 */
export function getNgrams(tokens: string[], n: number): Map<string, number> {
  const ngrams = new Map<string, number>();

  if (tokens.length < n) {
    return ngrams;
  }

  for (let i = 0; i <= tokens.length - n; i++) {
    const ngram = tokens.slice(i, i + n).join(' ');
    ngrams.set(ngram, (ngrams.get(ngram) ?? 0) + 1);
  }

  return ngrams;
}

// =============================================================================
// ROUGE-N (N-gram overlap)
// =============================================================================

/**
 * Calculate ROUGE-N score (n-gram overlap)
 *
 * @param reference Reference text (ground truth)
 * @param candidate Candidate text (generated)
 * @param n N-gram size (1 for ROUGE-1, 2 for ROUGE-2)
 * @returns Precision, recall, and F1 scores
 */
export function rougeN(
  reference: string,
  candidate: string,
  n: number
): ROUGEVariantScore {
  const refTokens = tokenize(reference);
  const candTokens = tokenize(candidate);

  const refNgrams = getNgrams(refTokens, n);
  const candNgrams = getNgrams(candTokens, n);

  // Count overlapping n-grams
  let overlapCount = 0;
  for (const [ngram, candCount] of candNgrams) {
    const refCount = refNgrams.get(ngram) ?? 0;
    overlapCount += Math.min(candCount, refCount);
  }

  // Calculate total n-grams
  const refTotal = Array.from(refNgrams.values()).reduce((a, b) => a + b, 0);
  const candTotal = Array.from(candNgrams.values()).reduce((a, b) => a + b, 0);

  // Calculate precision, recall, F1
  const precision = candTotal > 0 ? overlapCount / candTotal : 0;
  const recall = refTotal > 0 ? overlapCount / refTotal : 0;
  const f1 = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  return { precision, recall, f1 };
}

/**
 * Calculate ROUGE-1 (unigram overlap)
 */
export function rouge1(reference: string, candidate: string): ROUGEVariantScore {
  return rougeN(reference, candidate, 1);
}

/**
 * Calculate ROUGE-2 (bigram overlap)
 */
export function rouge2(reference: string, candidate: string): ROUGEVariantScore {
  return rougeN(reference, candidate, 2);
}

// =============================================================================
// ROUGE-L (Longest Common Subsequence)
// =============================================================================

/**
 * Calculate Longest Common Subsequence length between two token arrays
 *
 * Uses dynamic programming for O(m*n) time complexity.
 *
 * @param tokens1 First token array
 * @param tokens2 Second token array
 * @returns Length of LCS
 */
export function lcsLength(tokens1: string[], tokens2: string[]): number {
  const m = tokens1.length;
  const n = tokens2.length;

  if (m === 0 || n === 0) {
    return 0;
  }

  // DP table: lcs[i][j] = LCS length for tokens1[0..i-1] and tokens2[0..j-1]
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (tokens1[i - 1] === tokens2[j - 1]) {
        lcs[i]![j] = lcs[i - 1]![j - 1]! + 1;
      } else {
        lcs[i]![j] = Math.max(lcs[i - 1]![j]!, lcs[i]![j - 1]!);
      }
    }
  }

  return lcs[m]![n]!;
}

/**
 * Calculate ROUGE-L (Longest Common Subsequence based)
 *
 * ROUGE-L measures the longest common subsequence between reference
 * and candidate, which captures sentence-level structure similarity.
 *
 * @param reference Reference text (ground truth)
 * @param candidate Candidate text (generated)
 * @returns Precision, recall, and F1 scores
 */
export function rougeL(reference: string, candidate: string): ROUGEVariantScore {
  const refTokens = tokenize(reference);
  const candTokens = tokenize(candidate);

  const lcs = lcsLength(refTokens, candTokens);

  const precision = candTokens.length > 0 ? lcs / candTokens.length : 0;
  const recall = refTokens.length > 0 ? lcs / refTokens.length : 0;
  const f1 = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  return { precision, recall, f1 };
}

// =============================================================================
// COMBINED ROUGE CALCULATION
// =============================================================================

/**
 * Calculate all ROUGE scores (ROUGE-1, ROUGE-2, ROUGE-L)
 *
 * @param reference Reference text (ground truth)
 * @param candidate Candidate text (generated)
 * @returns Complete ROUGE scores
 */
export function calculateROUGE(reference: string, candidate: string): ROUGEScores {
  return {
    rouge1: rouge1(reference, candidate),
    rouge2: rouge2(reference, candidate),
    rougeL: rougeL(reference, candidate),
  };
}

/**
 * Calculate ROUGE scores for multiple reference-candidate pairs
 *
 * @param pairs Array of { reference, candidate } pairs
 * @returns Array of ROUGE scores
 */
export function calculateROUGEBatch(
  pairs: Array<{ reference: string; candidate: string }>
): ROUGEScores[] {
  return pairs.map(({ reference, candidate }) =>
    calculateROUGE(reference, candidate)
  );
}

/**
 * Aggregate ROUGE scores from multiple evaluations
 *
 * @param scores Array of ROUGE scores
 * @returns Averaged ROUGE scores
 */
export function aggregateROUGEScores(scores: ROUGEScores[]): ROUGEScores {
  if (scores.length === 0) {
    return {
      rouge1: { precision: 0, recall: 0, f1: 0 },
      rouge2: { precision: 0, recall: 0, f1: 0 },
      rougeL: { precision: 0, recall: 0, f1: 0 },
    };
  }

  const sum = {
    rouge1: { precision: 0, recall: 0, f1: 0 },
    rouge2: { precision: 0, recall: 0, f1: 0 },
    rougeL: { precision: 0, recall: 0, f1: 0 },
  };

  for (const score of scores) {
    sum.rouge1.precision += score.rouge1.precision;
    sum.rouge1.recall += score.rouge1.recall;
    sum.rouge1.f1 += score.rouge1.f1;
    sum.rouge2.precision += score.rouge2.precision;
    sum.rouge2.recall += score.rouge2.recall;
    sum.rouge2.f1 += score.rouge2.f1;
    sum.rougeL.precision += score.rougeL.precision;
    sum.rougeL.recall += score.rougeL.recall;
    sum.rougeL.f1 += score.rougeL.f1;
  }

  const n = scores.length;
  return {
    rouge1: {
      precision: sum.rouge1.precision / n,
      recall: sum.rouge1.recall / n,
      f1: sum.rouge1.f1 / n,
    },
    rouge2: {
      precision: sum.rouge2.precision / n,
      recall: sum.rouge2.recall / n,
      f1: sum.rouge2.f1 / n,
    },
    rougeL: {
      precision: sum.rougeL.precision / n,
      recall: sum.rougeL.recall / n,
      f1: sum.rougeL.f1 / n,
    },
  };
}
