/**
 * Latent Memory Compression Module
 *
 * Provides compression strategies for embedding dimensionality reduction
 * and quantization. Supports efficient storage and retrieval of high-dimensional
 * embeddings used in latent memory systems.
 *
 * Available strategies:
 * - Random Projection: Dimensionality reduction (e.g., 1536 -> 256)
 * - Scalar Quantization: Precision reduction (float32 -> int8/int16)
 *
 * @module services/latent-memory/compression
 *
 * @example
 * ```typescript
 * import { createCompressor } from './services/latent-memory/compression';
 *
 * // Random projection: 1536 -> 256 dimensions
 * const rp = createCompressor('random_projection', {
 *   inputDimension: 1536,
 *   outputDimension: 256,
 *   seed: 42
 * });
 *
 * // Quantization: float32 -> int8
 * const quant = createCompressor('quantized', {
 *   inputDimension: 1536,
 *   outputDimension: 1536,
 *   bits: 8
 * });
 * ```
 *
 * NOTE: Non-null assertions used for array indexing in compression algorithms
 * after bounds validation.
 */

import { createValidationError } from '../../../core/errors.js';

// Export types
export type {
  CompressionMethod,
  CompressionStrategy,
  CompressionConfig,
  RandomProjectionConfig,
  QuantizationConfig,
  CompressionMetadata,
  CompressionResult,
} from './types.js';

// Export strategies
export { RandomProjection, createRandomProjection } from './random-projection.js';
export { ScalarQuantization, createScalarQuantization } from './quantization.js';

// Re-export for convenience
import type {
  CompressionStrategy,
  CompressionMethod,
  CompressionConfig,
  RandomProjectionConfig,
  QuantizationConfig,
  CompressionResult,
  CompressionMetadata,
} from './types.js';
import { RandomProjection } from './random-projection.js';
import { ScalarQuantization } from './quantization.js';

/**
 * Factory function to create a compression strategy
 *
 * @param method - Compression method to use
 * @param config - Configuration for the compression strategy
 * @returns Configured compression strategy instance
 * @throws Error if method is not supported or config is invalid
 *
 * @example
 * ```typescript
 * // Random projection
 * const rp = createCompressor('random_projection', {
 *   inputDimension: 1536,
 *   outputDimension: 256,
 *   seed: 42
 * });
 *
 * // Quantization
 * const quant = createCompressor('quantized', {
 *   inputDimension: 1536,
 *   outputDimension: 1536,
 *   bits: 8,
 *   min: -1.0,
 *   max: 1.0
 * });
 * ```
 */
export function createCompressor(
  method: 'random_projection',
  config: RandomProjectionConfig
): RandomProjection;
export function createCompressor(
  method: 'quantized',
  config: QuantizationConfig
): ScalarQuantization;
export function createCompressor(
  method: CompressionMethod,
  config: CompressionConfig | RandomProjectionConfig | QuantizationConfig
): CompressionStrategy;
export function createCompressor(
  method: CompressionMethod,
  config: CompressionConfig | RandomProjectionConfig | QuantizationConfig
): CompressionStrategy {
  switch (method) {
    case 'random_projection':
      return new RandomProjection(config as RandomProjectionConfig);

    case 'quantized':
      return new ScalarQuantization(config as QuantizationConfig);

    default: {
      // Exhaustive check for TypeScript
      const exhaustiveCheck: never = method;
      throw createValidationError(
        'method',
        `unsupported compression method: ${String(exhaustiveCheck)}`
      );
    }
  }
}

/**
 * Create default compression strategy for latent memory
 * Uses random projection: 1536 -> 256 dimensions with reproducible seed
 *
 * @param seed - Random seed for reproducibility (default: 42)
 * @returns Random projection compressor configured for OpenAI embeddings
 *
 * @example
 * ```typescript
 * const compressor = createDefaultCompressor();
 * const embedding = await generateEmbedding(text); // 1536 dims
 * const compressed = compressor.compress(embedding); // 256 dims
 * ```
 */
export function createDefaultCompressor(seed = 42): RandomProjection {
  return new RandomProjection({
    inputDimension: 1536, // OpenAI text-embedding-3-small/large
    outputDimension: 256, // 6x compression ratio
    seed,
    sparsity: 3,
  });
}

/**
 * Utility function to compress an embedding with metadata
 *
 * @param embedding - Input embedding to compress
 * @param strategy - Compression strategy to use
 * @returns Compression result with compressed vector and metadata
 *
 * @example
 * ```typescript
 * const compressor = createDefaultCompressor();
 * const result = compressWithMetadata(embedding, compressor);
 * console.log(result.metadata.compressionRatio); // 6.0
 * console.log(result.compressed.length); // 256
 * ```
 */
