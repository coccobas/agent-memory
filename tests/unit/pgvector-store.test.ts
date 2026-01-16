/**
 * Unit tests for PgVectorStore
 *
 * Tests the pgvector-based vector store implementation with a mocked PostgreSQL pool.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';

// Mock the logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocking
import { PgVectorStore } from '../../src/db/vector-stores/pgvector.js';

describe('PgVectorStore', () => {
  let mockPool: Pool;
  let mockClient: PoolClient;
  let store: PgVectorStore;

  const createMockQueryResult = (rows: unknown[] = [], rowCount = rows.length): QueryResult => ({
    rows,
    rowCount,
    command: 'SELECT',
    oid: 0,
    fields: [],
  });

  beforeEach(() => {
    // Create mock client
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    } as unknown as PoolClient;

    // Create mock pool
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    store = new PgVectorStore(mockPool, 'cosine');
  });

  describe('constructor', () => {
    it('should create instance with default cosine metric', () => {
      const s = new PgVectorStore(mockPool);
      expect(s.getDistanceMetric()).toBe('cosine');
    });

    it('should create instance with specified metric', () => {
      const s = new PgVectorStore(mockPool, 'l2');
      expect(s.getDistanceMetric()).toBe('l2');
    });

    it('should create instance with dot product metric', () => {
      const s = new PgVectorStore(mockPool, 'dot');
      expect(s.getDistanceMetric()).toBe('dot');
    });
  });

  describe('isAvailable', () => {
    it('should return false before initialization', () => {
      expect(store.isAvailable()).toBe(false);
    });

    it('should return true after initialization', async () => {
      // Mock successful initialization
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }])) // pgvector extension check
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }])) // table exists check
        .mockResolvedValueOnce(createMockQueryResult([])) // dimension from meta (none)
        .mockResolvedValueOnce(createMockQueryResult([])); // hnsw index check

      await store.initialize();
      expect(store.isAvailable()).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should verify pgvector extension exists', async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));

      await store.initialize();

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("pg_extension WHERE extname = 'vector'")
      );
    });

    it('should throw error if pgvector extension not installed', async () => {
      vi.mocked(mockClient.query).mockResolvedValueOnce(createMockQueryResult([])); // No extension

      await expect(store.initialize()).rejects.toThrow('pgvector extension not installed');
    });

    it('should throw error if vector_embeddings table not found', async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }])) // extension exists
        .mockResolvedValueOnce(createMockQueryResult([])); // table not found

      await expect(store.initialize()).rejects.toThrow('vector_embeddings table not found');
    });

    it('should load dimension from meta table', async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ value: '1536' }])) // dimension
        .mockResolvedValueOnce(createMockQueryResult([]));

      await store.initialize();
      expect(store.getExpectedDimension()).toBe(1536);
    });

    it('should be idempotent', async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));

      await store.initialize();
      await store.initialize();

      // Should only connect once
      expect(mockPool.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('dimension handling', () => {
    it('should start with null dimension', () => {
      expect(store.getExpectedDimension()).toBeNull();
    });

    it('should set dimension', () => {
      store.setExpectedDimension(384);
      expect(store.getExpectedDimension()).toBe(384);
    });
  });

  describe('store', () => {
    beforeEach(async () => {
      // Initialize store first
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));
      await store.initialize();
    });

    it('should store embedding with correct vector format', async () => {
      const embedding = [0.1, 0.2, 0.3];

      // Mock queries for setting dimension and storing
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult()) // dimension insert
        .mockResolvedValueOnce(createMockQueryResult()) // hnsw index creation
        .mockResolvedValueOnce(createMockQueryResult()); // store embedding

      await store.store({
        entryType: 'tool',
        entryId: 'test-id',
        versionId: 'v1',
        text: 'Test text',
        vector: embedding,
        model: 'test-model',
        createdAt: '2024-01-01T00:00:00Z',
      });

      // Verify the embedding was stored with correct vector format
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vector_embeddings'),
        expect.arrayContaining(['[0.1,0.2,0.3]'])
      );
    });

    it('should reject dimension mismatch', async () => {
      store.setExpectedDimension(3);

      const embedding = [0.1, 0.2]; // Wrong dimension

      await expect(
        store.store({
          entryType: 'tool',
          entryId: 'test-id',
          versionId: 'v1',
          text: 'Test text',
          vector: embedding,
          model: 'test-model',
          createdAt: '2024-01-01T00:00:00Z',
        })
      ).rejects.toThrow('dimension mismatch');
    });

    it('should create HNSW index on first store', async () => {
      const embedding = [0.1, 0.2, 0.3];

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult()) // dimension insert
        .mockResolvedValueOnce(createMockQueryResult()) // hnsw index creation
        .mockResolvedValueOnce(createMockQueryResult()); // store embedding

      await store.store({
        entryType: 'tool',
        entryId: 'test-id',
        versionId: 'v1',
        text: 'Test text',
        vector: embedding,
        model: 'test-model',
        createdAt: '2024-01-01T00:00:00Z',
      });

      // Verify HNSW index creation was attempted
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_vector_embeddings_hnsw')
      );
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));
      await store.initialize();
    });

    it('should delete by entry type and id', async () => {
      vi.mocked(mockClient.query).mockResolvedValueOnce(createMockQueryResult());

      await store.delete({ entryType: 'tool', entryId: 'test-id' });

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM vector_embeddings WHERE entry_type = $1 AND entry_id = $2',
        ['tool', 'test-id']
      );
    });

    it('should delete by version id', async () => {
      vi.mocked(mockClient.query).mockResolvedValueOnce(createMockQueryResult());

      await store.delete({ entryType: 'tool', entryId: 'test-id', versionId: 'v1' });

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM vector_embeddings WHERE entry_type = $1 AND entry_id = $2 AND version_id = $3',
        ['tool', 'test-id', 'v1']
      );
    });

    it('should exclude version id when specified', async () => {
      vi.mocked(mockClient.query).mockResolvedValueOnce(createMockQueryResult());

      await store.delete({ entryType: 'tool', entryId: 'test-id', excludeVersionId: 'v2' });

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM vector_embeddings WHERE entry_type = $1 AND entry_id = $2 AND version_id != $3',
        ['tool', 'test-id', 'v2']
      );
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ value: '3' }]))
        .mockResolvedValueOnce(createMockQueryResult([]));
      await store.initialize();
    });

    it('should search with cosine distance operator', async () => {
      vi.mocked(mockClient.query).mockResolvedValueOnce(
        createMockQueryResult([
          {
            entry_type: 'tool',
            entry_id: 'id1',
            version_id: 'v1',
            text: 'Test',
            distance: 0.1,
          },
        ])
      );

      const results = await store.search([0.1, 0.2, 0.3], { limit: 10 });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('<=>'),
        expect.any(Array)
      );
      expect(results).toHaveLength(1);
      expect(results[0].entryType).toBe('tool');
    });

    it('should filter by entry types', async () => {
      vi.mocked(mockClient.query).mockResolvedValueOnce(createMockQueryResult([]));

      await store.search([0.1, 0.2, 0.3], { limit: 10, entryTypes: ['tool', 'guideline'] });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('entry_type = ANY'),
        expect.any(Array)
      );
    });

    it('should reject dimension mismatch', async () => {
      await expect(store.search([0.1, 0.2], { limit: 10 })).rejects.toThrow('dimension mismatch');
    });

    it('should convert distance to similarity score', async () => {
      vi.mocked(mockClient.query).mockResolvedValueOnce(
        createMockQueryResult([
          {
            entry_type: 'tool',
            entry_id: 'id1',
            version_id: 'v1',
            text: 'Test',
            distance: 0.2, // Cosine distance
          },
        ])
      );

      const results = await store.search([0.1, 0.2, 0.3], { limit: 10 });

      // For cosine, similarity = 1 - distance = 1 - 0.2 = 0.8
      expect(results[0].score).toBeCloseTo(0.8, 2);
    });

    it('should return empty array for no results', async () => {
      vi.mocked(mockClient.query).mockResolvedValueOnce(createMockQueryResult([]));

      const results = await store.search([0.1, 0.2, 0.3], { limit: 10 });

      expect(results).toEqual([]);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));
      await store.initialize();
    });

    it('should return count of embeddings', async () => {
      vi.mocked(mockClient.query).mockResolvedValueOnce(createMockQueryResult([{ count: '42' }]));

      const count = await store.count();

      expect(count).toBe(42);
    });

    it('should return 0 on error', async () => {
      vi.mocked(mockClient.query).mockRejectedValueOnce(new Error('DB error'));

      const count = await store.count();

      expect(count).toBe(0);
    });
  });

  describe('compact', () => {
    beforeEach(async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));
      await store.initialize();
    });

    it('should run VACUUM ANALYZE', async () => {
      vi.mocked(mockClient.query).mockResolvedValueOnce(createMockQueryResult());

      await store.compact();

      expect(mockClient.query).toHaveBeenCalledWith('VACUUM ANALYZE vector_embeddings');
    });

    it('should not throw on error', async () => {
      vi.mocked(mockClient.query).mockRejectedValueOnce(new Error('VACUUM failed'));

      await expect(store.compact()).resolves.not.toThrow();
    });
  });

  describe('close', () => {
    it('should mark as not available', async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));
      await store.initialize();

      expect(store.isAvailable()).toBe(true);

      store.close();

      expect(store.isAvailable()).toBe(false);
    });
  });

  describe('distance metric conversion', () => {
    it('should use correct operator for L2 metric', async () => {
      const l2Store = new PgVectorStore(mockPool, 'l2');

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ value: '3' }]))
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));

      await l2Store.initialize();

      await l2Store.search([0.1, 0.2, 0.3], { limit: 10 });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('<->'),
        expect.any(Array)
      );
    });

    it('should use correct operator for dot product metric', async () => {
      const dotStore = new PgVectorStore(mockPool, 'dot');

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ 1: 1 }]))
        .mockResolvedValueOnce(createMockQueryResult([{ value: '3' }]))
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));

      await dotStore.initialize();

      await dotStore.search([0.1, 0.2, 0.3], { limit: 10 });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('<#>'),
        expect.any(Array)
      );
    });
  });
});
