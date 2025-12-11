import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getEmbeddingService,
  resetEmbeddingService,
} from '../../src/services/embedding.service.js';

describe('Embedding Service', () => {
  beforeEach(() => {
    resetEmbeddingService();
  });

  afterEach(() => {
    resetEmbeddingService();
  });

  it('should create singleton instance', () => {
    const service1 = getEmbeddingService();
    const service2 = getEmbeddingService();
    expect(service1).toBe(service2);
  });

  it('should determine provider based on environment', () => {
    const service = getEmbeddingService();
    const provider = service.getProvider();
    // Should be 'local' or 'openai' depending on API key presence
    expect(['openai', 'local', 'disabled']).toContain(provider);
  });

  it('should report availability correctly', () => {
    const service = getEmbeddingService();
    const available = service.isAvailable();
    const provider = service.getProvider();

    if (provider === 'disabled') {
      expect(available).toBe(false);
    } else {
      expect(available).toBe(true);
    }
  });

  it('should return correct embedding dimensions', () => {
    const service = getEmbeddingService();
    const dimensions = service.getEmbeddingDimension();

    if (service.getProvider() === 'openai') {
      expect(dimensions).toBe(1536); // text-embedding-3-small
    } else if (service.getProvider() === 'local') {
      expect(dimensions).toBe(384); // all-MiniLM-L6-v2
    } else {
      expect(dimensions).toBe(0); // disabled
    }
  });

  it('should throw error when embeddings disabled', async () => {
    // Force disabled mode by setting env var
    const originalProvider = process.env.AGENT_MEMORY_EMBEDDING_PROVIDER;
    process.env.AGENT_MEMORY_EMBEDDING_PROVIDER = 'disabled';

    resetEmbeddingService();
    const service = getEmbeddingService();

    await expect(service.embed('test')).rejects.toThrow('Embeddings are disabled');

    // Restore
    if (originalProvider) {
      process.env.AGENT_MEMORY_EMBEDDING_PROVIDER = originalProvider;
    } else {
      delete process.env.AGENT_MEMORY_EMBEDDING_PROVIDER;
    }
  });

  it('should reject empty text', async () => {
    const service = getEmbeddingService();

    if (service.isAvailable()) {
      await expect(service.embed('')).rejects.toThrow('Cannot embed empty text');
      await expect(service.embed('   ')).rejects.toThrow('Cannot embed empty text');
    }
  });

  // Note: Actual embedding generation tests would require API keys or local model setup
  // Those are integration tests rather than unit tests
});


