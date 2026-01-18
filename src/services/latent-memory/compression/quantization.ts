/**
 * Scalar Quantization Compression Strategy
 *
 * Implements scalar quantization to reduce embedding storage size by
 * converting float32 values to int8 (or int16) representations.
 *
 * Key properties:
 * - Reduces memory footprint by 4x (float32 -> int8)
 * - Maintains dimensionality (no dimension reduction)
 * - Supports decompression to approximate original values
 * - Fast compression and decompression (simple arithmetic)
 * - Lossy compression with controllable precision
 *
 * Quantization formula:
 * - quantized = round((value - min) / (max - min) * (2^bits - 1))
 * - dequantized = (quantized / (2^bits - 1)) * (max - min) + min
 *
 * NOTE: Non-null assertions used for array indexing after bounds checks in compression algorithms.
 */

import { createValidationError } from '../../../core/errors.js';
import type { CompressionStrategy, CompressionMethod, QuantizationConfig } from './types.js';

/**
 * Scalar Quantization compression strategy
 *
 * Compresses float32 embeddings to int8 or int16 representations.
 * Preserves all dimensions but reduces precision.
 *
 * @example
 * ```typescript
 * const compressor = new ScalarQuantization({
 *   inputDimension: 1536,
 *   outputDimension: 1536, // Same as input for quantization
 *   bits: 8
 * });
 *
 * const embedding = new Array(1536).fill(0).map(() => Math.random());
 * const compressed = compressor.compress(embedding);
 * const decompressed = compressor.decompress(compressed);
 *
 * // Memory saved: 1536 * 4 bytes -> 1536 * 1 byte = 75% reduction
 * ```
 */
export class ScalarQuantization implements CompressionStrategy {
  private readonly inputDim: number;
  private readonly outputDim: number;
  private readonly bits: 8 | 16;
  private min: number;
  private max: number;
  private readonly minValue: number;
  private readonly maxValue: number;
  private readonly range: number;

  /**
   * Create a new scalar quantization compressor
   *
   * @param config - Configuration including dimensions, bits, and optional min/max
   */
  constructor(config: QuantizationConfig) {
    if (config.inputDimension <= 0) {
      throw createValidationError('inputDimension', 'must be positive');
    }

    // For quantization, input and output dimensions must match
    if (config.outputDimension !== config.inputDimension) {
      throw createValidationError(
        'outputDimension',
        'quantization preserves dimensionality: must equal inputDimension'
      );
    }

    this.inputDim = config.inputDimension;
    this.outputDim = config.outputDimension;
    this.bits = config.bits ?? 8;

    // Quantization range based on bits
    if (this.bits === 8) {
      this.minValue = -128;
      this.maxValue = 127;
    } else if (this.bits === 16) {
      this.minValue = -32768;
      this.maxValue = 32767;
    } else {
      throw createValidationError('bits', 'only 8-bit and 16-bit quantization supported');
    }

    this.range = this.maxValue - this.minValue;

    // Value range for normalization
    // If not provided, will be computed from first embedding
    this.min = config.min ?? -Infinity;
    this.max = config.max ?? Infinity;
  }

  /**
   * Update normalization range based on embedding values
   * Called automatically on first compression if min/max not provided
   *
   * @param embedding - Input embedding to compute range from
   */
  private updateRange(embedding: number[]): void {
    if (this.min !== -Infinity && this.max !== Infinity) {
      return; // Range already set
    }

    let min = Infinity;
    let max = -Infinity;

    for (const value of embedding) {
      if (value < min) min = value;
      if (value > max) max = value;
    }

    // Add small epsilon to avoid division by zero
    const epsilon = 1e-8;
    if (max - min < epsilon) {
      min -= epsilon;
      max += epsilon;
    }

    this.min = min;
    this.max = max;
  }

  /**
   * Compress a float32 embedding to int8/int16 representation
   *
   * Time complexity: O(n) where n is embedding dimension
   * Space complexity: O(n) for result
   *
   * @param embedding - Input embedding vector (float32)
   * @returns Quantized embedding vector (int8/int16 as numbers)
   * @throws Error if embedding dimension doesn't match configuration
   */
  compress(embedding: number[]): number[] {
    if (embedding.length !== this.inputDim) {
      throw createValidationError(
        'embedding',
        `dimension mismatch: expected ${this.inputDim}, got ${embedding.length}`
      );
    }

    // Compute range from first embedding if needed
    this.updateRange(embedding);

    const result = new Array<number>(this.outputDim);

    for (let i = 0; i < embedding.length; i++) {
      const value = embedding[i] ?? 0;
      // Normalize to [0, 1]
      const normalized = (value - this.min) / (this.max - this.min);

      // Scale to [minValue, maxValue] and round
      const quantized = Math.round(normalized * this.range + this.minValue);

      // Clamp to valid range
      result[i] = Math.max(this.minValue, Math.min(this.maxValue, quantized));
    }

    return result;
  }

