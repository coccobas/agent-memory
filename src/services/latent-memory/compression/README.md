# Latent Memory Compression Strategies

This module provides compression strategies for reducing the storage and computational costs of high-dimensional embeddings in the latent memory system.

## Overview

The compression module supports two main strategies:

1. **Random Projection** - Dimensionality reduction using sparse random matrices
2. **Scalar Quantization** - Precision reduction from float32 to int8/int16

## Quick Start

### Random Projection (Default)

Reduces embedding dimensions while preserving pairwise distances and cosine similarity.

```typescript
import { createCompressor, createDefaultCompressor } from './services/latent-memory/compression';

// Use default settings (1536 -> 256 dimensions)
const compressor = createDefaultCompressor();

// Or custom configuration
const compressor = createCompressor('random_projection', {
  inputDimension: 1536,
  outputDimension: 256,
  seed: 42, // For reproducibility
  sparsity: 3,
});

// Compress embedding
const embedding = new Array(1536).fill(0).map(() => Math.random());
const compressed = compressor.compress(embedding);
console.log(compressed.length); // 256

// 6x compression ratio with ~10% error tolerance
```

### Scalar Quantization

Reduces precision while maintaining all dimensions.

```typescript
import { createCompressor } from './services/latent-memory/compression';

// 8-bit quantization (4x memory reduction)
const compressor = createCompressor('quantized', {
  inputDimension: 1536,
  outputDimension: 1536, // Same as input
  bits: 8,
  min: -1.0, // Optional: set if known
  max: 1.0,
});

const embedding = new Array(1536).fill(0).map(() => Math.random());
const compressed = compressor.compress(embedding);
const decompressed = compressor.decompress(compressed);

// Calculate similarity
console.log(compressor.calculateSimilarity(embedding, compressed));
// Typical result: 0.998+
```

## API Reference

### Factory Functions

#### `createCompressor(method, config)`

Create a compression strategy instance.

**Parameters:**

- `method: 'random_projection' | 'quantized'` - Compression method
- `config: CompressionConfig` - Configuration object

**Returns:** `CompressionStrategy`

#### `createDefaultCompressor(seed?)`

Create default random projection compressor (1536 -> 256 dims).

**Parameters:**

- `seed?: number` - Random seed (default: 42)

**Returns:** `RandomProjection`

### CompressionStrategy Interface

All compression strategies implement this interface:

```typescript
interface CompressionStrategy {
  compress(embedding: number[]): number[];
  decompress?(compressed: number[]): number[];
  getOutputDimension(): number;
  getName(): CompressionMethod;
}
```

### Random Projection

#### Constructor

```typescript
new RandomProjection(config: RandomProjectionConfig)
```

**Config:**

- `inputDimension: number` - Input embedding size
- `outputDimension: number` - Target compressed size
- `seed?: number` - Random seed for reproducibility
- `sparsity?: number` - Sparsity factor (default: 3)

#### Methods

- `compress(embedding: number[]): number[]` - Compress embedding
- `getOutputDimension(): number` - Get output dimension
- `getName(): 'random_projection'` - Get method name
- `getConfig(): RandomProjectionConfig` - Get configuration
- `getMemoryUsage(): number` - Estimate memory usage in bytes

#### Static Methods

- `RandomProjection.estimateOutputDimension(epsilon): number` - Calculate minimum dimension for error bound

### Scalar Quantization

#### Constructor

```typescript
new ScalarQuantization(config: QuantizationConfig)
```

**Config:**

- `inputDimension: number` - Input embedding size
- `outputDimension: number` - Must equal inputDimension
- `bits?: 8 | 16` - Quantization bits (default: 8)
- `min?: number` - Minimum value for normalization
- `max?: number` - Maximum value for normalization

#### Methods

- `compress(embedding: number[]): number[]` - Quantize embedding
- `decompress(compressed: number[]): number[]` - Dequantize embedding
- `getOutputDimension(): number` - Get output dimension
- `getName(): 'quantized'` - Get method name
- `getConfig(): QuantizationConfig` - Get configuration
- `getMemorySavings(): number` - Calculate memory savings ratio
- `estimateError(original, compressed?): ErrorMetrics` - Calculate reconstruction error
- `calculateSimilarity(original, compressed?): number` - Calculate cosine similarity
- `setRange(min, max): void` - Set normalization range

## Utility Functions

### `compressWithMetadata(embedding, strategy)`

Compress an embedding and return result with metadata.

```typescript
const result = compressWithMetadata(embedding, compressor);
console.log(result.metadata.compressionRatio); // e.g., 6.0
console.log(result.metadata.method); // 'random_projection'
console.log(result.quality?.similarity); // 0.98+ (if available)
```

