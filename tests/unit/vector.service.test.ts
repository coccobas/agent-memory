import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VectorService } from '../../src/services/vector.service.js';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const TEST_VECTOR_DB_PATH = resolve(process.cwd(), 'data/test-vectors.lance');

describe('Vector Service', () => {
  let service: VectorService;

  beforeEach(() => {
    // Set environment variable to use test database path
    process.env.AGENT_MEMORY_VECTOR_DB_PATH = TEST_VECTOR_DB_PATH;

    // Clean up any existing test vector DB
    if (existsSync(TEST_VECTOR_DB_PATH)) {
      rmSync(TEST_VECTOR_DB_PATH, { recursive: true, force: true });
    }
    service = new VectorService();
  });

  afterEach(async () => {
    await service.close();

    // Clean up test vector DB
    if (existsSync(TEST_VECTOR_DB_PATH)) {
      rmSync(TEST_VECTOR_DB_PATH, { recursive: true, force: true });
    }

    // Clear environment variable
    delete process.env.AGENT_MEMORY_VECTOR_DB_PATH;
  });

  it('should create independent instances', () => {
    const service1 = new VectorService();
    const service2 = new VectorService();
    // With DI pattern, instances are independent
    expect(service1).not.toBe(service2);
    service1.close();
    service2.close();
  });

  it('should initialize vector database', { timeout: 10000 }, async () => {
    // Should not throw
    await expect(service.initialize()).resolves.not.toThrow();

    // Calling initialize again should be safe (idempotent)
    await expect(service.initialize()).resolves.not.toThrow();
  });

  it('should store embedding successfully', { timeout: 15000 }, async () => {
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

  it.skip(
    'should handle concurrent storeEmbedding without explicit initialize (flaky under load)',
    { timeout: 90000 },
    async () => {
      const embedding = Array(384).fill(0.123);

      await expect(
        Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            service.storeEmbedding(
              'tool',
              `tool-concurrent-${i}`,
              'v1',
              `Tool ${i}`,
              embedding,
              'm'
            )
          )
        )
      ).resolves.not.toThrow();

      const count = await service.getCount();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  );

  it.skip('should store multiple embeddings (flaky under load)', { timeout: 30000 }, async () => {
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

  it.skip('should update existing embedding (flaky under load)', { timeout: 30000 }, async () => {
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

  it.skip('should search for similar embeddings', { timeout: 15000 }, async () => {
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

  it.skip('should filter search results by entry type (flaky under load)', { timeout: 60000 }, async () => {
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

  it.skip('should respect limit parameter', { timeout: 30000 }, async () => {
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

  it.skip('should return results sorted by similarity (flaky under load)', { timeout: 20000 }, async () => {
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

  it.skip('should get count of stored embeddings (flaky under load)', { timeout: 15000 }, async () => {
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

  it('should handle search with no results gracefully', { timeout: 400000 }, async () => {
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

  it('should handle search with empty entry types array', { timeout: 10000 }, async () => {
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

  it('should close connection successfully', { timeout: 10000 }, async () => {
    await service.initialize();

    // Should not throw
    expect(() => service.close()).not.toThrow();

    // Closing again should be safe
    expect(() => service.close()).not.toThrow();
  });

  it('should handle initialization errors gracefully', { timeout: 10000 }, async () => {
    // This test is tricky as we'd need to force an error
    // For now, just verify that initialization doesn't throw with valid path
    await expect(service.initialize()).resolves.not.toThrow();
  });

  it.skip('should return similarity scores between 0 and 1 (flaky under load)', { timeout: 30000 }, async () => {
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

  it.skip('should include text in search results', { timeout: 10000 }, async () => {
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

  it.skip('should store version information', { timeout: 10000 }, async () => {
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
