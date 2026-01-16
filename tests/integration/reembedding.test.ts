/**
 * Integration tests for Re-embedding Service with real LanceDB
 *
 * These tests verify that re-embedding works correctly with the actual
 * vector store implementation, including dimension detection and re-embedding
 * of stored embeddings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/db/schema.js';
import { ReembeddingService } from '../../src/services/reembedding.service.js';
import { LanceDbVectorStore } from '../../src/db/vector-stores/lancedb.js';
import type { IEmbeddingService } from '../../src/core/context.js';
import type { AppDb } from '../../src/core/types.js';

const TEST_VECTOR_DB_PATH = resolve(process.cwd(), 'data/test-reembedding.lance');

// Mock embedding service with configurable dimension
class MockEmbeddingService implements IEmbeddingService {
  constructor(private dimension: number = 384) {}

  isAvailable(): boolean {
    return true;
  }

  getEmbeddingDimension(): number {
    return this.dimension;
  }

  async embed(text: string): Promise<{ embedding: number[]; model: string }> {
    // Create deterministic embedding based on text hash
    const hash = Array.from(text).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
    const embedding = Array(this.dimension)
      .fill(0)
      .map((_, i) => Math.sin(hash + i) * 0.5 + 0.5);
    return {
      embedding,
      model: `mock-model-${this.dimension}`,
    };
  }

  async embedBatch(texts: string[]): Promise<{ embeddings: number[][]; model: string }> {
    const results = await Promise.all(texts.map((t) => this.embed(t)));
    return {
      embeddings: results.map((r) => r.embedding),
      model: `mock-model-${this.dimension}`,
    };
  }
}

function createTestDb(): AppDb {
  const sqlite = new Database(':memory:');

  // Create schema matching drizzle definitions
  const createSchema = `
    CREATE TABLE tools (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      name TEXT NOT NULL,
      category TEXT,
      current_version_id TEXT,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      last_accessed_at TEXT,
      access_count INTEGER DEFAULT 0
    );

    CREATE TABLE tool_versions (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      description TEXT,
      version_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      change_reason TEXT,
      parameters TEXT,
      constraints TEXT,
      examples TEXT
    );

    CREATE TABLE guidelines (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      name TEXT NOT NULL,
      category TEXT,
      priority INTEGER DEFAULT 50 NOT NULL,
      current_version_id TEXT,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      last_accessed_at TEXT,
      access_count INTEGER DEFAULT 0
    );

    CREATE TABLE guideline_versions (
      id TEXT PRIMARY KEY,
      guideline_id TEXT NOT NULL,
      content TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      change_reason TEXT,
      rationale TEXT,
      examples_good TEXT,
      examples_bad TEXT
    );

    CREATE TABLE knowledge (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      title TEXT NOT NULL,
      category TEXT,
      current_version_id TEXT,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      last_accessed_at TEXT,
      access_count INTEGER DEFAULT 0
    );

    CREATE TABLE knowledge_versions (
      id TEXT PRIMARY KEY,
      knowledge_id TEXT NOT NULL,
      content TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      change_reason TEXT,
      source TEXT,
      confidence REAL,
      valid_from TEXT,
      valid_until TEXT,
      invalidated_by TEXT
    );

    CREATE TABLE experiences (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      title TEXT NOT NULL,
      category TEXT,
      current_version_id TEXT,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      last_accessed_at TEXT,
      access_count INTEGER DEFAULT 0
    );

    CREATE TABLE experience_versions (
      id TEXT PRIMARY KEY,
      experience_id TEXT NOT NULL,
      content TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      change_reason TEXT
    );
  `;
  sqlite.exec(createSchema);

  // Insert test data
  const insertData = `
    INSERT INTO guidelines (id, scope_type, name, category, priority, current_version_id, created_at, created_by)
    VALUES
      ('g1', 'project', 'code-style', 'workflow', 50, 'gv1', '2025-01-01', 'test'),
      ('g2', 'project', 'testing-rules', 'workflow', 60, 'gv2', '2025-01-01', 'test');

    INSERT INTO guideline_versions (id, guideline_id, content, version_number, created_at, created_by)
    VALUES
      ('gv1', 'g1', 'Always use consistent code formatting and follow the style guide', 1, '2025-01-01', 'test'),
      ('gv2', 'g2', 'Write unit tests for all new functionality', 1, '2025-01-01', 'test');

    INSERT INTO knowledge (id, scope_type, title, category, current_version_id, created_at, created_by)
    VALUES ('k1', 'project', 'API Authentication', 'fact', 'kv1', '2025-01-01', 'test');

    INSERT INTO knowledge_versions (id, knowledge_id, content, version_number, created_at, created_by)
    VALUES ('kv1', 'k1', 'The API uses JWT tokens for authentication with 24-hour expiration', 1, '2025-01-01', 'test');
  `;
  sqlite.exec(insertData);

  return drizzle(sqlite, { schema }) as BetterSQLite3Database<typeof schema> as AppDb;
}

describe('ReembeddingService Integration', () => {
  let vectorStore: LanceDbVectorStore;
  let db: AppDb;

  beforeEach(async () => {
    // Set test vector DB path
    process.env.AGENT_MEMORY_VECTOR_DB_PATH = TEST_VECTOR_DB_PATH;

    // Clean up any existing test vector DB
    if (existsSync(TEST_VECTOR_DB_PATH)) {
      rmSync(TEST_VECTOR_DB_PATH, { recursive: true, force: true });
    }

    vectorStore = new LanceDbVectorStore();
    await vectorStore.initialize();
    db = createTestDb();
  });

  afterEach(() => {
    vectorStore.close();

    // Clean up test vector DB
    if (existsSync(TEST_VECTOR_DB_PATH)) {
      rmSync(TEST_VECTOR_DB_PATH, { recursive: true, force: true });
    }

    delete process.env.AGENT_MEMORY_VECTOR_DB_PATH;
  });

  it('should store embeddings and verify count', { timeout: 30000 }, async () => {
    const embeddingService = new MockEmbeddingService(384);

    // Store some embeddings
    const text1 = 'Test guideline content';
    const { embedding: emb1, model } = await embeddingService.embed(text1);

    await vectorStore.store({
      entryType: 'guideline',
      entryId: 'g1',
      versionId: 'gv1',
      text: text1,
      vector: emb1,
      model,
      createdAt: new Date().toISOString(),
    });

    // Verify count
    const count = await vectorStore.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('should create reembedding service successfully', { timeout: 10000 }, async () => {
    const embeddingService = new MockEmbeddingService(384);
    const reembeddingService = new ReembeddingService(embeddingService, vectorStore, db);

    // Service should start in idle state
    expect(reembeddingService.getState()).toBe('idle');

    // Should be able to check dimension mismatch
    const result = await reembeddingService.checkDimensionMismatch();
    expect(result.currentDimension).toBe(384);
    // storedDimension may be null if no embeddings stored yet
    expect([null, 384]).toContain(result.storedDimension);
  });

  it('should report no mismatch when no embeddings exist', { timeout: 10000 }, async () => {
    const embeddingService = new MockEmbeddingService(384);
    const reembeddingService = new ReembeddingService(embeddingService, vectorStore, db);

    const result = await reembeddingService.checkDimensionMismatch();

    // No stored embeddings means no mismatch
    expect(result.mismatch).toBe(false);
    expect(result.storedDimension).toBe(null);
    expect(result.currentDimension).toBe(384);
  });

  it('should not trigger when no entries need re-embedding', { timeout: 10000 }, async () => {
    const embeddingService = new MockEmbeddingService(384);
    const reembeddingService = new ReembeddingService(embeddingService, vectorStore, db);

    // No embeddings stored, so no mismatch, so should not trigger
    const triggered = await reembeddingService.triggerIfNeeded();
    expect(triggered).toBe(false);
    expect(reembeddingService.getState()).toBe('idle');
  });

  it('should not trigger when disabled', { timeout: 10000 }, async () => {
    const embeddingService384 = new MockEmbeddingService(384);
    const { embedding, model } = await embeddingService384.embed('Test');

    await vectorStore.store({
      entryType: 'guideline',
      entryId: 'g1',
      versionId: 'gv1',
      text: 'Test',
      vector: embedding,
      model,
      createdAt: new Date().toISOString(),
    });

    const embeddingService768 = new MockEmbeddingService(768);
    const reembeddingService = new ReembeddingService(embeddingService768, vectorStore, db, {
      enabled: false,
    });

    const triggered = await reembeddingService.triggerIfNeeded();
    expect(triggered).toBe(false);
    expect(reembeddingService.getState()).toBe('idle');
  });
});
