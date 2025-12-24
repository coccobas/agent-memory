/**
 * Integration tests for PgVectorStore
 *
 * These tests require a PostgreSQL instance with pgvector extension installed.
 * They are skipped if PostgreSQL connection is not available.
 *
 * To run these tests:
 * 1. Set up PostgreSQL with pgvector: CREATE EXTENSION vector;
 * 2. Set environment variable: AGENT_MEMORY_PG_HOST, AGENT_MEMORY_PG_DATABASE, etc.
 * 3. Run: npx vitest run tests/integration/pgvector.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';

// Dynamic import to avoid loading issues when pg is not configured
let PgVectorStore: typeof import('../../src/db/vector-stores/pgvector.js').PgVectorStore;

const PG_CONFIG = {
  host: process.env.AGENT_MEMORY_PG_HOST || 'localhost',
  port: parseInt(process.env.AGENT_MEMORY_PG_PORT || '5432', 10),
  database: process.env.AGENT_MEMORY_PG_DATABASE || 'agent_memory_test',
  user: process.env.AGENT_MEMORY_PG_USER || 'postgres',
  password: process.env.AGENT_MEMORY_PG_PASSWORD || '',
};

let pool: Pool | null = null;
let store: InstanceType<typeof PgVectorStore> | null = null;
let pgAvailable = false;

async function checkPgVectorAvailable(): Promise<boolean> {
  try {
    const testPool = new Pool({ ...PG_CONFIG, connectionTimeoutMillis: 5000 });
    const client = await testPool.connect();

    try {
      // Check if pgvector extension is available
      const result = await client.query(
        "SELECT 1 FROM pg_extension WHERE extname = 'vector'"
      );
      if (result.rowCount === 0) {
        console.log('pgvector extension not installed, skipping integration tests');
        return false;
      }

      // Ensure test tables exist
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS vector;

        DROP TABLE IF EXISTS vector_embeddings;
        DROP TABLE IF EXISTS _vector_meta;

        CREATE TABLE vector_embeddings (
          id text PRIMARY KEY,
          entry_type text NOT NULL,
          entry_id text NOT NULL,
          version_id text NOT NULL,
          text text NOT NULL,
          embedding vector NOT NULL,
          model text NOT NULL,
          created_at timestamp with time zone DEFAULT now() NOT NULL,
          CONSTRAINT vector_embeddings_entry_type_check CHECK (entry_type IN ('tool', 'guideline', 'knowledge', 'experience'))
        );

        CREATE INDEX idx_vector_embeddings_entry ON vector_embeddings(entry_type, entry_id);
        CREATE INDEX idx_vector_embeddings_type ON vector_embeddings(entry_type);
        CREATE UNIQUE INDEX uq_vector_entry_version ON vector_embeddings(entry_type, entry_id, version_id);

        CREATE TABLE _vector_meta (
          key text PRIMARY KEY,
          value text NOT NULL,
          updated_at timestamp with time zone DEFAULT now()
        );
      `);

      pool = testPool;
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.log(
      'PostgreSQL not available for integration tests:',
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

describe('PgVectorStore Integration', () => {
  beforeAll(async () => {
    // Import the module
    const module = await import('../../src/db/vector-stores/pgvector.js');
    PgVectorStore = module.PgVectorStore;

    pgAvailable = await checkPgVectorAvailable();
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    if (!pgAvailable || !pool) return;

    // Clean up embeddings between tests
    const client = await pool.connect();
    try {
      await client.query('TRUNCATE vector_embeddings');
      await client.query('DELETE FROM _vector_meta');
    } finally {
      client.release();
    }

    store = new PgVectorStore(pool, 'cosine');
  });

  describe.skipIf(!pgAvailable)('with PostgreSQL', () => {
    it('should initialize successfully', async () => {
      await expect(store!.initialize()).resolves.not.toThrow();
      expect(store!.isAvailable()).toBe(true);
    });

    it('should store and retrieve embeddings', async () => {
      await store!.initialize();

      const embedding = Array(384).fill(0).map(() => Math.random());

      await store!.store({
        entryType: 'tool',
        entryId: 'test-tool-1',
        versionId: 'v1',
        text: 'Test tool for authentication',
        vector: embedding,
        model: 'test-model',
        createdAt: new Date().toISOString(),
      });

      const count = await store!.count();
      expect(count).toBe(1);
    });

    it('should search for similar embeddings', async () => {
      await store!.initialize();

      // Store a base embedding
      const baseEmbedding = Array(384).fill(0.5);
      await store!.store({
        entryType: 'tool',
        entryId: 'base-tool',
        versionId: 'v1',
        text: 'Base tool',
        vector: baseEmbedding,
        model: 'test-model',
        createdAt: new Date().toISOString(),
      });

      // Search with a similar embedding
      const queryEmbedding = Array(384).fill(0).map(() => 0.5 + (Math.random() - 0.5) * 0.1);
      const results = await store!.search(queryEmbedding, { limit: 10, entryTypes: ['tool'] });

      expect(results.length).toBe(1);
      expect(results[0].entryId).toBe('base-tool');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it('should filter search by entry type', async () => {
      await store!.initialize();

      const embedding = Array(384).fill(0.5);

      // Store tool and guideline
      await store!.store({
        entryType: 'tool',
        entryId: 'tool-1',
        versionId: 'v1',
        text: 'Tool',
        vector: embedding,
        model: 'test-model',
        createdAt: new Date().toISOString(),
      });

      await store!.store({
        entryType: 'guideline',
        entryId: 'guideline-1',
        versionId: 'v1',
        text: 'Guideline',
        vector: embedding,
        model: 'test-model',
        createdAt: new Date().toISOString(),
      });

      // Search for only tools
      const results = await store!.search(embedding, { limit: 10, entryTypes: ['tool'] });

      expect(results.length).toBe(1);
      expect(results[0].entryType).toBe('tool');
    });

    it('should delete embeddings', async () => {
      await store!.initialize();

      const embedding = Array(384).fill(0.5);

      await store!.store({
        entryType: 'tool',
        entryId: 'delete-test',
        versionId: 'v1',
        text: 'To be deleted',
        vector: embedding,
        model: 'test-model',
        createdAt: new Date().toISOString(),
      });

      expect(await store!.count()).toBe(1);

      await store!.delete({ entryType: 'tool', entryId: 'delete-test' });

      expect(await store!.count()).toBe(0);
    });

    it('should handle upsert correctly', async () => {
      await store!.initialize();

      const embedding1 = Array(384).fill(0.5);
      const embedding2 = Array(384).fill(0.7);

      // Store initial
      await store!.store({
        entryType: 'tool',
        entryId: 'upsert-test',
        versionId: 'v1',
        text: 'Original text',
        vector: embedding1,
        model: 'test-model',
        createdAt: new Date().toISOString(),
      });

      // Upsert same entry
      await store!.store({
        entryType: 'tool',
        entryId: 'upsert-test',
        versionId: 'v1',
        text: 'Updated text',
        vector: embedding2,
        model: 'test-model',
        createdAt: new Date().toISOString(),
      });

      // Should still have 1 entry
      expect(await store!.count()).toBe(1);

      // Search should return updated text
      const results = await store!.search(embedding2, { limit: 10, entryTypes: ['tool'] });
      expect(results[0].text).toBe('Updated text');
    });

    it('should create HNSW index on first store', async () => {
      await store!.initialize();

      const embedding = Array(384).fill(0.5);

      await store!.store({
        entryType: 'tool',
        entryId: 'index-test',
        versionId: 'v1',
        text: 'Index test',
        vector: embedding,
        model: 'test-model',
        createdAt: new Date().toISOString(),
      });

      // Verify HNSW index was created
      const client = await pool!.connect();
      try {
        const result = await client.query(
          "SELECT 1 FROM pg_indexes WHERE indexname = 'idx_vector_embeddings_hnsw'"
        );
        expect(result.rowCount).toBe(1);
      } finally {
        client.release();
      }
    });

    it('should persist dimension in meta table', async () => {
      await store!.initialize();

      const embedding = Array(384).fill(0.5);

      await store!.store({
        entryType: 'tool',
        entryId: 'dim-test',
        versionId: 'v1',
        text: 'Dimension test',
        vector: embedding,
        model: 'test-model',
        createdAt: new Date().toISOString(),
      });

      // Verify dimension was stored
      const client = await pool!.connect();
      try {
        const result = await client.query("SELECT value FROM _vector_meta WHERE key = 'dimension'");
        expect(result.rows[0].value).toBe('384');
      } finally {
        client.release();
      }
    });

    it('should handle concurrent stores', async () => {
      await store!.initialize();

      const embedding = Array(384).fill(0.5);

      // Store 10 entries concurrently
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          store!.store({
            entryType: 'tool',
            entryId: `concurrent-${i}`,
            versionId: 'v1',
            text: `Concurrent ${i}`,
            vector: embedding,
            model: 'test-model',
            createdAt: new Date().toISOString(),
          })
        )
      );

      expect(await store!.count()).toBe(10);
    });

    it('should compact without error', async () => {
      await store!.initialize();

      const embedding = Array(384).fill(0.5);
      await store!.store({
        entryType: 'tool',
        entryId: 'compact-test',
        versionId: 'v1',
        text: 'Compact test',
        vector: embedding,
        model: 'test-model',
        createdAt: new Date().toISOString(),
      });

      await expect(store!.compact()).resolves.not.toThrow();
    });
  });
});
