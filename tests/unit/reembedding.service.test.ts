import { describe, it, expect, beforeEach } from 'vitest';
import {
  ReembeddingService,
  type ReembeddingState,
  type ReembeddingConfig,
} from '../../src/services/reembedding.service.js';
import type { IVectorStore } from '../../src/core/interfaces/vector-store.js';
import type { IEmbeddingService } from '../../src/core/context.js';
import type { AppDb } from '../../src/core/types.js';
import type {
  VectorRecord,
  SearchResult,
  DistanceMetric,
} from '../../src/core/interfaces/vector.service.js';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/db/schema.js';

// ============================================================================
// Mock implementations
// ============================================================================

class MockEmbeddingService implements IEmbeddingService {
  private available = true;

  constructor(private dimension: number = 384) {}

  setAvailable(available: boolean): void {
    this.available = available;
  }

  isAvailable(): boolean {
    return this.available;
  }

  getEmbeddingDimension(): number {
    return this.dimension;
  }

  async embed(text: string): Promise<{ embedding: number[]; model: string }> {
    return {
      embedding: Array(this.dimension)
        .fill(0)
        .map(() => Math.random()),
      model: `mock-model-${this.dimension}`,
    };
  }

  async embedBatch(texts: string[]): Promise<{ embeddings: number[][]; model: string }> {
    return {
      embeddings: texts.map(() =>
        Array(this.dimension)
          .fill(0)
          .map(() => Math.random())
      ),
      model: `mock-model-${this.dimension}`,
    };
  }
}

class MockVectorStore implements IVectorStore {
  private records: VectorRecord[] = [];
  private expectedDimension: number | null = null;
  private storedDimension: number | null;
  private metadataEntries: Array<{
    entryType: string;
    entryId: string;
    versionId: string;
    model: string;
    dimension: number;
  }> = [];

  constructor(storedDimension: number | null = 768) {
    this.storedDimension = storedDimension;
  }

  setMetadataEntries(
    entries: Array<{
      entryType: string;
      entryId: string;
      versionId: string;
      model: string;
      dimension: number;
    }>
  ): void {
    this.metadataEntries = entries;
  }

  async initialize(): Promise<void> {}

  isAvailable(): boolean {
    return true;
  }

  close(): void {}

  async store(record: VectorRecord): Promise<void> {
    this.records.push(record);
  }

  getStoredRecords(): VectorRecord[] {
    return this.records;
  }

  async delete(_filter: {
    entryType: string;
    entryId: string;
    versionId?: string;
    excludeVersionId?: string;
  }): Promise<void> {}

  async search(
    _embedding: number[],
    _options: { limit: number; entryTypes?: string[] }
  ): Promise<SearchResult[]> {
    return [];
  }

  async count(): Promise<number> {
    return this.records.length;
  }

  getExpectedDimension(): number | null {
    return this.expectedDimension;
  }

  setExpectedDimension(dimension: number): void {
    this.expectedDimension = dimension;
  }

  getDistanceMetric(): DistanceMetric {
    return 'cosine';
  }

  async getStoredDimension(): Promise<number | null> {
    return this.storedDimension;
  }

  async getEmbeddingMetadata(options?: { entryTypes?: string[]; limit?: number }): Promise<
    Array<{
      entryType: string;
      entryId: string;
      versionId: string;
      model: string;
      dimension: number;
    }>
  > {
    const limit = options?.limit ?? 100;
    return this.metadataEntries.slice(0, limit);
  }
}

