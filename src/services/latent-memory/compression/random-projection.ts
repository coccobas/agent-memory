/**
 * Random Projection Compression Strategy
 *
 * Implements sparse random projection for dimensionality reduction.
 * Uses the Johnson-Lindenstrauss lemma to preserve pairwise distances
 * with high probability while reducing dimensionality.
 *
 * Key properties:
 * - Preserves cosine similarity with high probability
 * - O(1) projection time per dimension (sparse matrix)
 * - Deterministic with seed for reproducibility
 * - No training required (data-independent)
 *
 * Reference: Achlioptas, D. (2003). Database-friendly random projections.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { createValidationError, createServiceUnavailableError } from '../../../core/errors.js';
import type { CompressionStrategy, CompressionMethod, RandomProjectionConfig } from './types.js';

/**
 * Seeded pseudo-random number generator (Mulberry32)
 * Provides reproducible random numbers for consistent compression.
 *
 * @param seed - Initial seed value
 * @returns Function that generates random numbers in [0, 1)
 */
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random Projection compression strategy
 *
 * Implements sparse random projection using Achlioptas's distribution:
 * - Values: {-1, 0, +1}
 * - Probabilities: {1/6, 2/3, 1/6} for sparsity factor s=3
 * - Scaling: 1/sqrt(outputDimension) for distance preservation
 *
 * @example
 * ```typescript
 * const compressor = new RandomProjection({
 *   inputDimension: 1536,
 *   outputDimension: 256,
 *   seed: 42
 * });
 *
 * const embedding = new Array(1536).fill(0).map(() => Math.random());
 * const compressed = compressor.compress(embedding);
 * console.log(compressed.length); // 256
 * ```
 */
export class RandomProjection implements CompressionStrategy {
  private readonly inputDim: number;
  private readonly outputDim: number;
  private readonly seed: number;
  private readonly sparsity: number;
  private readonly scale: number;

  // Lazy-loaded projection matrix (sparse representation)
  // Only stores non-zero values: Map<outputIndex, Map<inputIndex, value>>
  private projectionMatrix: Map<number, Map<number, number>> | null = null;

  /**
   * Create a new random projection compressor
   *
   * @param config - Configuration including input/output dimensions and seed
   */
  constructor(config: RandomProjectionConfig) {
    if (config.inputDimension <= 0 || config.outputDimension <= 0) {
      throw createValidationError('dimensions', 'input and output dimensions must be positive');
    }

    if (config.outputDimension > config.inputDimension) {
      throw createValidationError('outputDimension', 'must not exceed input dimension');
    }

    this.inputDim = config.inputDimension;
    this.outputDim = config.outputDimension;
    this.seed = config.seed ?? Date.now();
    this.sparsity = config.sparsity ?? 3;

    // Johnson-Lindenstrauss scaling factor
    this.scale = 1 / Math.sqrt(this.outputDim);
  }

  /**
   * Initialize the sparse random projection matrix
   * Uses lazy initialization to avoid memory overhead when not needed
   */
  private initializeMatrix(): void {
    if (this.projectionMatrix !== null) {
      return;
    }

    const rng = createSeededRandom(this.seed);
    this.projectionMatrix = new Map();

    // Generate sparse random matrix
    for (let i = 0; i < this.outputDim; i++) {
      const row = new Map<number, number>();

      for (let j = 0; j < this.inputDim; j++) {
        const rand = rng();

        // Achlioptas distribution with sparsity s=3:
        // P(value = +1) = 1/6
        // P(value =  0) = 2/3
        // P(value = -1) = 1/6
        let value = 0;
        if (rand < 1 / (2 * this.sparsity)) {
          value = 1;
        } else if (rand > 1 - 1 / (2 * this.sparsity)) {
          value = -1;
        }

        // Only store non-zero values (sparse)
        if (value !== 0) {
          row.set(j, value);
        }
      }

      if (row.size > 0) {
        this.projectionMatrix.set(i, row);
      }
    }
  }

