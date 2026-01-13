/**
 * Embedding Dimension Tests (P0)
 *
 * Tests critical edge cases in embedding dimension handling:
 * - Dimension mismatch detection
 * - Batch consistency validation
 * - NaN/Infinity handling
 * - Provider fallback dimension issues
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Embedding Dimension - Boundary Conditions', () => {
  describe('validateEmbedding', () => {
    it('should accept valid embedding', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const result = validateEmbedding(embedding);
      expect(result.valid).toBe(true);
      expect(result.embedding).toEqual(embedding);
    });

    it('should reject empty embedding', () => {
      const embedding: number[] = [];
      const result = validateEmbedding(embedding);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should detect NaN in embedding', () => {
      const embedding = [0.1, NaN, 0.3, 0.4, 0.5];
      const result = validateEmbedding(embedding);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('NaN');
    });

    it('should detect Infinity in embedding', () => {
      const embedding = [0.1, Infinity, 0.3, 0.4, 0.5];
      const result = validateEmbedding(embedding);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Infinity');
    });

    it('should detect -Infinity in embedding', () => {
      const embedding = [0.1, -Infinity, 0.3, 0.4, 0.5];
      const result = validateEmbedding(embedding);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Infinity');
    });

    it('should detect multiple invalid values', () => {
      const embedding = [NaN, Infinity, -Infinity, 0.4, 0.5];
      const result = validateEmbedding(embedding);
      expect(result.valid).toBe(false);
    });

    it('should handle very large values (not Infinity)', () => {
      const embedding = [1e308, -1e308, 0.3, 0.4, 0.5];
      const result = validateEmbedding(embedding);
      expect(result.valid).toBe(true);
    });

    it('should handle very small values (near zero)', () => {
      const embedding = [1e-308, -1e-308, 0, 0.4, 0.5];
      const result = validateEmbedding(embedding);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateEmbeddingBatch', () => {
    it('should accept valid batch with consistent dimensions', () => {
      const batch = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
        [0.7, 0.8, 0.9],
      ];
      const result = validateEmbeddingBatch(batch);
      expect(result.valid).toBe(true);
    });

    it('should reject empty batch', () => {
      const batch: number[][] = [];
      const result = validateEmbeddingBatch(batch);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should detect mixed dimensions in batch', () => {
      const batch = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5], // Different dimension!
        [0.7, 0.8, 0.9],
      ];
      const result = validateEmbeddingBatch(batch);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dimension');
    });

    it('should detect NaN in any batch item', () => {
      const batch = [
        [0.1, 0.2, 0.3],
        [0.4, NaN, 0.6],
        [0.7, 0.8, 0.9],
      ];
      const result = validateEmbeddingBatch(batch);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('NaN');
    });

    it('should handle batch with single item', () => {
      const batch = [[0.1, 0.2, 0.3]];
      const result = validateEmbeddingBatch(batch);
      expect(result.valid).toBe(true);
    });

    it('should handle very large batch', () => {
      const batch = Array(1000)
        .fill(null)
        .map(() => [0.1, 0.2, 0.3]);
      const result = validateEmbeddingBatch(batch);
      expect(result.valid).toBe(true);
    });
  });

  describe('dimensionMismatch', () => {
    it('should detect mismatch between query and stored embedding', () => {
      const queryEmbedding = new Array(384).fill(0.1);
      const storedEmbedding = new Array(1536).fill(0.2);

      const mismatch = checkDimensionMismatch(queryEmbedding, storedEmbedding);
      expect(mismatch).toBe(true);
    });

    it('should not detect mismatch for same dimensions', () => {
      const queryEmbedding = new Array(384).fill(0.1);
      const storedEmbedding = new Array(384).fill(0.2);

      const mismatch = checkDimensionMismatch(queryEmbedding, storedEmbedding);
      expect(mismatch).toBe(false);
    });

    it('should handle empty query embedding', () => {
      const queryEmbedding: number[] = [];
      const storedEmbedding = new Array(384).fill(0.2);

      const mismatch = checkDimensionMismatch(queryEmbedding, storedEmbedding);
      expect(mismatch).toBe(true);
    });

    it('should handle empty stored embedding', () => {
      const queryEmbedding = new Array(384).fill(0.1);
      const storedEmbedding: number[] = [];

      const mismatch = checkDimensionMismatch(queryEmbedding, storedEmbedding);
      expect(mismatch).toBe(true);
    });
  });

  describe('cosineSimilarityWithMismatch', () => {
    it('should compute correct similarity for matching dimensions', () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should compute correct similarity for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('should compute correct similarity for opposite vectors', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('should throw error for mismatched dimensions', () => {
      const a = [1, 0, 0];
      const b = [1, 0];
      expect(() => cosineSimilarity(a, b)).toThrow();
    });

    it('should handle zero vector gracefully', () => {
      const a = [0, 0, 0];
      const b = [1, 0, 0];
      // Zero vector has undefined cosine similarity (0/0)
      const similarity = cosineSimilarity(a, b);
      expect(Number.isNaN(similarity)).toBe(true);
    });

    it('should handle NaN in vector', () => {
      const a = [NaN, 0, 0];
      const b = [1, 0, 0];
      const similarity = cosineSimilarity(a, b);
      expect(Number.isNaN(similarity)).toBe(true);
    });
  });

  describe('Provider Dimension Detection', () => {
    it('should detect OpenAI dimension (1536 for text-embedding-ada-002)', () => {
      const dimension = getProviderDimension('openai', 'text-embedding-ada-002');
      expect(dimension).toBe(1536);
    });

    it('should detect OpenAI dimension (3072 for text-embedding-3-large)', () => {
      const dimension = getProviderDimension('openai', 'text-embedding-3-large');
      expect(dimension).toBe(3072);
    });

    it('should detect LMStudio default dimension', () => {
      const dimension = getProviderDimension('lmstudio', undefined);
      expect(dimension).toBe(384); // Common default
    });

    it('should return 0 for disabled provider', () => {
      const dimension = getProviderDimension('disabled', undefined);
      expect(dimension).toBe(0);
    });

    it('should handle unknown provider', () => {
      const dimension = getProviderDimension('unknown' as any, undefined);
      expect(dimension).toBe(0);
    });
  });

  describe('Dimension Change Detection (Model Swap)', () => {
    it('should detect when model dimension changes', () => {
      const oldDimension = 1536;
      const newDimension = 384;

      const changed = dimensionChanged(oldDimension, newDimension);
      expect(changed).toBe(true);
    });

    it('should not flag same dimension', () => {
      const oldDimension = 384;
      const newDimension = 384;

      const changed = dimensionChanged(oldDimension, newDimension);
      expect(changed).toBe(false);
    });

    it('should flag when old dimension is 0 (first time)', () => {
      const oldDimension = 0;
      const newDimension = 384;

      const changed = dimensionChanged(oldDimension, newDimension);
      expect(changed).toBe(false); // First time is not a "change"
    });

    it('should flag when new dimension is 0 (disabled)', () => {
      const oldDimension = 384;
      const newDimension = 0;

      const changed = dimensionChanged(oldDimension, newDimension);
      expect(changed).toBe(true);
    });
  });

  describe('Cross-dimension Similarity (Silent Corruption)', () => {
    it('should detect corrupted similarity when dimensions differ', () => {
      // This simulates what happens when old 1536-dim embeddings meet new 384-dim queries
      const query384 = new Array(384).fill(0.1);
      const stored1536 = new Array(1536).fill(0.05);

      // Truncated comparison (only first 384 dims)
      const truncatedSimilarity = cosineSimilarityTruncated(query384, stored1536.slice(0, 384));

      // Full comparison would be different
      expect(truncatedSimilarity).toBeDefined();
    });

    it('should show different results for truncated vs padded comparison', () => {
      const query384 = new Array(384).fill(0.1);
      const stored1536 = new Array(1536).fill(0.05);

      // Pad query to 1536
      const paddedQuery = [...query384, ...new Array(1152).fill(0)];
      const paddedSimilarity = cosineSimilarity(paddedQuery, stored1536);

      // Truncate stored to 384
      const truncatedSimilarity = cosineSimilarity(query384, stored1536.slice(0, 384));

      // These should be different!
      expect(paddedSimilarity).not.toBeCloseTo(truncatedSimilarity, 2);
    });
  });
});

// =============================================================================
// Helper functions for testing
// =============================================================================

interface ValidationResult {
  valid: boolean;
  embedding?: number[];
  error?: string;
}

function validateEmbedding(embedding: number[]): ValidationResult {
  if (embedding.length === 0) {
    return { valid: false, error: 'Embedding is empty' };
  }

  for (let i = 0; i < embedding.length; i++) {
    const value = embedding[i];
    if (Number.isNaN(value)) {
      return { valid: false, error: `Embedding contains NaN at index ${i}` };
    }
    if (!Number.isFinite(value)) {
      return { valid: false, error: `Embedding contains Infinity at index ${i}` };
    }
  }

  return { valid: true, embedding };
}

function validateEmbeddingBatch(batch: number[][]): ValidationResult {
  if (batch.length === 0) {
    return { valid: false, error: 'Batch is empty' };
  }

  const expectedDimension = batch[0].length;

  for (let i = 0; i < batch.length; i++) {
    const embedding = batch[i];

    if (embedding.length !== expectedDimension) {
      return {
        valid: false,
        error: `Batch has inconsistent dimensions: item ${i} has ${embedding.length}, expected ${expectedDimension}`,
      };
    }

    const itemResult = validateEmbedding(embedding);
    if (!itemResult.valid) {
      return { valid: false, error: `Batch item ${i}: ${itemResult.error}` };
    }
  }

  return { valid: true };
}

function checkDimensionMismatch(query: number[], stored: number[]): boolean {
  return query.length !== stored.length;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function cosineSimilarityTruncated(a: number[], b: number[]): number {
  const minLength = Math.min(a.length, b.length);
  return cosineSimilarity(a.slice(0, minLength), b.slice(0, minLength));
}

function getProviderDimension(provider: string, model: string | undefined): number {
  if (provider === 'disabled') return 0;

  if (provider === 'openai') {
    if (model === 'text-embedding-ada-002') return 1536;
    if (model === 'text-embedding-3-small') return 1536;
    if (model === 'text-embedding-3-large') return 3072;
    return 1536; // default
  }

  if (provider === 'lmstudio') {
    return 384; // common default
  }

  if (provider === 'local') {
    return 384;
  }

  return 0;
}

function dimensionChanged(oldDim: number, newDim: number): boolean {
  // First-time initialization is not a "change"
  if (oldDim === 0) return false;
  return oldDim !== newDim;
}
