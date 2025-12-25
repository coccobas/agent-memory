import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingService,
  resetEmbeddingServiceState,
} from '../../src/services/embedding.service.js';

describe('Embedding Service', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    resetEmbeddingServiceState();
    service = new EmbeddingService();
  });

  afterEach(() => {
    service.cleanup();
    resetEmbeddingServiceState();
  });

  it('should create independent instances', () => {
    const service1 = new EmbeddingService();
    const service2 = new EmbeddingService();
    // With DI pattern, instances are independent
    expect(service1).not.toBe(service2);
    service1.cleanup();
    service2.cleanup();
  });

  it('should determine provider based on environment', () => {
    const provider = service.getProvider();
    // Should be 'local' or 'openai' depending on API key presence
    expect(['openai', 'local', 'disabled']).toContain(provider);
  });

  it('should report availability correctly', () => {
    const available = service.isAvailable();
    const provider = service.getProvider();

    if (provider === 'disabled') {
      expect(available).toBe(false);
    } else {
      expect(available).toBe(true);
    }
  });

  it('should return correct embedding dimensions', () => {
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

    // Reload config to pick up the new env var
    const { reloadConfig } = await import('../../src/config/index.js');
    reloadConfig();

    resetEmbeddingServiceState();
    const disabledService = new EmbeddingService();

    await expect(disabledService.embed('test')).rejects.toThrow('Embeddings are disabled');

    disabledService.cleanup();

    // Restore
    if (originalProvider) {
      process.env.AGENT_MEMORY_EMBEDDING_PROVIDER = originalProvider;
    } else {
      delete process.env.AGENT_MEMORY_EMBEDDING_PROVIDER;
    }
    reloadConfig();
  });

  it('should reject empty text', async () => {
    if (service.isAvailable()) {
      await expect(service.embed('')).rejects.toThrow('Cannot embed empty text');
      await expect(service.embed('   ')).rejects.toThrow('Cannot embed empty text');
    }
  });

  // Note: Actual embedding generation tests would require API keys or local model setup
  // Those are integration tests rather than unit tests
});