  /**
   * Decompress an int8/int16 embedding back to approximate float32
   *
   * Time complexity: O(n) where n is embedding dimension
   * Space complexity: O(n) for result
   *
   * @param compressed - Quantized embedding vector (int8/int16 as numbers)
   * @returns Dequantized (approximate) embedding vector (float32)
   * @throws Error if compressed dimension doesn't match configuration
   */
  decompress(compressed: number[]): number[] {
    if (compressed.length !== this.outputDim) {
      throw createValidationError(
        'compressed',
        `dimension mismatch: expected ${this.outputDim}, got ${compressed.length}`
      );
    }

    if (this.min === -Infinity || this.max === Infinity) {
      throw createValidationError(
        'normalizationRange',
        'not initialized, compress an embedding first'
      );
    }

    const result = new Array<number>(this.inputDim);

    for (let i = 0; i < compressed.length; i++) {
      const value = compressed[i] ?? 0;
      // Denormalize from [minValue, maxValue] to [0, 1]
      const normalized = (value - this.minValue) / this.range;

      // Scale to [min, max]
      result[i] = normalized * (this.max - this.min) + this.min;
    }

    return result;
  }

  /**
   * Get the output dimension after compression
   * For quantization, this equals input dimension
   *
   * @returns Output dimension size
   */
  getOutputDimension(): number {
    return this.outputDim;
  }

  /**
   * Get the compression method name
   *
   * @returns 'quantized'
   */
  getName(): CompressionMethod {
    return 'quantized';
  }

  /**
   * Get configuration information
   *
   * @returns Configuration object with dimensions, bits, and normalization range
   */
  getConfig(): QuantizationConfig {
    return {
      inputDimension: this.inputDim,
      outputDimension: this.outputDim,
      bits: this.bits,
      min: this.min !== -Infinity ? this.min : undefined,
      max: this.max !== Infinity ? this.max : undefined,
    };
  }

  /**
   * Calculate memory savings compared to float32
   *
   * @returns Memory savings ratio (e.g., 0.75 for 75% reduction with int8)
   */
  getMemorySavings(): number {
    const float32Bytes = this.inputDim * 4;
    const quantizedBytes = this.outputDim * (this.bits / 8);
    return 1 - quantizedBytes / float32Bytes;
  }

  /**
   * Estimate quantization error for a given embedding
   *
   * @param original - Original float32 embedding
   * @param compressed - Compressed embedding (optional, will compress if not provided)
   * @returns Metrics including MSE, max error, and RMSE
   */
  estimateError(
    original: number[],
    compressed?: number[]
  ): {
    mse: number;
    rmse: number;
    maxError: number;
    meanError: number;
  } {
    const quantized = compressed ?? this.compress(original);
    const decompressed = this.decompress(quantized);

    let sumSquaredError = 0;
    let sumAbsError = 0;
    let maxError = 0;

    for (let i = 0; i < original.length; i++) {
      const origValue = original[i] ?? 0;
      const decompValue = decompressed[i] ?? 0;
      const error = Math.abs(origValue - decompValue);
      sumSquaredError += error * error;
      sumAbsError += error;
      maxError = Math.max(maxError, error);
    }

    const mse = sumSquaredError / original.length;
    const rmse = Math.sqrt(mse);
    const meanError = sumAbsError / original.length;

    return { mse, rmse, maxError, meanError };
  }

  /**
   * Calculate cosine similarity between original and decompressed embeddings
   *
   * @param original - Original float32 embedding
   * @param compressed - Compressed embedding (optional, will compress if not provided)
   * @returns Cosine similarity in range [-1, 1] (typically close to 1.0)
   */
  calculateSimilarity(original: number[], compressed?: number[]): number {
    const quantized = compressed ?? this.compress(original);
    const decompressed = this.decompress(quantized);

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < original.length; i++) {
      const origValue = original[i] ?? 0;
      const decompValue = decompressed[i] ?? 0;
      dotProduct += origValue * decompValue;
      normA += origValue * origValue;
      normB += decompValue * decompValue;
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return similarity;
  }

  /**
   * Set normalization range explicitly
   * Useful when processing multiple embeddings with known value range
   *
   * @param min - Minimum value in the range
   * @param max - Maximum value in the range
   */
  setRange(min: number, max: number): void {
    if (min >= max) {
      throw createValidationError('range', 'min must be less than max');
    }
    this.min = min;
    this.max = max;
  }
}

/**
 * Factory function to create a scalar quantization compressor
 *
 * @param config - Configuration including dimensions and bits
 * @returns Scalar quantization compression strategy
 *
 * @example
 * ```typescript
 * // 8-bit quantization (4x compression)
 * const compressor = createScalarQuantization({
 *   inputDimension: 1536,
 *   outputDimension: 1536,
 *   bits: 8,
 *   min: -1.0,
 *   max: 1.0
 * });
 * ```
 */
export function createScalarQuantization(config: QuantizationConfig): ScalarQuantization {
  return new ScalarQuantization(config);
}