function createTestDb(): AppDb {
  const sqlite = new Database(':memory:');

  // Create minimal schema for re-embedding tests (matching drizzle schema)
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

  // Insert test data with required scope_type field
  const insertData = `
    INSERT INTO tools (id, scope_type, name, category, current_version_id, created_at, created_by)
    VALUES ('t1', 'project', 'test-tool', 'cli', 'v1', '2025-01-01', 'test');

    INSERT INTO tool_versions (id, tool_id, description, version_number, created_at, created_by)
    VALUES ('v1', 't1', 'A test tool for testing', 1, '2025-01-01', 'test');

    INSERT INTO guidelines (id, scope_type, name, category, priority, current_version_id, created_at, created_by)
    VALUES ('g1', 'project', 'test-guideline', 'workflow', 50, 'v1', '2025-01-01', 'test');

    INSERT INTO guideline_versions (id, guideline_id, content, version_number, created_at, created_by)
    VALUES ('v1', 'g1', 'Always test your code', 1, '2025-01-01', 'test');

    INSERT INTO knowledge (id, scope_type, title, category, current_version_id, created_at, created_by)
    VALUES ('k1', 'project', 'test-knowledge', 'fact', 'v1', '2025-01-01', 'test');

    INSERT INTO knowledge_versions (id, knowledge_id, content, version_number, created_at, created_by)
    VALUES ('v1', 'k1', 'Testing is important', 1, '2025-01-01', 'test');
  `;
  sqlite.exec(insertData);

  return drizzle(sqlite, { schema }) as BetterSQLite3Database<typeof schema> as AppDb;
}

// ============================================================================
// Tests
// ============================================================================