export function compressWithMetadata(
  embedding: number[],
  strategy: CompressionStrategy
): CompressionResult {
  const compressed = strategy.compress(embedding);

  const metadata: CompressionMetadata = {
    method: strategy.getName(),
    inputDimension: embedding.length,
    outputDimension: compressed.length,
    compressionRatio: embedding.length / compressed.length,
    compressedAt: new Date().toISOString(),
  };

  // Add strategy-specific metadata
  if (strategy instanceof RandomProjection) {
    const config = strategy.getConfig();
    metadata.seed = config.seed;
  } else if (strategy instanceof ScalarQuantization) {
    const config = strategy.getConfig();
    metadata.quantization = {
      bits: config.bits ?? 8,
      min: config.min ?? 0,
      max: config.max ?? 1,
    };
  }

  // Calculate quality metrics if decompression is available
  let quality: CompressionResult['quality'];
  if (strategy.decompress && strategy instanceof ScalarQuantization) {
    const similarity = strategy.calculateSimilarity(embedding, compressed);
    const error = strategy.estimateError(embedding, compressed);

    quality = {
      similarity,
      reconstructionError: error.rmse,
    };
  }

  return {
    compressed,
    metadata,
    quality,
  };
}

/**
 * Utility function to calculate cosine similarity between two embeddings
 * Useful for evaluating compression quality
 *
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Cosine similarity in range [-1, 1]
 *
 * @example
 * ```typescript
 * const original = generateEmbedding(text);
 * const compressed = compressor.compress(original);
 * const decompressed = compressor.decompress(compressed);
 * const similarity = cosineSimilarity(original, decompressed);
 * console.log(`Similarity: ${similarity.toFixed(4)}`); // e.g., 0.9987
 * ```
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw createValidationError('vectors', 'must have same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aValue = a[i] ?? 0;
    const bValue = b[i] ?? 0;
    dotProduct += aValue * bValue;
    normA += aValue * aValue;
    normB += bValue * bValue;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Estimate minimum output dimension for desired error bound
 * Based on Johnson-Lindenstrauss lemma for random projection
 *
 * @param datasetSize - Expected number of embeddings in dataset
 * @param epsilon - Desired relative error (default: 0.1 for 10%)
 * @returns Minimum output dimension to preserve distances within epsilon
 *
 * @example
 * ```typescript
 * // For 10,000 embeddings with 10% error tolerance
 * const minDim = estimateMinimumDimension(10000, 0.1);
 * console.log(`Minimum dimension: ${minDim}`); // e.g., 746
 *
 * // Use 256 dims for higher compression (accepts more error)
 * const minDim = estimateMinimumDimension(10000, 0.3);
 * console.log(`Minimum dimension: ${minDim}`); // e.g., 83
 * ```
 */
export function estimateMinimumDimension(datasetSize: number, epsilon = 0.1): number {
  // Johnson-Lindenstrauss lemma: k >= 4 * log(n) / (ε²/2 - ε³/3)
  // Simplified approximation: k >= 8 * log(n) / ε²
  const k = (8 * Math.log(datasetSize)) / (epsilon * epsilon);
  return Math.ceil(k);
}

/**
 * Compression performance benchmarking utility
 *
 * @param embedding - Sample embedding to benchmark
 * @param strategy - Compression strategy to benchmark
 * @param iterations - Number of iterations for timing (default: 1000)
 * @returns Performance metrics
 *
 * @example
 * ```typescript
 * const embedding = new Array(1536).fill(0).map(() => Math.random());
 * const compressor = createDefaultCompressor();
 * const perf = benchmarkCompression(embedding, compressor);
 * console.log(`Compression: ${perf.compressionTimeMs.toFixed(2)}ms`);
 * console.log(`Memory saved: ${perf.memorySavingsPercent.toFixed(1)}%`);
 * ```
 */
export function benchmarkCompression(
  embedding: number[],
  strategy: CompressionStrategy,
  iterations = 1000
): {
  compressionTimeMs: number;
  decompressionTimeMs: number | null;
  memorySavingsPercent: number;
  compressionRatio: number;
} {
  // Benchmark compression
  const compressStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    strategy.compress(embedding);
  }
  const compressEnd = performance.now();
  const compressionTimeMs = (compressEnd - compressStart) / iterations;

  // Benchmark decompression if available
  let decompressionTimeMs: number | null = null;
  if (strategy.decompress) {
    const compressed = strategy.compress(embedding);
    const decompressStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      strategy.decompress(compressed);
    }
    const decompressEnd = performance.now();
    decompressionTimeMs = (decompressEnd - decompressStart) / iterations;
  }

  // Calculate memory metrics
  const inputBytes = embedding.length * 4; // float32
  const outputBytes = strategy.getOutputDimension() * 4; // Assuming float32 storage
  const memorySavingsPercent = ((inputBytes - outputBytes) / inputBytes) * 100;
  const compressionRatio = embedding.length / strategy.getOutputDimension();

  return {
    compressionTimeMs,
    decompressionTimeMs,
    memorySavingsPercent,
    compressionRatio,
  };
}
