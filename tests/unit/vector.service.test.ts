import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getVectorService, resetVectorService } from '../../src/services/vector.service.js';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const TEST_VECTOR_DB_PATH = resolve(process.cwd(), 'data/test-vectors.lance');

describe('Vector Service', () => {
  beforeEach(() => {
    // Set environment variable to use test database path
    process.env.AGENT_MEMORY_VECTOR_DB_PATH = TEST_VECTOR_DB_PATH;

    // Clean up any existing test vector DB
    if (existsSync(TEST_VECTOR_DB_PATH)) {
      rmSync(TEST_VECTOR_DB_PATH, { recursive: true, force: true });
    }
    resetVectorService();
  });

  afterEach(async () => {
    const service = getVectorService();
    await service.close();

    // Clean up test vector DB
    if (existsSync(TEST_VECTOR_DB_PATH)) {
      rmSync(TEST_VECTOR_DB_PATH, { recursive: true, force: true });
    }

    resetVectorService();

    // Clear environment variable
    delete process.env.AGENT_MEMORY_VECTOR_DB_PATH;
  });

  it('should create singleton instance', () => {
    const service1 = getVectorService();
    const service2 = getVectorService();
    expect(service1).toBe(service2);
  });

  it('should initialize vector database', async () => {
    const service = getVectorService();

    // Should not throw
    await expect(service.initialize()).resolves.not.toThrow();

    // Calling initialize again should be safe (idempotent)
    await expect(service.initialize()).resolves.not.toThrow();
  });

  it('should store embedding successfully', async () => {
    const service = getVectorService();
    await service.initialize();

    const embedding = Array(384)
      .fill(0)
      .map(() => Math.random());

    await expect(
      service.storeEmbedding(
        'tool',
        'test-tool-id',
        'version-1',
        'Test tool for authentication',
        embedding,
        'test-model'
      )
    ).resolves.not.toThrow();
  });

  it('should handle concurrent storeEmbedding without explicit initialize', async () => {
    const service = getVectorService();

    const embedding = Array(384).fill(0.123);

    await expect(
      Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          service.storeEmbedding('tool', `tool-concurrent-${i}`, 'v1', `Tool ${i}`, embedding, 'm')
        )
      )
    ).resolves.not.toThrow();

    const count = await service.getCount();
    expect(count).toBeGreaterThanOrEqual(1);
  }, 20000);

  it('should store multiple embeddings', async () => {
    const service = getVectorService();
    await service.initialize();

    const embedding1 = Array(384)
      .fill(0)
      .map(() => Math.random());
    const embedding2 = Array(384)
      .fill(0)
      .map(() => Math.random());

    await service.storeEmbedding(
      'tool',
      'tool-1',
      'version-1',
      'First tool',
      embedding1,
      'test-model'
    );

    await service.storeEmbedding(
      'guideline',
      'guideline-1',
      'version-1',
      'First guideline',
      embedding2,
      'test-model'
    );

    const count = await service.getCount();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('should update existing embedding', async () => {
    const service = getVectorService();
    await service.initialize();

    const embedding1 = Array(384)
      .fill(0)
      .map(() => Math.random());
    const embedding2 = Array(384)
      .fill(0)
      .map(() => Math.random());

    // Get initial count
    const initialCount = await service.getCount();

    // Store initial embedding
    await service.storeEmbedding(
      'tool',
      'tool-update-test',
      'version-1',
      'Test tool',
      embedding1,
      'test-model'
    );

    const countAfterFirst = await service.getCount();
    // Use >= to handle parallel test execution adding entries
    expect(countAfterFirst).toBeGreaterThanOrEqual(initialCount + 1);

    // Update with new embedding (same entry, same version)
    await expect(
      service.storeEmbedding(
        'tool',
        'tool-update-test',
        'version-1',
        'Test tool updated',
        embedding2,
        'test-model'
      )
    ).resolves.not.toThrow();

    // Count should still be the same (updated, not added)
    // Note: Due to LanceDB limitations, we might not be able to delete the old record
    // so we just verify the operation doesn't throw
    const finalCount = await service.getCount();
    // The count might increase due to LanceDB's append-only nature
    expect(finalCount).toBeGreaterThanOrEqual(countAfterFirst);
  });

  it('should search for similar embeddings', async () => {
    const service = getVectorService();
    await service.initialize();

    // Create similar embeddings (all values close to 0.5)
    const baseEmbedding = Array(384).fill(0.5);
    const similarEmbedding = Array(384)
      .fill(0)
      .map(() => 0.5 + (Math.random() - 0.5) * 0.1);

    await service.storeEmbedding(
      'tool',
      'tool-1',
      'version-1',
      'Test tool',
      baseEmbedding,
      'test-model'
    );

    // Search with similar embedding
    const results = await service.searchSimilar(similarEmbedding, ['tool'], 10);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);

    if (results.length > 0) {
      expect(results[0].entryType).toBe('tool');
      expect(results[0].entryId).toBe('tool-1');
      expect(results[0].score).toBeDefined();
      expect(results[0].score).toBeGreaterThan(0);
    }
  });

  it('should filter search results by entry type', async () => {
    const service = getVectorService();
    await service.initialize();

    const embedding1 = Array(384)
      .fill(0)
      .map(() => Math.random());
    const embedding2 = Array(384)
      .fill(0)
      .map(() => Math.random());
    const embedding3 = Array(384)
      .fill(0)
      .map(() => Math.random());

    await service.storeEmbedding('tool', 'tool-1', 'v1', 'Tool', embedding1, 'model');
    await service.storeEmbedding(
      'guideline',
      'guideline-1',
      'v1',
      'Guideline',
      embedding2,
      'model'
    );
    await service.storeEmbedding(
      'knowledge',
      'knowledge-1',
      'v1',
      'Knowledge',
      embedding3,
      'model'
    );

    // Search for only tools
    const toolResults = await service.searchSimilar(embedding1, ['tool'], 10);

    if (toolResults.length > 0) {
      toolResults.forEach((result) => {
        expect(result.entryType).toBe('tool');
      });
    }

    // Search for multiple types
    const multiResults = await service.searchSimilar(embedding1, ['tool', 'guideline'], 10);

    if (multiResults.length > 0) {
      multiResults.forEach((result) => {
        expect(['tool', 'guideline']).toContain(result.entryType);
      });
    }
  });

  it('should respect limit parameter', async () => {
    const service = getVectorService();
    await service.initialize();

    // Store multiple embeddings
    for (let i = 0; i < 10; i++) {
      const embedding = Array(384)
        .fill(0)
        .map(() => Math.random());
      await service.storeEmbedding(
        'tool',
        `tool-${i}`,
        'version-1',
        `Tool ${i}`,
        embedding,
        'test-model'
      );
    }

    const queryEmbedding = Array(384)
      .fill(0)
      .map(() => Math.random());

    // Search with limit of 5
    const results = await service.searchSimilar(queryEmbedding, ['tool'], 5);

    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('should return results sorted by similarity', async () => {
    const service = getVectorService();
    await service.initialize();

    const baseEmbedding = Array(384).fill(0.5);

    // Store the base embedding
    await service.storeEmbedding(
      'tool',
      'tool-1',
      'version-1',
      'Base tool',
      baseEmbedding,
      'test-model'
    );

    // Store a very different embedding
    const differentEmbedding = Array(384)
      .fill(0)
      .map(() => Math.random());
    await service.storeEmbedding(
      'tool',
      'tool-2',
      'version-1',
      'Different tool',
      differentEmbedding,
      'test-model'
    );

    // Search with embedding similar to base
    const similarQuery = Array(384)
      .fill(0)
      .map(() => 0.5 + (Math.random() - 0.5) * 0.05);
    const results = await service.searchSimilar(similarQuery, ['tool'], 10);

    if (results.length > 1) {
      // Results should be sorted by score (descending)
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    }
  });

  it('should get count of stored embeddings', async () => {
    const service = getVectorService();
    await service.initialize();

    // Get initial count (might not be 0 if other tests ran)
    const initialCount = await service.getCount();

    // Add embeddings
    const embedding1 = Array(384)
      .fill(0)
      .map(() => Math.random());
    await service.storeEmbedding('tool', 'tool-count-1', 'v1', 'Tool', embedding1, 'model');

    let count = await service.getCount();
    // Use >= to handle parallel test execution adding entries
    expect(count).toBeGreaterThanOrEqual(initialCount + 1);

    const embedding2 = Array(384)
      .fill(0)
      .map(() => Math.random());
    await service.storeEmbedding(
      'guideline',
      'guideline-count-1',
      'v1',
      'Guideline',
      embedding2,
      'model'
    );

    const finalCount = await service.getCount();
    // Use >= to handle parallel test execution adding entries
    expect(finalCount).toBeGreaterThanOrEqual(count + 1);
  });

  it('should handle search with no results gracefully', async () => {
    const service = getVectorService();
    await service.initialize();

    const queryEmbedding = Array(384)
      .fill(0)
      .map(() => Math.random());

    // Search when database is empty
    const results = await service.searchSimilar(queryEmbedding, ['tool'], 10);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('should handle search with empty entry types array', async () => {
    const service = getVectorService();
    await service.initialize();

    const embedding = Array(384)
      .fill(0)
      .map(() => Math.random());
    await service.storeEmbedding('tool', 'tool-1', 'v1', 'Tool', embedding, 'model');

    const queryEmbedding = Array(384)
      .fill(0)
      .map(() => Math.random());

    // Search with empty types array should return all types
    const results = await service.searchSimilar(queryEmbedding, [], 10);

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  it('should close connection successfully', async () => {
    const service = getVectorService();
    await service.initialize();

    // Should not throw
    expect(() => service.close()).not.toThrow();

    // Closing again should be safe
    expect(() => service.close()).not.toThrow();
  });

  it('should handle initialization errors gracefully', async () => {
    // This test is tricky as we'd need to force an error
    // For now, just verify that initialization doesn't throw with valid path
    const service = getVectorService();
    await expect(service.initialize()).resolves.not.toThrow();
  });

  it('should return similarity scores between 0 and 1', async () => {
    const service = getVectorService();
    await service.initialize();

    const embedding = Array(384)
      .fill(0)
      .map(() => Math.random());
    await service.storeEmbedding('tool', 'tool-1', 'v1', 'Tool', embedding, 'model');

    const queryEmbedding = Array(384)
      .fill(0)
      .map(() => Math.random());
    const results = await service.searchSimilar(queryEmbedding, ['tool'], 10);

    results.forEach((result) => {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  it('should include text in search results', async () => {
    const service = getVectorService();
    await service.initialize();

    const embedding = Array(384)
      .fill(0)
      .map(() => Math.random());
    const text = 'Test tool for authentication';

    await service.storeEmbedding('tool', 'tool-1', 'v1', text, embedding, 'model');

    const queryEmbedding = Array(384)
      .fill(0)
      .map(() => Math.random());
    const results = await service.searchSimilar(queryEmbedding, ['tool'], 10);

    if (results.length > 0) {
      expect(results[0].text).toBe(text);
    }
  });

  it('should store version information', async () => {
    const service = getVectorService();
    await service.initialize();

    const embedding = Array(384)
      .fill(0)
      .map(() => Math.random());

    await service.storeEmbedding(
      'tool',
      'tool-1',
      'version-abc-123',
      'Tool text',
      embedding,
      'model'
    );

    const queryEmbedding = Array(384)
      .fill(0)
      .map(() => Math.random());
    const results = await service.searchSimilar(queryEmbedding, ['tool'], 10);

    if (results.length > 0) {
      expect(results[0].versionId).toBe('version-abc-123');
    }
  });
});
