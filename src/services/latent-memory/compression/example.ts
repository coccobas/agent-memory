/**
 * Compression Strategy Examples
 *
 * Demonstrates usage of random projection and scalar quantization
 * for embedding compression in latent memory systems.
 *
 * NOTE: Non-null assertions used for array indexing in example code
 * after array construction with known bounds.
 */

/* eslint-disable no-console, @typescript-eslint/no-non-null-assertion */

import {
  createCompressor,
  createDefaultCompressor,
  compressWithMetadata,
  cosineSimilarity,
  estimateMinimumDimension,
  benchmarkCompression,
} from './index.js';

/**
 * Example 1: Basic Random Projection
 */
export function exampleRandomProjection(): void {
  console.log('\n=== Example 1: Random Projection ===\n');

  // Create compressor with default settings (1536 -> 256)
  const compressor = createDefaultCompressor(42);

  // Generate sample embedding (simulating OpenAI embedding)
  const embedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);

  // Compress
  const compressed = compressor.compress(embedding);

  console.log(`Original dimension: ${embedding.length}`);
  console.log(`Compressed dimension: ${compressed.length}`);
  console.log(`Compression ratio: ${embedding.length / compressed.length}x`);
  console.log(`Memory saved: ${((1 - compressed.length / embedding.length) * 100).toFixed(1)}%`);

  // Show sample values
  console.log(
    `\nSample original values: [${embedding
      .slice(0, 5)
      .map((v) => v.toFixed(4))
      .join(', ')}...]`
  );
  console.log(
    `Sample compressed values: [${compressed
      .slice(0, 5)
      .map((v) => v.toFixed(4))
      .join(', ')}...]`
  );
}

/**
 * Example 2: Scalar Quantization with Decompression
 */
export function exampleScalarQuantization(): void {
  console.log('\n=== Example 2: Scalar Quantization ===\n');

  // Create 8-bit quantization compressor
  const compressor = createCompressor('quantized', {
    inputDimension: 1536,
    outputDimension: 1536,
    bits: 8,
    min: -1.0,
    max: 1.0,
  });

  // Generate sample embedding (normalized to [-1, 1])
  const embedding = new Array(1536).fill(0).map(() => (Math.random() - 0.5) * 2);

  // Compress
  const compressed = compressor.compress(embedding);

  // Decompress
  const decompressed = compressor.decompress(compressed);

  // Calculate quality metrics
  const similarity = compressor.calculateSimilarity(embedding, compressed);
  const error = compressor.estimateError(embedding, compressed);

  console.log(`Bits per value: 8 (int8)`);
  console.log(
    `Memory per embedding: ${embedding.length * 4} bytes -> ${compressed.length * 1} bytes`
  );
  console.log(`Memory savings: ${(compressor.getMemorySavings() * 100).toFixed(1)}%`);
  console.log(`\nQuality metrics:`);
  console.log(`  Cosine similarity: ${similarity.toFixed(6)}`);
  console.log(`  RMSE: ${error.rmse.toFixed(6)}`);
  console.log(`  Max error: ${error.maxError.toFixed(6)}`);
  console.log(`  Mean error: ${error.meanError.toFixed(6)}`);

  // Show reconstruction accuracy
  console.log(`\nSample reconstruction:`);
  for (let i = 0; i < 5; i++) {
    console.log(
      `  [${i}] Original: ${embedding[i]!.toFixed(4)}, Decompressed: ${decompressed[i]!.toFixed(4)}, Error: ${Math.abs(embedding[i]! - decompressed[i]!).toFixed(6)}`
    );
  }
}

/**
 * Example 3: Compression with Metadata
 */
export function exampleCompressionMetadata(): void {
  console.log('\n=== Example 3: Compression with Metadata ===\n');

  const compressor = createDefaultCompressor(42);
  const embedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);

  // Compress with metadata
  const result = compressWithMetadata(embedding, compressor);

  console.log('Compression result:');
  console.log(JSON.stringify(result.metadata, null, 2));

  if (result.quality) {
    console.log('\nQuality metrics:');
    console.log(JSON.stringify(result.quality, null, 2));
  }
}

/**
 * Example 4: Dimension Estimation
 */
export function exampleDimensionEstimation(): void {
  console.log('\n=== Example 4: Dimension Estimation ===\n');

  const datasetSizes = [1000, 10000, 100000, 1000000];
  const epsilons = [0.05, 0.1, 0.2, 0.3];

  console.log('Minimum output dimensions for error bounds:\n');
  console.log('Dataset Size | ε=0.05  | ε=0.10  | ε=0.20  | ε=0.30');
  console.log('-------------|---------|---------|---------|--------');

  for (const n of datasetSizes) {
    const dims = epsilons.map((eps) => estimateMinimumDimension(n, eps));
    console.log(
      `${n.toString().padStart(12)} | ${dims.map((d) => d.toString().padStart(7)).join(' | ')}`
    );
  }

  console.log('\nRecommendation: Use 256 dims for ~10% error with <100k embeddings');
}

/**
 * Example 5: Performance Benchmarking
 */