describe('ReembeddingService', () => {
  let embeddingService: MockEmbeddingService;
  let vectorStore: MockVectorStore;
  let db: AppDb;

  beforeEach(() => {
    embeddingService = new MockEmbeddingService(384);
    vectorStore = new MockVectorStore(768);
    db = createTestDb();

    // Set up default metadata entries for dimension mismatch scenario
    vectorStore.setMetadataEntries([
      {
        entryType: 'guideline',
        entryId: 'g1',
        versionId: 'v1',
        model: 'old-model',
        dimension: 768,
      },
      {
        entryType: 'knowledge',
        entryId: 'k1',
        versionId: 'v1',
        model: 'old-model',
        dimension: 768,
      },
      {
        entryType: 'tool',
        entryId: 't1',
        versionId: 'v1',
        model: 'old-model',
        dimension: 768,
      },
    ]);
  });

  describe('checkDimensionMismatch', () => {
    it('should detect no mismatch when dimensions match', async () => {
      const matchingVectorStore = new MockVectorStore(384); // Same as embedding service
      const service = new ReembeddingService(embeddingService, matchingVectorStore, db);

      const result = await service.checkDimensionMismatch();

      expect(result.mismatch).toBe(false);
      expect(result.storedDimension).toBe(384);
      expect(result.currentDimension).toBe(384);
    });

    it('should detect mismatch when dimensions differ', async () => {
      const service = new ReembeddingService(embeddingService, vectorStore, db);

      const result = await service.checkDimensionMismatch();

      expect(result.mismatch).toBe(true);
      expect(result.storedDimension).toBe(768);
      expect(result.currentDimension).toBe(384);
    });

    it('should report no mismatch when no stored embeddings exist', async () => {
      const emptyVectorStore = new MockVectorStore(null);
      const service = new ReembeddingService(embeddingService, emptyVectorStore, db);

      const result = await service.checkDimensionMismatch();

      expect(result.mismatch).toBe(false);
      expect(result.storedDimension).toBe(null);
    });
  });

  describe('triggerIfNeeded', () => {
    it('should not trigger when disabled', async () => {
      const service = new ReembeddingService(embeddingService, vectorStore, db, {
        enabled: false,
      });

      const triggered = await service.triggerIfNeeded();

      expect(triggered).toBe(false);
      expect(service.getState()).toBe('idle');
    });

    it('should not trigger when embedding service unavailable', async () => {
      embeddingService.setAvailable(false);
      const service = new ReembeddingService(embeddingService, vectorStore, db);

      const triggered = await service.triggerIfNeeded();

      expect(triggered).toBe(false);
      expect(service.getState()).toBe('idle');
    });

    it('should not trigger when dimensions match', async () => {
      const matchingVectorStore = new MockVectorStore(384);
      const service = new ReembeddingService(embeddingService, matchingVectorStore, db);

      const triggered = await service.triggerIfNeeded();

      expect(triggered).toBe(false);
    });

    it('should not trigger when already running', async () => {
      const service = new ReembeddingService(embeddingService, vectorStore, db, {
        batchDelayMs: 100,
      });

      // First trigger should succeed
      const firstTrigger = await service.triggerIfNeeded();
      expect(firstTrigger).toBe(true);
      expect(service.getState()).toBe('running');

      // Second trigger should be rejected
      const secondTrigger = await service.triggerIfNeeded();
      expect(secondTrigger).toBe(false);

      await service.waitForCompletion();
    });

    it('should trigger and complete on dimension mismatch', async () => {
      const service = new ReembeddingService(embeddingService, vectorStore, db, {
        batchSize: 10,
        batchDelayMs: 1,
      });

      const triggered = await service.triggerIfNeeded();
      expect(triggered).toBe(true);

      await service.waitForCompletion();

      expect(service.getState()).toBe('completed');
      const progress = service.getProgress();
      expect(progress.processed).toBe(3);
      expect(progress.failed).toBe(0);
      expect(progress.queued).toBe(0);
    });

    it('should not trigger when no entries need re-embedding', async () => {
      vectorStore.setMetadataEntries([]); // No entries
      const service = new ReembeddingService(embeddingService, vectorStore, db);

      const triggered = await service.triggerIfNeeded();

      expect(triggered).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('should transition from idle to running to completed', async () => {
      const service = new ReembeddingService(embeddingService, vectorStore, db, {
        batchDelayMs: 10,
      });

      expect(service.getState()).toBe('idle');

      await service.triggerIfNeeded();
      expect(service.getState()).toBe('running');

      await service.waitForCompletion();
      expect(service.getState()).toBe('completed');
    });
  });

  describe('progress tracking', () => {
    it('should track processed count correctly', async () => {
      const service = new ReembeddingService(embeddingService, vectorStore, db, {
        batchSize: 1,
        batchDelayMs: 1,
      });

      await service.triggerIfNeeded();
      await service.waitForCompletion();

      const progress = service.getProgress();
      expect(progress.processed).toBe(3);
      expect(progress.failed).toBe(0);
    });

    // Note: Testing failure tracking requires a fully integrated db setup because
    // getEntryText() performs actual database queries. The core failure handling
    // logic is covered by unit tests for the try/catch in processBatch, and
    // failure scenarios will be tested in integration tests with real db.
  });

  describe('entry text fetching', () => {
    it('should handle missing entries gracefully', async () => {
      // Set up metadata for non-existent entry
      vectorStore.setMetadataEntries([
        {
          entryType: 'guideline',
          entryId: 'non-existent',
          versionId: 'v1',
          model: 'old',
          dimension: 768,
        },
      ]);

      const service = new ReembeddingService(embeddingService, vectorStore, db, {
        batchDelayMs: 1,
      });

      await service.triggerIfNeeded();
      await service.waitForCompletion();

      // Should complete without error (entry skipped)
      expect(service.getState()).toBe('completed');
    });

    it('should handle unknown entry types', async () => {
      vectorStore.setMetadataEntries([
        {
          entryType: 'unknown-type',
          entryId: 'x1',
          versionId: 'v1',
          model: 'old',
          dimension: 768,
        },
      ]);

      const service = new ReembeddingService(embeddingService, vectorStore, db, {
        batchDelayMs: 1,
      });

      await service.triggerIfNeeded();
      await service.waitForCompletion();

      // Should complete without error (entry skipped)
      expect(service.getState()).toBe('completed');
    });
  });

  describe('configuration', () => {
    it('should use default configuration values', () => {
      const service = new ReembeddingService(embeddingService, vectorStore, db);

      // Service should be created without error
      expect(service.getState()).toBe('idle');
    });

    it('should accept custom configuration', async () => {
      const config: ReembeddingConfig = {
        batchSize: 5,
        batchDelayMs: 50,
        maxEntriesPerRun: 500,
        enabled: true,
      };

      const service = new ReembeddingService(embeddingService, vectorStore, db, config);

      // Should use custom config (tested by successful operation)
      await service.triggerIfNeeded();
      await service.waitForCompletion();

      expect(service.getState()).toBe('completed');
    });
  });
});