### `cosineSimilarity(a, b)`

Calculate cosine similarity between two embeddings.

```typescript
const similarity = cosineSimilarity(original, decompressed);
```

### `estimateMinimumDimension(datasetSize, epsilon)`

Estimate minimum output dimension for desired error bound.

```typescript
const minDim = estimateMinimumDimension(10000, 0.1);
console.log(`Minimum dimension: ${minDim}`); // e.g., 746
```

### `benchmarkCompression(embedding, strategy, iterations?)`

Benchmark compression performance.

```typescript
const perf = benchmarkCompression(embedding, compressor);
console.log(`Compression: ${perf.compressionTimeMs.toFixed(2)}ms`);
console.log(`Memory saved: ${perf.memorySavingsPercent.toFixed(1)}%`);
```

## Performance Characteristics

### Random Projection

| Metric                  | Value                       |
| ----------------------- | --------------------------- |
| Compression time        | ~0.05ms per 1536->256       |
| Memory overhead         | ~20KB for projection matrix |
| Compression ratio       | 6x (1536 -> 256)            |
| Distance preservation   | ~10% error with 256 dims    |
| Similarity preservation | 0.98+ cosine similarity     |
| Decompression           | Not supported (lossy)       |

### Scalar Quantization

| Metric                  | Value (8-bit)            |
| ----------------------- | ------------------------ |
| Compression time        | ~0.01ms per 1536 dims    |
| Memory overhead         | Minimal                  |
| Compression ratio       | 4x (float32 -> int8)     |
| Reconstruction error    | <1% typical              |
| Similarity preservation | 0.999+ cosine similarity |
| Decompression           | Supported (approximate)  |

## Use Cases

### When to Use Random Projection

- Need to reduce dimensionality for faster search
- Memory is a primary concern
- Can tolerate 5-15% distance error
- Working with large-scale datasets (>100k embeddings)
- Want data-independent compression (no training)

### When to Use Scalar Quantization

- Need to preserve all dimensions
- Want lossless-like compression (with decompression)
- Precision is less critical than dimensionality
- Working with smaller datasets
- Need very fast compression/decompression

### Combining Both Strategies

For maximum compression, apply both strategies:

```typescript
// 1. Reduce dimensions: 1536 -> 256
const rp = createCompressor('random_projection', {
  inputDimension: 1536,
  outputDimension: 256,
  seed: 42,
});

// 2. Quantize: float32 -> int8
const quant = createCompressor('quantized', {
  inputDimension: 256,
  outputDimension: 256,
  bits: 8,
});

const compressed = quant.compress(rp.compress(embedding));
// Total compression: 24x (1536 * 4 bytes -> 256 * 1 byte)
```

## Theory

### Johnson-Lindenstrauss Lemma

Random projection preserves pairwise distances with high probability. For a dataset of `n` points, projecting to dimension `k` satisfies:

```
k >= 4 * log(n) / (ε²/2 - ε³/3)
```

where `ε` is the desired relative error.

### Sparse Random Projection

Uses Achlioptas's sparse distribution for efficiency:

- Values: {-1, 0, +1}
- Probabilities: {1/6, 2/3, 1/6}
- Scaling: 1/√k for distance preservation

### Scalar Quantization

Quantization formula:

```
quantized = round((value - min) / (max - min) * (2^bits - 1))
dequantized = (quantized / (2^bits - 1)) * (max - min) + min
```

## Configuration Examples

### Low-latency Search

Prioritize speed over accuracy:

```typescript
const compressor = createCompressor('random_projection', {
  inputDimension: 1536,
  outputDimension: 128, // Very aggressive compression
  seed: 42,
});
```

### High-accuracy Retrieval

Preserve more information:

```typescript
const compressor = createCompressor('random_projection', {
  inputDimension: 1536,
  outputDimension: 512, // Less compression
  seed: 42,
});
```

### Memory-optimized

Minimize storage footprint:

```typescript
const compressor = createCompressor('quantized', {
  inputDimension: 1536,
  outputDimension: 1536,
  bits: 8,
  min: -1.0,
  max: 1.0,
});
```

## Testing

Run compression tests:

```bash
npm test -- src/services/latent-memory/compression
```

Run benchmarks:

```bash
npm run bench -- compression
```

## References

- Achlioptas, D. (2003). "Database-friendly random projections"
- Johnson, W. B., & Lindenstrauss, J. (1984). "Extensions of Lipschitz mappings"
- Gersho, A., & Gray, R. M. (1992). "Vector Quantization and Signal Compression"
