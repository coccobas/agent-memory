/**
 * BERTScore Implementation
 *
 * Semantic similarity metric using contextual embeddings.
 * Unlike ROUGE which measures surface-level overlap, BERTScore captures
 * semantic meaning through embedding similarity.
 *
 * @see https://arxiv.org/abs/1904.09675 (BERTScore paper)
 */

import type { EmbeddingService } from '../../../src/services/embedding.service.js';
import { cosineSimilarity } from '../../../src/services/summarization/community-detection/similarity.js';
import type { BERTScoreResult } from './metric-types.js';

// =============================================================================
// TEXT SEGMENTATION
// =============================================================================

/**
 * Split text into sentences for embedding
 *
 * Uses simple sentence boundary detection (. ! ? followed by space or end).
 * Falls back to treating entire text as one segment if no boundaries found.
 *
 * @param text Text to segment
 * @returns Array of sentence strings
 */
export function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // If no sentences found, treat whole text as one
  if (sentences.length === 0 && text.trim().length > 0) {
    return [text.trim()];
  }

  return sentences;
}

// =============================================================================
// BERTSCORE EVALUATOR
// =============================================================================

/**
 * BERTScore evaluator using embedding similarity
 */
export class BERTScoreEvaluator {
  private embeddingService: EmbeddingService;

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  /**
   * Calculate BERTScore between reference and candidate text
   *
   * Algorithm:
   * 1. Segment texts into sentences
   * 2. Generate embeddings for all sentences
   * 3. Compute similarity matrix
   * 4. Precision = avg of max similarities for each candidate sentence
   * 5. Recall = avg of max similarities for each reference sentence
   * 6. F1 = harmonic mean
   *
   * @param reference Reference text (ground truth)
   * @param candidate Candidate text (generated)
   * @returns BERTScore result with precision, recall, F1
   */
  async calculateBERTScore(
    reference: string,
    candidate: string
  ): Promise<BERTScoreResult> {
    // Segment into sentences
    const refSentences = splitIntoSentences(reference);
    const candSentences = splitIntoSentences(candidate);

    // Handle edge cases
    if (refSentences.length === 0 || candSentences.length === 0) {
      return {
        precision: 0,
        recall: 0,
        f1: 0,
        embeddingModel: this.getModelName(),
        embeddingProvider: this.embeddingService.getProvider(),
      };
    }

    // Generate embeddings for all sentences
    const allSentences = [...refSentences, ...candSentences];
    const { embeddings } = await this.embeddingService.embedBatch(allSentences);

    // Split embeddings back
    const refEmbeddings = embeddings.slice(0, refSentences.length);
    const candEmbeddings = embeddings.slice(refSentences.length);

    // Calculate precision: for each candidate sentence, find max similarity to any reference
    let precisionSum = 0;
    for (const candEmb of candEmbeddings) {
      let maxSim = 0;
      for (const refEmb of refEmbeddings) {
        const sim = cosineSimilarity(candEmb, refEmb);
        maxSim = Math.max(maxSim, sim);
      }
      precisionSum += maxSim;
    }
    const precision = precisionSum / candEmbeddings.length;

    // Calculate recall: for each reference sentence, find max similarity to any candidate
    let recallSum = 0;
    for (const refEmb of refEmbeddings) {
      let maxSim = 0;
      for (const candEmb of candEmbeddings) {
        const sim = cosineSimilarity(refEmb, candEmb);
        maxSim = Math.max(maxSim, sim);
      }
      recallSum += maxSim;
    }
    const recall = recallSum / refEmbeddings.length;

    // Calculate F1
    const f1 = precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

    return {
      precision,
      recall,
      f1,
      embeddingModel: this.getModelName(),
      embeddingProvider: this.embeddingService.getProvider(),
    };
  }

  /**
   * Calculate BERTScore for multiple pairs
   *
   * More efficient than calling calculateBERTScore repeatedly as it batches embeddings.
   *
   * @param pairs Array of { reference, candidate } pairs
   * @returns Array of BERTScore results
   */
  async calculateBERTScoreBatch(
    pairs: Array<{ reference: string; candidate: string }>
  ): Promise<BERTScoreResult[]> {
    if (pairs.length === 0) {
      return [];
    }

    // For now, process sequentially (could optimize with batched embeddings)
    const results: BERTScoreResult[] = [];
    for (const { reference, candidate } of pairs) {
      const result = await this.calculateBERTScore(reference, candidate);
      results.push(result);
    }

    return results;
  }

  /**
   * Get the model name being used
   */
  private getModelName(): string {
    const provider = this.embeddingService.getProvider();
    if (provider === 'openai') {
      return 'text-embedding-3-small';
    } else if (provider === 'local') {
      return 'all-MiniLM-L6-v2';
    }
    return 'unknown';
  }
}

// =============================================================================
// AGGREGATION UTILITIES
// =============================================================================

/**
 * Aggregate BERTScore results from multiple evaluations
 *
 * @param scores Array of BERTScore results
 * @returns Averaged BERTScore
 */
export function aggregateBERTScores(
  scores: BERTScoreResult[]
): Omit<BERTScoreResult, 'embeddingModel' | 'embeddingProvider'> & {
  embeddingModel: string;
  embeddingProvider: string;
} {
  if (scores.length === 0) {
    return {
      precision: 0,
      recall: 0,
      f1: 0,
      embeddingModel: 'unknown',
      embeddingProvider: 'unknown',
    };
  }

  let precisionSum = 0;
  let recallSum = 0;
  let f1Sum = 0;

  for (const score of scores) {
    precisionSum += score.precision;
    recallSum += score.recall;
    f1Sum += score.f1;
  }

  const n = scores.length;
  return {
    precision: precisionSum / n,
    recall: recallSum / n,
    f1: f1Sum / n,
    embeddingModel: scores[0]!.embeddingModel,
    embeddingProvider: scores[0]!.embeddingProvider,
  };
}
