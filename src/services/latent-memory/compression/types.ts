/**
 * Compression Strategy Types
 *
 * Type definitions for embedding compression strategies used in latent memory.
 * Supports dimensionality reduction and quantization for efficient storage.
 */

/**
 * Available compression methods
 */
export type CompressionMethod = 'random_projection' | 'quantized';

/**
 * Base interface for all compression strategies
 */
export interface CompressionStrategy {
  /**
   * Compress a high-dimensional embedding to lower dimensions
   *
   * @param embedding - Input embedding vector
   * @returns Compressed embedding vector
   */
  compress(embedding: number[]): number[];

  /**
   * Decompress a compressed embedding back to approximate original
   * Optional: not all strategies support decompression
   *
   * @param compressed - Compressed embedding vector
   * @returns Decompressed (approximate) embedding vector
   */
  decompress?(compressed: number[]): number[];

  /**
   * Get the output dimension after compression
   *
   * @returns Output dimension size
   */
  getOutputDimension(): number;

  /**
   * Get the compression method name
   *
   * @returns Method identifier
   */
  getName(): CompressionMethod;
}

/**
 * Configuration for compression strategies
 */
export interface CompressionConfig {
  /**
   * Input embedding dimension (e.g., 1536 for OpenAI embeddings)
   */
  inputDimension: number;

  /**
   * Target output dimension after compression (e.g., 256)
   */
  outputDimension: number;

  /**
   * Random seed for reproducible compression (optional)
   * Critical for random projection to ensure consistent results
   */
  seed?: number;
}

/**
 * Random projection specific configuration
 */
export interface RandomProjectionConfig extends CompressionConfig {
  /**
   * Sparsity factor for sparse random projection
   * Higher values = sparser matrix = faster computation
   * Default: 3 (values {-1, 0, 1} with p = {1/6, 2/3, 1/6})
   */
  sparsity?: number;
}

/**
 * Quantization specific configuration
 */
export interface QuantizationConfig extends CompressionConfig {
  /**
   * Number of bits per value (default: 8 for int8)
   */
  bits?: 8 | 16;

  /**
   * Minimum value for normalization (auto-computed if not provided)
   */
  min?: number;

  /**
   * Maximum value for normalization (auto-computed if not provided)
   */
  max?: number;
}

/**
 * Metadata stored with compressed embeddings
 */
export interface CompressionMetadata {
  /**
   * Compression method used
   */
  method: CompressionMethod;

  /**
   * Original dimension before compression
   */
  inputDimension: number;

  /**
   * Compressed dimension
   */
  outputDimension: number;

  /**
   * Compression ratio (inputDim / outputDim)
   */
  compressionRatio: number;

  /**
   * Random seed used (for random projection)
   */
  seed?: number;

  /**
   * Quantization parameters (for quantized method)
   */
  quantization?: {
    bits: number;
    min: number;
    max: number;
  };

  /**
   * Timestamp when compression was applied
   */
  compressedAt: string;
}

/**
 * Result of a compression operation
 */
export interface CompressionResult {
  /**
   * Compressed embedding vector
   */
  compressed: number[];

  /**
   * Metadata about the compression
   */
  metadata: CompressionMetadata;

  /**
   * Optional quality metrics
   */
  quality?: {
    /**
     * Approximate reconstruction error (if decompression is available)
     */
    reconstructionError?: number;

    /**
     * Cosine similarity between original and decompressed (0-1)
     */
    similarity?: number;
  };
}