export function exampleBenchmarking(): void {
  console.log('\n=== Example 5: Performance Benchmarking ===\n');

  const embedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);

  // Benchmark random projection
  console.log('Random Projection (1536 -> 256):');
  const rpCompressor = createDefaultCompressor(42);
  const rpPerf = benchmarkCompression(embedding, rpCompressor, 1000);
  console.log(`  Compression time: ${rpPerf.compressionTimeMs.toFixed(3)}ms`);
  console.log(`  Decompression: Not supported`);
  console.log(`  Compression ratio: ${rpPerf.compressionRatio.toFixed(2)}x`);
  console.log(`  Memory savings: ${rpPerf.memorySavingsPercent.toFixed(1)}%`);

  // Benchmark scalar quantization
  console.log('\nScalar Quantization (8-bit):');
  const quantCompressor = createCompressor('quantized', {
    inputDimension: 1536,
    outputDimension: 1536,
    bits: 8,
    min: -1.0,
    max: 1.0,
  });
  const quantPerf = benchmarkCompression(embedding, quantCompressor, 1000);
  console.log(`  Compression time: ${quantPerf.compressionTimeMs.toFixed(3)}ms`);
  console.log(`  Decompression time: ${quantPerf.decompressionTimeMs?.toFixed(3) ?? 'N/A'}ms`);
  console.log(`  Compression ratio: ${quantPerf.compressionRatio.toFixed(2)}x`);
  console.log(`  Memory savings: ${quantPerf.memorySavingsPercent.toFixed(1)}%`);
}

/**
 * Example 6: Combined Compression Strategy
 */
export function exampleCombinedCompression(): void {
  console.log('\n=== Example 6: Combined Compression ===\n');

  const embedding = new Array(1536).fill(0).map(() => (Math.random() - 0.5) * 2);

  console.log('Original embedding:');
  console.log(`  Dimension: ${embedding.length}`);
  console.log(`  Memory: ${embedding.length * 4} bytes (float32)`);

  // Step 1: Random projection (1536 -> 256)
  const rpCompressor = createCompressor('random_projection', {
    inputDimension: 1536,
    outputDimension: 256,
    seed: 42,
  });
  const step1 = rpCompressor.compress(embedding);

  console.log('\nAfter random projection:');
  console.log(`  Dimension: ${step1.length}`);
  console.log(`  Memory: ${step1.length * 4} bytes (float32)`);
  console.log(`  Compression: ${(embedding.length / step1.length).toFixed(1)}x`);

  // Step 2: Quantization (float32 -> int8)
  const quantCompressor = createCompressor('quantized', {
    inputDimension: 256,
    outputDimension: 256,
    bits: 8,
    min: -1.0,
    max: 1.0,
  });
  const step2 = quantCompressor.compress(step1);

  console.log('\nAfter quantization:');
  console.log(`  Dimension: ${step2.length}`);
  console.log(`  Memory: ${step2.length * 1} bytes (int8)`);
  console.log(`  Compression: ${((embedding.length * 4) / (step2.length * 1)).toFixed(1)}x`);

  // Overall compression
  const originalBytes = embedding.length * 4;
  const compressedBytes = step2.length * 1;
  const totalCompression = originalBytes / compressedBytes;
  const memorySaved = ((originalBytes - compressedBytes) / originalBytes) * 100;

  console.log('\nTotal compression:');
  console.log(`  ${originalBytes} bytes -> ${compressedBytes} bytes`);
  console.log(`  Ratio: ${totalCompression.toFixed(1)}x`);
  console.log(`  Memory saved: ${memorySaved.toFixed(1)}%`);
}

/**
 * Example 7: Cosine Similarity Preservation
 */
export function exampleSimilarityPreservation(): void {
  console.log('\n=== Example 7: Similarity Preservation ===\n');

  // Generate two similar embeddings
  const base = new Array(1536).fill(0).map(() => Math.random() - 0.5);
  const similar = base.map((v, _i) => v + (Math.random() - 0.5) * 0.1);
  const dissimilar = new Array(1536).fill(0).map(() => Math.random() - 0.5);

  // Original similarities
  const simOriginal = cosineSimilarity(base, similar);
  const dissimOriginal = cosineSimilarity(base, dissimilar);

  console.log('Original embeddings:');
  console.log(`  Similar pair: ${simOriginal.toFixed(4)}`);
  console.log(`  Dissimilar pair: ${dissimOriginal.toFixed(4)}`);

  // Compress all three
  const compressor = createDefaultCompressor(42);
  const baseComp = compressor.compress(base);
  const simComp = compressor.compress(similar);
  const dissimComp = compressor.compress(dissimilar);

  // Compressed similarities
  const simCompressed = cosineSimilarity(baseComp, simComp);
  const dissimCompressed = cosineSimilarity(baseComp, dissimComp);

  console.log('\nAfter random projection (1536 -> 256):');
  console.log(`  Similar pair: ${simCompressed.toFixed(4)}`);
  console.log(`  Dissimilar pair: ${dissimCompressed.toFixed(4)}`);

  console.log('\nSimilarity preservation:');
  console.log(`  Similar pair error: ${Math.abs(simOriginal - simCompressed).toFixed(4)}`);
  console.log(`  Dissimilar pair error: ${Math.abs(dissimOriginal - dissimCompressed).toFixed(4)}`);
}

/**
 * Run all examples
 */
export function runAllExamples(): void {
  console.log('========================================');
  console.log('  Compression Strategy Examples');
  console.log('========================================');

  exampleRandomProjection();
  exampleScalarQuantization();
  exampleCompressionMetadata();
  exampleDimensionEstimation();
  exampleBenchmarking();
  exampleCombinedCompression();
  exampleSimilarityPreservation();

  console.log('\n========================================');
  console.log('  Examples Complete');
  console.log('========================================\n');
}

// Note: To run examples, import and call runAllExamples() from your code
// Example: import { runAllExamples } from './example.js';
//          runAllExamples();
