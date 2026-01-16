/**
 * Groundedness Evaluation
 *
 * Measures whether extracted/generated content is grounded in source material.
 * Used to detect hallucinations - content that cannot be traced back to the source.
 *
 * A fragment is "grounded" if it has high semantic similarity to some part of the source.
 * Ungrounded fragments may indicate fabrication or hallucination.
 */

import type { EmbeddingService } from '../../../src/services/embedding.service.js';
import { cosineSimilarity } from '../../../src/services/summarization/community-detection/similarity.js';
import type { GroundednessResult, GroundednessDetail, GroundednessConfig } from './metric-types.js';

// =============================================================================
// TEXT FRAGMENTATION
// =============================================================================

/**
 * Split text into sentences
 *
 * @param text Text to fragment
 * @returns Array of sentence fragments
 */
export function splitIntoSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0 && text.trim().length > 0) {
    return [text.trim()];
  }

  return sentences;
}

/**
 * Split text into phrases (shorter fragments)
 *
 * Splits on commas, semicolons, and sentence boundaries.
 *
 * @param text Text to fragment
 * @returns Array of phrase fragments
 */
export function splitIntoPhrases(text: string): string[] {
  const phrases = text
    .split(/[,;.!?]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3); // Filter very short fragments

  if (phrases.length === 0 && text.trim().length > 0) {
    return [text.trim()];
  }

  return phrases;
}

/**
 * Fragment text based on configuration
 *
 * @param text Text to fragment
 * @param fragmentSize 'sentence' or 'phrase'
 * @returns Array of fragments
 */
export function fragmentText(text: string, fragmentSize: 'sentence' | 'phrase'): string[] {
  if (fragmentSize === 'phrase') {
    return splitIntoPhrases(text);
  }
  return splitIntoSentences(text);
}

// =============================================================================
// GROUNDEDNESS EVALUATOR
// =============================================================================

/**
 * Default configuration for groundedness evaluation
 */
const DEFAULT_CONFIG: GroundednessConfig = {
  enabled: true,
  threshold: 0.7,
  fragmentSize: 'sentence',
};

/**
 * Groundedness evaluator using embedding similarity
 */
export class GroundednessEvaluator {
  private embeddingService: EmbeddingService;
  private config: GroundednessConfig;

  constructor(embeddingService: EmbeddingService, config: Partial<GroundednessConfig> = {}) {
    this.embeddingService = embeddingService;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluate groundedness of extracted content against source
   *
   * Algorithm:
   * 1. Fragment both extracted content and source into sentences/phrases
   * 2. Generate embeddings for all fragments
   * 3. For each extracted fragment, find best matching source fragment
   * 4. Mark as grounded if similarity >= threshold
   * 5. Return overall groundedness score and details
   *
   * @param extractedContent Content that was extracted (to evaluate)
   * @param sourceContext Original source material
   * @returns Groundedness evaluation result
   */
  async evaluateGroundedness(
    extractedContent: string,
    sourceContext: string
  ): Promise<GroundednessResult> {
    // Fragment texts
    const extractedFragments = fragmentText(extractedContent, this.config.fragmentSize);
    const sourceFragments = fragmentText(sourceContext, this.config.fragmentSize);

    // Handle edge cases
    if (extractedFragments.length === 0) {
      return {
        score: 1.0, // Nothing extracted = nothing ungrounded
        groundedFragments: [],
        ungroundedFragments: [],
        details: [],
        threshold: this.config.threshold,
      };
    }

    if (sourceFragments.length === 0) {
      return {
        score: 0.0, // No source = nothing can be grounded
        groundedFragments: [],
        ungroundedFragments: extractedFragments,
        details: extractedFragments.map((f) => ({
          extractedFragment: f,
          sourceFragment: null,
          similarity: 0,
          isGrounded: false,
        })),
        threshold: this.config.threshold,
      };
    }

    // Generate embeddings for all fragments
    const allFragments = [...extractedFragments, ...sourceFragments];
    const { embeddings } = await this.embeddingService.embedBatch(allFragments);

    // Split embeddings
    const extractedEmbeddings = embeddings.slice(0, extractedFragments.length);
    const sourceEmbeddings = embeddings.slice(extractedFragments.length);

    // Evaluate each extracted fragment
    const details: GroundednessDetail[] = [];
    const groundedFragments: string[] = [];
    const ungroundedFragments: string[] = [];

    for (let i = 0; i < extractedFragments.length; i++) {
      const extractedFragment = extractedFragments[i]!;
      const extractedEmb = extractedEmbeddings[i]!;

      // Find best matching source fragment
      let bestSimilarity = 0;
      let bestSourceFragment: string | null = null;

      for (let j = 0; j < sourceFragments.length; j++) {
        const sourceEmb = sourceEmbeddings[j]!;
        const similarity = cosineSimilarity(extractedEmb, sourceEmb);

        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestSourceFragment = sourceFragments[j]!;
        }
      }

      const isGrounded = bestSimilarity >= this.config.threshold;

      details.push({
        extractedFragment,
        sourceFragment: bestSourceFragment,
        similarity: bestSimilarity,
        isGrounded,
      });

      if (isGrounded) {
        groundedFragments.push(extractedFragment);
      } else {
        ungroundedFragments.push(extractedFragment);
      }
    }

    // Calculate overall score
    const score = groundedFragments.length / extractedFragments.length;

    return {
      score,
      groundedFragments,
      ungroundedFragments,
      details,
      threshold: this.config.threshold,
    };
  }

  /**
   * Evaluate groundedness for multiple extracted entries against a shared source
   *
   * @param extractedContents Array of extracted content strings
   * @param sourceContext Original source material
   * @returns Array of groundedness results
   */
  async evaluateGroundednessBatch(
    extractedContents: string[],
    sourceContext: string
  ): Promise<GroundednessResult[]> {
    if (extractedContents.length === 0) {
      return [];
    }

    const results: GroundednessResult[] = [];
    for (const content of extractedContents) {
      const result = await this.evaluateGroundedness(content, sourceContext);
      results.push(result);
    }

    return results;
  }

  /**
   * Get current threshold setting
   */
  getThreshold(): number {
    return this.config.threshold;
  }
}

// =============================================================================
// AGGREGATION UTILITIES
// =============================================================================

/**
 * Aggregate groundedness results from multiple evaluations
 *
 * @param results Array of groundedness results
 * @returns Aggregated statistics
 */
export function aggregateGroundednessResults(results: GroundednessResult[]): {
  avgScore: number;
  totalGrounded: number;
  totalUngrounded: number;
  ungroundedRate: number;
} {
  if (results.length === 0) {
    return {
      avgScore: 0,
      totalGrounded: 0,
      totalUngrounded: 0,
      ungroundedRate: 0,
    };
  }

  let scoreSum = 0;
  let totalGrounded = 0;
  let totalUngrounded = 0;

  for (const result of results) {
    scoreSum += result.score;
    totalGrounded += result.groundedFragments.length;
    totalUngrounded += result.ungroundedFragments.length;
  }

  const totalFragments = totalGrounded + totalUngrounded;

  return {
    avgScore: scoreSum / results.length,
    totalGrounded,
    totalUngrounded,
    ungroundedRate: totalFragments > 0 ? totalUngrounded / totalFragments : 0,
  };
}
