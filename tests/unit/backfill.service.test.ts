import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestTool, createTestGuideline, createTestKnowledge } from '../fixtures/test-helpers.js';
import { backfillEmbeddings, getBackfillStats, type BackfillProgress } from '../../src/services/backfill.service.js';
import { getEmbeddingService, resetEmbeddingService } from '../../src/services/embedding.service.js';
import { getVectorService, resetVectorService } from '../../src/services/vector.service.js';
import * as schema from '../../src/db/schema.js';
import { entryEmbeddings } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-backfill-unit.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

describe.skipIf(!getEmbeddingService().isAvailable())('Backfill Service', () => {
  beforeEach(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(async () => {
    if (sqlite) {
      sqlite.close();
    }
    cleanupTestDb(TEST_DB_PATH);
    
    const vectorService = getVectorService();
    await vectorService.close();
    
    resetEmbeddingService();
    resetVectorService();
  });

  it('should process all entry types by default', async () => {

    // Create one of each type
    createTestTool(db, 'test-tool', 'global', undefined, 'function', 'Test tool description');
    createTestGuideline(db, 'test-guideline', 'global', undefined, 'testing', 50, 'Test guideline content');
    createTestKnowledge(db, 'test-knowledge', 'global', undefined, 'Test knowledge content');

    const progress = await backfillEmbeddings({
      batchSize: 10,
      delayMs: 0, // No delay for tests
    });

    expect(progress.total).toBe(3);
    expect(progress.processed).toBe(3);
    expect(progress.inProgress).toBe(false);
  });

  it('should process only specified entry types', async () => {
    // Create multiple entries
    createTestTool(db, 'test-tool-1', 'global');
    createTestTool(db, 'test-tool-2', 'global');
    createTestGuideline(db, 'test-guideline', 'global');

    const progress = await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 10,
      delayMs: 0,
    });

    // Should only count and process tools
    expect(progress.total).toBe(2);
    expect(progress.processed).toBe(2);
  });

  it('should handle batch processing', async () => {
    // Create multiple tools
    for (let i = 0; i < 5; i++) {
      createTestTool(db, `batch-tool-${i}`, 'global');
    }

    const progress = await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 2, // Small batch size
      delayMs: 0,
    });

    expect(progress.total).toBe(5);
    expect(progress.processed).toBe(5);
  });

  it('should track progress with callback', async () => {

    createTestTool(db, 'progress-tool-1', 'global');
    createTestTool(db, 'progress-tool-2', 'global');

    const progressUpdates: BackfillProgress[] = [];
    
    const progress = await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 1,
      delayMs: 0,
      onProgress: (p) => {
        progressUpdates.push({ ...p });
      },
    });

    // Should have received progress updates
    expect(progressUpdates.length).toBeGreaterThan(0);
    
    // Final update should show completion
    const finalUpdate = progressUpdates[progressUpdates.length - 1];
    expect(finalUpdate.inProgress).toBe(false);
    expect(finalUpdate.processed).toBe(progress.processed);
  });

  it('should track succeeded and failed counts', async () => {
    // Create valid tools
    createTestTool(db, 'valid-tool', 'global', undefined, 'function', 'Valid description');
    
    const progress = await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 10,
      delayMs: 0,
    });

    expect(progress.succeeded).toBeGreaterThan(0);
    expect(progress.succeeded + progress.failed).toBe(progress.processed);
  });

  it('should skip entries that already have embeddings', async () => {

    createTestTool(db, 'existing-tool', 'global');

    // Run backfill first time
    const firstRun = await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 10,
      delayMs: 0,
    });

    expect(firstRun.processed).toBe(1);

    // Run backfill again - should skip already processed entries
    const secondRun = await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 10,
      delayMs: 0,
    });

    // All entries should already have embeddings
    expect(secondRun.succeeded).toBe(1);
  });

  it('should respect delay between batches', async () => {
    // Create multiple tools
    for (let i = 0; i < 4; i++) {
      createTestTool(db, `delay-tool-${i}`, 'global');
    }

    const startTime = Date.now();
    
    await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 2, // 2 batches needed
      delayMs: 100, // 100ms delay between batches
    });

    const elapsed = Date.now() - startTime;
    
    // Should have at least one delay (100ms) between batches
    // Being lenient with timing to avoid flaky tests
    expect(elapsed).toBeGreaterThan(50);
  });

  it('should get backfill statistics', async () => {

    // Create entries
    createTestTool(db, 'stats-tool', 'global');
    createTestGuideline(db, 'stats-guideline', 'global');
    createTestKnowledge(db, 'stats-knowledge', 'global');

    // Get stats before backfill
    const statsBefore = getBackfillStats();
    expect(statsBefore.tools.total).toBe(1);
    expect(statsBefore.guidelines.total).toBe(1);
    expect(statsBefore.knowledge.total).toBe(1);
    expect(statsBefore.tools.withEmbeddings).toBe(0);

    // Run backfill
    await backfillEmbeddings({
      batchSize: 10,
      delayMs: 0,
    });

    // Get stats after backfill
    const statsAfter = getBackfillStats();
    expect(statsAfter.tools.withEmbeddings).toBe(1);
    expect(statsAfter.guidelines.withEmbeddings).toBe(1);
    expect(statsAfter.knowledge.withEmbeddings).toBe(1);
  });

  it('should handle entries without current version', async () => {
    // Create a tool without version (edge case)
    const { tool } = createTestTool(db, 'no-version-tool', 'global');
    
    // Remove the current version reference
    db.update(schema.tools)
      .set({ currentVersionId: null })
      .where(eq(schema.tools.id, tool.id))
      .run();

    const progress = await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 10,
      delayMs: 0,
    });

    // Should mark as failed
    expect(progress.processed).toBe(1);
    expect(progress.failed).toBe(1);
  });

  it('should store embedding tracking records', async () => {

    const { tool } = createTestTool(db, 'tracked-tool', 'global');

    await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 10,
      delayMs: 0,
    });

    // Check that tracking record was created
    const embeddingRecord = db
      .select()
      .from(entryEmbeddings)
      .where(eq(entryEmbeddings.entryId, tool.id))
      .get();

    expect(embeddingRecord).toBeDefined();
    expect(embeddingRecord?.hasEmbedding).toBe(true);
    expect(embeddingRecord?.embeddingModel).toBeDefined();
    expect(embeddingRecord?.embeddingProvider).toBeDefined();
  });

  it('should handle multiple entry types in single run', async () => {
    // Create multiple types
    createTestTool(db, 'multi-tool-1', 'global');
    createTestTool(db, 'multi-tool-2', 'global');
    createTestGuideline(db, 'multi-guideline', 'global');

    const progress = await backfillEmbeddings({
      entryTypes: ['tool', 'guideline'],
      batchSize: 10,
      delayMs: 0,
    });

    expect(progress.total).toBe(3);
    expect(progress.processed).toBe(3);
  });

  it('should handle empty database', async () => {
    // Don't create any entries
    const progress = await backfillEmbeddings({
      batchSize: 10,
      delayMs: 0,
    });

    expect(progress.total).toBe(0);
    expect(progress.processed).toBe(0);
    expect(progress.inProgress).toBe(false);
  });

  it('should process inactive entries as not included', async () => {

    const { tool } = createTestTool(db, 'inactive-tool', 'global');
    
    // Mark as inactive
    db.update(schema.tools)
      .set({ isActive: false })
      .where(eq(schema.tools.id, tool.id))
      .run();

    const progress = await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 10,
      delayMs: 0,
    });

    // Inactive entries should not be processed
    expect(progress.total).toBe(0);
    expect(progress.processed).toBe(0);
  });

  it('should extract text correctly for different entry types', async () => {
    // Create entries with specific content
    createTestTool(db, 'text-tool', 'global', undefined, 'function', 'Tool description text');
    createTestGuideline(db, 'text-guideline', 'global', undefined, 'testing', 50, 'Guideline content text');
    createTestKnowledge(db, 'text-knowledge', 'global', undefined, 'Knowledge content text');

    const progress = await backfillEmbeddings({
      batchSize: 10,
      delayMs: 0,
    });

    // All should succeed (text extraction worked)
    expect(progress.succeeded).toBe(3);
  });

  it('should handle progress updates incrementally', async () => {

    createTestTool(db, 'incremental-1', 'global');
    createTestTool(db, 'incremental-2', 'global');
    createTestTool(db, 'incremental-3', 'global');

    const progressUpdates: number[] = [];
    
    await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 1,
      delayMs: 0,
      onProgress: (p) => {
        progressUpdates.push(p.processed);
      },
    });

    // Progress should increase incrementally
    expect(progressUpdates.length).toBeGreaterThan(0);
    
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i]).toBeGreaterThanOrEqual(progressUpdates[i - 1]);
    }
  });

  it('should set inProgress to false when complete', async () => {
    createTestTool(db, 'complete-tool', 'global');

    const progress = await backfillEmbeddings({
      entryTypes: ['tool'],
      batchSize: 10,
      delayMs: 0,
    });

    expect(progress.inProgress).toBe(false);
  });
});