  /**
   * Compress a high-dimensional embedding using random projection
   *
   * Time complexity: O(nnz * outputDim) where nnz is average non-zeros per row
   * Space complexity: O(outputDim) for result
   *
   * @param embedding - Input embedding vector
   * @returns Compressed embedding vector
   * @throws Error if embedding dimension doesn't match configuration
   */
  compress(embedding: number[]): number[] {
    if (embedding.length !== this.inputDim) {
      throw createValidationError(
        'embedding',
        `dimension mismatch: expected ${this.inputDim}, got ${embedding.length}`
      );
    }

    // Lazy initialization of projection matrix
    this.initializeMatrix();

    // TypeScript doesn't infer type from Array.fill() - explicit annotation needed
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result: number[] = new Array(this.outputDim).fill(0);

    // Sparse matrix-vector multiplication
    for (let i = 0; i < this.outputDim; i++) {
      const row = this.projectionMatrix!.get(i);
      if (!row) {
        continue;
      }

      let sum = 0;
      row.forEach((value, j) => {
        sum += embedding[j]! * value;
      });

      // Apply scaling factor for distance preservation
      result[i] = sum * this.scale;
    }

    return result;
  }

  /**
   * Random projection is not invertible - decompression not supported
   * The projection is lossy by design.
   *
   * To recover approximate vectors, use the adjoint (transpose) operation,
   * but this is generally not useful for retrieval purposes.
   */
  decompress(): number[] {
    throw createServiceUnavailableError(
      'decompress',
      'random projection does not support decompression (lossy transformation)'
    );
  }

  /**
   * Get the output dimension after compression
   *
   * @returns Output dimension size
   */
  getOutputDimension(): number {
    return this.outputDim;
  }

  /**
   * Get the compression method name
   *
   * @returns 'random_projection'
   */
  getName(): CompressionMethod {
    return 'random_projection';
  }

  /**
   * Get configuration information
   *
   * @returns Configuration object with dimensions and seed
   */
  getConfig(): RandomProjectionConfig {
    return {
      inputDimension: this.inputDim,
      outputDimension: this.outputDim,
      seed: this.seed,
      sparsity: this.sparsity,
    };
  }

  /**
   * Calculate approximate memory usage of the projection matrix
   *
   * @returns Estimated memory in bytes
   */
  getMemoryUsage(): number {
    if (this.projectionMatrix === null) {
      return 0;
    }

    let nonZeroCount = 0;
    this.projectionMatrix.forEach((row) => {
      nonZeroCount += row.size;
    });

    // Each entry: 8 bytes (key) + 8 bytes (value) + overhead
    return nonZeroCount * 20 + this.outputDim * 8;
  }

  /**
   * Estimate the expected error bound for this projection
   * Based on Johnson-Lindenstrauss lemma
   *
   * @param epsilon - Desired relative error (default: 0.1 for 10%)
   * @returns Minimum output dimension needed for this error bound
   */
  static estimateOutputDimension(epsilon: number = 0.1): number {
    // Johnson-Lindenstrauss: k >= 4 * log(n) / (ε²/2 - ε³/3)
    // For practical purposes, simplified to: k >= 8 * log(n) / ε²
    // Assuming n=10000 entries in the dataset
    const n = 10000;
    const k = (8 * Math.log(n)) / (epsilon * epsilon);
    return Math.ceil(k);
  }
}

/**
 * Factory function to create a random projection compressor
 *
 * @param config - Configuration including input/output dimensions and seed
 * @returns Random projection compression strategy
 *
 * @example
 * ```typescript
 * const compressor = createRandomProjection({
 *   inputDimension: 1536,
 *   outputDimension: 256,
 *   seed: 42
 * });
 * ```
 */
export function createRandomProjection(config: RandomProjectionConfig): RandomProjection {
  return new RandomProjection(config);
}
