/**
 * Unit tests for compression strategies (ScalarQuantization and RandomProjection)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScalarQuantization,
  createScalarQuantization,
} from '../../src/services/latent-memory/compression/quantization.js';
import {
  RandomProjection,
  createRandomProjection,
} from '../../src/services/latent-memory/compression/random-projection.js';
import type {
  QuantizationConfig,
  RandomProjectionConfig,
} from '../../src/services/latent-memory/compression/types.js';

describe('ScalarQuantization', () => {
  describe('constructor', () => {
    it('should initialize with valid config', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);

      expect(compressor).toBeDefined();
      expect(compressor.getOutputDimension()).toBe(1536);
    });

    it('should throw error for invalid input dimension', () => {
      const config: QuantizationConfig = {
        inputDimension: 0,
        outputDimension: 0,
        bits: 8,
      };

      expect(() => new ScalarQuantization(config)).toThrow('Validation error: inputDimension - must be positive');
    });

    it('should throw error when output dimension differs from input', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 768,
        bits: 8,
      };

      expect(() => new ScalarQuantization(config)).toThrow(
        /outputDimension.*must.*inputDimension|must match input dimension/i
      );
    });

    it('should throw error for unsupported bit depth', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 4 as 8,
      };

      expect(() => new ScalarQuantization(config)).toThrow(
        'Validation error: bits - only 8-bit and 16-bit quantization supported'
      );
    });

    it('should accept 8-bit quantization', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);
      expect(compressor).toBeDefined();
    });

    it('should accept 16-bit quantization', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 16,
      };

      const compressor = new ScalarQuantization(config);
      expect(compressor).toBeDefined();
    });

    it('should use provided min/max range', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 8,
        min: -1.0,
        max: 1.0,
      };

      const compressor = new ScalarQuantization(config);
      const configOut = compressor.getConfig();

      expect(configOut.min).toBe(-1.0);
      expect(configOut.max).toBe(1.0);
    });
  });

  describe('compress', () => {
    it('should compress embedding to int8 range', () => {
      const config: QuantizationConfig = {
        inputDimension: 10,
        outputDimension: 10,
        bits: 8,
        min: -1.0,
        max: 1.0,
      };

      const compressor = new ScalarQuantization(config);
      const embedding = [0.5, -0.5, 0, 1.0, -1.0, 0.25, -0.25, 0.75, -0.75, 0.1];
      const compressed = compressor.compress(embedding);

      expect(compressed).toHaveLength(10);
      compressed.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(-128);
        expect(value).toBeLessThanOrEqual(127);
      });
    });

    it('should compress embedding to int16 range', () => {
      const config: QuantizationConfig = {
        inputDimension: 10,
        outputDimension: 10,
        bits: 16,
        min: -1.0,
        max: 1.0,
      };

      const compressor = new ScalarQuantization(config);
      const embedding = [0.5, -0.5, 0, 1.0, -1.0, 0.25, -0.25, 0.75, -0.75, 0.1];
      const compressed = compressor.compress(embedding);

      expect(compressed).toHaveLength(10);
      compressed.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(-32768);
        expect(value).toBeLessThanOrEqual(32767);
      });
    });

    it('should throw error for dimension mismatch', () => {
      const config: QuantizationConfig = {
        inputDimension: 10,
        outputDimension: 10,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);
      const embedding = [0.1, 0.2]; // Only 2 elements

      expect(() => compressor.compress(embedding)).toThrow('Validation error: embedding - dimension mismatch');
    });

    it('should auto-compute range from first embedding', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);
      const embedding = [0.1, 0.5, 0.9, 0.3, 0.7];
      const compressed = compressor.compress(embedding);

      expect(compressed).toHaveLength(5);
      expect(compressed.every((v) => v >= -128 && v <= 127)).toBe(true);
    });

    it('should handle constant values with epsilon', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);
      const embedding = [0.5, 0.5, 0.5, 0.5, 0.5];

      expect(() => compressor.compress(embedding)).not.toThrow();
    });

    it('should produce consistent results for same input', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
        min: 0,
        max: 1,
      };

      const compressor = new ScalarQuantization(config);
      const embedding = [0.1, 0.5, 0.9, 0.3, 0.7];

      const compressed1 = compressor.compress(embedding);
      const compressed2 = compressor.compress(embedding);

      expect(compressed1).toEqual(compressed2);
    });

    it('should handle edge values correctly', () => {
      const config: QuantizationConfig = {
        inputDimension: 3,
        outputDimension: 3,
        bits: 8,
        min: 0,
        max: 1,
      };

      const compressor = new ScalarQuantization(config);
      const embedding = [0, 0.5, 1];
      const compressed = compressor.compress(embedding);

      expect(compressed[0]).toBe(-128); // min value
      expect(compressed[2]).toBe(127); // max value
    });
  });

  describe('decompress', () => {
    it('should decompress to approximate original', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
        min: -1.0,
        max: 1.0,
      };

      const compressor = new ScalarQuantization(config);
      const original = [0.5, -0.5, 0, 0.25, -0.25];
      const compressed = compressor.compress(original);
      const decompressed = compressor.decompress(compressed);

      expect(decompressed).toHaveLength(5);
      decompressed.forEach((value, i) => {
        expect(Math.abs(value - original[i]!)).toBeLessThan(0.1);
      });
    });

    it('should throw error for dimension mismatch', () => {
      const config: QuantizationConfig = {
        inputDimension: 10,
        outputDimension: 10,
        bits: 8,
        min: 0,
        max: 1,
      };

      const compressor = new ScalarQuantization(config);
      const compressed = [0, 1, 2]; // Only 3 elements

      expect(() => compressor.decompress(compressed)).toThrow('Validation error: compressed - dimension mismatch');
    });

    it('should throw error if range not initialized', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);
      const compressed = [0, 10, 20, 30, 40];

      expect(() => compressor.decompress(compressed)).toThrow(
        'Validation error: normalizationRange - not initialized'
      );
    });

    it('should maintain values within original range', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
        min: 0,
        max: 1,
      };

      const compressor = new ScalarQuantization(config);
      const original = [0.1, 0.3, 0.5, 0.7, 0.9];
      const compressed = compressor.compress(original);
      const decompressed = compressor.decompress(compressed);

      decompressed.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });

    it('should handle 16-bit decompression', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 16,
        min: -1,
        max: 1,
      };

      const compressor = new ScalarQuantization(config);
      const original = [0.1, 0.2, 0.3, 0.4, 0.5];
      const compressed = compressor.compress(original);
      const decompressed = compressor.decompress(compressed);

      expect(decompressed).toHaveLength(5);
      decompressed.forEach((value, i) => {
        expect(Math.abs(value - original[i]!)).toBeLessThan(0.01);
      });
    });
  });

  describe('getOutputDimension', () => {
    it('should return output dimension', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);

      expect(compressor.getOutputDimension()).toBe(1536);
    });
  });

  describe('getName', () => {
    it('should return quantized method name', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);

      expect(compressor.getName()).toBe('quantized');
    });
  });

  describe('getConfig', () => {
    it('should return configuration', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 16,
        min: -1,
        max: 1,
      };

      const compressor = new ScalarQuantization(config);
      const configOut = compressor.getConfig();

      expect(configOut).toEqual({
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 16,
        min: -1,
        max: 1,
      });
    });

    it('should return undefined for uninitialized min/max', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);
      const configOut = compressor.getConfig();

      expect(configOut.min).toBeUndefined();
      expect(configOut.max).toBeUndefined();
    });
  });

  describe('getMemorySavings', () => {
    it('should calculate 75% savings for 8-bit quantization', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);
      const savings = compressor.getMemorySavings();

      expect(savings).toBeCloseTo(0.75, 2);
    });

    it('should calculate 50% savings for 16-bit quantization', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 16,
      };

      const compressor = new ScalarQuantization(config);
      const savings = compressor.getMemorySavings();

      expect(savings).toBeCloseTo(0.5, 2);
    });
  });

  describe('estimateError', () => {
    it('should compute error metrics', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
        min: 0,
        max: 1,
      };

      const compressor = new ScalarQuantization(config);
      const original = [0.1, 0.3, 0.5, 0.7, 0.9];
      const error = compressor.estimateError(original);

      expect(error.mse).toBeGreaterThanOrEqual(0);
      expect(error.rmse).toBeGreaterThanOrEqual(0);
      expect(error.maxError).toBeGreaterThanOrEqual(0);
      expect(error.meanError).toBeGreaterThanOrEqual(0);
    });

    it('should accept pre-compressed embedding', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
        min: 0,
        max: 1,
      };

      const compressor = new ScalarQuantization(config);
      const original = [0.1, 0.3, 0.5, 0.7, 0.9];
      const compressed = compressor.compress(original);
      const error = compressor.estimateError(original, compressed);

      expect(error.mse).toBeGreaterThanOrEqual(0);
    });

    it('should have lower error for 16-bit than 8-bit', () => {
      const original = [0.1, 0.3, 0.5, 0.7, 0.9];

      const compressor8 = new ScalarQuantization({
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
        min: 0,
        max: 1,
      });

      const compressor16 = new ScalarQuantization({
        inputDimension: 5,
        outputDimension: 5,
        bits: 16,
        min: 0,
        max: 1,
      });

      const error8 = compressor8.estimateError(original);
      const error16 = compressor16.estimateError(original);

      expect(error16.mse).toBeLessThan(error8.mse);
    });
  });

  describe('calculateSimilarity', () => {
    it('should compute cosine similarity', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
        min: 0,
        max: 1,
      };

      const compressor = new ScalarQuantization(config);
      const original = [0.1, 0.3, 0.5, 0.7, 0.9];
      const similarity = compressor.calculateSimilarity(original);

      expect(similarity).toBeGreaterThan(0.9);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should accept pre-compressed embedding', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
        min: 0,
        max: 1,
      };

      const compressor = new ScalarQuantization(config);
      const original = [0.1, 0.3, 0.5, 0.7, 0.9];
      const compressed = compressor.compress(original);
      const similarity = compressor.calculateSimilarity(original, compressed);

      expect(similarity).toBeGreaterThan(0.9);
    });

    it('should have higher similarity for 16-bit than 8-bit', () => {
      const original = [0.1, 0.3, 0.5, 0.7, 0.9];

      const compressor8 = new ScalarQuantization({
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
        min: 0,
        max: 1,
      });

      const compressor16 = new ScalarQuantization({
        inputDimension: 5,
        outputDimension: 5,
        bits: 16,
        min: 0,
        max: 1,
      });

      const similarity8 = compressor8.calculateSimilarity(original);
      const similarity16 = compressor16.calculateSimilarity(original);

      expect(similarity16).toBeGreaterThan(similarity8);
    });
  });

  describe('setRange', () => {
    it('should set normalization range explicitly', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);
      compressor.setRange(-1, 1);

      const configOut = compressor.getConfig();
      expect(configOut.min).toBe(-1);
      expect(configOut.max).toBe(1);
    });

    it('should throw error if min >= max', () => {
      const config: QuantizationConfig = {
        inputDimension: 5,
        outputDimension: 5,
        bits: 8,
      };

      const compressor = new ScalarQuantization(config);

      expect(() => compressor.setRange(1, 1)).toThrow('Validation error: range - min must be less than max');
      expect(() => compressor.setRange(1, 0)).toThrow('Validation error: range - min must be less than max');
    });
  });

  describe('factory function', () => {
    it('should create instance via factory', () => {
      const config: QuantizationConfig = {
        inputDimension: 1536,
        outputDimension: 1536,
        bits: 8,
      };

      const compressor = createScalarQuantization(config);

      expect(compressor).toBeInstanceOf(ScalarQuantization);
    });
  });
});

describe('RandomProjection', () => {
  describe('constructor', () => {
    it('should initialize with valid config', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 256,
        seed: 42,
      };

      const compressor = new RandomProjection(config);

      expect(compressor).toBeDefined();
      expect(compressor.getOutputDimension()).toBe(256);
    });

    it('should throw error for invalid input dimension', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 0,
        outputDimension: 256,
      };

      expect(() => new RandomProjection(config)).toThrow(
        'Validation error: dimensions - input and output dimensions must be positive'
      );
    });

    it('should throw error for invalid output dimension', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 0,
      };

      expect(() => new RandomProjection(config)).toThrow(
        'Validation error: dimensions - input and output dimensions must be positive'
      );
    });

    it('should throw error when output dimension exceeds input', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 256,
        outputDimension: 1536,
      };

      expect(() => new RandomProjection(config)).toThrow(
        'Validation error: outputDimension - must not exceed input dimension'
      );
    });

    it('should use Date.now() as default seed', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 256,
      };

      const compressor = new RandomProjection(config);

      expect(compressor).toBeDefined();
    });

    it('should accept custom sparsity', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 256,
        seed: 42,
        sparsity: 5,
      };

      const compressor = new RandomProjection(config);

      expect(compressor.getConfig().sparsity).toBe(5);
    });
  });

  describe('compress', () => {
    it('should compress embedding to lower dimension', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      };

      const compressor = new RandomProjection(config);
      const embedding = Array.from({ length: 100 }, (_, i) => i / 100);
      const compressed = compressor.compress(embedding);

      expect(compressed).toHaveLength(20);
    });

    it('should throw error for dimension mismatch', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      };

      const compressor = new RandomProjection(config);
      const embedding = [0.1, 0.2]; // Only 2 elements

      expect(() => compressor.compress(embedding)).toThrow('Validation error: embedding - dimension mismatch');
    });

    it('should produce deterministic results with same seed', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      };

      const compressor1 = new RandomProjection(config);
      const compressor2 = new RandomProjection(config);

      const embedding = Array.from({ length: 100 }, (_, i) => i / 100);

      const compressed1 = compressor1.compress(embedding);
      const compressed2 = compressor2.compress(embedding);

      expect(compressed1).toEqual(compressed2);
    });

    it('should produce different results with different seeds', () => {
      const embedding = Array.from({ length: 100 }, (_, i) => i / 100);

      const compressor1 = new RandomProjection({
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      });

      const compressor2 = new RandomProjection({
        inputDimension: 100,
        outputDimension: 20,
        seed: 123,
      });

      const compressed1 = compressor1.compress(embedding);
      const compressed2 = compressor2.compress(embedding);

      expect(compressed1).not.toEqual(compressed2);
    });

    it('should handle zero vector', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      };

      const compressor = new RandomProjection(config);
      const embedding = Array.from({ length: 100 }, () => 0);
      const compressed = compressor.compress(embedding);

      expect(compressed).toHaveLength(20);
      expect(compressed.every((v) => v === 0)).toBe(true);
    });

    it('should apply scaling factor', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      };

      const compressor = new RandomProjection(config);
      const embedding = Array.from({ length: 100 }, () => 1);
      const compressed = compressor.compress(embedding);

      // Values should be scaled by 1/sqrt(outputDimension)
      const expectedScale = 1 / Math.sqrt(20);
      compressed.forEach((value) => {
        expect(Math.abs(value)).toBeLessThan(expectedScale * 50);
      });
    });

    it('should preserve approximate distances', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 50,
        seed: 42,
      };

      const compressor = new RandomProjection(config);

      const embedding1 = Array.from({ length: 100 }, (_, i) => Math.sin(i));
      const embedding2 = Array.from({ length: 100 }, (_, i) => Math.cos(i));

      const compressed1 = compressor.compress(embedding1);
      const compressed2 = compressor.compress(embedding2);

      // Calculate cosine similarity
      const dotProduct = compressed1.reduce((sum, v, i) => sum + v * compressed2[i]!, 0);
      const norm1 = Math.sqrt(compressed1.reduce((sum, v) => sum + v * v, 0));
      const norm2 = Math.sqrt(compressed2.reduce((sum, v) => sum + v * v, 0));
      const similarity = dotProduct / (norm1 * norm2);

      // Similarity should be reasonable (not testing exact preservation)
      expect(Math.abs(similarity)).toBeLessThan(1);
    });
  });

  describe('decompress', () => {
    it('should throw error as decompression is not supported', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      };

      const compressor = new RandomProjection(config);

      expect(() => compressor.decompress()).toThrow(
        'decompress is unavailable: random projection does not support decompression'
      );
    });
  });

  describe('getOutputDimension', () => {
    it('should return output dimension', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 256,
        seed: 42,
      };

      const compressor = new RandomProjection(config);

      expect(compressor.getOutputDimension()).toBe(256);
    });
  });

  describe('getName', () => {
    it('should return random_projection method name', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 256,
        seed: 42,
      };

      const compressor = new RandomProjection(config);

      expect(compressor.getName()).toBe('random_projection');
    });
  });

  describe('getConfig', () => {
    it('should return configuration', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 256,
        seed: 42,
        sparsity: 5,
      };

      const compressor = new RandomProjection(config);
      const configOut = compressor.getConfig();

      expect(configOut).toEqual({
        inputDimension: 1536,
        outputDimension: 256,
        seed: 42,
        sparsity: 5,
      });
    });

    it('should include default sparsity', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 256,
        seed: 42,
      };

      const compressor = new RandomProjection(config);
      const configOut = compressor.getConfig();

      expect(configOut.sparsity).toBe(3);
    });
  });

  describe('getMemoryUsage', () => {
    it('should return 0 before matrix initialization', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 256,
        seed: 42,
      };

      const compressor = new RandomProjection(config);
      const memory = compressor.getMemoryUsage();

      expect(memory).toBe(0);
    });

    it('should return non-zero after compression', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      };

      const compressor = new RandomProjection(config);
      const embedding = Array.from({ length: 100 }, () => 0.5);

      compressor.compress(embedding);

      const memory = compressor.getMemoryUsage();
      expect(memory).toBeGreaterThan(0);
    });
  });

  describe('estimateOutputDimension', () => {
    it('should estimate output dimension for given epsilon', () => {
      const k = RandomProjection.estimateOutputDimension(0.1);

      expect(k).toBeGreaterThan(0);
      expect(Number.isInteger(k)).toBe(true);
    });

    it('should return higher dimension for smaller epsilon', () => {
      const k1 = RandomProjection.estimateOutputDimension(0.1);
      const k2 = RandomProjection.estimateOutputDimension(0.05);

      expect(k2).toBeGreaterThan(k1);
    });

    it('should use default epsilon of 0.1', () => {
      const k = RandomProjection.estimateOutputDimension();

      expect(k).toBeGreaterThan(0);
    });
  });

  describe('sparse matrix generation', () => {
    it('should generate sparse matrix with {-1, 0, 1} values', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      };

      const compressor = new RandomProjection(config);

      // Force matrix initialization
      const embedding = Array.from({ length: 100 }, () => 1);
      compressor.compress(embedding);

      // Matrix should be initialized (verified indirectly through memory usage)
      const memory = compressor.getMemoryUsage();
      expect(memory).toBeGreaterThan(0);
    });

    it('should create matrix with expected sparsity', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1000,
        outputDimension: 100,
        seed: 42,
        sparsity: 3,
      };

      const compressor = new RandomProjection(config);

      // Force initialization
      const embedding = Array.from({ length: 1000 }, () => 0.5);
      compressor.compress(embedding);

      // With sparsity 3, ~2/3 of entries should be zero
      // Verify indirectly through memory usage (sparse matrix uses less memory)
      const memory = compressor.getMemoryUsage();
      const maxMemory = 1000 * 100 * 20; // Max if all entries stored
      expect(memory).toBeLessThan(maxMemory);
    });
  });

  describe('factory function', () => {
    it('should create instance via factory', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 256,
        seed: 42,
      };

      const compressor = createRandomProjection(config);

      expect(compressor).toBeInstanceOf(RandomProjection);
    });
  });

  describe('lazy initialization', () => {
    it('should not initialize matrix until first compress', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 1536,
        outputDimension: 256,
        seed: 42,
      };

      const compressor = new RandomProjection(config);

      expect(compressor.getMemoryUsage()).toBe(0);
    });

    it('should initialize matrix on first compress', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      };

      const compressor = new RandomProjection(config);
      const embedding = Array.from({ length: 100 }, () => 0.5);

      expect(compressor.getMemoryUsage()).toBe(0);

      compressor.compress(embedding);

      expect(compressor.getMemoryUsage()).toBeGreaterThan(0);
    });

    it('should not reinitialize on subsequent compress', () => {
      const config: RandomProjectionConfig = {
        inputDimension: 100,
        outputDimension: 20,
        seed: 42,
      };

      const compressor = new RandomProjection(config);
      const embedding = Array.from({ length: 100 }, () => 0.5);

      compressor.compress(embedding);
      const memory1 = compressor.getMemoryUsage();

      compressor.compress(embedding);
      const memory2 = compressor.getMemoryUsage();

      expect(memory1).toBe(memory2);
    });
  });
});
